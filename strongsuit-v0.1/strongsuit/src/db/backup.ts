import { db, ALL_TABLES, SCHEMA_VERSION, type TableName } from './schema'
import type { BackupEnvelope } from './types'
import { makeRepo } from './repo/base'
import type { Base } from './types'
import { APP_NAME, BACKUP_APP_ID, BACKUP_APP_ID_LEGACY, BACKUP_FILE_PREFIX, BACKUP_EXT } from '@/lib/brand'

// ============ crypto (Web Crypto, spec §2.5.2) ============
const PBKDF2_ITERATIONS = 310_000
const MAGIC = 'CWENC1'          // encrypted-file header magic (Coachwright)
const MAGIC_LEGACY = 'SSENC1'   // pre-rename files still open
const isMagic = (m: string) => m === MAGIC || m === MAGIC_LEGACY

const enc = new TextEncoder()
const dec = new TextDecoder()

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function b64(bytes: Uint8Array): string {
  let s = ''
  bytes.forEach(b => (s += String.fromCharCode(b)))
  return btoa(s)
}
function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0))
}

export async function encryptText(plaintext: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, enc.encode(plaintext)))
  // file format: MAGIC \n base64(salt) \n base64(iv) \n base64(ciphertext)
  return [MAGIC, b64(salt), b64(iv), b64(ct)].join('\n')
}

export async function decryptText(fileText: string, passphrase: string): Promise<string> {
  const [magic, saltB64, ivB64, ctB64] = fileText.split('\n')
  if (!isMagic(magic)) throw new Error(`Not an encrypted ${APP_NAME} backup.`)
  const key = await deriveKey(passphrase, unb64(saltB64))
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(ivB64) as BufferSource }, key, unb64(ctB64) as BufferSource,
    )
    return dec.decode(pt)
  } catch {
    throw new Error("Couldn't decrypt — check the passphrase and try again.")
  }
}

export const isEncryptedBackup = (text: string) =>
  text.startsWith(MAGIC + '\n') || text.startsWith(MAGIC_LEGACY + '\n')

// ============ export ============
export async function buildEnvelope(): Promise<BackupEnvelope> {
  const data = {} as BackupEnvelope['data']
  for (const name of ALL_TABLES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(data as any)[name] = await (db as any)[name].toArray()
  }
  return {
    app: BACKUP_APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    encrypted: false,
    data,
  }
}

export async function exportBackup(passphrase?: string): Promise<{ filename: string; text: string }> {
  const envelope = await buildEnvelope()
  const json = JSON.stringify(envelope)
  const stampStr = envelope.exportedAt.slice(0, 10)
  const filename = `${BACKUP_FILE_PREFIX}-${stampStr}${BACKUP_EXT}`
  if (passphrase) {
    return { filename, text: await encryptText(json, passphrase) }
  }
  return { filename, text: json }
}

// ============ import ============
export type ImportMode = 'replace' | 'merge'
export interface ImportReport {
  mode: ImportMode
  schemaVersion: number
  perTable: Record<string, { applied: number; skipped: number }>
}

export function parseEnvelope(text: string): BackupEnvelope {
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch {
    throw new Error(`This file isn't a ${APP_NAME} backup.`)
  }
  const env = obj as BackupEnvelope
  const known = env?.app === BACKUP_APP_ID || env?.app === BACKUP_APP_ID_LEGACY
  if (!known || !env.data) throw new Error(`This file isn't a ${APP_NAME} backup.`)
  if (env.schemaVersion > SCHEMA_VERSION) {
    throw new Error(`This backup was made with a newer version of ${APP_NAME}. Update the app, then import again.`)
  }
  return env
}

export async function importBackup(text: string, mode: ImportMode, passphrase?: string): Promise<ImportReport> {
  const raw = isEncryptedBackup(text) ? await decryptText(text, passphrase ?? '') : text
  const env = parseEnvelope(raw)
  const report: ImportReport = { mode, schemaVersion: env.schemaVersion, perTable: {} }

  const tables = ALL_TABLES.map(n => (db as never as Record<TableName, unknown>)[n]) as never[]
  await db.transaction('rw', tables, async () => {
    for (const name of ALL_TABLES) {
      const rows = (env.data[name] ?? []) as Base[]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const table = (db as any)[name]
      if (mode === 'replace') {
        // Not clear(): that skips Dexie's delete hooks, so the cloud would
        // never hear the old rows are gone (lib/cloud/syncEngine.ts).
        await table.toCollection().delete()
        if (rows.length) await table.bulkAdd(rows)
        report.perTable[name] = { applied: rows.length, skipped: 0 }
      } else {
        report.perTable[name] = await makeRepo(table).mergeUpsert(rows)
      }
    }
  })
  return report
}

// ============ panic export (spec §2.5.6) ============
export async function panicDump(): Promise<string> {
  try {
    return JSON.stringify(await buildEnvelope())
  } catch {
    // last resort: raw table scrape without envelope guarantees
    const out: Record<string, unknown[]> = {}
    for (const name of ALL_TABLES) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { out[name] = await (db as any)[name].toArray() } catch { out[name] = [] }
    }
    return JSON.stringify({ app: BACKUP_APP_ID, panic: true, data: out })
  }
}

// ============ browser download helper ============
export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

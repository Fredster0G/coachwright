// ===== Cloud sync engine =====
//
// The app keeps working off its local IndexedDB exactly as before; this
// module keeps that database and the coach's cloud account in step.
//
//   local write ─▶ Dexie hook marks (table,id) dirty ─▶ debounced push
//   timer / focus / online ─▶ pull everything past our cursor ─▶ apply
//
// Dirty keys live in localStorage, written synchronously from the hook, so a
// crash between a write and its upload loses nothing: the next push re-reads
// the row by id (or sends a tombstone if it's gone). Remote rows are applied
// inside transactions tagged in `applyingRemote`, which the hooks ignore, so
// a pull never echoes back up as a push.
//
// Conflicts are last-write-wins by the row's own `updatedAt`, decided on the
// server for pushes and in `mergeIncoming` for pulls.

import type { Transaction, Table } from 'dexie'
import { db } from '@/db/schema'
import type { Base } from '@/db/types'
import { api, getSession, CloudError } from './session'
import { SYNCED_TABLES, type SyncedTable, toWire, mergeIncoming } from './tables'

// ---------------------------------------------------------------- state

const DIRTY_KEY = 'cw.cloud.dirty'
const CURSOR_KEY = 'cw.cloud.cursor'
const LINKED_KEY = 'cw.cloud.linkedAccount'
const LAST_SYNC_KEY = 'cw.cloud.lastSyncAt'

// localStorage, with an in-memory mirror so a refused/absent storage (private
// mode, tests) degrades to "state lasts this session" rather than "no state".
const mem = new Map<string, string>()
function load<T>(key: string, fallback: T): T {
  let raw: string | null | undefined = mem.get(key)
  if (raw === undefined) { try { raw = localStorage.getItem(key) } catch { raw = null } }
  try { return raw ? JSON.parse(raw) as T : fallback } catch { return fallback }
}
function save(key: string, value: unknown) {
  const raw = JSON.stringify(value)
  mem.set(key, raw)
  try { localStorage.setItem(key, raw) } catch { /* quota/private mode — in-memory only */ }
}
function remove(key: string) {
  mem.delete(key)
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}

const dirty = new Set<string>(load<string[]>(DIRTY_KEY, []))
const persistDirty = () => save(DIRTY_KEY, [...dirty])
const keyOf = (table: string, id: string) => `${table}\u0000${id}`
const splitKey = (k: string) => { const i = k.indexOf('\u0000'); return [k.slice(0, i), k.slice(i + 1)] as [SyncedTable, string] }

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error' | 'signed-out'
export interface SyncStatus {
  phase: SyncPhase; pending: number; lastSyncAt: string | null; error?: string
  /** Clients the server refused to make active: over the free tier's limit
   *  (server-enforced since S24). They stay on this device and retry. */
  refusedClients?: number
}

let status: SyncStatus = { phase: getSession() ? 'idle' : 'signed-out', pending: dirty.size, lastSyncAt: load<string | null>(LAST_SYNC_KEY, null) }
const statusListeners = new Set<() => void>()
function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, pending: dirty.size, ...patch }
  for (const l of statusListeners) l()
}
export function getSyncStatus(): SyncStatus { return status }
export function onSyncStatus(fn: () => void): () => void { statusListeners.add(fn); return () => { statusListeners.delete(fn) } }

// ---------------------------------------------------------------- hooks

const applyingRemote = new WeakSet<Transaction>()
let pushTimer: ReturnType<typeof setTimeout> | null = null

function markDirty(table: SyncedTable, id: unknown, trans: Transaction) {
  if (applyingRemote.has(trans) || typeof id !== 'string') return
  dirty.add(keyOf(table, id))
  persistDirty()
  setStatus({})
  if (getSession()) {
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = setTimeout(() => { void syncNow() }, 1500)
  }
}

let hooksInstalled = false
/** Idempotent. Must run before the first write that should sync. */
export function installSyncHooks() {
  if (hooksInstalled) return
  hooksInstalled = true
  for (const name of SYNCED_TABLES) {
    const table = db.table(name)
    table.hook('creating', function (pk, obj, trans) { markDirty(name, pk ?? (obj as Base).id, trans) })
    table.hook('updating', function (_mods, pk, _obj, trans) { markDirty(name, pk, trans) })
    table.hook('deleting', function (pk, _obj, trans) { markDirty(name, pk, trans) })
  }
}

/** Run a write that came FROM the cloud: its changes must not be re-uploaded. */
async function remoteWrite(fn: () => Promise<void>) {
  await db.transaction('rw', SYNCED_TABLES.map(t => db.table(t)), async tx => {
    applyingRemote.add(tx)
    await fn()
  })
}

// ---------------------------------------------------------------- push

interface WireChange { table: string; id: string; updatedAt: string; deleted?: boolean; data?: Record<string, unknown> }

const PUSH_BATCH = 200
/** Keeps a batch comfortably under the server's 10MB body cap even when it
 *  carries progress photos (data URLs). */
const PUSH_BATCH_BYTES = 4_000_000

interface PushResponse { applied: string[]; stale: string[]; refused?: string[] }

/** Returns how many rows the server refused (free-tier client cap). Those
 *  stay dirty so they go up on their own once the coach upgrades or archives
 *  another client. */
async function pushDirty(): Promise<number> {
  const held = new Set<string>()
  try {
    while (dirty.size) await pushBatch(held)
  } finally {
    for (const k of held) dirty.add(k)
    persistDirty()
  }
  return held.size
}

async function pushBatch(held: Set<string>): Promise<void> {
  const keys = [...dirty].slice(0, PUSH_BATCH)
  const batch: WireChange[] = []
  let bytes = 0
  const taken: string[] = []
  for (const k of keys) {
    const [table, id] = splitKey(k)
    const row = await (db.table(table) as Table<Base, string>).get(id)
    const change: WireChange = row
      ? { table, id, updatedAt: row.updatedAt || new Date().toISOString(), data: toWire(table, row) }
      : { table, id, updatedAt: new Date().toISOString(), deleted: true }
    const size = row ? JSON.stringify(change.data).length : 64
    if (taken.length && bytes + size > PUSH_BATCH_BYTES) break
    bytes += size
    batch.push(change)
    taken.push(k)
  }
  // Clear before sending: a write that lands while the request is in flight
  // re-marks its key and goes out in the next round.
  for (const k of taken) dirty.delete(k)
  persistDirty()
  try {
    const r = await api<PushResponse>('/data/push', { method: 'POST', json: { changes: batch } })
    for (const c of batch) if (c.table === 'clients' && r.refused?.includes(c.id)) held.add(keyOf(c.table, c.id))
  } catch (err) {
    for (const k of taken) dirty.add(k)
    persistDirty()
    throw err
  }
}

// ---------------------------------------------------------------- pull

interface PullResponse { changes: WireChange[]; cursor: number; more: boolean }

async function pullAll(): Promise<number> {
  let cursor = load<number>(CURSOR_KEY, 0)
  let applied = 0
  for (;;) {
    const page = await api<PullResponse>(`/data/pull?since=${cursor}`)
    if (page.changes.length) {
      await remoteWrite(async () => {
        for (const c of page.changes) {
          if (!(SYNCED_TABLES as readonly string[]).includes(c.table)) continue
          const table = c.table as SyncedTable
          const t = db.table(table) as Table<Record<string, unknown>, string>
          const isDirty = dirty.has(keyOf(table, c.id))
          if (c.deleted) {
            if (!isDirty) { await t.delete(c.id); applied++ }
            continue
          }
          const local = await t.get(c.id)
          const next = mergeIncoming(table, local, c.data!, isDirty)
          if (next) { await t.put(next); applied++ }
        }
      })
    }
    cursor = page.cursor
    save(CURSOR_KEY, cursor)
    if (!page.more) return applied
  }
}

// ---------------------------------------------------------------- public

let running: Promise<void> | null = null

/** Push local changes, then pull remote ones. Safe to call any time; calls
 *  made while one is running share it. */
export function syncNow(): Promise<void> {
  if (running) return running
  if (!getSession()) { setStatus({ phase: 'signed-out' }); return Promise.resolve() }
  running = (async () => {
    setStatus({ phase: 'syncing', error: undefined })
    try {
      const refused = await pushDirty()
      await pullAll()
      const now = new Date().toISOString()
      save(LAST_SYNC_KEY, now)
      setStatus({ phase: 'idle', lastSyncAt: now, refusedClients: refused || undefined })
    } catch (err) {
      if (err instanceof CloudError && err.status === 0) setStatus({ phase: 'offline' })
      else if (err instanceof CloudError && err.status === 401) setStatus({ phase: 'signed-out' })
      else setStatus({ phase: 'error', error: err instanceof Error ? err.message : String(err) })
    } finally {
      running = null
    }
  })()
  return running
}

const POLL_MS = 30_000
/** Background sync while the app is open. Returns a stop function. */
export function startSyncLoop(): () => void {
  void syncNow()
  const timer = setInterval(() => { if (document.visibilityState === 'visible') void syncNow() }, POLL_MS)
  const wake = () => { if (document.visibilityState === 'visible') void syncNow() }
  document.addEventListener('visibilitychange', wake)
  window.addEventListener('online', wake)
  return () => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', wake)
    window.removeEventListener('online', wake)
  }
}

export function linkedAccountId(): string | null { return load<string | null>(LINKED_KEY, null) }

export async function localHasCoachData(): Promise<boolean> {
  return (await db.clients.count()) > 0 || (await db.programs.count()) > 0
}

async function serverHasData(): Promise<boolean> {
  const page = await api<PullResponse>('/data/pull?since=0')
  return page.changes.length > 0
}

/** Connect this device's database to the signed-in account. Three cases:
 *   - already linked to this account: nothing to do
 *   - the account has data: this device becomes a copy of it (local rows are
 *     cleared first — the UI warns and offers a backup before this)
 *   - the account is empty and this device was never linked to another
 *     account: everything local is uploaded (a pre-cloud install moving up)
 *  A device previously linked to a DIFFERENT account never uploads into the
 *  new one; it's cleared, so two coaches' data can't mix. */
export async function linkDevice(): Promise<'already-linked' | 'downloaded' | 'uploaded'> {
  const session = getSession()
  if (!session) throw new Error('Sign in first.')
  if (linkedAccountId() === session.accountId) return 'already-linked'

  const previous = linkedAccountId()
  const hasRemote = await serverHasData()
  dirty.clear(); persistDirty()
  save(CURSOR_KEY, 0)

  if (hasRemote || previous) {
    await remoteWrite(async () => { for (const t of SYNCED_TABLES) await db.table(t).clear() })
    await pullAll()
    save(LINKED_KEY, session.accountId)
    setStatus({})
    return 'downloaded'
  }

  for (const t of SYNCED_TABLES) {
    const ids = await db.table(t).toCollection().primaryKeys() as string[]
    for (const id of ids) dirty.add(keyOf(t, id))
  }
  persistDirty()
  await pushDirty()
  await pullAll()
  save(LINKED_KEY, session.accountId)
  setStatus({})
  return 'uploaded'
}

/** After the account is deleted: erase this device's copy too — every table,
 *  not just the synced ones — and forget which account it belonged to. The
 *  app returns to first-run. */
export async function eraseThisDevice(): Promise<void> {
  // clear() bypasses the sync hooks, which is exactly right here.
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear()
  })
  resetSyncState(true)
}

/** Forget cursor + dirty state (sign-out). `forgetLink` also forgets which
 *  account this device's data belongs to — only for tests; in the app the
 *  link must survive sign-out so a different account can't inherit the data. */
export function resetSyncState(forgetLink = false) {
  if (forgetLink) remove(LINKED_KEY)
  dirty.clear(); persistDirty()
  remove(CURSOR_KEY); remove(LAST_SYNC_KEY)
  setStatus({ phase: getSession() ? 'idle' : 'signed-out', lastSyncAt: null })
}

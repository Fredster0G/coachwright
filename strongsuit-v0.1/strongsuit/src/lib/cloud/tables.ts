// ===== Which tables sync, and how a row goes on/off the wire (pure) =====

import type { Base } from '@/db/types'

/** Must match SYNC_TABLES in sync-server/server.ts. Everything the coach
 *  owns. Not here: model caches, embeddings, and other per-device data. */
export const SYNCED_TABLES = [
  'trainer', 'clients', 'clientNotes', 'exercises', 'exerciseOverrides', 'programs', 'sessionLogs',
  'checkIns', 'metrics', 'payments', 'appointments', 'expenses', 'waivers', 'messages', 'staff',
  'locations', 'leads', 'progressPhotos', 'habits', 'habitEntries', 'challenges', 'invoices',
  'coupons', 'automationRules', 'foodItems', 'foodEntries',
] as const
export type SyncedTable = (typeof SYNCED_TABLES)[number]

export function isSyncedTable(name: string): name is SyncedTable {
  return (SYNCED_TABLES as readonly string[]).includes(name)
}

/** Trainer fields that describe THIS device, not the coach — never uploaded,
 *  and kept when a remote trainer row is applied. */
export const LOCAL_ONLY_TRAINER_FIELDS = ['membershipActive', 'membershipExpiresAt'] as const

export function toWire(table: SyncedTable, row: Base): Record<string, unknown> {
  if (table !== 'trainer') return row as unknown as Record<string, unknown>
  const out: Record<string, unknown> = { ...row }
  for (const f of LOCAL_ONLY_TRAINER_FIELDS) delete out[f]
  return out
}

/** What to store locally when a remote row arrives. Returns null to keep the
 *  local row — it's newer and still waiting to upload. */
export function mergeIncoming(
  table: SyncedTable,
  local: Record<string, unknown> | undefined,
  remote: Record<string, unknown>,
  localIsDirty: boolean,
): Record<string, unknown> | null {
  if (local && localIsDirty && String(local.updatedAt ?? '') > String(remote.updatedAt ?? '')) return null
  if (table !== 'trainer' || !local) return remote
  const merged = { ...remote }
  for (const f of LOCAL_ONLY_TRAINER_FIELDS) if (f in local) merged[f] = local[f]
  return merged
}

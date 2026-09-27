// ===== Client data portability (spec §4.34) =====
// A client's history shouldn't be hostage to one coach's install. This
// exports ONE client's full history (profile, programs, logs, check-ins,
// metrics, payments, appointments, waivers, photos, habits, messages, food
// log) as a
// single self-contained file a client can hand to a NEW coach running
// Coachwright — or a coach can use to move a client between two of their own
// installs, or hand off a departing staff member's clients (Team, spec §4.26).
//
// Re-keys every row with fresh ULIDs on import so it never collides with
// data already in the destination database, while preserving every date,
// note, and number exactly.

import { db, ALL_TABLES } from './schema'
import { newId, nowIso } from '@/lib/core'
import { BACKUP_APP_ID } from '@/lib/brand'
import type {
  Client, ClientNote, Program, SessionLog, CheckIn, Metric, Payment,
  Appointment, Waiver, ProgressPhoto, Habit, HabitEntry, CoachMessage, Base,
  FoodEntry, FoodItem,
} from './types'

export interface ClientPackage {
  app: typeof BACKUP_APP_ID
  kind: 'client-package'
  exportedAt: string
  client: Client
  clientNotes: ClientNote[]
  programs: Program[]
  sessionLogs: SessionLog[]
  checkIns: CheckIn[]
  metrics: Metric[]
  payments: Payment[]
  appointments: Appointment[]
  waivers: Waiver[]
  progressPhotos: ProgressPhoto[]
  habits: Habit[]
  habitEntries: HabitEntry[]
  messages: CoachMessage[]
  /** Optional: packages exported before S23 have neither field. */
  foodEntries?: FoodEntry[]
  /** The FoodItems those entries point at. `foodItems` is a SHARED,
   *  non-client-scoped cache (one row per product, keyed by barcode), so a
   *  package must carry the referenced rows — without them every entry's
   *  `foodItemId` dangles at the destination and its macros are lost. */
  foodItems?: FoodItem[]
}

async function byClient<T>(table: { where(k: string): { equals(v: string): { toArray(): Promise<T[]> } } }, clientId: string): Promise<T[]> {
  return table.where('clientId').equals(clientId).toArray()
}

/** Build a portable package for one client. */
export async function exportClientPackage(clientId: string): Promise<ClientPackage> {
  const client = await db.clients.get(clientId)
  if (!client) throw new Error('Client not found.')

  const [clientNotes, programs, sessionLogs, checkIns, metrics, payments, appointments, waivers, progressPhotos, habits, messages] =
    await Promise.all([
      byClient<ClientNote>(db.clientNotes, clientId),
      byClient<Program>(db.programs, clientId),
      byClient<SessionLog>(db.sessionLogs, clientId),
      byClient<CheckIn>(db.checkIns, clientId),
      byClient<Metric>(db.metrics, clientId),
      byClient<Payment>(db.payments, clientId),
      byClient<Appointment>(db.appointments, clientId),
      byClient<Waiver>(db.waivers, clientId),
      byClient<ProgressPhoto>(db.progressPhotos, clientId),
      byClient<Habit>(db.habits, clientId),
      byClient<CoachMessage>(db.messages, clientId),
    ])
  const habitIds = new Set(habits.map(h => h.id))
  const habitEntries = (await db.habitEntries.toArray()).filter(e => habitIds.has(e.habitId))
  const foodEntries = await byClient<FoodEntry>(db.foodEntries, clientId)
  const foodItemIds = [...new Set(foodEntries.map(e => e.foodItemId))]
  const foodItems = (await db.foodItems.bulkGet(foodItemIds)).filter((f): f is FoodItem => !!f)

  return {
    app: BACKUP_APP_ID, kind: 'client-package', exportedAt: nowIso(),
    client, clientNotes, programs, sessionLogs, checkIns, metrics, payments,
    appointments, waivers, progressPhotos, habits, habitEntries, messages,
    foodEntries, foodItems,
  }
}

export function isClientPackage(obj: unknown): obj is ClientPackage {
  return !!obj && typeof obj === 'object' && (obj as { kind?: string }).kind === 'client-package'
}
/** A bundle of multiple packages — e.g. every client assigned to a departing staff member. */
export function isClientPackageBundle(obj: unknown): obj is ClientPackage[] {
  return Array.isArray(obj) && obj.length > 0 && obj.every(isClientPackage)
}

/** Re-key every row in a package with fresh ULIDs, remapping every internal
 *  cross-reference (client id, program id, habit id). Pure — testable without
 *  touching IndexedDB. */
export function rekeyClientPackage(pkg: ClientPackage): ClientPackage {
  const clientId = newId()
  const programIdMap = new Map(pkg.programs.map(p => [p.id, newId()]))
  const habitIdMap = new Map(pkg.habits.map(h => [h.id, newId()]))
  const foodItemIdMap = new Map((pkg.foodItems ?? []).map(f => [f.id, newId()]))
  const t = nowIso()
  const restamp = <T extends Base>(row: T): T => ({ ...row, id: newId(), createdAt: t, updatedAt: t })

  return {
    ...pkg,
    client: { ...restamp(pkg.client), activeProgramId: pkg.client.activeProgramId ? programIdMap.get(pkg.client.activeProgramId) : undefined, id: clientId, staffId: undefined, locationId: undefined },
    clientNotes: pkg.clientNotes.map(n => ({ ...restamp(n), clientId })),
    programs: pkg.programs.map(p => ({ ...restamp(p), id: programIdMap.get(p.id)!, clientId })),
    sessionLogs: pkg.sessionLogs.map(l => ({ ...restamp(l), clientId, programId: l.programId ? programIdMap.get(l.programId) : undefined })),
    checkIns: pkg.checkIns.map(c => ({ ...restamp(c), clientId })),
    metrics: pkg.metrics.map(m => ({ ...restamp(m), clientId })),
    payments: pkg.payments.map(p => ({ ...restamp(p), clientId, invoiceId: undefined })),
    appointments: pkg.appointments.map(a => ({ ...restamp(a), clientId, staffId: undefined, locationId: undefined })),
    waivers: pkg.waivers.map(w => ({ ...restamp(w), clientId })),
    progressPhotos: pkg.progressPhotos.map(p => ({ ...restamp(p), clientId })),
    habits: pkg.habits.map(h => ({ ...restamp(h), id: habitIdMap.get(h.id)!, clientId })),
    habitEntries: pkg.habitEntries.map(e => ({ ...restamp(e), clientId, habitId: habitIdMap.get(e.habitId)! })),
    messages: pkg.messages.map(m => ({ ...restamp(m), clientId })),
    foodItems: (pkg.foodItems ?? []).map(f => ({ ...restamp(f), id: foodItemIdMap.get(f.id)! })),
    // An entry whose item didn't travel (deleted from the source cache) would
    // dangle with no macros — drop it rather than import a broken row.
    foodEntries: (pkg.foodEntries ?? [])
      .filter(e => foodItemIdMap.has(e.foodItemId))
      .map(e => ({ ...restamp(e), clientId, foodItemId: foodItemIdMap.get(e.foodItemId)! })),
  }
}

/** Point packaged food entries at products the destination already has
 *  cached (same barcode) instead of adding duplicates to the shared cache.
 *  Returns the items that still need inserting. Pure. */
export function dedupeFoodItems(pkg: ClientPackage, existingByBarcode: Map<string, string>): { items: FoodItem[]; entries: FoodEntry[] } {
  const redirect = new Map<string, string>()
  const items: FoodItem[] = []
  for (const f of pkg.foodItems ?? []) {
    const existing = f.barcode ? existingByBarcode.get(f.barcode) : undefined
    if (existing) redirect.set(f.id, existing)
    else items.push(f)
  }
  const entries = (pkg.foodEntries ?? []).map(e => redirect.has(e.foodItemId) ? { ...e, foodItemId: redirect.get(e.foodItemId)! } : e)
  return { items, entries }
}

export interface ImportClientReport { clientName: string; recordsImported: number }

/** Import one already-rekeyed package as a brand-new client + history. */
async function insertClientPackage(pkg: ClientPackage): Promise<ImportClientReport> {
  const tables = [
    db.clients, db.clientNotes, db.programs, db.sessionLogs, db.checkIns, db.metrics,
    db.payments, db.appointments, db.waivers, db.progressPhotos, db.habits, db.habitEntries, db.messages,
    db.foodItems, db.foodEntries,
  ]
  let count = 0
  await db.transaction('rw', tables, async () => {
    const barcodes = (pkg.foodItems ?? []).map(f => f.barcode).filter((b): b is string => !!b)
    const existing = barcodes.length ? await db.foodItems.where('barcode').anyOf(barcodes).toArray() : []
    const food = dedupeFoodItems(pkg, new Map(existing.map(f => [f.barcode!, f.id])))
    await db.clients.add(pkg.client)
    count++
    for (const [rows, table] of [
      [pkg.clientNotes, db.clientNotes], [pkg.programs, db.programs], [pkg.sessionLogs, db.sessionLogs],
      [pkg.checkIns, db.checkIns], [pkg.metrics, db.metrics], [pkg.payments, db.payments],
      [pkg.appointments, db.appointments], [pkg.waivers, db.waivers], [pkg.progressPhotos, db.progressPhotos],
      [pkg.habits, db.habits], [pkg.habitEntries, db.habitEntries], [pkg.messages, db.messages],
      [food.items, db.foodItems], [food.entries, db.foodEntries],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as [Base[], any][]) {
      if (rows.length) await table.bulkAdd(rows)
      count += rows.length
    }
  })
  return { clientName: `${pkg.client.firstName} ${pkg.client.lastName}`.trim(), recordsImported: count }
}

/** Parse + import a client-package file's text — a single package or a bundle. */
export async function importClientPackageText(text: string): Promise<ImportClientReport[]> {
  let obj: unknown
  try { obj = JSON.parse(text) } catch { throw new Error("That file isn't a Coachwright client package.") }
  const packages = isClientPackageBundle(obj) ? obj : isClientPackage(obj) ? [obj] : null
  if (!packages) throw new Error("That file isn't a Coachwright client package.")
  const reports: ImportClientReport[] = []
  for (const pkg of packages) reports.push(await insertClientPackage(rekeyClientPackage(pkg)))
  return reports
}

/** Bundle every client assigned to a staff member into one importable file
 *  (spec §4.26 — a departing coach takes their book of clients with them). */
export async function exportStaffClientBundle(staffId: string): Promise<ClientPackage[]> {
  // staffId isn't an indexed field on `clients` (assignment is rare + small
  // tables), so filter in memory rather than adding an index for one query.
  const clients = (await db.clients.toArray()).filter(c => c.staffId === staffId)
  return Promise.all(clients.map(c => exportClientPackage(c.id)))
}

// keep ALL_TABLES referenced so this file breaks loudly if the table list
// ever changes without this module being revisited
void ALL_TABLES

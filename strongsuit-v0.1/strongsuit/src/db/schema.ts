import Dexie, { type Table } from 'dexie'
import { DB_NAME } from '@/lib/brand'
import type {
  Trainer, Client, ClientNote, Exercise, ExerciseOverride, Program, SessionLog,
  CheckIn, Metric, Payment, Appointment, Expense, Waiver,
  CoachMessage, Staff, Location, Lead, ProgressPhoto, Habit, HabitEntry,
  Challenge, Invoice, Coupon, AutomationRule, ModelBlob, ExerciseEmbedding,
  FoodItem, FoodEntry,
} from './types'

// Envelope schema version. Bumped 1→2 (expenses), 2→3 (waivers + devices, v1.3),
// 4→5 (messages, v1.4), 5→6 (team/locations/CRM/photos/habits/leaderboards/
// invoicing/automations, v1.5), 6→7 (food logging, v1.7). A newer envelope is rejected by older apps with
// the "made with a newer version" message.
export const SCHEMA_VERSION = 7

export class CoachwrightDB extends Dexie {
  trainer!: Table<Trainer, string>
  clients!: Table<Client, string>
  clientNotes!: Table<ClientNote, string>
  exercises!: Table<Exercise, string>
  exerciseOverrides!: Table<ExerciseOverride, string>
  programs!: Table<Program, string>
  sessionLogs!: Table<SessionLog, string>
  checkIns!: Table<CheckIn, string>
  metrics!: Table<Metric, string>
  payments!: Table<Payment, string>
  appointments!: Table<Appointment, string>
  expenses!: Table<Expense, string>
  waivers!: Table<Waiver, string>
  messages!: Table<CoachMessage, string>
  staff!: Table<Staff, string>
  locations!: Table<Location, string>
  leads!: Table<Lead, string>
  progressPhotos!: Table<ProgressPhoto, string>
  habits!: Table<Habit, string>
  habitEntries!: Table<HabitEntry, string>
  challenges!: Table<Challenge, string>
  invoices!: Table<Invoice, string>
  coupons!: Table<Coupon, string>
  automationRules!: Table<AutomationRule, string>
  foodItems!: Table<FoodItem, string>
  foodEntries!: Table<FoodEntry, string>
  /** Cached local-AI model weights (lib/modelFetch.ts). Deliberately absent
   *  from ALL_TABLES below — this is a local download cache, not user data:
   *  it must never be backed up, restored, or synced (a multi-MB/GB blob has
   *  no business riding in a JSON backup file or across a sync relay, and a
   *  restored trainer should re-download rather than inherit a stale cache
   *  from whichever machine made the backup). */
  modelBlobs!: Table<ModelBlob, string>
  /** Cached exercise-library embeddings (lib/embeddings.ts). Same "never
   *  backed up, never synced" reasoning as modelBlobs — see the field
   *  comment on ExerciseEmbedding in db/types.ts. */
  exerciseEmbeddings!: Table<ExerciseEmbedding, string>

  // DB_NAME stays 'strongsuit' post-rename so existing IndexedDB data survives
  // the Coachwright rebrand (see lib/brand.ts). Never repoint without migration.
  constructor(name = DB_NAME) {
    super(name)
    // MIGRATION DOCTRINE (spec §2.5.1): never edit an existing version block.
    // Schema changes = append this.version(N+1).stores({...}).upgrade(tx => ...)
    this.version(1).stores({
      trainer: 'id',
      clients: 'id, status, lastName, *tags',
      exercises: 'id, name, category, isCustom',
      programs: 'id, clientId, status',
      sessionLogs: 'id, clientId, date, [clientId+date], programId',
      checkIns: 'id, clientId, date, [clientId+date]',
      metrics: 'id, clientId, [clientId+key], date',
      payments: 'id, clientId, date',
      appointments: 'id, clientId, start',
    })
    
    this.version(2).stores({
      clientNotes: 'id, clientId',
    }).upgrade(_tx => {})

    this.version(3).stores({
      expenses: 'id, date, category',
    }).upgrade(_tx => {})

    // v1.3: liability records + paired sync devices. Appointments gain
    // seriesId (recurring) — indexed for series queries.
    this.version(4).stores({
      appointments: 'id, clientId, start, seriesId',
      waivers: 'id, clientId, kind',
      devices: 'id, clientId, role',
    }).upgrade(_tx => {})

    this.version(5).stores({
      messages: 'id, clientId, date',
    }).upgrade(_tx => {})

    // v1.5: team/locations, CRM leads, progress photos, habits, challenges,
    // invoicing/coupons, and the automation rule engine.
    this.version(6).stores({
      staff: 'id, locationId, role',
      locations: 'id',
      leads: 'id, stage',
      progressPhotos: 'id, clientId, date',
      habits: 'id, clientId',
      habitEntries: 'id, habitId, clientId, date, [habitId+date]',
      challenges: 'id, startDate, endDate',
      invoices: 'id, clientId, number, status',
      coupons: 'id, code',
      automationRules: 'id',
    }).upgrade(_tx => {})

    // v7 — sync conflicts a human has to settle (docs/plans/01-CONNECTIVITY.md
    // §7). APPENDED as a new version rather than edited into v6, per this
    // project's schema rule: an existing install must migrate, not break.
    this.version(7).stores({
      syncConflicts: 'id, table, rowId, resolvedAt',
    }).upgrade(_tx => {})

    // v8 — per-row staff attribution (Studio Phase 1). SessionLog/Payment/
    // Program/Invoice each gain an optional staffId so commission math and
    // "who actually did this" survive a client being reassigned to a
    // different coach later. Purely additive — no backfill; old rows simply
    // read staffId as undefined and existing consumers fall back to
    // client.staffId (see lib/business.ts).
    this.version(8).stores({
      sessionLogs: 'id, clientId, date, [clientId+date], programId, staffId',
      payments: 'id, clientId, date, staffId',
      programs: 'id, clientId, status, staffId',
      invoices: '&id, clientId, status, createdAt, staffId',
    }).upgrade(_tx => {})

    // v9 — lead routing (Studio, continued): which coach/location an
    // inquiry belongs to, so a front-desk staffer can filter their own
    // pipeline. Purely additive, same doctrine as v8.
    this.version(9).stores({
      leads: 'id, stage, staffId, locationId',
    }).upgrade(_tx => {})

    // v10 — local-AI model weight cache (lib/modelFetch.ts). Keyed by the
    // ModelSpec id from lib/localAi.ts's registry, one row per downloaded
    // model. Never added to ALL_TABLES — see the field comment above.
    this.version(10).stores({
      modelBlobs: 'id',
    }).upgrade(_tx => {})

    // v11 — semantic exercise search cache (lib/embeddings.ts). Keyed by
    // exerciseId, not a ULID — one row per exercise, at most.
    this.version(11).stores({
      exerciseEmbeddings: 'exerciseId',
    }).upgrade(_tx => {})

    // v12 — seed exercise overlays (DEBT-67). Coach edits to seed rows are
    // stored here rather than in `exercises` so future seed library updates
    // can overwrite stock rows without clobbering coach customizations.
    // Keyed by id (which is the exerciseId).
    this.version(12).stores({
      exerciseOverrides: 'id',
    }).upgrade(_tx => {})

    // v13 (August 2026): Food Logging & Barcode Scanning.
    this.version(13).stores({
      foodItems: '&id, barcode, name, createdAt',
      foodEntries: '&id, clientId, [clientId+date], date, createdAt'
    }).upgrade(_tx => {})

    // v14 (S23): cloud accounts replaced E2EE device pairing and packet sync.
    // Paired-device records and parked packet-merge conflicts have no meaning
    // any more; drop both tables.
    this.version(14).stores({
      devices: null,
      syncConflicts: null,
    })
  }
}

export const db = new CoachwrightDB()

export const ALL_TABLES = [
  'trainer', 'clients', 'clientNotes', 'exercises', 'exerciseOverrides', 'programs', 'sessionLogs',
  'checkIns', 'metrics', 'payments', 'appointments', 'expenses', 'waivers',
  'messages', 'staff', 'locations', 'leads', 'progressPhotos', 'habits', 'habitEntries',
  'challenges', 'invoices', 'coupons', 'automationRules', 'foodItems', 'foodEntries',
] as const
export type TableName = (typeof ALL_TABLES)[number]

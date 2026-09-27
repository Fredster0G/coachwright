// ===== Coachwright data model (spec §2.4) =====
// All entities carry id (ULID), createdAt, updatedAt (ISO strings).

import type { Conflict } from '@/lib/conflict'

export interface Base {
  id: string
  createdAt: string
  updatedAt: string
}

export type Units = 'lb' | 'kg'

export interface Trainer extends Base {
  businessName: string
  trainerName: string
  logoDataUrl?: string
  brandColor?: string
  units: Units
  weekStartsOn: 0 | 1
  defaultRestSeconds: number
  currency: string
  lastBackupAt?: string
  onboardingComplete: boolean
  companionCredit: boolean // show "Built with Coachwright" footer in Companion
  density: 'compact' | 'comfortable'
  theme: 'light' | 'dark' | 'system'
  monthlyProfitTarget?: number // Profit Planner goal (Business page)
  eulaAcceptedAt?: string      // ISO timestamp of when the coach accepted the EULA (v1.4)
  seedVersion?: number         // seed DB version this app has merged (v1.6)
  // module visibility (v1.6) — hide nav sections a solo/independent coach doesn't need.
  // Absent/undefined key = visible (opt-out, not opt-in, so existing installs show everything).
  hiddenModules?: ModuleKey[]
  // which brand-mark variant (spec §7.4b) shows in the sidebar header (v1.6).
  // Absent = 'horizontal' (mark + wordmark), the default lockup. Kept as an
  // inline union (not imported from app/brand/Logomark) so the data layer
  // never depends on a UI module — see src/app/brand/Logomark.tsx's own
  // `BrandMarkVariant` export for the UI-facing version of this same type.
  sidebarLogoVariant?: 'horizontal' | 'mark' | 'monogram' | 'cw' | 'lockup'
  // ---- edition & licence (v2, docs/plans/06-EDITIONS-PRICING.md) ----
  // Absent = 'personal', the most restrictive edition. Deliberate: a missing or
  // corrupt licence must never silently unlock paid features. See lib/edition.ts.
  // Kept as an inline union so the data layer never imports a lib module.
  edition?: 'personal' | 'independent' | 'studio'
  /** Signed, offline-verifiable licence key. There is no activation server —
   *  see HOW-TO-OWN-IT.md; a licence check that phones home would break the
   *  "works if we disappear" promise. */
  licenseKey?: string
  /** Studio only: seats this licence grants. */
  licensedSeats?: number
  // ---- membership — the $29/mo subscription on the coach's cloud account,
  // separate from licenseKey above (a pre-2026-08 one-time purchase).
  // Both fields are DEVICE-ONLY (lib/cloud/tables.ts never uploads them):
  // each device asks the server itself.
  /** Cached result of the last successful refresh, so UI checks (like the
   *  free-tier client cap) stay synchronous. Never read directly for gating —
   *  go through `hasActiveMembership()`, which also enforces the expiry. */
  membershipActive?: boolean
  /** Access holds until this ISO time (Stripe period end + grace) even if the
   *  server can't be reached; after it, free-tier limits apply. */
  membershipExpiresAt?: string
}

/** Optional nav sections a solo coach can hide (Settings → Modules). Core
 *  workflow (Today/Clients/Programs/Exercises/Logging/Settings) is never hideable. */
export type ModuleKey =
  | 'filmRoom' | 'calendar' | 'business' | 'team' | 'leads' | 'leaderboard' | 'sync' | 'reports' | 'science'

export type ClientStatus = 'active' | 'paused' | 'archived'
export type BillingModel = 'per-session' | 'monthly' | 'package'

// Nutrition profile (spec §4.18a) — all optional, no schema index needed
export type Sex = 'male' | 'female'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very' | 'extra'
export type NutritionGoal = 'cut' | 'maintain' | 'gain'

// Food Logging (v1.7)
export interface FoodItem extends Base {
  barcode?: string        // null if manually entered without a barcode
  name: string
  brand?: string
  calories: number
  protein: number         // grams
  carbs: number           // grams
  fat: number             // grams
  servingSize?: string    // e.g. "1 bar (60g)", "100g"
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface FoodEntry extends Base {
  clientId: string
  date: string            // yyyy-MM-dd
  foodItemId: string      // reference to FoodItem
  meal: MealType
  servings: number        // multiplier for the FoodItem's macros
}

/** Primary training goal (spec §4.21). Drives programming + nutrition mapping. */
export type TrainingGoal =
  | 'strength' | 'hypertrophy' | 'power' | 'endurance'
  | 'fat-loss' | 'lean-gain' | 'general-fitness'

/** What the gym/facility takes from this client's income (spec §4.17b). */
export interface GymCut {
  kind: 'percent' | 'flat-monthly'
  value: number // percent (0–100) or currency per month
}

// ---- Safety & liability (spec §4.22) ----
export interface ParqAnswer { q: string; yes: boolean }
export interface ScreeningResult {
  date: string
  answers: ParqAnswer[]
  cleared: boolean          // no "yes" answers → proceed; else clearance recommended
  flags: string[]           // the questions answered "yes"
  note?: string
}

export type WaiverKind = 'assumption-of-risk' | 'informed-consent' | 'parq-attestation' | 'medical-clearance'
export interface Waiver extends Base {
  clientId: string
  kind: WaiverKind
  documentTitle: string
  documentText: string      // exact text acknowledged (audit trail)
  documentHash: string      // sha-256 of documentText, tamper-evident
  signedName: string        // typed signature
  signedDate: string
  deviceLabel?: string      // best-effort device name (no IP; app is local)
}

export interface Client extends Base {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  photoDataUrl?: string
  status: ClientStatus
  goals: string
  injuries: string
  parqNotes: string
  tags: string[]
  startDate: string
  sessionRate?: number
  billingModel?: BillingModel
  activeProgramId?: string
  archivedAt?: string
  isDemo?: boolean
  // nutrition profile (unindexed, added v1.2)
  sex?: Sex
  heightCm?: number
  birthDate?: string       // yyyy-MM-dd
  activityLevel?: ActivityLevel
  nutritionGoal?: NutritionGoal
  dietPhaseStartDate?: string  // yyyy-MM-dd — when the current cut/gain phase began (v1.6, diet-break awareness)
  trainingDaysPerWeek?: number // v1.6, drives carb cycling
  // facility cut on this client's income (unindexed, added v1.2)
  gymCut?: GymCut
  // training goal + safety (unindexed, added v1.3)
  trainingGoal?: TrainingGoal
  screening?: ScreeningResult   // latest PAR-Q result surfaced on the client
  // sync (unindexed, added v1.3): the paired device that is THIS client, if any
  linkedDeviceId?: string
  // team & locations (unindexed, added v1.5)
  locationId?: string
  staffId?: string          // the staff member this client is assigned to
  leaderboardOptIn?: boolean
}

export interface ClientNote extends Base {
  clientId: string
  content: string
}

export type ExerciseCategory =
  | 'squat' | 'hinge' | 'push' | 'pull' | 'lunge'
  | 'carry' | 'core' | 'conditioning' | 'mobility'

export type TrackingType = 'weight_reps' | 'reps' | 'time' | 'distance' | 'rpe_only'

export interface ExerciseVideoLink {
  label: string     // e.g. "Coaching cue", "Alternate angle", "Client demo"
  url: string
}

export interface Exercise extends Base {
  name: string
  aliases: string[]
  category: ExerciseCategory
  primaryMuscles: string[]
  equipment: string[]
  /** @deprecated kept for old rows; new/edited exercises use videoLinks. Read
   *  through `lib/media.ts`'s `exerciseVideos()` which merges both. */
  videoUrl?: string
  videoLinks?: ExerciseVideoLink[]   // added v1.6 — multiple links, played in-app
  cues: string[]
  isCustom: boolean
  defaultTracking: TrackingType
  
  // factual fields imported from Free Exercise DB (Engine A)
  level?: string
  force?: string
  mechanic?: string
  secondaryMuscles?: string[]
  needsAuthoring?: boolean
  hidden?: boolean // v1.6 (hides seed exercises from lists)
}

/** 
 * Overlay for seeded exercises (spec §4.3). Coach edits to seed rows are saved here
 * rather than in the `exercises` table, so seed updates don't clobber them.
 * `id` is the `exerciseId`.
 */
export interface ExerciseOverride extends Base {
  exerciseId: string
  name?: string
  cues?: string[]
  videoLinks?: ExerciseVideoLink[]
  equipment?: string[]
  hidden?: boolean
}

// ---- Program structure (embedded JSON on Program.weeks) ----
export type LoadMode = 'absolute' | 'percent1rm' | 'rpe' | 'note'
export type BlockType = 'straight' | 'superset' | 'circuit' | 'interval' | 'warmup' | 'cooldown'

export interface SetPrescription {
  reps?: string          // "8" | "8-10" | "AMRAP"
  load?: number          // meaning depends on loadMode
  loadMode?: LoadMode
  loadNote?: string      // when loadMode === 'note'
  timeSeconds?: number
  distanceM?: number
  rpe?: number
}

export interface ExercisePrescription {
  id: string             // ULID — stable row identity for dnd/undo
  exerciseId: string
  sets: SetPrescription[]
  restSeconds?: number
  tempo?: string
  note?: string
}

export interface Block {
  id: string
  type: BlockType
  label?: string          // e.g. "A", "B1/B2", "Finisher"
  intervalSpec?: string   // e.g. "EMOM 10", "AMRAP 12"
  exercises: ExercisePrescription[]
}

export interface Day {
  id: string
  name: string            // "Day 1 — Lower"
  blocks: Block[]
}

export interface Week {
  id: string
  label: string           // "Week 1"
  days: Day[]
}

export type ProgramStatus = 'draft' | 'active' | 'completed' | 'template'

export interface Program extends Base {
  name: string
  description: string
  clientId?: string       // undefined = library template
  goalTag?: string
  weeks: Week[]
  status: ProgramStatus
  startDate?: string
  progressionPolicy?: ProgressionPolicy
  sourceTemplateId?: string
  /** Which staff member built this (Studio, v1.6) — independent of who the
   *  client is CURRENTLY assigned to. See lib/activeStaff.ts. */
  staffId?: string
}

export type ProgressionPolicy =
  | { kind: 'linear-load'; percent: number }
  | { kind: 'double-progression'; repRange: [number, number]; loadIncrement: number }
  | { kind: 'rpe-target'; target: number }

// ---- Logging ----
export interface LoggedSet {
  targetReps?: string
  targetLoad?: number
  targetLoadMode?: LoadMode
  actualReps?: number
  actualLoad?: number
  actualTimeSeconds?: number
  rpe?: number
  done: boolean
}

export interface LogEntry {
  exerciseId: string
  sets: LoggedSet[]
  notes?: string
  restSeconds?: number   // carried from the prescription, or the trainer's default — drives the rest timer
}

export type DataSource = 'trainer' | 'companion-import'

export interface SessionLog extends Base {
  clientId: string
  programId?: string
  weekId?: string
  dayId?: string
  date: string            // yyyy-MM-dd
  title: string
  entries: LogEntry[]
  sessionNotes?: string
  source: DataSource
  /** Which staff member logged this (Studio, v1.6) — independent of who the
   *  client is CURRENTLY assigned to. See lib/activeStaff.ts. */
  staffId?: string
}

export interface CheckIn extends Base {
  clientId: string
  date: string
  mood?: number
  sleepHours?: number
  bodyweight?: number
  energy?: number
  adherence?: number
  answers: { question: string; answer: string }[]
  source: DataSource
}

// ---- Messaging (spec §4.19) ----
export type MessageDirection = 'inbound' | 'outbound'
export type MessageChannel = 'sms' | 'email' | 'whatsapp' | 'in-person' | 'app' | 'other'

export interface CoachMessage extends Base {
  clientId: string
  date: string            // ISO datetime
  direction: MessageDirection
  channel: MessageChannel
  content: string
}

export type MetricType =
  | 'bodyweight' | 'bodyfat' | 'measurement' | 'custom'
  | 'performance'    // e.g. vertical jump, broad jump, sprint time, mile time (v1.6)
  | 'recovery'       // e.g. resting heart rate, HRV (v1.6)
  | 'strength-test'  // a tested (not working-set) 1RM/e1RM on a key lift (v1.6)

export interface Metric extends Base {
  clientId: string
  date: string
  type: MetricType
  key: string             // 'bodyweight' | 'waist' | custom name
  value: number
  unit: string
}

export type PaymentType = 'payment' | 'session-credit' | 'refund'

export interface Payment extends Base {
  clientId: string
  date: string
  amount: number
  method?: string
  memo?: string
  type: PaymentType
  sessions?: number       // for session-credit packs
  invoiceId?: string      // links this payment to an Invoice (v1.5), optional
  /** Which staff member collected this (Studio, v1.6) — independent of who
   *  the client is CURRENTLY assigned to. See lib/activeStaff.ts. */
  staffId?: string
}

// ---- Expenses (Profit Planner) ----
export type ExpenseCategory =
  | 'rent' | 'equipment' | 'insurance' | 'software'
  | 'education' | 'marketing' | 'travel' | 'other'

export type ExpenseRecurrence = 'one-time' | 'monthly'

export interface Expense extends Base {
  date: string            // yyyy-MM-dd; for monthly, the first month it applies
  amount: number
  category: ExpenseCategory
  memo?: string
  recurrence: ExpenseRecurrence
  endDate?: string        // monthly only: last month it applies (inclusive)
}

// ---- Team & locations (spec §4.24, v1.5) ----
export type StaffRole = 'owner' | 'coach' | 'front-desk'
export interface Staff extends Base {
  name: string
  email?: string
  phone?: string
  role: StaffRole
  commissionPercent?: number  // % of THIS staff member's assigned clients' income
  locationId?: string
  active: boolean
}

export interface Location extends Base {
  name: string
  address?: string
  notes?: string
}

// ---- CRM / leads (spec §4.25, v1.5) ----
export type LeadStage = 'new' | 'contacted' | 'trial' | 'won' | 'lost'
export interface Lead extends Base {
  name: string
  email?: string
  phone?: string
  source?: string
  stage: LeadStage
  notes?: string
  convertedClientId?: string
  /** Which coach/location this inquiry is routed to (Studio, v1.6) — a
   *  front-desk staffer working leads for several coaches needs to filter
   *  to their own pipeline. Optional: an unrouted lead is fine. */
  staffId?: string
  locationId?: string
}

// ---- Progress photos & habits (spec §4.26, v1.5) ----
export interface ProgressPhoto extends Base {
  clientId: string
  date: string
  dataUrl: string   // resized client-side before storage — see lib/media.ts
  note?: string
}

export interface Habit extends Base {
  clientId: string
  name: string
  active: boolean
}
export interface HabitEntry extends Base {
  habitId: string
  clientId: string
  date: string      // yyyy-MM-dd
  done: boolean
}

// ---- Leaderboards & challenges (spec §4.27, v1.5) ----
export type ChallengeMetric = 'volume' | 'sessions' | 'bodyweight-loss-pct'
export interface Challenge extends Base {
  name: string
  metric: ChallengeMetric
  startDate: string
  endDate: string
  participantClientIds: string[]
}

// ---- Invoicing, coupons, balances (spec §4.28, v1.5) ----
export interface InvoiceLineItem { description: string; amount: number; qty?: number }
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void'
export interface Invoice extends Base {
  clientId: string
  number: number
  date: string
  dueDate?: string
  lineItems: InvoiceLineItem[]
  couponCode?: string
  discountAmount?: number
  subtotal: number
  total: number
  status: InvoiceStatus
  notes?: string
  /** A payment link the coach pastes in from their OWN Stripe/Square/PayPal
   *  account (see docs/SERVER_STRATEGY.md §3). Coachwright never processes
   *  payments or holds card data — this just renders their link as a button. */
  paymentLink?: string
  /** Which staff member issued this (Studio, v1.6) — independent of who the
   *  client is CURRENTLY assigned to. See lib/activeStaff.ts. */
  staffId?: string
}

export type CouponKind = 'percent' | 'flat'
export interface Coupon extends Base {
  code: string
  kind: CouponKind
  value: number
  active: boolean
  expiresAt?: string
}

// ---- Automations (spec §4.29, v1.5) ----
export type AutomationTrigger =
  | 'no-session-days' | 'checkin-overdue-days' | 'package-low-sessions'
  | 'payment-overdue-days' | 'screening-missing'
  | 'checkin-cadence-slipping' | 'completion-trend-declining'
export interface AutomationRule extends Base {
  name: string
  trigger: AutomationTrigger
  thresholdDays?: number
  thresholdSessions?: number
  message: string
  active: boolean
}

// ---- Local-AI model weight cache (v2, lib/modelFetch.ts) ----
// Deliberately NOT `extends Base` — no createdAt/updatedAt churn, and it must
// never carry an `id` that collides with sync/backup expectations for real
// user data. `id` is the ModelSpec id from lib/localAi.ts's registry.
export interface ModelBlob {
  id: string
  blob: Blob
  bytes: number
  cachedAt: string
}

// ---- Semantic exercise search cache (v2, lib/embeddings.ts) ----
// A derived index, not user data — recomputable from the exercise itself in
// well under a second per row, so (like ModelBlob) it's excluded from
// ALL_TABLES/backup on purpose: a backup file gaining 350 rows of 384 floats
// each for a cache a restore should just rebuild is pure bloat, not safety.
export interface ExerciseEmbedding {
  exerciseId: string
  vector: number[]
  /** Hash of the exact text embedded (name+aliases+category+muscles+cues) —
   *  lets a stale row from an edited custom exercise be detected and
   *  recomputed instead of silently searched against outdated text. */
  textHash: string
  updatedAt: string
}

// ---- Scheduling (spec §4.11 + recurring, v1.3) ----
export type RecurrenceFreq = 'weekly' | 'biweekly' | 'monthly'
export interface RecurrenceRule {
  freq: RecurrenceFreq
  byWeekday?: number[]    // 0=Sun..6=Sat; weekly patterns can repeat on several days
  until?: string          // yyyy-MM-dd, inclusive end of the series
  count?: number          // or a fixed number of occurrences (until wins if both set)
}

export type AppointmentStatus = 'scheduled' | 'completed' | 'canceled'

export interface Appointment extends Base {
  clientId?: string
  title: string
  start: string           // ISO datetime (series master = first occurrence)
  end: string
  recurrence?: 'none' | 'weekly'   // legacy field, kept for old rows
  recurrenceRule?: RecurrenceRule  // set on the series master
  seriesId?: string       // groups a recurring series (= master appointment id)
  exceptions?: string[]   // yyyy-MM-dd occurrence dates removed/rescheduled out
  status?: AppointmentStatus
  location?: string
  notes?: string
  locationId?: string       // structured location (v1.5); `location` stays free-text for legacy rows
  staffId?: string
}

export interface BackupEnvelope {
  // 'coachwright' is canonical; 'strongsuit' still accepted for pre-rename backups
  app: 'coachwright' | 'strongsuit'
  schemaVersion: number
  exportedAt: string
  encrypted: false
  data: {
    trainer: Trainer[]
    clients: Client[]
    clientNotes: ClientNote[]
    exercises: Exercise[]
    exerciseOverrides?: ExerciseOverride[]
    programs: Program[]
    sessionLogs: SessionLog[]
    checkIns: CheckIn[]
    metrics: Metric[]
    payments: Payment[]
    appointments: Appointment[]
    expenses?: Expense[]  // added schema v2 envelopes; absent in v1 backups
    waivers?: Waiver[]    // added schema v3 (v1.3); absent in older backups
    devices?: unknown[]   // legacy (E2EE device pairing, removed S23) — ignored on import
    messages?: CoachMessage[] // added schema v5 (v1.4)
    // added schema v6 (v1.5); absent in older backups
    staff?: Staff[]
    locations?: Location[]
    leads?: Lead[]
    progressPhotos?: ProgressPhoto[]
    habits?: Habit[]
    habitEntries?: HabitEntry[]
    challenges?: Challenge[]
    invoices?: Invoice[]
    coupons?: Coupon[]
    automationRules?: AutomationRule[]
    syncConflicts?: Conflict[]      // present since sync/conflict resolution shipped; missing from this type until now (real gap, not a new field)
    foodItems?: FoodItem[]          // added S15 (barcode nutrition logging)
    foodEntries?: FoodEntry[]       // added S15
  }
}

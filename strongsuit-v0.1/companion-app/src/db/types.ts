// ===== Companion entities (spec: docs/CLIENT_APP_STRATEGY.md) =====
// Minimal on purpose — grow this as real features land, don't pre-build a
// schema for features that don't exist yet.

export type Units = 'lb' | 'kg'
export type Theme = 'system' | 'light' | 'dark'

/** One row, ever. Created on first open. There is no login — this profile
 *  IS the local database; there's nothing to authenticate against. */
export interface CompanionProfile {
  id: string
  name: string
  units: Units
  theme: Theme
  /** Has this person actually chosen "solo" or "I have a coach" yet? Gates
   *  the first-run flow, separate from whether a CoachLink exists (a client
   *  could finish onboarding solo and pair with a coach later). */
  onboarded: boolean
  /** Opt-in system notifications for background-arrived coach items
   *  (messages/programs/reminders). Unindexed — no schema bump needed. */
  notifyEnabled?: boolean
  /** Cycle tracking is off until explicitly turned on, and turning it off
   *  erases the data (see features/cycle/CyclePage). Absent = off, so a
   *  profile written before this field existed is correctly treated as
   *  never-consented rather than defaulting on. */
  cycleTrackingEnabled?: boolean
  createdAt: string
  updatedAt: string
}

/** Present once connected to a coach (a connect code from the coach app,
 *  redeemed via Coachwright Cloud). */
export interface CoachLink {
  id: string
  coachName: string
  /** Cloud token scoped to this one client of this one coach. A link from
   *  before S23 (E2EE pairing) has none and is dropped at boot. */
  token: string
  pairedAt: string
  /** The coach's Client.id for this person — informational. */
  clientIdOnCoachSide?: string
  lastSyncAt?: string
  /** Watermark for incremental uploads — rows changed after this go up. */
  lastPushAt?: string
  // ---- self-booking, refreshed from the bundle on every sync (unindexed) ----
  bookingEnabled?: boolean
  /** Times the coach has free (ISO instants), notice period already applied. */
  openSlots?: BookingSlot[]
  /** This client's own upcoming sessions on the coach's calendar. */
  sessions?: { id: string; title: string; start: string; end: string; recurring: boolean }[]
  /** The coach's branding, when their plan includes it (server decides). */
  brand?: { name?: string; logo?: string; color?: string } | null
}

export interface BookingSlot { start: string; end: string }

export interface CoachMessage {
  id: string
  direction: 'from-coach' | 'to-coach'
  content: string
  createdAt: string
  /** A session request sent from the booking screen; the coach's answer
   *  comes back on the same message id. Absent status = waiting. */
  booking?: BookingSlot & { status?: 'accepted' | 'declined' }
}

export type ExerciseSet = { reps: number; load?: number; rpe?: number }

/** A single freeform training session — used with or without a coach. Shape
 *  deliberately mirrors the coach app's SessionLog (exercise/sets/reps/load/
 *  RPE) so a future "coach adopts this client's existing history" import is
 *  a straight copy, not a data-model translation. */
export interface PersonalWorkout {
  id: string
  date: string // yyyy-MM-dd
  title: string
  exercises: { name: string; sets: ExerciseSet[] }[]
  notes?: string
  createdAt: string
  updatedAt: string
}

export type MetricType = 'bodyweight' | 'waist' | 'chest' | 'hips' | 'bodyfat'

export interface PersonalMetric {
  id: string
  date: string
  type: MetricType
  value: number
  createdAt: string
  updatedAt: string
}

// ---- Coach wire-format types (verbatim shape copies from the coach app's
// db/types.ts — same rule as lib/sync.ts: when two codebases speak one wire
// protocol, copy the shapes, don't approximate them). These rows arrive
// inside sealed coach→client sync packets and are stored as-is so the
// program renders exactly the way the coach built it. ----

export type LoadMode = 'absolute' | 'percent1rm' | 'rpe' | 'note'
export type BlockType = 'straight' | 'superset' | 'circuit' | 'interval' | 'warmup' | 'cooldown'

export interface SetPrescription {
  reps?: string
  load?: number
  loadMode?: LoadMode
  loadNote?: string
  timeSeconds?: number
  distanceM?: number
  rpe?: number
}

export interface ExercisePrescription {
  id: string
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
  name: string
  blocks: Block[]
}

export interface Week {
  id: string
  label: string
  days: Day[]
}

/** A program assigned by the coach, exactly as their app stores it (subset
 *  of fields Companion actually renders — extra fields on the wire are kept
 *  by the spread-merge and simply not rendered). Read-mostly: a client logs
 *  against this, they don't edit it. */
export interface AssignedProgram {
  id: string
  createdAt: string
  updatedAt: string
  name: string
  description: string
  clientId?: string
  goalTag?: string
  weeks: Week[]
  status: 'draft' | 'active' | 'completed' | 'template'
  startDate?: string
}

/** The coach's exercise rows ride along with an assigned program so
 *  Companion can show real names/cues instead of opaque exercise ids. */
export interface CoachExercise {
  id: string
  createdAt: string
  updatedAt: string
  name: string
  category?: string
  cues?: string[]
}

/** Every table a local backup covers.
 *
 *  `cycleDays` IS included, and that is a deliberate call rather than an
 *  oversight — a backup that silently drops a year of health logging is a
 *  broken backup, and restore clears each listed table first, so leaving it
 *  out would strand the previous profile's cycle rows on a restored device.
 *  This is a local file the user chooses to create; sync is the boundary that
 *  matters, and cycle rows are excluded there by construction. Settings says
 *  plainly that the backup file contains it. */
export const ALL_TABLES = ['profile', 'coachLink', 'workouts', 'metrics', 'messages', 'assignedPrograms', 'coachExercises', 'cycleDays'] as const
export type TableName = (typeof ALL_TABLES)[number]

// ---- Cycle & symptom tracking (optional, LOCAL-ONLY) ----
// ⚠️ This is special-category health data (GDPR Art. 9). It is stored on this
// device and is deliberately NOT part of any sync payload: the outbound shape
// in features/sync/companionSyncApi.ts is a fixed `{ sessionLogs, metrics,
// messages }`, so cycle rows are excluded by construction rather than by a
// filter someone could accidentally remove. Do not add them to it.
//
// The science lives in lib/cycle.ts (a byte-for-byte copy of the coach app's,
// same doctrine as lib/sync.ts and lib/pose.ts). Read its header before
// touching anything here — the feature deliberately tracks SYMPTOMS and does
// not prescribe by cycle phase.
export interface CycleDay {
  id: string
  /** yyyy-MM-dd */
  date: string
  bleeding: boolean
  flow?: 'none' | 'spotting' | 'light' | 'medium' | 'heavy'
  /** Symptom → severity 0–3. */
  symptoms?: Record<string, 0 | 1 | 2 | 3>
  createdAt: string
  updatedAt: string
}

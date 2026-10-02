import { db } from './schema'
import { stamp, newId, nowIso, singleFlight } from '@/lib/core'
import type {
  CompanionProfile, CoachLink, PersonalWorkout, PersonalMetric, CoachMessage,
  AssignedProgram, CoachExercise, CycleDay,
} from './types'

const PROFILE_ID = 'profile' // singleton row, same pattern as the coach app's Trainer singleton

export const profileRepo = {
  async get(): Promise<CompanionProfile | undefined> {
    return db.profile.get(PROFILE_ID)
  },
  /** Creates the one profile row if it doesn't exist yet — no login, this
   *  IS the account.
   *
   *  Single-flighted, and tolerant of losing the insert race. Without this the
   *  app was blank on its very first launch and fine on every launch after:
   *  StrictMode ran the boot effect twice, both copies read "no profile", both
   *  called `add()`, and the loser's ConstraintError rejected a promise with no
   *  catch — so `setProfile` never ran and AppRoot rendered `null` forever.
   *  Identical bug (and identical fix) to the coach app's debt #6/#54a. */
  getOrCreate: singleFlight(async (): Promise<CompanionProfile> => {
    const existing = await db.profile.get(PROFILE_ID)
    if (existing) return existing
    const fresh: CompanionProfile = {
      id: PROFILE_ID,
      name: '',
      units: 'lb',
      theme: 'system',
      onboarded: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    try {
      await db.profile.add(fresh)
      return fresh
    } catch (err) {
      // Another tab inserted it between our read and our write — adopt their
      // row rather than failing boot. Anything else is a real error.
      const raced = await db.profile.get(PROFILE_ID)
      if (raced) return raced
      throw err
    }
  }),
  async patch(changes: Partial<CompanionProfile>) {
    await db.profile.update(PROFILE_ID, { ...changes, updatedAt: nowIso() })
  },
}

export const coachLinkRepo = {
  async get(): Promise<CoachLink | undefined> {
    const link = await db.coachLink.toCollection().first()
    // A pre-S23 E2EE pairing has no cloud token and can't sync any more.
    // Drop it so the app offers "connect with a code" instead of a dead link.
    if (link && !link.token) { await db.coachLink.delete(link.id); return undefined }
    return link
  },
  async create(link: Omit<CoachLink, 'id' | 'pairedAt'>) {
    const row: CoachLink = { ...link, id: newId(), pairedAt: nowIso() }
    await db.coachLink.add(row)
    return row
  },
  async patch(id: string, changes: Partial<CoachLink>) {
    await db.coachLink.update(id, changes)
  },
  async remove(id: string) {
    await db.coachLink.delete(id)
  },
}

export const messagesRepo = {
  async all(): Promise<CoachMessage[]> {
    return db.messages.orderBy('createdAt').toArray()
  },
  async create(m: Omit<CoachMessage, 'id' | 'createdAt'> & { id?: string }) {
    const row: CoachMessage = { createdAt: nowIso(), ...m, id: m.id ?? newId() }
    await db.messages.add(row)
    return row
  },
  /** Id-preserving upsert — a message can arrive twice (once over the live
   *  relay, once inside a sync packet); same id = same row, no duplicate
   *  bubbles in the thread. */
  async put(row: CoachMessage) {
    await db.messages.put(row)
  },
  async has(id: string) {
    return (await db.messages.get(id)) !== undefined
  },
  async get(id: string) {
    return db.messages.get(id)
  },
}

export const assignedProgramsRepo = {
  async all(): Promise<AssignedProgram[]> {
    return db.assignedPrograms.toArray()
  },
  /** Active first, then most recently updated — what the Program page shows. */
  async display(): Promise<AssignedProgram[]> {
    const rows = await db.assignedPrograms.toArray()
    return rows
      .filter(p => p.status !== 'template') // library templates never render client-side
      .sort((a, b) =>
        (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) ||
        b.updatedAt.localeCompare(a.updatedAt))
  },
  /** Newest-updatedAt-wins merge — same reconciliation rule as everything
   *  else in this protocol (see coach app's mergeUpsert). */
  async mergeUpsert(rows: AssignedProgram[]) {
    let applied = 0
    await db.transaction('rw', db.assignedPrograms, async () => {
      for (const row of rows) {
        const existing = await db.assignedPrograms.get(row.id)
        if (!existing || new Date(row.updatedAt) >= new Date(existing.updatedAt)) {
          await db.assignedPrograms.put(row)
          applied++
        }
      }
    })
    return applied
  },
}

export const coachExercisesRepo = {
  async byId(): Promise<Map<string, CoachExercise>> {
    const rows = await db.coachExercises.toArray()
    return new Map(rows.map(r => [r.id, r]))
  },
  async mergeUpsert(rows: CoachExercise[]) {
    await db.transaction('rw', db.coachExercises, async () => {
      for (const row of rows) {
        const existing = await db.coachExercises.get(row.id)
        if (!existing || new Date(row.updatedAt) >= new Date(existing.updatedAt)) {
          await db.coachExercises.put(row)
        }
      }
    })
  },
}

export const workoutsRepo = {
  async all(): Promise<PersonalWorkout[]> {
    return db.workouts.orderBy('date').reverse().toArray()
  },
  async create(w: Omit<PersonalWorkout, 'id' | 'createdAt' | 'updatedAt'>) {
    const row: PersonalWorkout = { ...w, ...stamp({}) }
    await db.workouts.add(row)
    return row
  },
  async remove(id: string) {
    await db.workouts.delete(id)
  },
}

export const metricsRepo = {
  async all(): Promise<PersonalMetric[]> {
    return db.metrics.orderBy('date').reverse().toArray()
  },
  async create(m: Omit<PersonalMetric, 'id' | 'createdAt' | 'updatedAt'>) {
    const row: PersonalMetric = { ...m, ...stamp({}) }
    await db.metrics.add(row)
    return row
  },
  async remove(id: string) {
    await db.metrics.delete(id)
  },
}

/** Cycle & symptom log. LOCAL-ONLY — see db/types.ts's CycleDay comment.
 *  Deliberately has its own `wipe()`: this data must be deletable on its own,
 *  without touching training history. */
export const cycleRepo = {
  async all(): Promise<CycleDay[]> {
    return db.cycleDays.orderBy('date').toArray()
  },
  async forDate(date: string): Promise<CycleDay | undefined> {
    return (await db.cycleDays.where('date').equals(date).toArray())[0]
  },
  /** Upsert by date — one row per day, so re-logging edits rather than duplicates. */
  async put(day: Omit<CycleDay, 'id' | 'createdAt' | 'updatedAt'>): Promise<CycleDay> {
    const existing = await cycleRepo.forDate(day.date)
    const now = nowIso()
    const row: CycleDay = existing
      ? { ...existing, ...day, updatedAt: now }
      : { ...day, id: newId(), createdAt: now, updatedAt: now }
    await db.cycleDays.put(row)
    return row
  },
  async remove(id: string) {
    await db.cycleDays.delete(id)
  },
  /** Erase every cycle row, leaving workouts and metrics untouched. */
  async wipe() {
    await db.cycleDays.clear()
  },
  async count(): Promise<number> {
    return db.cycleDays.count()
  },
}

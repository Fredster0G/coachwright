import { db } from '../schema'
import { makeRepo } from './base'
import { newId, nowIso, singleFlight, stamp, today } from '@/lib/core'
import { planRecurringInvoices, draftFromTemplate } from '@/lib/recurringInvoices'
import { computeOpenSlots, sameSlots, BOOKING_HORIZON_DAYS } from '@/lib/booking'
import type {
  Trainer, Client, ClientNote, Program, SessionLog, Metric, Waiver, CoachMessage,
  Staff, Location, Lead, ProgressPhoto, Habit, HabitEntry, Challenge, Invoice, Coupon, AutomationRule,
  ModelBlob, ExerciseEmbedding, Exercise, ExerciseOverride, FoodItem, FoodEntry,
} from '../types'

// ---------- trainer (singleton) ----------
const TRAINER_ID = 'trainer'
export const trainerRepo = {
  ...makeRepo<Trainer>(db.trainer),
  async get(): Promise<Trainer | undefined> {
    return db.trainer.get(TRAINER_ID)
  },
  /** Single-flighted check-then-insert of the singleton row. Two concurrent
   *  callers both used to read "missing" and both `add()`, and the loser's
   *  ConstraintError rejected AppRoot's un-caught boot chain — the first-boot
   *  hang in debt #6/#54a. The catch handles the cross-tab race that
   *  single-flight can't, since IndexedDB is shared between tabs. */
  getOrCreate: singleFlight(async (): Promise<Trainer> => {
    const existing = await db.trainer.get(TRAINER_ID)
    if (existing) return existing
    const t = nowIso()
    const fresh: Trainer = {
      id: TRAINER_ID, createdAt: t, updatedAt: t,
      businessName: '', trainerName: '', units: 'lb', weekStartsOn: 1,
      defaultRestSeconds: 90, currency: 'USD', onboardingComplete: false,
      companionCredit: true, density: 'compact', theme: 'system',
      // S15: new installs start on the free tier (PERSONAL — up to
      // FREE_TIER_CLIENT_LIMIT clients, see lib/membership.ts) rather than
      // the old unconditional 'independent' default. A coach who already had
      // the app before this shipped keeps whatever `edition` was already
      // stored on their trainer row — this only governs a BRAND NEW row, so
      // nobody already using the app gets downgraded by this change.
      edition: 'personal',
    }
    try {
      await db.trainer.add(fresh)
      return fresh
    } catch (err) {
      // Someone else inserted the singleton between our read and our write —
      // adopt their row instead of failing boot. Anything else is a real error.
      const raced = await db.trainer.get(TRAINER_ID)
      if (raced) return raced
      throw err
    }
  }),
  async patch(patch: Partial<Trainer>) {
    await db.trainer.update(TRAINER_ID, { ...patch, updatedAt: nowIso() })
    return db.trainer.get(TRAINER_ID)
  },
  /** Recompute the open booking slots and store them on the trainer row —
   *  only when they changed, since the row (logo and all) re-uploads on every
   *  write. Pending requests hold their slot. Returns whether it wrote. */
  publishBookingSlots: singleFlight(async (): Promise<boolean> => {
    const t = await db.trainer.get(TRAINER_ID)
    if (!t) return false
    const now = new Date()
    const nowIsoStr = now.toISOString()
    const held = (await db.messages.toArray())
      .filter(m => m.direction === 'inbound' && m.booking && !m.booking.status && m.booking.end > nowIsoStr)
      .map(m => ({ start: m.booking!.start, end: m.booking!.end }))
    const slots = t.booking?.enabled ? computeOpenSlots(t.booking, await db.appointments.toArray(), now, BOOKING_HORIZON_DAYS, held) : []
    if (sameSlots(t.bookingSlots ?? [], slots)) return false
    await db.trainer.update(TRAINER_ID, { bookingSlots: slots, updatedAt: nowIso() })
    return true
  }),
}

// ---------- clients ----------
export const clientsRepo = {
  ...makeRepo<Client>(db.clients),
  async active() {
    return db.clients.where('status').equals('active').toArray()
  },
  async archive(id: string) {
    await db.clients.update(id, { status: 'archived', archivedAt: nowIso(), updatedAt: nowIso() })
  },
  /** Hard delete (Settings → Data only): removes client + all child rows. */
  async hardDelete(id: string) {
    await db.transaction('rw', [db.clients, db.clientNotes, db.programs, db.sessionLogs, db.checkIns, db.metrics, db.payments, db.appointments, db.waivers], async () => {
      await db.clientNotes.where('clientId').equals(id).delete()
      await db.programs.where('clientId').equals(id).delete()
      await db.sessionLogs.where('clientId').equals(id).delete()
      await db.checkIns.where('clientId').equals(id).delete()
      await db.metrics.where('clientId').equals(id).delete()
      await db.payments.where('clientId').equals(id).delete()
      await db.appointments.where('clientId').equals(id).delete()
      await db.waivers.where('clientId').equals(id).delete()
      await db.clients.delete(id)
    })
  },
  async purgeDemo() {
    const demo = await db.clients.filter(c => !!c.isDemo).toArray()
    for (const c of demo) await this.hardDelete(c.id)
  },
}

// ---------- exercises ----------
function mergeOverride(ex: Exercise, o: ExerciseOverride): Exercise {
  return {
    ...ex,
    name: o.name ?? ex.name,
    cues: o.cues ?? ex.cues,
    videoLinks: o.videoLinks ?? ex.videoLinks,
    equipment: o.equipment ?? ex.equipment,
    hidden: o.hidden ?? ex.hidden,
  }
}

export const exercisesRepo = {
  ...makeRepo<Exercise>(db.exercises),
  async get(id: string): Promise<Exercise | undefined> {
    const ex = await db.exercises.get(id)
    if (!ex) return undefined
    if (ex.isCustom) return ex
    const override = await db.exerciseOverrides.get(id)
    return override ? mergeOverride(ex, override) : ex
  },
  async all(): Promise<Exercise[]> {
    const [exs, overrides] = await Promise.all([
      db.exercises.toArray(),
      db.exerciseOverrides.toArray()
    ])
    const byId = new Map(overrides.map(o => [o.id, o]))
    return exs.map(ex => {
      if (ex.isCustom) return ex
      const o = byId.get(ex.id)
      return o ? mergeOverride(ex, o) : ex
    }).filter(ex => !ex.hidden)
  },
  async update(id: string, patch: Partial<Exercise>) {
    const ex = await db.exercises.get(id)
    if (!ex) return undefined
    if (ex.isCustom) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.exercises.update(id, { ...patch, updatedAt: nowIso() } as any)
    } else {
      const existing = await db.exerciseOverrides.get(id)
      const t = nowIso()
      const o: ExerciseOverride = {
        id,
        createdAt: existing?.createdAt ?? t,
        updatedAt: t,
        exerciseId: id,
        name: patch.name !== undefined && patch.name !== ex.name ? patch.name : existing?.name,
        cues: patch.cues !== undefined ? patch.cues : existing?.cues,
        videoLinks: patch.videoLinks !== undefined ? patch.videoLinks : existing?.videoLinks,
        equipment: patch.equipment !== undefined ? patch.equipment : existing?.equipment,
        hidden: patch.hidden !== undefined ? patch.hidden : existing?.hidden,
      }
      await db.exerciseOverrides.put(o)
    }
    return this.get(id)
  }
}

// ---------- client notes ----------
export const clientNotesRepo = {
  ...makeRepo<ClientNote>(db.clientNotes),
  async forClient(clientId: string) {
    return db.clientNotes.where('clientId').equals(clientId).reverse().sortBy('createdAt')
  },
}

// ---------- programs ----------
export const programsRepo = {
  ...makeRepo<Program>(db.programs),
  async templates() {
    return db.programs.where('status').equals('template').toArray()
  },
  async forClient(clientId: string) {
    return db.programs.where('clientId').equals(clientId).toArray()
  },
  /** Make a program this client's active one. A TEMPLATE is copied (the
   *  library keeps it); any other program is reassigned in place. The
   *  client's previous active program is marked completed, so there's only
   *  ever one, and `client.activeProgramId` (Quick Log, roster adherence)
   *  points at it. Returns the program id that is now active. */
  async assignToClient(programId: string, clientId: string, startDate: string): Promise<string> {
    const src = await db.programs.get(programId)
    if (!src) throw new Error('Program not found')
    const targetId = src.status === 'template'
      ? (await programsRepo.duplicate(programId, { clientId, status: 'active', startDate })).id
      : programId
    await db.transaction('rw', [db.programs, db.clients], async () => {
      const t = nowIso()
      const previous = await db.programs.where('clientId').equals(clientId).filter(p => p.status === 'active' && p.id !== targetId).toArray()
      for (const p of previous) await db.programs.update(p.id, { status: 'completed', updatedAt: t })
      if (targetId === programId) await db.programs.update(programId, { clientId, status: 'active', startDate, updatedAt: t })
      await db.clients.update(clientId, { activeProgramId: targetId, updatedAt: t })
    })
    return targetId
  },
  /** Deep-duplicate a program (template instantiation / duplicate week uses lib fns). */
  async duplicate(programId: string, overrides: Partial<Program> = {}) {
    const src = await db.programs.get(programId)
    if (!src) throw new Error('Program not found')
    const clone: Program = stamp({
      ...structuredClone(src),
      ...overrides,
      id: newId(),
      sourceTemplateId: src.status === 'template' ? src.id : src.sourceTemplateId,
    })
    // re-key nested ids so dnd/undo identities never collide
    clone.weeks = clone.weeks.map(w => ({
      ...w, id: newId(),
      days: w.days.map(d => ({
        ...d, id: newId(),
        blocks: d.blocks.map(b => ({
          ...b, id: newId(),
          exercises: b.exercises.map(e => ({ ...e, id: newId() })),
        })),
      })),
    }))
    await db.programs.add(clone)
    return clone
  },
}

// ---------- food ----------
export const foodItemsRepo = {
  ...makeRepo<FoodItem>(db.foodItems),
  async byBarcode(barcode: string) {
    return db.foodItems.where('barcode').equals(barcode).first()
  }
}

export const foodEntriesRepo = {
  ...makeRepo<FoodEntry>(db.foodEntries),
  async forClientDate(clientId: string, date: string) {
    return db.foodEntries.where('[clientId+date]').equals([clientId, date]).toArray()
  }
}

// ---------- logs ----------
export const logsRepo = {
  ...makeRepo<SessionLog>(db.sessionLogs),
  async forClient(clientId: string) {
    return db.sessionLogs.where('clientId').equals(clientId).reverse().sortBy('date')
  },
  async lastForClient(clientId: string) {
    const all = await db.sessionLogs.where('clientId').equals(clientId).sortBy('date')
    return all.at(-1)
  },
  /** Exercise history across sessions, newest first (history drawer, spec §4.5). */
  async exerciseHistory(clientId: string, exerciseId: string, limit = 5) {
    const logs = await db.sessionLogs.where('clientId').equals(clientId).sortBy('date')
    const hits: { date: string; sets: SessionLog['entries'][number]['sets'] }[] = []
    for (const log of logs.reverse()) {
      const entry = log.entries.find(e => e.exerciseId === exerciseId)
      if (entry) hits.push({ date: log.date, sets: entry.sets })
      if (hits.length >= limit) break
    }
    return hits
  },
}

// ---------- simple repos ----------
export const checkInsRepo = makeRepo(db.checkIns)
export const metricsRepo = {
  ...makeRepo<Metric>(db.metrics),
  async forClient(clientId: string) {
    return db.metrics.where('clientId').equals(clientId).sortBy('date')
  }
}
export const paymentsRepo = makeRepo(db.payments)
export const appointmentsRepo = {
  ...makeRepo(db.appointments),
  /** All series masters + one-offs (occurrences are expanded at read time). */
  async masters() {
    return db.appointments.toArray()
  },
}
export const expensesRepo = makeRepo(db.expenses)

// ---------- waivers (liability audit trail) ----------
export const waiversRepo = {
  ...makeRepo<Waiver>(db.waivers),
  async forClient(clientId: string) {
    return db.waivers.where('clientId').equals(clientId).reverse().sortBy('signedDate')
  },
}

// ---------- messages ----------
export const messagesRepo = {
  ...makeRepo<CoachMessage>(db.messages),
  async forClient(clientId: string) {
    return db.messages.where('clientId').equals(clientId).reverse().sortBy('date')
  },
  /** Booking requests from Companion still waiting on the coach, soonest
   *  first. Past ones drop off — there's nothing left to answer. */
  async pendingBookings(now = new Date()) {
    const n = now.toISOString()
    return (await db.messages.toArray())
      .filter(m => m.direction === 'inbound' && m.booking && !m.booking.status && m.booking.end > n)
      .sort((a, b) => a.booking!.start.localeCompare(b.booking!.start))
  },
  /** Answer a booking request: on accept, the appointment is created and
   *  linked; either way the client gets a reply in the thread and the open
   *  slots are republished. One transaction so a half-answered request can't
   *  exist. Returns the appointment id on accept. */
  async answerBooking(messageId: string, accept: boolean, replyText: string): Promise<string | undefined> {
    const apptId = await db.transaction('rw', db.messages, db.appointments, async () => {
      const m = await db.messages.get(messageId)
      if (!m?.booking || m.booking.status) throw new Error('This request was already answered.')
      const t = nowIso()
      let id: string | undefined
      if (accept) {
        id = newId()
        await db.appointments.add({ id, createdAt: t, updatedAt: t, clientId: m.clientId, title: 'Session', start: m.booking.start, end: m.booking.end, status: 'scheduled' })
      }
      await db.messages.update(messageId, { booking: { ...m.booking, status: accept ? 'accepted' : 'declined', appointmentId: id }, updatedAt: t })
      await db.messages.add({ id: newId(), createdAt: t, updatedAt: t, clientId: m.clientId, date: t, direction: 'outbound', channel: 'app', content: replyText })
      return id
    })
    await trainerRepo.publishBookingSlots()
    return apptId
  },
}

// ---------- team & locations ----------
export const staffRepo = {
  ...makeRepo<Staff>(db.staff),
  async active() {
    return db.staff.filter(s => s.active).toArray()
  },
}
export const locationsRepo = makeRepo<Location>(db.locations)

// ---------- CRM / leads ----------
export const leadsRepo = {
  ...makeRepo<Lead>(db.leads),
  async open() {
    return db.leads.filter(l => l.stage !== 'won' && l.stage !== 'lost').toArray()
  },
}

// ---------- progress photos ----------
export const progressPhotosRepo = {
  ...makeRepo<ProgressPhoto>(db.progressPhotos),
  async forClient(clientId: string) {
    return db.progressPhotos.where('clientId').equals(clientId).sortBy('date')
  },
}

// ---------- habits ----------
export const habitsRepo = {
  ...makeRepo<Habit>(db.habits),
  async forClient(clientId: string) {
    return db.habits.where('clientId').equals(clientId).toArray()
  },
}
export const habitEntriesRepo = {
  ...makeRepo<HabitEntry>(db.habitEntries),
  async forClient(clientId: string) {
    return db.habitEntries.where('clientId').equals(clientId).toArray()
  },
  /** Toggle (create/flip) today's entry for a habit — idempotent per day. */
  async toggle(habitId: string, clientId: string, date: string) {
    const existing = await db.habitEntries.where('[habitId+date]').equals([habitId, date]).first()
    if (existing) {
      await db.habitEntries.update(existing.id, { done: !existing.done, updatedAt: nowIso() })
      return !existing.done
    }
    await db.habitEntries.add(stamp({ habitId, clientId, date, done: true } as HabitEntry))
    return true
  },
}

// ---------- challenges ----------
export const challengesRepo = makeRepo<Challenge>(db.challenges)

// ---------- invoicing & coupons ----------
export const invoicesRepo = {
  ...makeRepo<Invoice>(db.invoices),
  async forClient(clientId: string) {
    return db.invoices.where('clientId').equals(clientId).reverse().sortBy('number')
  },
  async nextNumber() {
    const all = await db.invoices.toArray()
    return (all.reduce((max, i) => Math.max(max, i.number), 0)) + 1
  },
  /** Create this month's (and any missed, up to a cap) draft copies of every
   *  repeat-monthly invoice. One transaction, so numbering can't interleave
   *  with itself; ids are deterministic, so re-runs are no-ops. Returns how
   *  many drafts it made. */
  generateRecurring: singleFlight(async (): Promise<number> => {
    return db.transaction('rw', db.invoices, async () => {
      const all = await db.invoices.toArray()
      const plans = planRecurringInvoices(all, today())
      if (!plans.length) return 0
      const byId = new Map(all.map(i => [i.id, i]))
      let number = all.reduce((max, i) => Math.max(max, i.number), 0)
      // Timestamped at the billing date, not now: two devices generating the
      // same month write the same row, and any real edit (sending it, marking
      // it paid) is always newer, so last-write-wins can't revert it to draft.
      for (const plan of plans) {
        const at = `${plan.date}T00:00:00.000Z`
        await db.invoices.add({ ...draftFromTemplate(byId.get(plan.templateId)!, plan, ++number), createdAt: at, updatedAt: at })
      }
      return plans.length
    })
  }),
}
export const couponsRepo = {
  ...makeRepo<Coupon>(db.coupons),
  async byCode(code: string) {
    return db.coupons.where('code').equalsIgnoreCase(code).first()
  },
}

// ---------- automation rules ----------
export const automationRulesRepo = {
  ...makeRepo<AutomationRule>(db.automationRules),
  async active() {
    return db.automationRules.filter(r => r.active).toArray()
  },
}

// ---------- local-AI model weight cache (lib/modelFetch.ts) ----------
// Hand-written rather than makeRepo: ModelBlob deliberately has no
// createdAt/updatedAt (see its own doc comment in db/types.ts) — a download
// cache isn't user data with an edit history.
export const modelBlobsRepo = {
  async get(id: string): Promise<ModelBlob | undefined> {
    return db.modelBlobs.get(id)
  },
  async has(id: string): Promise<boolean> {
    return (await db.modelBlobs.get(id)) !== undefined
  },
  async allIds(): Promise<string[]> {
    return db.modelBlobs.toCollection().primaryKeys()
  },
  async put(id: string, blob: Blob): Promise<void> {
    const row: ModelBlob = { id, blob, bytes: blob.size, cachedAt: nowIso() }
    await db.modelBlobs.put(row)
  },
  async remove(id: string): Promise<void> {
    await db.modelBlobs.delete(id)
  },
  /** Total bytes currently cached, across every installed model — shown in
   *  Settings so "remove downloads" has a real number attached to it. */
  async totalBytes(): Promise<number> {
    const rows = await db.modelBlobs.toArray()
    return rows.reduce((sum, r) => sum + r.bytes, 0)
  },
}

// ---------- exercise semantic-search cache (lib/embeddings.ts) ----------
export const exerciseEmbeddingsRepo = {
  async get(exerciseId: string): Promise<ExerciseEmbedding | undefined> {
    return db.exerciseEmbeddings.get(exerciseId)
  },
  async put(row: ExerciseEmbedding): Promise<void> {
    await db.exerciseEmbeddings.put(row)
  },
  /** Loaded once per search-index build rather than per-exercise — 350
   *  individual IndexedDB reads to score one query would be needless
   *  latency when one bulk read gives the same data. */
  async all(): Promise<ExerciseEmbedding[]> {
    return db.exerciseEmbeddings.toArray()
  },
  async remove(exerciseId: string): Promise<void> {
    await db.exerciseEmbeddings.delete(exerciseId)
  },
  async clear(): Promise<void> {
    await db.exerciseEmbeddings.clear()
  },
}

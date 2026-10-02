// ===== Sync with the coach, via Coachwright Cloud =====
// The coach gives the client a one-time connect code (their app → client page
// → Connect Companion). Redeeming it returns a token that can read ONLY this
// client's program, exercises and message thread, and add this client's own
// logs and messages — the server forces every upload onto this client.
//
// Outbound rows use the coach app's own SessionLog/Metric/CoachMessage shapes
// so they land in the coach's tables as-is.

import {
  coachLinkRepo, workoutsRepo, metricsRepo, messagesRepo,
  assignedProgramsRepo, coachExercisesRepo,
} from '@/db/repo'
import { nowIso } from '@/lib/core'
import { clientApi, CloudError } from '@/lib/cloud'
import type { CoachLink, AssignedProgram, CoachExercise, PersonalWorkout, PersonalMetric, CoachMessage, BookingSlot } from '@/db/types'

// ---- connect ----

export async function connectWithCode(code: string): Promise<CoachLink> {
  const r = await clientApi<{ token: string; clientId: string; coachName: string }>('/client/redeem', null, { json: { code } })
  const existing = await coachLinkRepo.get()
  if (existing) await coachLinkRepo.remove(existing.id)
  return coachLinkRepo.create({ coachName: r.coachName, token: r.token, clientIdOnCoachSide: r.clientId })
}

// ---- client → coach (pure payload builder, see cyclePrivacy.test.ts) ----

interface CoachSessionLogRow {
  id: string; createdAt: string; updatedAt: string
  clientId: string; date: string; title: string
  entries: { exerciseId: string; sets: { reps: number; load?: number; rpe?: number }[] }[]
  source: 'companion-import'
}
interface CoachMetricRow {
  id: string; createdAt: string; updatedAt: string
  clientId: string; date: string; type: string; key: string; value: number; unit: string
}
interface CoachMessageRow {
  id: string; createdAt: string; updatedAt: string
  clientId: string; date: string; direction: 'inbound' | 'outbound'
  channel: 'app'; content: string
  /** Only the requested time goes up — the server drops anything else. */
  booking?: BookingSlot
}
interface OutboundPayload {
  tables: { sessionLogs: CoachSessionLogRow[]; metrics: CoachMetricRow[]; messages: CoachMessageRow[] }
}

/** Only rows changed since `since` (ISO), so a long history isn't re-sent on
 *  every sync. The server stamps the real client id; `clientId` here is a
 *  placeholder it overwrites. */
export function buildOutbound(workouts: PersonalWorkout[], metrics: PersonalMetric[], messages: CoachMessage[], clientId: string, since?: string): OutboundPayload {
  const changed = (updatedAt: string) => !since || updatedAt > since
  return {
    tables: {
      sessionLogs: workouts.filter(w => changed(w.updatedAt)).map(w => ({
        id: w.id, createdAt: w.createdAt, updatedAt: w.updatedAt,
        clientId, date: w.date, title: w.title,
        entries: w.exercises.map(e => ({ exerciseId: e.name, sets: e.sets })),
        source: 'companion-import',
      })),
      metrics: metrics.filter(m => changed(m.updatedAt)).map(m => ({
        id: m.id, createdAt: m.createdAt, updatedAt: m.updatedAt,
        clientId, date: m.date,
        type: m.type === 'bodyfat' ? 'bodyfat' : 'measurement',
        key: m.type, value: m.value, unit: m.type === 'bodyfat' ? '%' : '',
      })),
      // Only this side's own messages; the coach's come back in the bundle.
      messages: messages.filter(m => m.direction === 'to-coach' && changed(m.createdAt)).map(m => ({
        id: m.id, createdAt: m.createdAt, updatedAt: m.createdAt,
        clientId, date: m.createdAt,
        direction: 'inbound' as const, channel: 'app' as const, content: m.content,
        ...(m.booking ? { booking: { start: m.booking.start, end: m.booking.end } } : {}),
      })),
    },
  }
}

const PUSH_BATCH = 400

async function pushToCoach(link: CoachLink): Promise<void> {
  const startedAt = nowIso()
  const [workouts, metrics, messages] = await Promise.all([workoutsRepo.all(), metricsRepo.all(), messagesRepo.all()])
  const { tables } = buildOutbound(workouts, metrics, messages, link.clientIdOnCoachSide ?? '', link.lastPushAt)
  const changes = (Object.entries(tables) as [string, { id: string; updatedAt: string }[]][])
    .flatMap(([table, rows]) => rows.map(r => ({ table, id: r.id, updatedAt: r.updatedAt, data: r })))
  for (let i = 0; i < changes.length; i += PUSH_BATCH) {
    await clientApi('/client/push', link.token, { json: { changes: changes.slice(i, i + PUSH_BATCH) } })
  }
  await coachLinkRepo.patch(link.id, { lastPushAt: startedAt })
}

// ---- coach → client ----

interface Bundle {
  coachName: string
  client: { id: string; firstName?: string; lastName?: string } | null
  programs: AssignedProgram[]
  exercises: CoachExercise[]
  messages: { id: string; direction: string; content: string; date: string; booking?: BookingSlot & { status?: 'accepted' | 'declined' } }[]
  booking?: { enabled: boolean }
  openSlots?: BookingSlot[]
  sessions?: CoachLink['sessions']
  brand?: CoachLink['brand']
}

async function pullFromCoach(link: CoachLink): Promise<{ programs: number; messages: number }> {
  const b = await clientApi<Bundle>('/client/bundle', link.token)
  const programs = await assignedProgramsRepo.mergeUpsert(b.programs)
  await coachExercisesRepo.mergeUpsert(b.exercises)
  let messages = 0
  for (const m of b.messages) {
    // Our own booking request, answered by the coach: take the answer.
    if (m.direction === 'inbound' && m.booking?.status) {
      const mine = await messagesRepo.get(m.id)
      if (mine?.booking && mine.booking.status !== m.booking.status) {
        await messagesRepo.put({ ...mine, booking: { ...mine.booking, status: m.booking.status } })
      }
      continue
    }
    if (m.direction !== 'outbound' || await messagesRepo.has(m.id)) continue
    await messagesRepo.put({ id: m.id, direction: 'from-coach', content: m.content, createdAt: m.date })
    messages++
  }
  await coachLinkRepo.patch(link.id, {
    coachName: b.coachName,
    bookingEnabled: !!b.booking?.enabled,
    openSlots: b.openSlots ?? [],
    sessions: b.sessions ?? [],
    brand: b.brand ?? null,
  })
  return { programs, messages }
}

/** Reminders the coach scheduled, delivered once each as a coach message. */
export async function pullReminders(link: CoachLink): Promise<number> {
  const r = await clientApi<{ reminders: { id: string; content: string; sendAt: string }[] }>('/client/reminders/due', link.token)
  let count = 0
  for (const rem of r.reminders) {
    if (await messagesRepo.has(rem.id)) continue
    await messagesRepo.put({ id: rem.id, direction: 'from-coach', content: `Reminder: ${rem.content}`, createdAt: rem.sendAt })
    count++
  }
  return count
}

/** Push what's been logged, then pull program + messages + reminders. A 401
 *  means the coach disconnected this device: the link is removed (local
 *  history stays) and the error says so. */
export async function syncNow(link: CoachLink): Promise<{ pulled: number; programs: number; reminders: number }> {
  try {
    await pushToCoach(link)
    const r = await pullFromCoach(link)
    const reminders = await pullReminders(link)
    await coachLinkRepo.patch(link.id, { lastSyncAt: nowIso() })
    return { pulled: r.messages, programs: r.programs, reminders }
  } catch (err) {
    if (err instanceof CloudError && err.status === 401) {
      await coachLinkRepo.remove(link.id)
      throw new Error('Your coach disconnected this app. Ask them for a new connect code — your own history is still here.')
    }
    throw err
  }
}

/** Save a message locally, then deliver it. Offline isn't an error: it's
 *  queued and goes out with the next sync. Returns true if delivered now. */
export async function pushMessageToCoach(link: CoachLink, content: string, booking?: BookingSlot): Promise<boolean> {
  await messagesRepo.create({ direction: 'to-coach', content, ...(booking ? { booking: { start: booking.start, end: booking.end } } : {}) })
  try {
    await pushToCoach(link)
    return true
  } catch (err) {
    if (err instanceof CloudError && err.status === 0) return false
    throw err
  }
}

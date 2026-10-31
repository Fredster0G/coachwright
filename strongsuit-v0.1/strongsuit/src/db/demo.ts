// ===== Sample roster for a new coach (onboarding step 3) =====
//
// The wizard promises "sample history, check-ins, and active programs so you
// can see how the analytics and logger work" — until S28 it created three
// bare client rows and nothing else. This builds the real thing: per client
// an active program, three weeks of logged sessions with progressing loads,
// weekly check-ins and bodyweight readings. Everything hangs off clients
// marked `isDemo`, so `clientsRepo.purgeDemo()` (Clients page → "Remove
// sample clients") removes all of it.

import { db } from './schema'
import { clientsRepo, programsRepo } from './repo'
import { newId, nowIso, isoDay } from '@/lib/core'
import type { CheckIn, Client, Metric, Program, SessionLog } from './types'

const PEOPLE = [
  { firstName: 'Alex', lastName: 'Demo', email: 'alex@example.com', base: 1.0, bw: 82 },
  { firstName: 'Sam', lastName: 'Sample', email: 'sam@example.com', base: 0.7, bw: 64 },
  { firstName: 'Jordan', lastName: 'Test', email: 'jordan@example.com', base: 0.85, bw: 75 },
]
// Name in the seed library → working load for a base-1.0 lifter, in kg.
const LIFTS: [string, number][] = [['Back Squat', 100], ['Bench Press', 70], ['Romanian Deadlift', 90]]
const LB_PER_KG = 2.2046

const daysAgo = (n: number, from: Date) => isoDay(new Date(from.getFullYear(), from.getMonth(), from.getDate() - n))
const round = (v: number, step: number) => Math.round(v / step) * step

/** Seeds the sample roster; returns the client ids. Loads are in the coach's units. */
export async function seedDemoRoster(units: 'lb' | 'kg', now = new Date()): Promise<string[]> {
  const all = await db.exercises.toArray()
  const lifts = LIFTS
    .map(([name, kg]) => ({ ex: all.find(e => e.name === name), kg }))
    .filter((l): l is { ex: NonNullable<typeof l.ex>; kg: number } => !!l.ex)
  const toUnits = (kg: number) => units === 'lb' ? round(kg * LB_PER_KG, 5) : round(kg, 2.5)
  const t = nowIso()
  const ids: string[] = []

  for (const p of PEOPLE) {
    const client = await clientsRepo.create({
      firstName: p.firstName, lastName: p.lastName, email: p.email, status: 'active', isDemo: true,
      startDate: daysAgo(21, now), tags: ['sample'], goals: 'Get stronger on the big three', injuries: '', parqNotes: '',
    } as Omit<Client, 'id' | 'createdAt' | 'updatedAt'>)
    ids.push(client.id)

    const dayId = newId(), weekId = newId()
    const program = await programsRepo.create({
      name: 'Sample: Full-body strength', description: 'Three lifts, three sets of five — a sample program.',
      status: 'draft', goalTag: 'Strength',
      weeks: [{ id: weekId, label: 'Week 1', days: [{ id: dayId, name: 'Full body', blocks: [{
        id: newId(), type: 'straight',
        exercises: lifts.map(l => ({ id: newId(), exerciseId: l.ex.id, sets: [1, 2, 3].map(() => ({ reps: '5', load: toUnits(l.kg * p.base) })), restSeconds: 150 })),
      }] }] }],
    } as Omit<Program, 'id' | 'createdAt' | 'updatedAt'>)
    await programsRepo.assignToClient(program.id, client.id, daysAgo(21, now))

    // Three sessions a week for three weeks, +2.5% a week.
    const logs: SessionLog[] = []
    for (let week = 0; week < 3; week++) {
      for (const offset of [0, 2, 4]) {
        const ago = 20 - week * 7 - offset
        if (ago < 0) continue
        logs.push({
          id: newId(), createdAt: t, updatedAt: t, clientId: client.id, programId: program.id, weekId, dayId,
          date: daysAgo(ago, now), title: 'Full body', source: 'trainer',
          entries: lifts.map(l => ({
            exerciseId: l.ex.id,
            sets: [1, 2, 3].map(() => ({ targetReps: '5', actualReps: 5, actualLoad: toUnits(l.kg * p.base * (1 + 0.025 * week)), rpe: 7 + week * 0.5, done: true })),
          })),
        })
      }
    }
    await db.sessionLogs.bulkAdd(logs)

    const checkIns: CheckIn[] = [14, 7, 0].map((ago, i) => ({
      id: newId(), createdAt: t, updatedAt: t, clientId: client.id, date: daysAgo(ago, now), source: 'trainer',
      mood: 3 + (i % 2), sleepHours: 7 + i * 0.5, energy: 3 + i % 2, adherence: 4,
      bodyweight: toUnits(p.bw - i * 0.4), answers: [],
    }))
    await db.checkIns.bulkAdd(checkIns)

    const metrics: Metric[] = [21, 14, 7, 0].map((ago, i) => ({
      id: newId(), createdAt: t, updatedAt: t, clientId: client.id, date: daysAgo(ago, now),
      type: 'bodyweight', key: 'bodyweight', unit: units,
      value: units === 'lb' ? Math.round((p.bw - i * 0.4) * LB_PER_KG * 10) / 10 : Math.round((p.bw - i * 0.4) * 10) / 10,
    }))
    await db.metrics.bulkAdd(metrics)
  }
  return ids
}

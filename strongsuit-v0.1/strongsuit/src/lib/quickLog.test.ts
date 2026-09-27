import { describe, it, expect } from 'vitest'
import { isoDay } from './core'
import {
  parseQuickLog, resolveClient, resolveExercise, buildQuickLogPlan, describePlan,
} from './quickLog'

const clients = [
  { id: 'c1', firstName: 'Sam', lastName: 'Rivera' },
  { id: 'c2', firstName: 'Samantha', lastName: 'Cole' },
  { id: 'c3', firstName: 'Jordan', lastName: 'Lee' },
]
const exercises = [
  { id: 'e1', name: 'Back Squat', aliases: ['squat', 'bb squat'] },
  { id: 'e2', name: 'Front Squat', aliases: ['fs'] },
  { id: 'e3', name: 'Bench Press', aliases: ['bench', 'bb bench'] },
]

describe('parseQuickLog — set notation', () => {
  it('parses sets x reps', () => {
    expect(parseQuickLog('3x5').prescription).toMatchObject({ sets: 3, reps: 5 })
  })

  it('parses sets x reps x load', () => {
    expect(parseQuickLog('3x5x225').prescription).toMatchObject({ sets: 3, reps: 5, load: 225 })
  })

  it('parses sets x reps then a bare load', () => {
    expect(parseQuickLog('sam 3x5 225 back squat').prescription).toMatchObject({ sets: 3, reps: 5, load: 225 })
  })

  it('parses load-first shorthand (225x5)', () => {
    // Magnitude disambiguates: 225 sets of 5 is not a thing.
    expect(parseQuickLog('sam 225x5 bench').prescription).toMatchObject({ load: 225, reps: 5 })
  })

  it('does NOT read a small first number as a load', () => {
    // "3x5" must stay 3 sets of 5, never 3 lb for 5.
    const p = parseQuickLog('sam 3x5 bench').prescription
    expect(p.sets).toBe(3)
    expect(p.reps).toBe(5)
    expect(p.load).toBeUndefined()
  })

  it('parses reps @ load', () => {
    expect(parseQuickLog('5@225').prescription).toMatchObject({ reps: 5, load: 225 })
  })

  it('parses explicit units', () => {
    expect(parseQuickLog('sam 3x5 100kg squat').prescription).toMatchObject({ load: 100, units: 'kg' })
    expect(parseQuickLog('sam 3x5 225lb squat').prescription).toMatchObject({ load: 225, units: 'lb' })
  })

  it('parses bodyweight', () => {
    expect(parseQuickLog('sam 3x10 bw pull up').prescription.bodyweight).toBe(true)
  })
})

describe('parseQuickLog — RPE', () => {
  it('parses "rpe 8"', () => {
    expect(parseQuickLog('sam 3x5 225 squat rpe 8').prescription.rpe).toBe(8)
  })

  it('parses half-point RPE', () => {
    expect(parseQuickLog('sam 3x5 squat rpe 8.5').prescription.rpe).toBe(8.5)
  })

  it('does not mistake a load for an RPE', () => {
    const p = parseQuickLog('sam 3x5 225lb squat').prescription
    expect(p.rpe).toBeUndefined()
    expect(p.load).toBe(225)
  })
})

describe('parseQuickLog — dates and notes', () => {
  it('resolves yesterday to an ISO date', () => {
    const d = new Date(); d.setDate(d.getDate() - 1)
    const expected = isoDay(d)
    expect(parseQuickLog('sam 3x5 squat yesterday').date).toBe(expected)
  })

  it('keeps a quoted note out of the parsed data', () => {
    const d = parseQuickLog('sam 3x5 225 squat "felt heavy today"')
    expect(d.notes).toBe('felt heavy today')
    // The note's words must not leak into the exercise query.
    expect(d.exerciseQuery).not.toContain('heavy')
    expect(d.prescription).toMatchObject({ sets: 3, reps: 5, load: 225 })
  })
})

describe('parseQuickLog — name and exercise split', () => {
  it('separates the client from the exercise', () => {
    const d = parseQuickLog('sam 3x5 225 back squat')
    expect(d.clientQuery).toBe('sam')
    expect(d.exerciseQuery).toBe('back squat')
  })

  it('survives having no structured data at all', () => {
    const d = parseQuickLog('jordan bench')
    expect(d.clientQuery).toBe('jordan')
    expect(d.exerciseQuery).toBe('bench')
  })
})

describe('resolveClient', () => {
  it('resolves an unambiguous first name', () => {
    const r = resolveClient('jordan', clients)
    expect(r.status).toBe('resolved')
    expect(r.match?.id).toBe('c3')
  })

  it('refuses to guess between two similar names', () => {
    // THE most important assertion here: "sam" matches both Sam and Samantha,
    // and logging to the wrong client silently corrupts training history.
    const r = resolveClient('sam', clients)
    expect(r.status).toBe('ambiguous')
    expect(r.candidates.length).toBeGreaterThanOrEqual(2)
  })

  it('resolves a full name exactly', () => {
    const r = resolveClient('samantha cole', clients)
    expect(r.status).toBe('resolved')
    expect(r.match?.id).toBe('c2')
  })

  it('reports missing when nothing matches', () => {
    expect(resolveClient('zzzz', clients).status).toBe('missing')
  })

  it('reports none when there was no query at all', () => {
    expect(resolveClient(undefined, clients).status).toBe('none')
  })
})

describe('resolveExercise', () => {
  it('resolves by alias', () => {
    const r = resolveExercise('bench', exercises)
    expect(r.status).toBe('resolved')
    expect(r.match?.id).toBe('e3')
  })

  it('resolves an exact name', () => {
    expect(resolveExercise('back squat', exercises).match?.id).toBe('e1')
  })

  it('asks when a term matches several exercises', () => {
    // "squat" is an alias of Back Squat but also a substring of Front Squat.
    const r = resolveExercise('squat', exercises)
    expect(['resolved', 'ambiguous']).toContain(r.status)
    if (r.status === 'ambiguous') expect(r.candidates.length).toBeGreaterThan(1)
  })
})

describe('buildQuickLogPlan', () => {
  it('is ready when everything resolves cleanly', () => {
    const plan = buildQuickLogPlan('jordan 3x5 225 back squat rpe 8', clients, exercises)
    expect(plan.ready).toBe(true)
    expect(plan.clarifications).toHaveLength(0)
    expect(plan.client.match?.id).toBe('c3')
    expect(plan.exercise.match?.id).toBe('e1')
    expect(plan.draft.prescription).toMatchObject({ sets: 3, reps: 5, load: 225, rpe: 8 })
  })

  it('asks which client when the name is ambiguous, and is NOT ready', () => {
    const plan = buildQuickLogPlan('sam 3x5 225 back squat', clients, exercises)
    expect(plan.ready).toBe(false)
    const q = plan.clarifications.find(c => c.id === 'client')
    expect(q).toBeDefined()
    expect(q!.options?.map(o => o.label)).toEqual(
      expect.arrayContaining(['Sam Rivera', 'Samantha Cole']),
    )
  })

  it('asks the client question first — it is the costliest to get wrong', () => {
    const plan = buildQuickLogPlan('sam squat', clients, exercises)
    expect(plan.clarifications[0].id).toBe('client')
  })

  it('asks for reps when none were given', () => {
    const plan = buildQuickLogPlan('jordan back squat', clients, exercises)
    expect(plan.ready).toBe(false)
    expect(plan.clarifications.some(c => c.id === 'reps')).toBe(true)
  })

  it('never asks for load — bodyweight and unreadable stacks are legitimate', () => {
    const plan = buildQuickLogPlan('jordan 3x5 back squat', clients, exercises)
    expect(plan.clarifications.some(c => c.id === 'load')).toBe(false)
    expect(plan.ready).toBe(true)
  })

  it('names the unmatched term in the question so the coach can see the typo', () => {
    const plan = buildQuickLogPlan('zzzz 3x5 back squat', clients, exercises)
    expect(plan.clarifications.find(c => c.id === 'client')?.question).toContain('zzzz')
  })
})

describe('describePlan', () => {
  it('renders a confirmable one-liner', () => {
    expect(describePlan({ sets: 3, reps: 5, load: 225, rpe: 8 })).toBe('3 × 5 · 225 lb · RPE 8')
  })

  it('renders bodyweight instead of a load', () => {
    expect(describePlan({ sets: 3, reps: 10, bodyweight: true })).toBe('3 × 10 · bodyweight')
  })

  it('honours the unit', () => {
    expect(describePlan({ reps: 5, load: 100, units: 'kg' })).toBe('5 reps · 100 kg')
  })

  it('says so when there is nothing yet', () => {
    expect(describePlan({})).toBe('no sets yet')
  })
})

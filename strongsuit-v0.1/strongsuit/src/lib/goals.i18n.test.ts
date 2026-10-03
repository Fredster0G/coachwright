import { describe, it, expect } from 'vitest'
import en from './i18n/locales/en'
import { ALL_GOALS, goalPlan } from './goals'

// The Coaching tab reads goal copy from the catalogue (goal.<id>.*) while
// goals.ts keeps the English for the engine. They must not drift.
describe('goal copy in the catalogue matches goals.ts', () => {
  const norm = (s: string) => s.replace(/'/g, '’')
  it.each(ALL_GOALS)('%s', g => {
    const p = goalPlan(g)
    const cat = en as Record<string, unknown>
    expect(cat[`goal.${g}.label`]).toBe(norm(p.label))
    expect(cat[`goal.${g}.summary`]).toBe(norm(p.summary))
    expect(cat[`goal.${g}.cardio`]).toBe(norm(p.cardio))
    p.rationale.forEach((r, i) => expect(cat[`goal.${g}.why${i}`]).toBe(norm(r.text)))
    expect(cat[`goal.${g}.why${p.rationale.length}`]).toBeUndefined()
  })
})

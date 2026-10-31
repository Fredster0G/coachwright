import { describe, it, expect } from 'vitest'
import { nutritionPlan, dietBreakAdvice, carbCycle } from './nutrition'

describe('nutritionPlan — the weekly-rate line tells the truth (S28)', () => {
  it('a light 60 kg sedentary woman on a 15% cut loses well under 0.5%/week — the note says so', () => {
    // Before S28 every cut read "inside the 0.5–1%/week range".
    const p = nutritionPlan({ weightKg: 60, heightCm: 160, age: 40, sex: 'female', activity: 'sedentary', goal: 'cut' })
    expect(p.weeklyRateNote).toMatch(/\(0\.[0-4]% of bodyweight\) — gentler than the 0\.5–1%\/week range/)
    expect(p.weeklyRateMsg.key).toBe('nutrition.rate.cutSlow')
  })
  it('the printed percent and the verdict agree at the boundary', () => {
    const p = nutritionPlan({ weightKg: 80, heightCm: 175, age: 35, sex: 'male', activity: 'moderate', goal: 'cut' })
    // 0.46% prints as "0.5%" — so it must read as inside the range, not "gentler than".
    expect(p.weeklyRateNote).toMatch(/\(0\.5% of bodyweight\) — inside/)
  })
  it('every rationale line carries a translatable message matching its English', () => {
    const p = nutritionPlan({ weightKg: 70, heightCm: 165, age: 30, sex: 'female', activity: 'light', goal: 'gain' })
    for (const line of Object.values(p.rationale)) expect(line.msg?.key).toMatch(/^nutrition\.why\./)
    expect(p.rationale.calories.text).toMatch(/10% surplus/)
    expect(p.weeklyRateNote).toMatch(/lean surplus/)
  })
})

describe('dietBreakAdvice / carbCycle messages', () => {
  it('keeps the English and the key in step', () => {
    expect(dietBreakAdvice(13).noteMsg.key).toBe('nutrition.break.overdue')
    expect(dietBreakAdvice(13).note).toMatch(/^13 weeks in a deficit/)
    const p = nutritionPlan({ weightKg: 80, heightCm: 180, age: 30, sex: 'male', activity: 'moderate', goal: 'maintain' })
    expect(carbCycle(p, 4).rationale.msg?.key).toBe('nutrition.why.cycle')
  })
})

// S24: several places derived "a date" with `toISOString().slice(0, 10)` —
// the UTC day, not the coach's. These run in a zone where the two differ.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { monotonyStrain, acwr } from './trainingLoad'
import { parseQuickLog } from './quickLog'
import { isoDay } from './core'

let savedTz: string | undefined
beforeAll(() => { savedTz = process.env.TZ; process.env.TZ = 'Asia/Tokyo' })
afterAll(() => { if (savedTz === undefined) delete process.env.TZ; else process.env.TZ = savedTz })

describe('local calendar days (east of UTC)', () => {
  it('the zone switch took effect', () => {
    expect(new Date(2026, 0, 1, 0, 0).toISOString().slice(0, 10)).toBe('2025-12-31')
  })

  it('isoDay is the local day', () => {
    expect(isoDay(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01')
  })

  it('training load counts a session on the day it was logged', () => {
    const loads = [{ date: '2026-03-10', load: 500 }]
    expect(monotonyStrain(loads, '2026-03-10').strain).toBeGreaterThan(0)
    expect(acwr(loads, '2026-03-10').acute).toBeGreaterThan(0)
  })

  it('quick-log "yesterday" is the local yesterday', () => {
    const d = new Date(); d.setDate(d.getDate() - 1)
    expect(parseQuickLog('sam 3x5 squat yesterday').date).toBe(isoDay(d))
  })
})

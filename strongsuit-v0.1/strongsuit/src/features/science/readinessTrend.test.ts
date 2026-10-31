import { describe, it, expect } from 'vitest'
import { readinessTrend, flagReadinessToday } from './readinessTrend'
import type { CheckIn } from '@/db/types'

function dateOf(dayIndex: number): string {
  // day 1 => 2026-01-01, day 20 => 2026-01-20 (all well within one month, no rollover math needed)
  return `2026-01-${String(dayIndex).padStart(2, '0')}`
}

function checkIn(clientId: string, dayIndex: number, overrides: Partial<CheckIn> = {}): CheckIn {
  return {
    id: `${clientId}-${dayIndex}`, createdAt: '', updatedAt: '',
    clientId, date: dateOf(dayIndex), answers: [], source: 'trainer', ...overrides,
  }
}

describe('readinessTrend', () => {
  it('reads "learning" for every point when there is not yet a baseline', () => {
    const checkIns = Array.from({ length: 10 }, (_, i) => checkIn('c1', i + 1, { mood: 7 }))
    const trend = readinessTrend(checkIns, 5)
    expect(trend).toHaveLength(5)
    expect(trend.every(p => p.score === null && p.band === 'learning')).toBe(true)
  })

  it('scores points once enough baseline has accumulated, holding steady for a constant history', () => {
    const checkIns = Array.from({ length: 20 }, (_, i) => checkIn('c1', i + 1, { mood: 7 }))
    const trend = readinessTrend(checkIns, 5)
    expect(trend).toHaveLength(5)
    // Every one of the last 5 days has >=14 prior days by the time it's evaluated,
    // and the history is perfectly constant, so each reads exactly at baseline.
    expect(trend.every(p => p.score === 70 && p.band === 'go')).toBe(true)
  })

  it('caps the window to however much history actually exists', () => {
    const checkIns = Array.from({ length: 3 }, (_, i) => checkIn('c1', i + 1, { mood: 7 }))
    expect(readinessTrend(checkIns, 14)).toHaveLength(3)
  })
})

describe('flagReadinessToday', () => {
  const baseline = Array.from({ length: 19 }, (_, i) => checkIn('c1', i + 1, { sleepHours: 8 }))

  it('flags an active client whose today reading is well below their own normal', () => {
    const checkIns = [...baseline, checkIn('c1', 20, { sleepHours: 4 })]
    const flags = flagReadinessToday(
      [{ id: 'c1', status: 'active' }],
      new Map([['c1', checkIns]]),
    )
    expect(flags).toEqual([{ clientId: 'c1', band: 'easy', recommendation: expect.any(String), recMsg: expect.objectContaining({ key: 'readiness.easy' }) }])
  })

  it('does not flag a paused or archived client even with the same low reading', () => {
    const checkIns = [...baseline, checkIn('c1', 20, { sleepHours: 4 })]
    const flags = flagReadinessToday(
      [{ id: 'c1', status: 'paused' }],
      new Map([['c1', checkIns]]),
    )
    expect(flags).toEqual([])
  })

  it('does not flag a client still learning their baseline', () => {
    const checkIns = [checkIn('c1', 1, { sleepHours: 4 })]
    const flags = flagReadinessToday(
      [{ id: 'c1', status: 'active' }],
      new Map([['c1', checkIns]]),
    )
    expect(flags).toEqual([])
  })

  it('does not flag a client reading at or above their normal', () => {
    const checkIns = [...baseline, checkIn('c1', 20, { sleepHours: 8 })]
    const flags = flagReadinessToday(
      [{ id: 'c1', status: 'active' }],
      new Map([['c1', checkIns]]),
    )
    expect(flags).toEqual([])
  })
})

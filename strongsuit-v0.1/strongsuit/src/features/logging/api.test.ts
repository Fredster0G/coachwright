import { describe, it, expect } from 'vitest'
import { completeSet, shownLoad } from './api'

describe('completeSet', () => {
  it('records the prescribed load and reps when nothing was typed', () => {
    expect(completeSet({ targetReps: '5', targetLoad: 100, done: false })).toMatchObject({ done: true, actualLoad: 100, actualReps: 5 })
  })
  it('keeps what the coach entered', () => {
    expect(completeSet({ targetReps: '5', targetLoad: 100, actualLoad: 95, actualReps: 4, done: false })).toMatchObject({ actualLoad: 95, actualReps: 4 })
  })
  it('does not invent reps from a range or AMRAP, nor a load from %1RM/RPE', () => {
    const r = completeSet({ targetReps: '8-10', targetLoad: 75, targetLoadMode: 'percent1rm', done: false })
    expect(r.actualReps).toBeUndefined()
    expect(r.actualLoad).toBeUndefined()
    expect(completeSet({ targetReps: 'AMRAP', done: false }).actualReps).toBeUndefined()
  })
})

describe('shownLoad', () => {
  it('shows an absolute target, hides a %1RM/RPE one', () => {
    expect(shownLoad({ targetLoad: 100, done: false })).toBe(100)
    expect(shownLoad({ targetLoad: 8, targetLoadMode: 'rpe', done: false })).toBeUndefined()
  })
})

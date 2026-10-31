import { describe, it, expect } from 'vitest'
import { bumpReps, progressSet } from './builderMutations'

describe('bumpReps', () => {
  it('adds one to a single number and both ends of a range', () => {
    expect(bumpReps('5')).toBe('6')
    expect(bumpReps('8-10')).toBe('9-11')
    expect(bumpReps('8 – 10')).toBe('9–11')
  })
  it('leaves non-numeric prescriptions alone', () => {
    expect(bumpReps('AMRAP')).toBe('AMRAP')
    expect(bumpReps('')).toBe('')
    expect(bumpReps(undefined)).toBeUndefined()
  })
})

describe('progressSet', () => {
  it('scales absolute loads only', () => {
    expect(progressSet({ reps: '5', load: 100 }, 'load').load).toBe(102.5)
    expect(progressSet({ reps: '5', load: 75, loadMode: 'percent1rm' }, 'load').load).toBe(75)
  })
  it('none is an exact copy', () => {
    const s = { reps: '5', load: 100 }
    expect(progressSet(s, 'none')).toEqual(s)
  })
})

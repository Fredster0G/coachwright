import { describe, it, expect } from 'vitest'
import { fmtSet, convertLoad } from './programFormat'

describe('fmtSet', () => {
  it('formats absolute load with units', () => {
    expect(fmtSet({ reps: '8', load: 135, loadMode: 'absolute' }, 'lb')).toBe('8 × 135 lb')
    expect(fmtSet({ reps: '5', load: 100, loadMode: 'absolute' }, 'kg')).toBe('5 × 100 kg')
  })

  it('formats percent-of-1RM prescriptions', () => {
    expect(fmtSet({ reps: '3', load: 85, loadMode: 'percent1rm' }, 'lb')).toBe('3 @ 85%')
  })

  it('formats RPE prescriptions, including load-less rows without an explicit mode', () => {
    expect(fmtSet({ reps: '8-10', rpe: 8, loadMode: 'rpe' }, 'lb')).toBe('8-10 @ RPE 8')
    expect(fmtSet({ reps: '10', rpe: 7 }, 'lb')).toBe('10 @ RPE 7')
  })

  it('passes coach load notes through verbatim', () => {
    expect(fmtSet({ reps: 'AMRAP', loadMode: 'note', loadNote: 'heavy but crisp' }, 'lb')).toBe('AMRAP @ heavy but crisp')
  })

  it('prefers time and distance over reps when present', () => {
    expect(fmtSet({ timeSeconds: 45 }, 'lb')).toBe('45s')
    expect(fmtSet({ distanceM: 400 }, 'kg')).toBe('400m')
  })

  it('degrades to just reps (or a placeholder) when nothing else is set', () => {
    expect(fmtSet({ reps: '12' }, 'lb')).toBe('12')
    expect(fmtSet({}, 'lb')).toBe('?')
  })
})

describe('convertLoad', () => {
  it('converts between lb and kg to 0.1, and leaves same-unit loads alone', () => {
    expect(convertLoad(225, 'lb', 'kg')).toBe(102.1)
    expect(convertLoad(100, 'kg', 'lb')).toBe(220.5)
    expect(convertLoad(135, 'lb', 'lb')).toBe(135)
  })
})

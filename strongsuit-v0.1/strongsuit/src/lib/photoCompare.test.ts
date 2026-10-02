import { describe, it, expect } from 'vitest'
import { daysApart, nearestReading } from './photoCompare'

const bw = (date: string, value: number) => ({ date, value })

describe('daysApart', () => {
  it('counts calendar days, signed', () => {
    expect(daysApart('2026-01-01', '2026-01-31')).toBe(30)
    expect(daysApart('2026-01-31', '2026-01-01')).toBe(-30)
    expect(daysApart('2026-05-05', '2026-05-05')).toBe(0)
  })
  it('is not thrown off by a DST change or a leap day', () => {
    expect(daysApart('2026-03-07', '2026-03-09')).toBe(2)
    expect(daysApart('2028-02-28', '2028-03-01')).toBe(2)
  })
})

describe('nearestReading', () => {
  const metrics = [bw('2026-01-01', 200), bw('2026-01-10', 196), bw('2026-02-20', 190)]

  it('picks the closest reading', () => {
    expect(nearestReading(metrics, '2026-01-11')?.value).toBe(196)
  })
  it('returns nothing when the closest is out of range', () => {
    expect(nearestReading(metrics, '2026-02-01')).toBeUndefined()
  })
  it('breaks a tie toward the earlier reading', () => {
    const tie = [bw('2026-01-08', 1), bw('2026-01-04', 2)]
    expect(nearestReading(tie, '2026-01-06')?.value).toBe(2)
  })
  it('honours a custom window', () => {
    expect(nearestReading(metrics, '2026-02-10', 14)?.value).toBe(190)
  })
})

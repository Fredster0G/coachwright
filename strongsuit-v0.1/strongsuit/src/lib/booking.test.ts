import { describe, it, expect } from 'vitest'
import { computeOpenSlots, sameSlots, validWindow, DEFAULT_BOOKING } from './booking'
import type { Appointment, BookingSettings } from '@/db/types'

// Local wall-clock helpers — the module works in the coach's local zone.
const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi)
const iso = (y: number, mo: number, d: number, h: number, mi = 0) => at(y, mo, d, h, mi).toISOString()

// 2026-10-05 is a Monday.
const MON = 1, TUE = 2
const hours = (over: Partial<BookingSettings> = {}): BookingSettings => ({
  ...DEFAULT_BOOKING, enabled: true, windows: [{ day: MON, start: '07:00', end: '10:00' }], ...over,
})
const appt = (over: Partial<Appointment>): Appointment => ({
  id: 'a', createdAt: '', updatedAt: '', title: 'Session', start: iso(2026, 10, 5, 8), end: iso(2026, 10, 5, 9), ...over,
})

describe('computeOpenSlots', () => {
  it('is empty when booking is off or has no hours', () => {
    expect(computeOpenSlots({ ...hours(), enabled: false }, [], at(2026, 10, 5, 0), 7)).toEqual([])
    expect(computeOpenSlots(hours({ windows: [] }), [], at(2026, 10, 5, 0), 7)).toEqual([])
  })
  it('cuts each window into whole slots on the right weekday', () => {
    const s = computeOpenSlots(hours(), [], at(2026, 10, 4, 15), 7)
    expect(s.map(x => x.start)).toEqual([iso(2026, 10, 5, 7), iso(2026, 10, 5, 8), iso(2026, 10, 5, 9)])
    expect(s[0].end).toBe(iso(2026, 10, 5, 8))
  })
  it('drops a trailing partial slot', () => {
    const s = computeOpenSlots(hours({ slotMinutes: 45, windows: [{ day: MON, start: '07:00', end: '09:00' }] }), [], at(2026, 10, 5, 0), 1)
    expect(s.map(x => x.start)).toEqual([iso(2026, 10, 5, 7), iso(2026, 10, 5, 7, 45)])
  })
  it('removes slots overlapping appointments, but not canceled ones', () => {
    const busy = computeOpenSlots(hours(), [appt({})], at(2026, 10, 5, 0), 1)
    expect(busy.map(x => x.start)).toEqual([iso(2026, 10, 5, 7), iso(2026, 10, 5, 9)])
    const canceled = computeOpenSlots(hours(), [appt({ status: 'canceled' })], at(2026, 10, 5, 0), 1)
    expect(canceled).toHaveLength(3)
  })
  it('removes slots hit by a recurring series occurrence', () => {
    const weekly = appt({ start: iso(2026, 9, 28, 7, 30), end: iso(2026, 9, 28, 8, 30), recurrenceRule: { freq: 'weekly' } })
    const s = computeOpenSlots(hours(), [weekly], at(2026, 10, 5, 0), 1)
    expect(s.map(x => x.start)).toEqual([iso(2026, 10, 5, 9)])
  })
  it('holds slots with a pending request', () => {
    const s = computeOpenSlots(hours(), [], at(2026, 10, 5, 0), 1, [{ start: iso(2026, 10, 5, 7), end: iso(2026, 10, 5, 8) }])
    expect(s.map(x => x.start)).toEqual([iso(2026, 10, 5, 8), iso(2026, 10, 5, 9)])
  })
  it('does not offer the same time twice from overlapping windows', () => {
    const s = computeOpenSlots(hours({ windows: [{ day: TUE, start: '07:00', end: '09:00' }, { day: TUE, start: '08:00', end: '09:00' }] }), [], at(2026, 10, 6, 0), 1)
    expect(s.map(x => x.start)).toEqual([iso(2026, 10, 6, 7), iso(2026, 10, 6, 8)])
  })
  it('ignores malformed windows', () => {
    expect(validWindow({ start: '10:00', end: '09:00' })).toBe(false)
    expect(validWindow({ start: '7:00', end: '09:00' })).toBe(false)
    expect(computeOpenSlots(hours({ windows: [{ day: MON, start: '10:00', end: '09:00' }] }), [], at(2026, 10, 5, 0), 1)).toEqual([])
  })
})

describe('sameSlots', () => {
  it('compares order and times', () => {
    const a = [{ start: 'x', end: 'y' }]
    expect(sameSlots(a, [{ start: 'x', end: 'y' }])).toBe(true)
    expect(sameSlots(undefined, [])).toBe(false)
    expect(sameSlots(a, [{ start: 'x', end: 'z' }])).toBe(false)
  })
})

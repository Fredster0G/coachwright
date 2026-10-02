// S26: schedule.ts took an occurrence's date from the UTC day of its ISO
// string. These pin the local-day behaviour on both sides of UTC.
import { describe, it, expect, afterAll } from 'vitest'
import { expandAppointment, nextOccurrence } from './schedule'
import type { Appointment } from '@/db/types'

const savedTz = process.env.TZ
afterAll(() => { if (savedTz === undefined) delete process.env.TZ; else process.env.TZ = savedTz })

const appt = (start: Date, over: Partial<Appointment> = {}): Appointment => ({
  id: 'm', createdAt: '', updatedAt: '', title: 'Session',
  start: start.toISOString(), end: new Date(start.getTime() + 3_600_000).toISOString(), ...over,
})

describe('west of UTC (Los Angeles)', () => {
  it('an evening appointment is on its own day, and a weekly series keeps its first evening', () => {
    process.env.TZ = 'America/Los_Angeles'
    const mon7pm = new Date(2026, 9, 5, 19, 0)               // Mon 5 Oct, 19:00 local = Tue 02:00Z
    expect(expandAppointment(appt(mon7pm), '2026-10-05', '2026-10-05').map(o => o.date)).toEqual(['2026-10-05'])
    const series = appt(mon7pm, { recurrenceRule: { freq: 'weekly' } })
    expect(expandAppointment(series, '2026-10-01', '2026-10-20').map(o => o.date)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19'])
  })
  it('an exception removes exactly the local-day occurrence', () => {
    process.env.TZ = 'America/Los_Angeles'
    const series = appt(new Date(2026, 9, 5, 19, 0), { recurrenceRule: { freq: 'weekly' }, exceptions: ['2026-10-12'] })
    expect(expandAppointment(series, '2026-10-01', '2026-10-20').map(o => o.date)).toEqual(['2026-10-05', '2026-10-19'])
  })
})

describe('east of UTC (Tokyo)', () => {
  it('an early-morning appointment is not filed under yesterday', () => {
    process.env.TZ = 'Asia/Tokyo'
    const mon7am = new Date(2026, 9, 5, 7, 0)                // Mon 5 Oct, 07:00 local = Sun 22:00Z
    expect(expandAppointment(appt(mon7am), '2026-10-05', '2026-10-05')).toHaveLength(1)
    expect(nextOccurrence(appt(mon7am, { recurrenceRule: { freq: 'weekly' } }), '2026-10-06')?.date).toBe('2026-10-12')
  })
})

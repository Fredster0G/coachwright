// ===== Client self-booking: the coach's open slots =====
//
// The coach sets weekly bookable hours (Settings → Booking). This module turns
// those hours plus the calendar into concrete open slots, which the app
// publishes on the trainer row (`bookingSlots`) for Companion to show through
// `/client/bundle`. A client picks one and it arrives as a booking REQUEST in
// the coach's Messages — nothing lands on the calendar until the coach
// accepts it (features/clients/BookingRequestCard).
//
// What a client can see is only "these times are free": never who or what
// fills the rest of the calendar.
//
// Hours are the coach's LOCAL wall-clock times; slots are published as ISO
// instants, so a client in another time zone sees them in theirs.

import type { Appointment, BookingSettings, BookingSlot } from '@/db/types'
import { expandAll } from './schedule'
import { isoDay } from './core'

/** How far ahead clients can book. */
export const BOOKING_HORIZON_DAYS = 14

export const DEFAULT_BOOKING: BookingSettings = {
  enabled: false,
  slotMinutes: 60,
  noticeHours: 12,
  windows: [],
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** A window is usable when both times parse and end is after start. */
export function validWindow(w: { start: string; end: string }): boolean {
  return /^\d{2}:\d{2}$/.test(w.start) && /^\d{2}:\d{2}$/.test(w.end) && toMinutes(w.end) > toMinutes(w.start)
}

/**
 * Every free slot from the start of `from`'s day through `days` days.
 * Busy = any non-canceled appointment occurrence, plus `held` intervals
 * (pending booking requests, so two clients aren't offered the same hour).
 * The notice period is NOT applied here — it moves with the clock, and
 * baking it in would republish the trainer row every hour. The server
 * applies it when serving (`/client/bundle`).
 */
export function computeOpenSlots(
  booking: BookingSettings,
  appointments: readonly Appointment[],
  from: Date,
  days = BOOKING_HORIZON_DAYS,
  held: readonly BookingSlot[] = [],
): BookingSlot[] {
  if (!booking.enabled || booking.slotMinutes <= 0) return []
  const windows = booking.windows.filter(validWindow)
  if (!windows.length) return []

  const startDay = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const endDay = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate() + days - 1)
  const busy = expandAll(
    appointments.filter(a => a.status !== 'canceled'),
    isoDay(startDay), isoDay(endDay),
  ).map(o => [Date.parse(o.start), Date.parse(o.end)] as const)
  for (const h of held) busy.push([Date.parse(h.start), Date.parse(h.end)])

  const out: BookingSlot[] = []
  for (let i = 0; i < days; i++) {
    const day = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate() + i)
    for (const w of windows.filter(w => w.day === day.getDay()).sort((a, b) => a.start.localeCompare(b.start))) {
      for (let m = toMinutes(w.start); m + booking.slotMinutes <= toMinutes(w.end); m += booking.slotMinutes) {
        const s = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, m)
        const e = new Date(s.getTime() + booking.slotMinutes * 60_000)
        if (busy.some(([bs, be]) => bs < e.getTime() && be > s.getTime())) continue
        out.push({ start: s.toISOString(), end: e.toISOString() })
      }
    }
  }
  // Overlapping windows on one day would offer the same time twice.
  return out.filter((s, i) => i === 0 || s.start !== out[i - 1].start)
}

/** Same slots, same order — so the trainer row is only re-uploaded when the
 *  offer actually changed. */
export function sameSlots(a: readonly BookingSlot[] | undefined, b: readonly BookingSlot[]): boolean {
  if (!a || a.length !== b.length) return false
  return a.every((s, i) => s.start === b[i].start && s.end === b[i].end)
}

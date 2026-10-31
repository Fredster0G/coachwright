// Booking screen helpers — pure, so the grouping and "already asked" logic
// is testable. Slots are ISO instants; they're shown in THIS phone's zone.
import type { BookingSlot, CoachMessage } from '@/db/types'
import { today } from './core'

export interface SlotDay { date: string; slots: BookingSlot[] }

/** Slots grouped by local calendar day, in time order. */
export function groupSlotsByDay(slots: readonly BookingSlot[]): SlotDay[] {
  const days = new Map<string, BookingSlot[]>()
  for (const s of [...slots].sort((a, b) => a.start.localeCompare(b.start))) {
    const d = today(new Date(s.start))
    if (!days.has(d)) days.set(d, [])
    days.get(d)!.push(s)
  }
  return [...days].map(([date, slots]) => ({ date, slots }))
}

/** This client's requests still waiting on the coach and not yet past. */
export function pendingRequests(messages: readonly CoachMessage[], now = new Date()): CoachMessage[] {
  const n = now.toISOString()
  return messages.filter(m => m.direction === 'to-coach' && m.booking && !m.booking.status && m.booking.end > n)
}

/** The message text that goes with a request, readable in the coach's
 *  thread even without the booking card. */
export function requestText(slot: BookingSlot, locale?: string): string {
  const s = new Date(slot.start), e = new Date(slot.end)
  const day = s.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })
  const t = (d: Date) => d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
  return `Session request: ${day}, ${t(s)}–${t(e)}`
}

// ===== Recurring schedule expansion (spec §4.11 extended) =====
// A series is stored as ONE master Appointment carrying a RecurrenceRule; the
// individual occurrences are computed here on demand for the window being
// viewed. Rescheduling/canceling a single occurrence adds a date to the
// master's `exceptions` (and, for a reschedule, creates a one-off). Pure +
// unit-tested — no I/O.

import type { Appointment, RecurrenceRule } from '@/db/types'
import { addDays, addMonths } from 'date-fns'
import { isoDay } from './core'

export interface Occurrence {
  appointment: Appointment  // the master (or one-off) this occurrence comes from
  start: string             // ISO datetime of this specific occurrence
  end: string
  date: string              // yyyy-MM-dd
  isRecurring: boolean
}

// The coach's LOCAL calendar day of an instant. Until S26 this sliced the ISO
// string — the UTC day — so in the Americas every appointment after ~5pm sat on
// tomorrow's calendar cell, the first occurrence of an evening weekly series
// was dropped as "before the series start", and in Asia/Oceania mornings
// landed on yesterday. Occurrence dates and `exceptions` are both local days.
const dateOf = (iso: string) => isoDay(new Date(iso))
const MS_DAY = 86_400_000

/** Shift an ISO datetime to a new calendar date, preserving the time of day. */
function moveToDate(iso: string, target: Date): string {
  const src = new Date(iso)
  const d = new Date(target)
  d.setHours(src.getHours(), src.getMinutes(), src.getSeconds(), 0)
  return d.toISOString()
}

/**
 * Expand one appointment (master or one-off) into occurrences overlapping
 * [rangeStart, rangeEnd] (yyyy-MM-dd inclusive). Non-recurring → at most one.
 */
export function expandAppointment(appt: Appointment, rangeStart: string, rangeEnd: string): Occurrence[] {
  const rule = appt.recurrenceRule
  const durationMs = new Date(appt.end).getTime() - new Date(appt.start).getTime()
  const exceptions = new Set(appt.exceptions ?? [])

  if (!rule) {
    const d = dateOf(appt.start)
    if (d < rangeStart || d > rangeEnd || exceptions.has(d)) return []
    return [{ appointment: appt, start: appt.start, end: appt.end, date: d, isRecurring: false }]
  }

  const out: Occurrence[] = []
  const first = new Date(appt.start)
  const hardEnd = rule.until ? rule.until : rangeEnd
  const stopDate = hardEnd < rangeEnd ? hardEnd : rangeEnd
  let produced = 0
  const maxCount = rule.count ?? Infinity
  // safety cap so a runaway rule can't loop forever
  const HARD_CAP = 1000

  const pushIfInRange = (occStart: Date) => {
    const iso = moveToDate(appt.start, occStart)
    const d = dateOf(iso)
    if (d > stopDate) return false
    if (produced >= maxCount) return false
    produced++
    if (d >= rangeStart && !exceptions.has(d)) {
      out.push({ appointment: appt, start: iso, end: new Date(new Date(iso).getTime() + durationMs).toISOString(), date: d, isRecurring: true })
    }
    return true
  }

  if (rule.freq === 'weekly' || rule.freq === 'biweekly') {
    const stepDays = rule.freq === 'biweekly' ? 14 : 7
    const weekdays = rule.byWeekday && rule.byWeekday.length ? [...rule.byWeekday].sort() : [first.getDay()]
    // walk week-blocks from the master's week
    const weekStart = new Date(first); weekStart.setDate(first.getDate() - first.getDay()) // back to Sunday
    for (let block = 0, guard = 0; guard < HARD_CAP; block++, guard++) {
      const blockStart = new Date(weekStart.getTime() + block * stepDays * MS_DAY)
      let anyProducedThisBlock = false
      let pastStop = true
      for (const wd of weekdays) {
        const occ = new Date(blockStart.getTime() + wd * MS_DAY)
        if (occ < new Date(dateOf(appt.start) + 'T00:00:00')) continue // before series start
        const cont = pushIfInRange(occ)
        anyProducedThisBlock = anyProducedThisBlock || cont
        if (dateOf(occ.toISOString()) <= stopDate) pastStop = false
        if (produced >= maxCount) break
      }
      if (produced >= maxCount) break
      // stop when the whole block is past the range/until and we've started
      if (!anyProducedThisBlock && pastStop && block > 0) break
      if (new Date(blockStart) > new Date(stopDate + 'T23:59:59') ) break
    }
  } else if (rule.freq === 'monthly') {
    for (let i = 0, guard = 0; guard < HARD_CAP; i++, guard++) {
      const occ = addMonths(first, i)
      if (dateOf(occ.toISOString()) > stopDate) break
      if (!pushIfInRange(occ)) {
        if (produced >= maxCount) break
      }
    }
  }

  return out.sort((a, b) => a.start.localeCompare(b.start))
}

/** Expand a set of appointments into a flat, sorted occurrence list for a window. */
export function expandAll(appts: Appointment[], rangeStart: string, rangeEnd: string): Occurrence[] {
  return appts
    .flatMap(a => expandAppointment(a, rangeStart, rangeEnd))
    .sort((a, b) => a.start.localeCompare(b.start))
}

/** The next occurrence on/after `fromISO` for a single appointment, if any. */
export function nextOccurrence(appt: Appointment, fromDate: string, horizonDays = 365): Occurrence | null {
  const end = dateOf(addDays(new Date(fromDate + 'T00:00:00'), horizonDays).toISOString())
  return expandAppointment(appt, fromDate, end)[0] ?? null
}

export function describeRule(rule?: RecurrenceRule): string {
  if (!rule) return 'One-time'
  const days = rule.byWeekday?.length
    ? rule.byWeekday.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')
    : ''
  const base = rule.freq === 'biweekly' ? 'Every 2 weeks' : rule.freq === 'monthly' ? 'Monthly' : 'Weekly'
  const on = days ? ` on ${days}` : ''
  const end = rule.until ? `, until ${rule.until}` : rule.count ? `, ${rule.count}×` : ''
  return `${base}${on}${end}`
}

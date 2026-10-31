import { ulid } from 'ulid'
import { format } from 'date-fns'

export const newId = () => ulid()
export const nowIso = () => new Date().toISOString()
export const today = () => format(new Date(), 'yyyy-MM-dd')
/** A Date's LOCAL calendar day as yyyy-MM-dd. Use this, never
 *  `toISOString().slice(0, 10)` — that's the UTC day, which is tomorrow for an
 *  evening in the Americas and yesterday for local midnight east of UTC. */
export const isoDay = (d: Date) => format(d, 'yyyy-MM-dd')

/** Stamp create fields onto a partial entity. */
export function stamp<T extends { id?: string }>(x: T) {
  const t = nowIso()
  return { ...x, id: x.id ?? newId(), createdAt: t, updatedAt: t }
}

/** Coalesces concurrent calls to an idempotent async initializer into a single
 *  in-flight run, so a check-then-insert against IndexedDB can't be interleaved
 *  with a copy of itself. React StrictMode's double-invoked effects are the
 *  common case: both copies read "missing" and both insert, and the second
 *  one's ConstraintError rejects a promise nobody is catching (see debt #6).
 *  Resets on settle, so a failed run can be retried. */
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null
  return () => {
    if (!inFlight) inFlight = fn().finally(() => { inFlight = null })
    return inFlight
  }
}

/** Epley estimated 1RM (spec §4.6). reps>0. */
export function e1rm(load: number, reps: number): number {
  if (reps <= 0 || load <= 0) return 0
  if (reps === 1) return load
  return Math.round(load * (1 + reps / 30) * 10) / 10
}

/** Volume load for a set. */
export const setTonnage = (load?: number, reps?: number) =>
  (load ?? 0) * (reps ?? 0)

export const KG_PER_LB = 0.45359237
export const lbToKg = (lb: number) => Math.round(lb * KG_PER_LB * 10) / 10
export const kgToLb = (kg: number) => Math.round((kg / KG_PER_LB) * 10) / 10

export function fmtLoad(v: number | undefined, units: 'lb' | 'kg') {
  if (v == null) return '—'
  return `${v} ${units}`
}

export function fullName(c: { firstName: string; lastName: string }) {
  return `${c.firstName} ${c.lastName}`.trim()
}

export function initials(c: { firstName: string; lastName: string }) {
  return `${c.firstName[0] ?? ''}${c.lastName[0] ?? ''}`.toUpperCase()
}

/** Local midnight of whatever day this instant falls on. */
function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * Whole CALENDAR DAYS between then and now, in the user's own timezone.
 *
 * The old version subtracted timestamps and divided by 86,400,000, which was
 * wrong twice over (debt #63):
 *
 *   1. `new Date('2026-08-05')` — a date-only string, which is what every
 *      `date` column in this app stores — parses as UTC midnight, not local.
 *      So at 9pm in a UTC-5 timezone, a session logged *today* was 26 hours
 *      after that instant and rendered as "1d ago".
 *   2. Elapsed-hours division is the wrong question anyway. "Last session 1d
 *      ago" means one sleep, not 24 hours — 11pm Monday to 1am Tuesday is
 *      "yesterday" to a human and 0.08 days to arithmetic.
 *
 * Comparing local midnights answers the question people are actually asking,
 * and rounding (rather than flooring) the difference keeps DST-shortened and
 * -lengthened days from drifting by one.
 */
export function daysSince(iso?: string): number | null {
  if (!iso) return null
  // Date-only strings must be read as local, or the whole point is lost.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  const then = dateOnly
    ? new Date(+dateOnly[1], +dateOnly[2] - 1, +dateOnly[3])
    : new Date(iso)
  if (Number.isNaN(then.getTime())) return null
  return Math.round((startOfLocalDay(new Date()) - startOfLocalDay(then)) / 86_400_000)
}

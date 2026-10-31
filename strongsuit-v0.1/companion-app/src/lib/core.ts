import { ulid } from 'ulid'

export const newId = () => ulid()
export const nowIso = () => new Date().toISOString()
/** The LOCAL calendar date. (Was `toISOString().slice(0, 10)` — UTC — so a
 *  workout logged at 8pm in New York was dated tomorrow; S24.) */
export function today(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/** Stamp create fields onto a partial entity — same convention as the coach app. */
export function stamp<T extends { id?: string }>(x: T) {
  const t = nowIso()
  return { ...x, id: x.id ?? newId(), createdAt: t, updatedAt: t }
}

/** Coalesces concurrent calls to an idempotent async initializer into a single
 *  in-flight run, so a check-then-insert against IndexedDB can't be interleaved
 *  with a copy of itself. React StrictMode's double-invoked effects are the
 *  common case: both copies read "missing" and both insert, and the second
 *  one's ConstraintError rejects a promise nobody is catching.
 *  Same helper (and same reasoning) as the coach app's `lib/core.ts`.
 *  Resets on settle, so a failed run can be retried. */
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null
  return () => {
    if (!inFlight) inFlight = fn().finally(() => { inFlight = null })
    return inFlight
  }
}

export function fmtLoad(v: number | undefined, units: 'lb' | 'kg') {
  if (v == null) return '—'
  return `${v} ${units}`
}

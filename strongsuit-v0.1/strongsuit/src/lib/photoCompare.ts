// ===== Progress-photo comparison: the numbers beside the two pictures =====
//
// Pure, so it's testable without a DOM. Dates are local `yyyy-MM-dd` strings
// (lib/core.ts `today()`), compared as calendar days — never through
// `new Date(str)` arithmetic in the local zone, which drifts an hour across DST.

/** Whole calendar days from `a` to `b` (positive when b is later). */
export function daysApart(a: string, b: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000)
}

/**
 * The reading closest to `date`, within `maxDays` either side. Pass only the
 * readings of one kind (e.g. bodyweight, by `type`).
 * Ties go to the earlier reading (the one the photo could have been taken
 * after). `undefined` when nothing is close enough — a weight from two months
 * away beside a photo would imply a link that isn't there.
 */
export function nearestReading<T extends { date: string }>(
  readings: readonly T[], date: string, maxDays = 7,
): T | undefined {
  let best: T | undefined
  let bestGap = Infinity
  for (const m of readings) {
    const gap = Math.abs(daysApart(m.date, date))
    if (gap > maxDays) continue
    if (gap < bestGap || (gap === bestGap && best && m.date < best.date)) {
      best = m
      bestGap = gap
    }
  }
  return best
}

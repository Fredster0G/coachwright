import type { Msg } from '@/lib/i18n/msg'
import type { CheckIn } from '@/db/types'
import { readinessV2, type Readiness2 } from '@/lib/readiness'

export interface TrendPoint {
  date: string
  score: number | null
  band: Readiness2['band']
}

/** Readiness score for the last `windowDays` check-in days, recomputed at
 *  each point from only the check-ins up to and including that day — so
 *  early points in the window can legitimately read as "learning" even once
 *  later points don't, exactly like the live score does day to day. */
export function readinessTrend(checkIns: CheckIn[], windowDays = 14): TrendPoint[] {
  const sorted = [...checkIns].sort((a, b) => a.date.localeCompare(b.date))
  const tail = sorted.slice(-windowDays)
  const priorCount = sorted.length - tail.length
  return tail.map((c, i) => {
    const upTo = sorted.slice(0, priorCount + i + 1)
    const r = readinessV2({ checkIns: upTo })
    return { date: c.date, score: r.score, band: r.band }
  })
}

export interface RosterFlag {
  clientId: string
  band: 'moderate' | 'easy'
  recommendation: string
  recMsg: Msg
}

/** Active clients whose latest readiness reads below their own normal today.
 *  'learning' (not enough baseline yet) and 'go' don't need a coach's
 *  attention — only 'moderate'/'easy' do. */
export function flagReadinessToday(
  clients: { id: string; status: string }[],
  checkInsByClient: Map<string, CheckIn[]>,
): RosterFlag[] {
  const out: RosterFlag[] = []
  for (const c of clients) {
    if (c.status !== 'active') continue
    const checkIns = checkInsByClient.get(c.id) ?? []
    const r = readinessV2({ checkIns })
    if (r.band === 'moderate' || r.band === 'easy') {
      out.push({ clientId: c.id, band: r.band, recommendation: r.recommendation, recMsg: r.recMsg })
    }
  }
  return out
}

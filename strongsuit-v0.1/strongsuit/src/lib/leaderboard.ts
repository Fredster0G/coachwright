// ===== Leaderboards & challenges (spec §4.27) =====
// Pure scoring over already-logged data — no new tracking burden on the
// client, and nothing leaves the device: a leaderboard is just a different
// lens on the same SessionLog/Metric rows Coachwright already has. Clients
// are opt-in (Client.leaderboardOptIn) since ranking people against each
// other is sensitive; off by default.

import type { ChallengeMetric, Client, Metric, SessionLog } from '@/db/types'
import { setTonnage } from './core'

export interface LeaderboardEntry {
  clientId: string
  value: number
  rank: number
}

function volumeByClient(logs: SessionLog[], clientIds: Set<string>, start: string, end: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const log of logs) {
    if (!clientIds.has(log.clientId) || log.date < start || log.date > end) continue
    const tonnage = log.entries.reduce((sum, e) =>
      sum + e.sets.reduce((s, set) => s + (set.done ? setTonnage(set.actualLoad, set.actualReps) : 0), 0), 0)
    out.set(log.clientId, (out.get(log.clientId) ?? 0) + tonnage)
  }
  return out
}

function sessionsByClient(logs: SessionLog[], clientIds: Set<string>, start: string, end: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const log of logs) {
    if (!clientIds.has(log.clientId) || log.date < start || log.date > end) continue
    out.set(log.clientId, (out.get(log.clientId) ?? 0) + 1)
  }
  return out
}

function bodyweightLossPctByClient(metrics: Metric[], clientIds: Set<string>, start: string, end: string): Map<string, number> {
  const byClient = new Map<string, Metric[]>()
  for (const m of metrics) {
    if (m.type !== 'bodyweight' || !clientIds.has(m.clientId) || m.date < start || m.date > end) continue
    if (!byClient.has(m.clientId)) byClient.set(m.clientId, [])
    byClient.get(m.clientId)!.push(m)
  }
  const out = new Map<string, number>()
  for (const [clientId, rows] of byClient) {
    const sorted = rows.sort((a, b) => a.date.localeCompare(b.date))
    const first = sorted[0], last = sorted.at(-1)!
    if (first.value <= 0 || sorted.length < 2) continue
    const pct = ((first.value - last.value) / first.value) * 100
    out.set(clientId, Math.round(pct * 10) / 10)
  }
  return out
}

/** Rank opted-in, active clients by a metric over a date range. Ties share rank. */
export function leaderboard(opts: {
  metric: ChallengeMetric
  clients: Client[]
  sessionLogs: SessionLog[]
  metrics: Metric[]
  start: string   // yyyy-MM-dd
  end: string
  /** limit to a specific roster (a Challenge's participants); omit for "everyone opted in" */
  participantIds?: string[]
}): LeaderboardEntry[] {
  const eligible = opts.clients.filter(c =>
    c.status === 'active' && c.leaderboardOptIn && (!opts.participantIds || opts.participantIds.includes(c.id)))
  const clientIds = new Set(eligible.map(c => c.id))

  const values = opts.metric === 'volume'
    ? volumeByClient(opts.sessionLogs, clientIds, opts.start, opts.end)
    : opts.metric === 'sessions'
      ? sessionsByClient(opts.sessionLogs, clientIds, opts.start, opts.end)
      : bodyweightLossPctByClient(opts.metrics, clientIds, opts.start, opts.end)

  const entries = eligible
    .map(c => ({ clientId: c.id, value: Math.round((values.get(c.id) ?? 0) * 10) / 10 }))
    .filter(e => e.value > 0)
    .sort((a, b) => b.value - a.value)

  let rank = 0, lastValue: number | null = null
  return entries.map((e, i) => {
    if (e.value !== lastValue) { rank = i + 1; lastValue = e.value }
    return { ...e, rank }
  })
}


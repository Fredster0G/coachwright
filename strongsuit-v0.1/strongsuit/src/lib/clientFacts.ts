// ===== Per-client facts for the automation engine (Dashboard attention queue) =====
//
// DEBT-1: this used to live inline in DashboardPage and re-filter every log,
// check-in and payment once per client on every render — O(clients × rows).
// Now one pass groups the rows by client, and the page memoises the result.

import type { CheckIn, Client, Payment, SessionLog } from '@/db/types'
import type { ClientFacts } from './automations'
import { sessionPackBalance } from './sessionPacks'

function groupBy<T extends { clientId: string }>(rows: readonly T[]): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const r of rows) {
    const list = out.get(r.clientId)
    if (list) list.push(r)
    else out.set(r.clientId, [r])
  }
  return out
}

const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date)

export function buildClientFacts(
  clients: readonly Pick<Client, 'id' | 'screening'>[],
  logs: readonly SessionLog[],
  checkIns: readonly CheckIn[],
  payments: readonly Payment[],
): Map<string, ClientFacts> {
  const logsBy = groupBy(logs), checkInsBy = groupBy(checkIns), paymentsBy = groupBy(payments)
  const facts = new Map<string, ClientFacts>()
  for (const c of clients) {
    const clientLogs = [...(logsBy.get(c.id) ?? [])].sort(byDate)
    const clientCheckIns = [...(checkInsBy.get(c.id) ?? [])].sort(byDate)
    const clientPayments = paymentsBy.get(c.id) ?? []
    let lastPaymentDate: string | undefined
    for (const p of clientPayments) if (p.type !== 'refund' && (!lastPaymentDate || p.date > lastPaymentDate)) lastPaymentDate = p.date
    const sessionCompletionRates: number[] = []
    for (const l of clientLogs) {
      let total = 0, done = 0
      for (const e of l.entries) for (const s of e.sets) { total++; if (s.done) done++ }
      if (total > 0) sessionCompletionRates.push(done / total)
    }
    facts.set(c.id, {
      clientId: c.id,
      lastSessionDate: clientLogs.at(-1)?.date,
      lastCheckInDate: clientCheckIns.at(-1)?.date,
      sessionsRemaining: sessionPackBalance(clientPayments, clientLogs)?.remaining,
      lastPaymentDate,
      hasScreening: !!c.screening,
      screeningCleared: c.screening?.cleared ?? false,
      checkInDates: clientCheckIns.map(ci => ci.date),
      sessionCompletionRates,
    })
  }
  return facts
}

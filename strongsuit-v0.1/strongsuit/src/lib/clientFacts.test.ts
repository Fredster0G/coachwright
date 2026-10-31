import { describe, it, expect } from 'vitest'
import { buildClientFacts } from './clientFacts'
import { sessionPackBalance } from './sessionPacks'
import type { CheckIn, Client, Payment, SessionLog } from '@/db/types'

// The pre-S24 inline Dashboard code, kept as the reference the fast version
// must agree with exactly.
function reference(clients: Pick<Client, 'id' | 'screening'>[], logs: SessionLog[], checkIns: CheckIn[], payments: Payment[]) {
  const facts = new Map()
  for (const c of clients) {
    const clientLogs = logs.filter(l => l.clientId === c.id).sort((a, b) => a.date.localeCompare(b.date))
    const clientCheckIns = checkIns.filter(ci => ci.clientId === c.id).sort((a, b) => a.date.localeCompare(b.date))
    const clientPayments = payments.filter(p => p.clientId === c.id)
    const lastPayment = clientPayments.filter(p => p.type !== 'refund').sort((a, b) => a.date.localeCompare(b.date)).at(-1)
    facts.set(c.id, {
      clientId: c.id,
      lastSessionDate: clientLogs.at(-1)?.date,
      lastCheckInDate: clientCheckIns.at(-1)?.date,
      sessionsRemaining: sessionPackBalance(clientPayments, clientLogs)?.remaining,
      lastPaymentDate: lastPayment?.date,
      hasScreening: !!c.screening,
      screeningCleared: c.screening?.cleared ?? false,
      checkInDates: clientCheckIns.map(ci => ci.date),
      sessionCompletionRates: clientLogs
        .map(l => { const s = l.entries.flatMap(e => e.sets); return s.length ? s.filter(x => x.done).length / s.length : null })
        .filter((r): r is number => r !== null),
    })
  }
  return facts
}

let seed = 42
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31 }
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]
const day = () => `2026-0${1 + Math.floor(rnd() * 9)}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`

describe('buildClientFacts', () => {
  it('matches the original per-client scan on randomised data', () => {
    const clients = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, screening: i % 3 ? { cleared: i % 2 === 0 } : undefined })) as unknown as Pick<Client, 'id' | 'screening'>[]
    const ids = [...clients.map(c => c.id), 'orphan']
    const logs = Array.from({ length: 300 }, (_, i) => ({
      id: `l${i}`, clientId: pick(ids), date: day(), title: '', source: pick(['trainer', 'companion-import'] as const),
      entries: Array.from({ length: Math.floor(rnd() * 3) }, () => ({ sets: Array.from({ length: Math.floor(rnd() * 4) }, () => ({ done: rnd() > 0.3 })) })),
    })) as unknown as SessionLog[]
    const checkIns = Array.from({ length: 120 }, (_, i) => ({ id: `k${i}`, clientId: pick(ids), date: day() })) as unknown as CheckIn[]
    const payments = Array.from({ length: 60 }, (_, i) => ({
      id: `p${i}`, clientId: pick(ids), date: day(), amount: 50, type: pick(['payment', 'refund', 'session-credit'] as const), sessions: 10,
    })) as unknown as Payment[]
    expect(buildClientFacts(clients, logs, checkIns, payments)).toEqual(reference(clients, logs, checkIns, payments))
  })
})

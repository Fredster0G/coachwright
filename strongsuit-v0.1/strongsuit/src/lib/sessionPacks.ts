// ===== Session packs — how many prepaid sessions a client has left =====
//
// DEBT-21: this used to be "credits bought − every session ever logged", so a
// client with a year of history who bought a 10-pack showed 0 left on day
// one. The ledger rules now:
//   - credits come from `session-credit` payments (their `sessions` count);
//   - a session uses a credit only if the COACH logged it (`source:
//     'trainer'`) — a workout the client logged themselves in Companion
//     isn't a paid session;
//   - and only if it's dated on or after the first pack was bought.
// Still derived, not a stored balance: editing a payment or a log re-derives
// it, which is what a coach correcting a mistake expects.

import type { Payment, SessionLog } from '@/db/types'

export interface PackBalance {
  purchased: number
  used: number
  remaining: number
}

/** Undefined when the client has never bought a pack. */
export function sessionPackBalance(
  payments: Pick<Payment, 'type' | 'sessions' | 'date'>[],
  logs: Pick<SessionLog, 'date' | 'source'>[],
): PackBalance | undefined {
  const packs = payments.filter(p => p.type === 'session-credit' && (p.sessions ?? 0) > 0)
  if (!packs.length) return undefined
  const purchased = packs.reduce((a, p) => a + (p.sessions ?? 0), 0)
  const since = packs.map(p => p.date).sort()[0]
  const used = logs.filter(l => l.source === 'trainer' && l.date >= since).length
  return { purchased, used, remaining: Math.max(0, purchased - used) }
}

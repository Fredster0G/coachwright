// ===== Automation rules engine (spec §4.29) =====
// Pure evaluator: given the coach's configured rules and a set of per-client
// facts (pre-aggregated by the caller from the repos), produce a flat list of
// attention items. No timers, no background jobs, no server — this runs on
// demand whenever the Dashboard (or a rule-editor preview) renders, which is
// the only kind of "automation" a zero-backend app can honestly offer: rules
// that re-evaluate instantly against your own local data, not push-notify you
// while the app is closed (see docs/SERVER_STRATEGY.md for why).
//
// Two of these rules (`checkin-cadence-slipping`, `completion-trend-declining`)
// are trend-based rather than threshold-based, added S15 in direct response to
// a recurring complaint from working coaches (competitor apps bolt on more
// generation features — AI program builders — while the actual bottleneck is
// reading a roster and knowing who needs a message *this week*, without
// opening a tab per client). A flat "overdue" rule only fires after a client
// has already gone quiet; these fire on the shape of the trend itself — a
// check-in gap stretching past someone's own historical cadence, or set
// completion sliding before a client fully drops off — which is the earlier,
// more useful signal.

import type { AutomationRule, AutomationTrigger, Client } from '@/db/types'

/** Whole days between a yyyy-MM-dd date and a reference "today" — deterministic
 *  (unlike lib/core's daysSince, which reads the real wall clock and would make
 *  this engine untestable and the caller's `today` parameter a lie). */
function daysBetween(dateStr: string | undefined, today: string): number | null {
  if (!dateStr) return null
  const ms = new Date(today + 'T00:00:00').getTime() - new Date(dateStr + 'T00:00:00').getTime()
  return Math.floor(ms / 86_400_000)
}

/** Days from one date to a later one — a plain interval, unlike `daysBetween`
 *  above which is always measured against "today". */
function diffDays(earlier: string, later: string): number {
  const ms = new Date(later + 'T00:00:00').getTime() - new Date(earlier + 'T00:00:00').getTime()
  return Math.round(ms / 86_400_000)
}

export interface ClientFacts {
  clientId: string
  lastSessionDate?: string       // yyyy-MM-dd
  lastCheckInDate?: string
  sessionsRemaining?: number     // from session-credit packs, if tracked
  lastPaymentDate?: string
  hasScreening: boolean
  screeningCleared: boolean
  /** Every check-in date, ascending, oldest first — not just the latest.
   *  Needed to compute this client's own historical cadence rather than a
   *  fixed threshold. */
  checkInDates?: string[]
  /** Fraction of prescribed sets marked done (0–1) per logged session,
   *  ascending by date. Sessions with zero prescribed sets are omitted —
   *  an empty log isn't a completion signal either way. */
  sessionCompletionRates?: number[]
}

export interface AttentionItem {
  clientId: string
  ruleId: string
  message: string
  severity: 'info' | 'warning'
}

const DEFAULTS_STAMP = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }

/** Always-on baseline rules — what the Dashboard showed before custom rules
 *  existed. A coach can turn these off or add their own alongside them. */
export const DEFAULT_RULES: AutomationRule[] = [
  { id: 'default-no-session', ...DEFAULTS_STAMP, name: 'No session in a while', trigger: 'no-session-days', thresholdDays: 7, message: 'No session logged in {days} days', active: true },
  { id: 'default-screening', ...DEFAULTS_STAMP, name: 'Missing health screening', trigger: 'screening-missing', message: 'No PAR-Q+ screening on file', active: true },
  { id: 'default-checkin-cadence', ...DEFAULTS_STAMP, name: 'Check-ins slipping', trigger: 'checkin-cadence-slipping', message: 'Used to check in roughly every {avg} days — it’s been {days}', active: true },
  { id: 'default-completion-trend', ...DEFAULTS_STAMP, name: 'Completion trending down', trigger: 'completion-trend-declining', message: 'Set completion dropped from {from}% to {to}% over recent sessions', active: true },
]

function evalOne(rule: AutomationRule, client: Client, facts: ClientFacts, today: string): AttentionItem | null {
  const msg = (m: string) => m

  switch (rule.trigger) {
    case 'no-session-days': {
      const days = daysBetween(facts.lastSessionDate, today)
      const threshold = rule.thresholdDays ?? 7
      if (days === null) {
        // Never logged: the rule's "{days}" template has no number to fill
        // (it used to render "No session logged in ever days").
        return { clientId: client.id, ruleId: rule.id, severity: 'warning', message: msg('No session logged yet') }
      }
      if (days >= threshold) {
        return { clientId: client.id, ruleId: rule.id, severity: 'warning', message: msg(rule.message.replace('{days}', String(days))) }
      }
      return null
    }
    case 'checkin-overdue-days': {
      const days = daysBetween(facts.lastCheckInDate, today)
      const threshold = rule.thresholdDays ?? 14
      if (days !== null && days >= threshold) {
        return { clientId: client.id, ruleId: rule.id, severity: 'info', message: msg(rule.message.replace('{days}', String(days))) }
      }
      return null
    }
    case 'package-low-sessions': {
      const threshold = rule.thresholdSessions ?? 2
      if (facts.sessionsRemaining != null && facts.sessionsRemaining <= threshold) {
        return { clientId: client.id, ruleId: rule.id, severity: 'warning', message: msg(rule.message.replace('{count}', String(facts.sessionsRemaining))) }
      }
      return null
    }
    case 'payment-overdue-days': {
      const days = daysBetween(facts.lastPaymentDate, today)
      const threshold = rule.thresholdDays ?? 35
      if (days !== null && days >= threshold) {
        return { clientId: client.id, ruleId: rule.id, severity: 'warning', message: msg(rule.message.replace('{days}', String(days))) }
      }
      return null
    }
    case 'screening-missing': {
      if (!facts.hasScreening || !facts.screeningCleared) {
        return { clientId: client.id, ruleId: rule.id, severity: 'warning', message: msg(rule.message) }
      }
      return null
    }
    case 'checkin-cadence-slipping': {
      const dates = facts.checkInDates
      // Needs at least 3 check-ins: 2 historical intervals to average, plus
      // the current gap to test against that average. Below that there's no
      // real cadence to compare to yet — `checkin-overdue-days` already
      // covers "hasn't checked in at all".
      if (!dates || dates.length < 3) return null
      const historical = dates.slice(0, -1)
      const intervals: number[] = []
      for (let i = 1; i < historical.length; i++) intervals.push(diffDays(historical[i - 1], historical[i]))
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
      const currentGap = diffDays(dates[dates.length - 1], today)
      // Both a relative jump (50% past their own average) and an absolute
      // one (3+ days) have to be true, so a client who normally checks in
      // every 2 days doesn't trip this over a single extra day.
      if (currentGap > avg * 1.5 && currentGap - avg >= 3) {
        return {
          clientId: client.id, ruleId: rule.id, severity: 'info',
          message: msg(rule.message.replace('{avg}', String(Math.round(avg))).replace('{days}', String(currentGap))),
        }
      }
      return null
    }
    case 'completion-trend-declining': {
      const rates = facts.sessionCompletionRates
      // Needs 2 recent sessions to average plus 2-3 prior ones to compare
      // against — below that "trend" isn't a meaningful word yet.
      if (!rates || rates.length < 4) return null
      const recent = rates.slice(-2)
      const prior = rates.slice(-5, -2)
      if (prior.length === 0) return null
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
      const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length
      const dropPoints = Math.round((priorAvg - recentAvg) * 100)
      // Only fires off a real prior baseline (70%+) — a client who was
      // already struggling isn't "declining", they're a different problem
      // (`no-session-days` or a coaching conversation, not this rule).
      if (priorAvg >= 0.7 && dropPoints >= 20) {
        return {
          clientId: client.id, ruleId: rule.id, severity: 'warning',
          message: msg(rule.message
            .replace('{from}', String(Math.round(priorAvg * 100)))
            .replace('{to}', String(Math.round(recentAvg * 100)))),
        }
      }
      return null
    }
  }
  return null
}

/** Evaluate every active rule against every active client's facts. */
export function evaluateAutomations(opts: {
  clients: Client[]
  facts: Map<string, ClientFacts>
  rules: AutomationRule[]
  today: string
}): AttentionItem[] {
  const out: AttentionItem[] = []
  for (const client of opts.clients) {
    if (client.status !== 'active') continue
    const facts = opts.facts.get(client.id)
    if (!facts) continue
    for (const rule of opts.rules) {
      if (!rule.active) continue
      const hit = evalOne(rule, client, facts, opts.today)
      if (hit) out.push(hit)
    }
  }
  return out
}

/** One-line "why did this fire" explanation for a rule, using its own
 *  configured threshold — the Dashboard surfaces this per attention item so
 *  a coach doesn't have to go to Settings to see what triggered it. */
export function explainRule(rule: AutomationRule): string {
  switch (rule.trigger) {
    case 'no-session-days':
      return `Fires when a client hasn't logged a session in ${rule.thresholdDays ?? 7}+ days.`
    case 'checkin-overdue-days':
      return `Fires when a client hasn't checked in in ${rule.thresholdDays ?? 14}+ days.`
    case 'package-low-sessions':
      return `Fires when a client's session pack is down to ${rule.thresholdSessions ?? 2} or fewer sessions.`
    case 'payment-overdue-days':
      return `Fires when a client hasn't paid in ${rule.thresholdDays ?? 35}+ days.`
    case 'screening-missing':
      return `Fires when a client has no cleared PAR-Q+ health screening on file.`
    case 'checkin-cadence-slipping':
      return `Fires when a client's check-in gap grows well past their own historical average — needs 3+ check-ins of history, no threshold to set.`
    case 'completion-trend-declining':
      return `Fires when a client's set-completion rate drops 20+ points from a 70%+ baseline — needs 4+ logged sessions, no threshold to set.`
  }
}

export const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  'no-session-days': 'No session logged in N days',
  'checkin-overdue-days': 'No check-in in N days',
  'package-low-sessions': 'Session pack down to N or fewer',
  'payment-overdue-days': 'No payment in N days',
  'screening-missing': 'Health screening missing or not cleared',
  'checkin-cadence-slipping': "Check-in gap grows past the client's own average",
  'completion-trend-declining': 'Set completion trending down',
}

import { describe, it, expect } from 'vitest'
import { explainRule, evaluateAutomations, DEFAULT_RULES, type ClientFacts } from './automations'
import type { AutomationRule, Client } from '@/db/types'

const STAMP = { id: 'r1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }

function rule(overrides: Partial<AutomationRule>): AutomationRule {
  return { ...STAMP, name: 'Test rule', trigger: 'no-session-days', message: 'msg', active: true, ...overrides }
}

const CLIENT_STAMP = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }

function client(overrides: Partial<Client> = {}): Client {
  return {
    ...CLIENT_STAMP, id: 'c1', firstName: 'Sam', lastName: 'Rivera', status: 'active',
    goals: '', injuries: '', parqNotes: '', tags: [], startDate: '2026-01-01', ...overrides,
  }
}

function facts(overrides: Partial<ClientFacts> = {}): ClientFacts {
  return { clientId: 'c1', hasScreening: true, screeningCleared: true, ...overrides }
}

describe('explainRule', () => {
  it('explains no-session-days with its configured threshold', () => {
    expect(explainRule(rule({ trigger: 'no-session-days', thresholdDays: 10 })))
      .toBe("Fires when a client hasn't logged a session in 10+ days.")
  })

  it('falls back to the engine default threshold when unset', () => {
    expect(explainRule(rule({ trigger: 'no-session-days', thresholdDays: undefined })))
      .toBe("Fires when a client hasn't logged a session in 7+ days.")
  })

  it('explains checkin-overdue-days', () => {
    expect(explainRule(rule({ trigger: 'checkin-overdue-days', thresholdDays: 21 })))
      .toBe("Fires when a client hasn't checked in in 21+ days.")
  })

  it('explains package-low-sessions', () => {
    expect(explainRule(rule({ trigger: 'package-low-sessions', thresholdSessions: 1 })))
      .toBe("Fires when a client's session pack is down to 1 or fewer sessions.")
  })

  it('explains payment-overdue-days', () => {
    expect(explainRule(rule({ trigger: 'payment-overdue-days', thresholdDays: 45 })))
      .toBe("Fires when a client hasn't paid in 45+ days.")
  })

  it('explains screening-missing with no threshold involved', () => {
    expect(explainRule(rule({ trigger: 'screening-missing' })))
      .toBe('Fires when a client has no cleared PAR-Q+ health screening on file.')
  })

  it('explains checkin-cadence-slipping', () => {
    expect(explainRule(rule({ trigger: 'checkin-cadence-slipping' })))
      .toContain("past their own historical average")
  })

  it('explains completion-trend-declining', () => {
    expect(explainRule(rule({ trigger: 'completion-trend-declining' })))
      .toContain('20+ points')
  })
})

describe('evaluateAutomations — checkin-cadence-slipping', () => {
  const cadenceRule = rule({ id: 'cadence', trigger: 'checkin-cadence-slipping', message: 'avg {avg}, now {days}' })

  it('fires when the current gap is well past the historical average', () => {
    // Checked in every 3 days historically (Jan 1, 4, 7), then went quiet —
    // today is 10 days past the last one, historical average is 3.
    const result = evaluateAutomations({
      clients: [client()],
      facts: new Map([['c1', facts({ checkInDates: ['2026-01-01', '2026-01-04', '2026-01-07'] })]]),
      rules: [cadenceRule],
      today: '2026-01-17',
    })
    expect(result).toHaveLength(1)
    expect(result[0].message).toBe('avg 3, now 10')
  })

  it('does not fire when the gap is in line with the historical average', () => {
    const result = evaluateAutomations({
      clients: [client()],
      facts: new Map([['c1', facts({ checkInDates: ['2026-01-01', '2026-01-04', '2026-01-07'] })]]),
      rules: [cadenceRule],
      today: '2026-01-10', // exactly one more 3-day interval
    })
    expect(result).toHaveLength(0)
  })

  it('does not fire with fewer than 3 check-ins — no history to compare against', () => {
    const result = evaluateAutomations({
      clients: [client()],
      facts: new Map([['c1', facts({ checkInDates: ['2026-01-01', '2026-01-04'] })]]),
      rules: [cadenceRule],
      today: '2026-01-20',
    })
    expect(result).toHaveLength(0)
  })
})

describe('evaluateAutomations — completion-trend-declining', () => {
  const trendRule = rule({ id: 'trend', trigger: 'completion-trend-declining', message: '{from}% to {to}%' })

  it('fires when recent completion has dropped well below a solid prior baseline', () => {
    const result = evaluateAutomations({
      clients: [client()],
      facts: new Map([['c1', facts({ sessionCompletionRates: [0.9, 0.85, 0.95, 0.5, 0.4] })]]),
      rules: [trendRule],
      today: '2026-01-20',
    })
    expect(result).toHaveLength(1)
    expect(result[0].message).toBe('90% to 45%')
  })

  it('does not fire when completion stays consistent', () => {
    const result = evaluateAutomations({
      clients: [client()],
      facts: new Map([['c1', facts({ sessionCompletionRates: [0.9, 0.85, 0.95, 0.9, 0.88] })]]),
      rules: [trendRule],
      today: '2026-01-20',
    })
    expect(result).toHaveLength(0)
  })

  it('does not fire off a low baseline that was never actually high', () => {
    const result = evaluateAutomations({
      clients: [client()],
      facts: new Map([['c1', facts({ sessionCompletionRates: [0.5, 0.4, 0.45, 0.2, 0.1] })]]),
      rules: [trendRule],
      today: '2026-01-20',
    })
    expect(result).toHaveLength(0)
  })

  it('does not fire with fewer than 4 logged sessions', () => {
    const result = evaluateAutomations({
      clients: [client()],
      facts: new Map([['c1', facts({ sessionCompletionRates: [0.9, 0.3] })]]),
      rules: [trendRule],
      today: '2026-01-20',
    })
    expect(result).toHaveLength(0)
  })
})

describe('DEFAULT_RULES', () => {
  it('includes the two trend-based rules, both active', () => {
    const cadence = DEFAULT_RULES.find(r => r.trigger === 'checkin-cadence-slipping')
    const trend = DEFAULT_RULES.find(r => r.trigger === 'completion-trend-declining')
    expect(cadence?.active).toBe(true)
    expect(trend?.active).toBe(true)
  })
})

describe('no-session rule for a client who has never logged', () => {
  it('says so in words, not "ever days"', () => {
    const client = { id: 'c', firstName: 'A', lastName: 'B', status: 'active' } as unknown as Client
    const facts = new Map<string, ClientFacts>([['c', { clientId: 'c', hasScreening: true, screeningCleared: true }]])
    const items = evaluateAutomations({ clients: [client], facts, rules: DEFAULT_RULES, today: '2026-09-28' })
    const msg = items.find(i => i.ruleId === 'default-no-session')?.message
    expect(msg).toBe('No session logged yet')
  })
})

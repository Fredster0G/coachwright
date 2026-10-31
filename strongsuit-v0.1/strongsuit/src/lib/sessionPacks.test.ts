import { describe, it, expect } from 'vitest'
import { sessionPackBalance } from './sessionPacks'

const pack = (date: string, sessions: number) => ({ type: 'session-credit' as const, sessions, date })
const log = (date: string, source: 'trainer' | 'companion-import' = 'trainer') => ({ date, source })

describe('sessionPackBalance', () => {
  it('is undefined without a pack', () => {
    expect(sessionPackBalance([{ type: 'payment', date: '2026-01-01' }], [log('2026-01-02')])).toBeUndefined()
  })

  it('does not charge sessions logged before the first pack', () => {
    const history = Array.from({ length: 40 }, (_, i) => log(`2025-0${1 + (i % 9)}-10`))
    expect(sessionPackBalance([pack('2026-01-01', 10)], [...history, log('2026-01-05')]))
      .toEqual({ purchased: 10, used: 1, remaining: 9 })
  })

  it('does not charge workouts the client logged in Companion', () => {
    expect(sessionPackBalance([pack('2026-01-01', 5)], [log('2026-01-02'), log('2026-01-03', 'companion-import')]))
      .toEqual({ purchased: 5, used: 1, remaining: 4 })
  })

  it('adds packs together and never goes negative', () => {
    const logs = Array.from({ length: 20 }, (_, i) => log(`2026-02-${String(i + 1).padStart(2, '0')}`))
    expect(sessionPackBalance([pack('2026-02-01', 5), pack('2026-02-10', 10)], logs))
      .toEqual({ purchased: 15, used: 20, remaining: 0 })
  })
})

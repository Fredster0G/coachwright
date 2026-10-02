import { describe, it, expect, afterAll } from 'vitest'
import { groupSlotsByDay, pendingRequests } from './booking'
import type { CoachMessage } from '@/db/types'

const savedTz = process.env.TZ
afterAll(() => { if (savedTz === undefined) delete process.env.TZ; else process.env.TZ = savedTz })

describe('groupSlotsByDay', () => {
  it('groups by the phone\'s local day, sorted', () => {
    process.env.TZ = 'America/New_York'
    const slot = (iso: string) => ({ start: iso, end: iso })
    // 2026-10-06T01:00Z is still Oct 5 in New York.
    const days = groupSlotsByDay([slot('2026-10-06T13:00:00.000Z'), slot('2026-10-06T01:00:00.000Z'), slot('2026-10-05T22:00:00.000Z')])
    expect(days.map(d => [d.date, d.slots.length])).toEqual([['2026-10-05', 2], ['2026-10-06', 1]])
    expect(days[0].slots[0].start).toBe('2026-10-05T22:00:00.000Z')
  })
})

describe('pendingRequests', () => {
  const msg = (over: Partial<CoachMessage>): CoachMessage => ({ id: 'm', direction: 'to-coach', content: '', createdAt: '', ...over })
  it('keeps only unanswered, upcoming requests from this side', () => {
    const now = new Date('2026-10-05T12:00:00.000Z')
    const future = { start: '2026-10-06T10:00:00.000Z', end: '2026-10-06T11:00:00.000Z' }
    const out = pendingRequests([
      msg({ id: 'a', booking: future }),
      msg({ id: 'b', booking: { ...future, status: 'accepted' } }),
      msg({ id: 'c', booking: { start: '2026-10-01T10:00:00.000Z', end: '2026-10-01T11:00:00.000Z' } }),
      msg({ id: 'd' }),
      msg({ id: 'e', direction: 'from-coach', booking: future }),
    ], now)
    expect(out.map(m => m.id)).toEqual(['a'])
  })
})

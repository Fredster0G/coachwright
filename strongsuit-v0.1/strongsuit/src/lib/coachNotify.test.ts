import { describe, it, expect } from 'vitest'
import { unseenInbound, summarize, seenIdsFor, SEEN_WINDOW_DAYS } from './coachNotify'
import type { CoachMessage } from '@/db/types'

const m = (id: string, over: Partial<CoachMessage> = {}): CoachMessage => ({
  id, createdAt: '', updatedAt: '', clientId: 'a', date: `2026-10-0${id.length}T10:00:00.000Z`, direction: 'inbound', channel: 'app', content: `msg ${id}`, ...over,
})
const names: Record<string, string> = { a: 'Alex', b: 'Sam', c: 'Kim', d: 'Lee' }
const nameOf = (id: string) => names[id] ?? 'A client'

const NOW = new Date('2026-10-10T00:00:00.000Z')
describe('unseenInbound', () => {
  it('returns only inbound, unseen, oldest first', () => {
    const out = unseenInbound([m('xx'), m('x'), m('o', { direction: 'outbound' }), m('seen')], new Set(['seen']), NOW)
    expect(out.map(x => x.id)).toEqual(['x', 'xx'])
  })
  it('ignores anything older than the window, so pruned ids never re-announce', () => {
    const old = m('old', { date: new Date(NOW.getTime() - (SEEN_WINDOW_DAYS + 1) * 86_400_000).toISOString() })
    expect(unseenInbound([old], new Set(), NOW)).toEqual([])
    expect(seenIdsFor([old, m('x'), m('o', { direction: 'outbound' })], NOW)).toEqual(['x'])
  })
})

describe('summarize', () => {
  it('one message', () => {
    expect(summarize([m('1')], nameOf)).toEqual({ title: 'Message from Alex', body: 'msg 1', clientId: 'a' })
  })
  it('one booking request', () => {
    const r = m('1', { booking: { start: 's', end: 'e' }, content: 'Session request: Mon' })
    expect(summarize([r], nameOf)!.title).toBe('Session request from Alex')
  })
  it('a batch names people and counts requests', () => {
    const batch = [m('1'), m('2', { clientId: 'b', booking: { start: 's', end: 'e' } }), m('3', { clientId: 'c' }), m('4', { clientId: 'd' })]
    expect(summarize(batch, nameOf)!.title).toBe('4 new from Alex, Sam and 2 more (1 session request)')
    expect(summarize([m('1'), m('2', { clientId: 'b' })], nameOf)!.title).toBe('2 new messages from Alex and Sam')
  })
  it('an answered request is just a message', () => {
    expect(summarize([m('1', { booking: { start: 's', end: 'e', status: 'accepted' } })], nameOf)!.title).toBe('Message from Alex')
  })
  it('nothing → null', () => { expect(summarize([], nameOf)).toBeNull() })
})

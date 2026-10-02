// Integration: Companion's real sync code against the real Coachwright Cloud
// server (../../sync-server), in-process, in-memory database. The "coach" is
// driven over HTTP exactly as the coach app would.
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

let server: Server
let base = ''
let api: typeof import('./companionSyncApi')
let repo: typeof import('@/db/repo')
let schema: typeof import('@/db/schema')

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  process.env.AUTH_RATE_LIMIT_PER_15MIN = '1000'
  const { app } = await import('../../../../sync-server/server')
  server = app.listen(0)
  await new Promise<void>(r => server.once('listening', () => r()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  vi.stubEnv('VITE_CLOUD_URL', base)
  schema = await import('@/db/schema')
  repo = await import('@/db/repo')
  api = await import('./companionSyncApi')
})
afterAll(() => { server?.close() })
beforeEach(async () => { for (const t of schema.db.tables) await t.clear() })

let n = 0
async function coach() {
  const r = await fetch(`${base}/auth/signup`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `c${++n}@example.com`, password: 'password1', name: 'Coach Jordan' }) })
  const { token } = await r.json() as { token: string }
  const h = { 'content-type': 'application/json', authorization: `Bearer ${token}` }
  const t0 = '2026-01-01T00:00:00.000Z'
  const row = (table: string, id: string, data: Record<string, unknown>) => ({ table, id, updatedAt: t0, data: { id, createdAt: t0, updatedAt: t0, ...data } })
  return {
    push: (changes: unknown[]) => fetch(`${base}/data/push`, { method: 'POST', headers: h, body: JSON.stringify({ changes }) }),
    pull: async () => (await (await fetch(`${base}/data/pull?since=0`, { headers: h })).json()) as { changes: { table: string; id: string; data: Record<string, unknown> }[] },
    invite: async (clientId: string) => ((await (await fetch(`${base}/invites`, { method: 'POST', headers: h, body: JSON.stringify({ clientId }) })).json()) as { code: string }).code,
    disconnect: (clientId: string) => fetch(`${base}/invites/${clientId}`, { method: 'DELETE', headers: h }),
    row,
  }
}

describe('Companion ↔ Coachwright Cloud', () => {
  it('connects with a code, receives the program and coach messages, sends logs back', async () => {
    const c = await coach()
    await c.push([
      c.row('clients', 'cl1', { firstName: 'Alex' }),
      c.row('programs', 'p1', { clientId: 'cl1', name: 'Strength Base', weeks: [] }),
      c.row('messages', 'm1', { clientId: 'cl1', direction: 'outbound', channel: 'app', content: 'Welcome!', date: '2026-01-01T00:00:00.000Z' }),
    ])
    const code = await c.invite('cl1')
    const link = await api.connectWithCode(`${code.slice(0, 4)}-${code.slice(4)}`)
    expect(link.coachName).toBe('Coach Jordan')

    await repo.workoutsRepo.create({ date: '2026-01-02', title: 'Squats', exercises: [{ name: 'Back Squat', sets: [{ reps: 5, load: 100 }] }] })
    await repo.messagesRepo.create({ direction: 'to-coach', content: 'Thanks coach' })
    const r = await api.syncNow((await repo.coachLinkRepo.get())!)
    expect(r.programs).toBe(1)
    expect(r.pulled).toBe(1)
    expect((await repo.messagesRepo.all()).map(m => m.content)).toContain('Welcome!')

    const coachSide = (await c.pull()).changes
    const log = coachSide.find(x => x.table === 'sessionLogs')!
    expect(log.data.clientId).toBe('cl1')
    expect(log.data.title).toBe('Squats')
    expect(coachSide.find(x => x.table === 'messages' && x.data.content === 'Thanks coach')?.data.direction).toBe('inbound')
  })

  it('only uploads what changed since the last sync', async () => {
    const c = await coach()
    await c.push([c.row('clients', 'cl1', { firstName: 'Alex' })])
    await api.connectWithCode(await c.invite('cl1'))
    await repo.workoutsRepo.create({ date: '2026-01-02', title: 'A', exercises: [] })
    await api.syncNow((await repo.coachLinkRepo.get())!)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await api.syncNow((await repo.coachLinkRepo.get())!)
    const pushes = fetchSpy.mock.calls.filter(([u]) => String(u).endsWith('/client/push'))
    const bodies = pushes.map(([, init]) => JSON.parse(String((init as RequestInit).body)).changes.length)
    expect(bodies.every(n => n === 0)).toBe(true)
    fetchSpy.mockRestore()
  })

  it('a disconnected app drops its link but keeps its own history', async () => {
    const c = await coach()
    await c.push([c.row('clients', 'cl1', { firstName: 'Alex' })])
    await api.connectWithCode(await c.invite('cl1'))
    await repo.workoutsRepo.create({ date: '2026-01-02', title: 'Mine', exercises: [] })
    await c.disconnect('cl1')
    await expect(api.syncNow((await repo.coachLinkRepo.get())!)).rejects.toThrow(/disconnected/)
    expect(await repo.coachLinkRepo.get()).toBeUndefined()
    expect((await repo.workoutsRepo.all()).map(w => w.title)).toEqual(['Mine'])
  })

  it('booking: sees open slots and its sessions, requests one, and gets the coach\'s answer', async () => {
    const c = await coach()
    const h = 3_600_000, now = Date.now()
    const at = (ms: number) => new Date(now + ms).toISOString()
    const slot = { start: at(30 * h), end: at(31 * h) }
    await c.push([
      c.row('clients', 'cl1', { firstName: 'Alex' }),
      c.row('trainer', 'trainer', { booking: { enabled: true, slotMinutes: 60, noticeHours: 12, windows: [] }, bookingSlots: [{ start: at(h), end: at(2 * h) }, slot] }),
      c.row('appointments', 'ap1', { clientId: 'cl1', title: 'Session', start: at(48 * h), end: at(49 * h) }),
    ])
    await api.connectWithCode(await c.invite('cl1'))
    await api.syncNow((await repo.coachLinkRepo.get())!)
    let link = (await repo.coachLinkRepo.get())!
    expect(link.bookingEnabled).toBe(true)
    expect(link.openSlots).toEqual([slot])            // the 1h-out one is inside the notice period
    expect(link.sessions?.map(s => s.id)).toEqual(['ap1'])

    await api.pushMessageToCoach(link, 'Session request', slot)
    const req = (await c.pull()).changes.find(x => x.table === 'messages' && x.data.booking)!
    expect(req.data.booking).toEqual(slot)

    // Coach accepts: same message id, newer stamp, status set.
    const t1 = new Date(now + 1000).toISOString()
    await c.push([{ table: 'messages', id: req.id, updatedAt: t1, data: { ...req.data, updatedAt: t1, booking: { ...slot, status: 'accepted', appointmentId: 'ap2' } } }])
    link = (await repo.coachLinkRepo.get())!
    await api.syncNow(link)
    const mine = (await repo.messagesRepo.all()).find(m => m.id === req.id)!
    expect(mine.booking?.status).toBe('accepted')
  })

  it('a wrong code is a clear error', async () => {
    await expect(api.connectWithCode('ZZZZ-ZZZZ')).rejects.toThrow(/wrong or has expired/)
  })
})

// Integration: the app's real sync engine against the real Coachwright Cloud
// server (sync-server/server.ts), in-process on an ephemeral port with an
// in-memory database. No mocks on either side of the wire.
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

let server: Server
let base = ''
type Engine = typeof import('./syncEngine')
type Session = typeof import('./session')
let engine: Engine
let session: Session
let dbm: typeof import('@/db/schema')

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  process.env.AUTH_RATE_LIMIT_PER_15MIN = '1000'
  const { app } = await import('../../../../sync-server/server')
  server = app.listen(0)
  await new Promise<void>(r => server.once('listening', () => r()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  vi.stubEnv('VITE_CLOUD_URL', base)
  dbm = await import('@/db/schema')
  session = await import('./session')
  engine = await import('./syncEngine')
  engine.installSyncHooks()
})
afterAll(() => { server?.close() })

beforeEach(async () => {
  await session.signOut()
  engine.resetSyncState(true)
  for (const t of dbm.db.tables) await t.clear()
})

let n = 0
const email = () => `sync${++n}@example.com`
const t0 = '2026-01-01T00:00:00.000Z'
const client = (id: string, firstName: string, updatedAt = t0) =>
  ({ id, firstName, lastName: 'X', status: 'active', startDate: '2026-01-01', createdAt: t0, updatedAt }) as never

/** A second device, talking to the server directly. */
async function otherDevice(address: string, password = 'password1') {
  const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: address, password }) })
  const { token } = await r.json() as { token: string }
  const h = { 'content-type': 'application/json', authorization: `Bearer ${token}` }
  return {
    push: (changes: unknown[]) => fetch(`${base}/data/push`, { method: 'POST', headers: h, body: JSON.stringify({ changes }) }),
    pull: async () => (await (await fetch(`${base}/data/pull?since=0`, { headers: h })).json()) as { changes: { table: string; id: string; deleted: boolean; data: Record<string, unknown> }[] },
  }
}

describe('cloud sync engine', () => {
  it('first sign-up on an install with data uploads it; later edits and deletes follow', async () => {
    await dbm.db.clients.add(client('c1', 'Alex'))
    const address = email()
    await session.signUp(address, 'password1')
    expect(await engine.linkDevice()).toBe('uploaded')

    const other = await otherDevice(address)
    expect((await other.pull()).changes.find(c => c.id === 'c1')?.data.firstName).toBe('Alex')

    await dbm.db.clients.update('c1', { firstName: 'Alexis', updatedAt: '2026-02-01T00:00:00.000Z' })
    await engine.syncNow()
    expect((await other.pull()).changes.find(c => c.id === 'c1')?.data.firstName).toBe('Alexis')

    await dbm.db.clients.delete('c1')
    await engine.syncNow()
    expect((await other.pull()).changes.find(c => c.id === 'c1')?.deleted).toBe(true)
    expect(engine.getSyncStatus().pending).toBe(0)
  })

  it('pulls another device\'s changes without echoing them back as local edits', async () => {
    const address = email()
    await session.signUp(address, 'password1')
    await engine.linkDevice()
    const other = await otherDevice(address)
    await other.push([{ table: 'clients', id: 'c2', updatedAt: t0, data: client('c2', 'Sam') }])

    await engine.syncNow()
    expect((await dbm.db.clients.get('c2'))?.firstName).toBe('Sam')
    expect(engine.getSyncStatus().pending).toBe(0)
  })

  it('signing in on a fresh device downloads the account and replaces local rows', async () => {
    const address = email()
    await session.signUp(address, 'password1')
    await engine.linkDevice()
    await dbm.db.clients.add(client('c3', 'Jordan'))
    await engine.syncNow()

    // "New device": same account, local DB holds unrelated junk, never linked.
    await session.signOut(); engine.resetSyncState(true)
    for (const t of dbm.db.tables) await t.clear()
    await dbm.db.clients.add(client('junk', 'Stranger'))
    await session.signIn(address, 'password1')
    expect(await engine.linkDevice()).toBe('downloaded')
    expect((await dbm.db.clients.toArray()).map(c => c.id)).toEqual(['c3'])
  })

  it('a newer local edit survives an older remote version', async () => {
    const address = email()
    await session.signUp(address, 'password1')
    await engine.linkDevice()
    const other = await otherDevice(address)
    await other.push([{ table: 'clients', id: 'c4', updatedAt: t0, data: client('c4', 'Old') }])
    await engine.syncNow()

    await dbm.db.clients.update('c4', { firstName: 'Mine', updatedAt: '2026-03-01T00:00:00.000Z' })
    await other.push([{ table: 'clients', id: 'c4', updatedAt: '2026-02-01T00:00:00.000Z', data: client('c4', 'Theirs', '2026-02-01T00:00:00.000Z') }])
    await engine.syncNow()
    expect((await dbm.db.clients.get('c4'))?.firstName).toBe('Mine')
    expect((await other.pull()).changes.find(c => c.id === 'c4')?.data.firstName).toBe('Mine')
  })

  it('never uploads device-only trainer fields', async () => {
    const address = email()
    await session.signUp(address, 'password1')
    await engine.linkDevice()
    await dbm.db.trainer.put({ id: 'trainer', trainerName: 'T', membershipActive: true, membershipExpiresAt: '2099-01-01', createdAt: t0, updatedAt: t0 } as never)
    await engine.syncNow()
    const row = (await (await otherDevice(address)).pull()).changes.find(c => c.table === 'trainer')!
    expect(row.data.trainerName).toBe('T')
    expect(row.data).not.toHaveProperty('membershipActive')
  })

  it('reports offline, keeps changes queued, and delivers them later', async () => {
    const address = email()
    await session.signUp(address, 'password1')
    await engine.linkDevice()
    await dbm.db.clients.add(client('c5', 'Queued'))
    const realFetch = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await engine.syncNow()
    expect(engine.getSyncStatus().phase).toBe('offline')
    expect(engine.getSyncStatus().pending).toBeGreaterThan(0)
    vi.stubGlobal('fetch', realFetch)
    await engine.syncNow()
    expect(engine.getSyncStatus().pending).toBe(0)
    expect((await (await otherDevice(address)).pull()).changes.some(c => c.id === 'c5')).toBe(true)
  })
})

describe('account isolation on one device', () => {
  it('a device linked to account A never uploads A\'s data into account B', async () => {
    const a = email(), b = email()
    await session.signUp(a, 'password1')
    await engine.linkDevice()
    await dbm.db.clients.add(client('a-secret', 'A client'))
    await engine.syncNow()
    await session.signOut(); engine.resetSyncState()   // link to A is kept

    await session.signUp(b, 'password1')
    expect(await engine.linkDevice()).toBe('downloaded')
    expect(await dbm.db.clients.count()).toBe(0)
    expect((await (await otherDevice(b)).pull()).changes.length).toBe(0)
  })
})

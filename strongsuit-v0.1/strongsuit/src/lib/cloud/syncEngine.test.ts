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
let server_: typeof import('../../../../sync-server/server')

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  process.env.AUTH_RATE_LIMIT_PER_15MIN = '1000'
  server_ = await import('../../../../sync-server/server')
  const { app } = server_
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

describe('account basics (S24)', () => {
  it('forgot password: the emailed code resets it and signs this device in', async () => {
    const address = email()
    await session.signUp(address, 'password1')
    await session.signOut()
    const sent: string[] = []
    const original = server_.mailer.send
    server_.mailer.send = async (_to, _subject, text) => { sent.push(text) }
    try {
      await session.requestPasswordReset(address)
      await new Promise(r => setTimeout(r, 10))
    } finally { server_.mailer.send = original }
    const code = /paste: ([0-9a-f]{32})/.exec(sent[0])![1]
    await session.confirmPasswordReset(`  ${code} `, 'password2')
    expect(session.getSession()?.email).toBe(address)
    await session.signOut()
    await expect(session.signIn(address, 'password1')).rejects.toThrow()
    await session.signIn(address, 'password2')
  })

  it('deleting the account erases it on the server and on this device', async () => {
    const address = email()
    await session.signUp(address, 'password1')
    await engine.linkDevice()
    await dbm.db.clients.add(client('gone', 'Gone'))
    await engine.syncNow()

    await expect(session.deleteAccount('wrong-password')).rejects.toThrow('Password is wrong')
    expect(session.getSession()).not.toBeNull()
    await session.deleteAccount('password1')
    await engine.eraseThisDevice()

    expect(session.getSession()).toBeNull()
    expect(engine.linkedAccountId()).toBeNull()
    for (const t of dbm.db.tables) expect(await t.count()).toBe(0)
    await expect(session.signIn(address, 'password1')).rejects.toThrow()
  })

  it('a client over the free limit stays on the device, is reported, and uploads once there is room', async () => {
    const address = email()
    await session.signUp(address, 'password1')
    await engine.linkDevice()
    await dbm.db.trainer.add({ id: 'me', createdAt: t0, updatedAt: t0 } as never)
    await engine.syncNow()
    for (const [id, name] of [['a', 'A'], ['b', 'B'], ['c', 'C'], ['d', 'D']]) await dbm.db.clients.add(client(id, name))
    await engine.syncNow()
    expect(engine.getSyncStatus()).toMatchObject({ phase: 'idle', refusedClients: 1, pending: 1 })

    await dbm.db.clients.update('a', { status: 'archived', updatedAt: '2026-02-01T00:00:00.000Z' })
    await engine.syncNow()
    expect(engine.getSyncStatus().refusedClients).toBeUndefined()
    expect(engine.getSyncStatus().pending).toBe(0)
    const ids = (await (await otherDevice(address)).pull()).changes.filter(c => c.table === 'clients').map(c => c.id)
    expect(ids.sort()).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('app ↔ server lists that must match (DEBT-60)', () => {
  it('synced tables', async () => {
    const { SYNCED_TABLES } = await import('./tables')
    expect([...server_.SYNC_TABLES].sort()).toEqual([...SYNCED_TABLES].sort())
  })
  it('licence verification key', async () => {
    const { RELEASE_PUBLIC_JWK } = await import('@/lib/licence')
    expect({ x: server_.LICENCE_PUBLIC_JWK.x, y: server_.LICENCE_PUBLIC_JWK.y, crv: server_.LICENCE_PUBLIC_JWK.crv })
      .toEqual({ x: RELEASE_PUBLIC_JWK!.x, y: RELEASE_PUBLIC_JWK!.y, crv: RELEASE_PUBLIC_JWK!.crv })
  })
})

// HTTP-level tests for Coachwright Cloud. Real Express app, in-memory SQLite,
// ephemeral port, no Stripe network calls (membership cases here are all
// decided before the server would reach Stripe, or use a locally signed
// webhook event).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import Stripe from 'stripe'
import { generateKeyPairSync, sign } from 'node:crypto'

const WEBHOOK_SECRET = 'whsec_test_local'
process.env.DB_PATH = ':memory:'
process.env.STRIPE_SECRET_KEY = 'sk_test_never_used_over_the_network'
process.env.STRIPE_PRICE_ID = 'price_test'
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET
process.env.AUTH_RATE_LIMIT_PER_15MIN = '1000'
// A throwaway licence-signing key, so a test can mint a valid one-time licence.
const licenceKeys = generateKeyPairSync('ec', { namedCurve: 'P-256' })
process.env.LICENCE_PUBLIC_JWK = JSON.stringify(licenceKeys.publicKey.export({ format: 'jwk' }))
function mintLicence(edition: string): string {
  const c = { name: 'Old Buyer', edition, issuedAt: '2026-03-01T00:00:00.000Z', serial: 7 }
  const canonical = JSON.stringify([c.name, c.edition, 0, c.issuedAt, c.serial, 'standard'])
  const sig = sign('sha256', Buffer.from(canonical), { key: licenceKeys.privateKey, dsaEncoding: 'ieee-p1363' })
  return `CW1.${Buffer.from(JSON.stringify(c)).toString('base64url')}.${sig.toString('base64url')}`
}

type Mod = typeof import('../server')
let mod: Mod
let server: Server
let base = ''

before(async () => {
  // require (not import) so the env above is set before server.ts evaluates.
  mod = require('../server') as Mod
  server = mod.app.listen(0)
  await new Promise<void>(r => server.once('listening', () => r()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(() => { server?.close() })

const json = (token?: string) => ({ 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) })
const post = (path: string, body: unknown, token?: string) => fetch(`${base}${path}`, { method: 'POST', headers: json(token), body: JSON.stringify(body) })
const get = (path: string, token?: string) => fetch(`${base}${path}`, { headers: json(token) })
const del = (path: string, body: unknown, token?: string) => fetch(`${base}${path}`, { method: 'DELETE', headers: json(token), body: JSON.stringify(body) })

let n = 0
async function signup(name = 'Coach'): Promise<string> {
  const r = await post('/auth/signup', { email: `coach${++n}@example.com`, password: 'correct horse', name })
  assert.equal(r.status, 200)
  return ((await r.json()) as { token: string }).token
}
const row = (table: string, id: string, updatedAt: string, data: Record<string, unknown> = {}) =>
  ({ table, id, updatedAt, data: { id, updatedAt, createdAt: updatedAt, ...data } })

// ---------------------------------------------------------------- auth

test('signup → me → logout → token no longer works', async () => {
  const r = await post('/auth/signup', { email: 'Sam@Example.com', password: 'longenough', name: 'Sam' })
  const { token, account } = await r.json() as { token: string; account: { email: string } }
  assert.equal(account.email, 'sam@example.com')
  assert.equal((await get('/auth/me', token)).status, 200)
  await post('/auth/logout', {}, token)
  assert.equal((await get('/auth/me', token)).status, 401)
})

test('signup rejects duplicates and weak passwords; login rejects wrong password', async () => {
  await post('/auth/signup', { email: 'dup@example.com', password: 'longenough' })
  assert.equal((await post('/auth/signup', { email: 'DUP@example.com', password: 'longenough' })).status, 409)
  assert.equal((await post('/auth/signup', { email: 'x@example.com', password: 'short' })).status, 400)
  assert.equal((await post('/auth/login', { email: 'dup@example.com', password: 'wrongwrong' })).status, 401)
  assert.equal((await post('/auth/login', { email: 'nobody@example.com', password: 'wrongwrong' })).status, 401)
  assert.equal((await post('/auth/login', { email: 'dup@example.com', password: 'longenough' })).status, 200)
})

test('passwords are stored as scrypt hashes and session tokens only as sha256', async () => {
  const token = await signup()
  const acct = mod.db.prepare('SELECT password_hash FROM accounts ORDER BY rowid DESC LIMIT 1').get() as { password_hash: string }
  assert.match(acct.password_hash, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/)
  assert.ok(mod.db.prepare('SELECT 1 FROM sessions WHERE token_hash = ?').get(mod.sha256Hex(token)))
  assert.equal(mod.db.prepare('SELECT 1 FROM sessions WHERE token_hash = ?').get(token), undefined)
})

test('changing password signs out other sessions but keeps this one', async () => {
  await post('/auth/signup', { email: 'pw@example.com', password: 'firstpass1' })
  const a = ((await (await post('/auth/login', { email: 'pw@example.com', password: 'firstpass1' })).json()) as { token: string }).token
  const b = ((await (await post('/auth/login', { email: 'pw@example.com', password: 'firstpass1' })).json()) as { token: string }).token
  assert.equal((await post('/auth/password', { currentPassword: 'nope', newPassword: 'secondpass2' }, a)).status, 403)
  assert.equal((await post('/auth/password', { currentPassword: 'firstpass1', newPassword: 'secondpass2' }, a)).status, 200)
  assert.equal((await get('/auth/me', a)).status, 200)
  assert.equal((await get('/auth/me', b)).status, 401)
})

// ---------------------------------------------------------------- password reset

async function requestReset(email: string): Promise<{ to: string; text: string }[]> {
  const sent: { to: string; text: string }[] = []
  const original = mod.mailer.send
  mod.mailer.send = async (to, _subject, text) => { sent.push({ to, text }) }
  try {
    const r = await post('/auth/reset/request', { email })
    assert.equal(r.status, 200)
    assert.deepEqual(await r.json(), { success: true })
    await new Promise(r => setImmediate(r))
  } finally { mod.mailer.send = original }
  return sent
}
const tokenIn = (text: string) => /token=([0-9a-f]{32})/.exec(text)![1]

test('password reset: emailed single-use token sets a new password and signs out every device', async () => {
  await post('/auth/signup', { email: 'forgot@example.com', password: 'oldpassword' })
  const old = ((await (await post('/auth/login', { email: 'forgot@example.com', password: 'oldpassword' })).json()) as { token: string }).token
  const sent = await requestReset('Forgot@Example.com')
  assert.equal(sent.length, 1)
  assert.equal(sent[0].to, 'forgot@example.com')
  const token = tokenIn(sent[0].text)
  assert.ok(sent[0].text.includes(`paste: ${token}`), 'desktop users get the code to paste')
  assert.equal(mod.db.prepare('SELECT 1 FROM password_resets WHERE token_hash = ?').get(token), undefined, 'stored hashed')

  assert.equal((await post('/auth/reset/confirm', { token, newPassword: 'short' })).status, 400)
  const ok = await post('/auth/reset/confirm', { token, newPassword: 'newpassword' })
  assert.equal(ok.status, 200)
  const { token: fresh, account } = await ok.json() as { token: string; account: { email: string } }
  assert.equal(account.email, 'forgot@example.com')
  assert.equal((await get('/auth/me', fresh)).status, 200)
  assert.equal((await get('/auth/me', old)).status, 401)
  assert.equal((await post('/auth/login', { email: 'forgot@example.com', password: 'oldpassword' })).status, 401)
  assert.equal((await post('/auth/login', { email: 'forgot@example.com', password: 'newpassword' })).status, 200)
  assert.equal((await post('/auth/reset/confirm', { token, newPassword: 'thirdpassword' })).status, 400, 'single use')
})

test('password reset: unknown emails look identical and send nothing; throttled; expired and superseded tokens fail', async () => {
  assert.deepEqual(await requestReset('nobody-here@example.com'), [])
  await post('/auth/signup', { email: 'twice@example.com', password: 'oldpassword' })
  const first = tokenIn((await requestReset('twice@example.com'))[0].text)
  assert.deepEqual(await requestReset('twice@example.com'), [], 'a second request within a minute sends nothing')
  mod.db.prepare('UPDATE password_resets SET expires_at = ? WHERE token_hash = ?')
    .run(new Date(Date.now() + 30 * 60_000).toISOString(), mod.sha256Hex(first))   // as if requested 30 min ago
  const second = tokenIn((await requestReset('twice@example.com'))[0].text)
  assert.equal((await post('/auth/reset/confirm', { token: first, newPassword: 'newpassword' })).status, 400, 'superseded')
  mod.db.prepare('UPDATE password_resets SET expires_at = ? WHERE token_hash = ?').run('2020-01-01T00:00:00.000Z', mod.sha256Hex(second))
  assert.equal((await post('/auth/reset/confirm', { token: second, newPassword: 'newpassword' })).status, 400, 'expired')
  assert.equal((await post('/auth/reset/confirm', { newPassword: 'newpassword' })).status, 400)
})

// ---------------------------------------------------------------- account deletion

test('deleting an account needs the password and erases everything it owns', async () => {
  const { coach, client } = await connectedClient()
  const me = await (await get('/auth/me', coach)).json() as { account: { id: string } }
  const id = me.account.id
  await post('/reminders', { clientId: 'c1', content: 'hi', sendAt: new Date().toISOString() }, coach)
  seedMembership(coach, 'canceled', new Date(Date.now() - 86_400_000).toISOString())
  const bystander = await signup()
  await post('/data/push', { changes: [row('clients', 'keep', '2026-01-01T00:00:00.000Z')] }, bystander)

  assert.equal((await del('/auth/account', { password: 'wrong password' }, coach)).status, 403)
  assert.equal((await del('/auth/account', { password: 'correct horse' })).status, 401)
  assert.equal((await del('/auth/account', { password: 'correct horse' }, coach)).status, 200)

  assert.equal((await get('/auth/me', coach)).status, 401)
  assert.equal((await get('/client/bundle', client)).status, 401)
  for (const t of ['accounts', 'sessions', 'records', 'invites', 'client_tokens', 'reminders', 'push_subscriptions', 'memberships', 'password_resets']) {
    const col = t === 'accounts' ? 'id' : 'account_id'
    assert.equal((mod.db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE ${col} = ?`).get(id) as { n: number }).n, 0, t)
  }
  const other = await (await get('/data/pull?since=0', bystander)).json() as { changes: unknown[] }
  assert.equal(other.changes.length, 1, 'other accounts untouched')
})

// ---------------------------------------------------------------- free-tier cap

const activeClient = (id: string, updatedAt = '2026-01-01T00:00:00.000Z') => row('clients', id, updatedAt, { status: 'active' })
type PushResult = { applied: string[]; stale: string[]; refused: string[] }
const push = async (t: string, changes: unknown[]) => (await (await post('/data/push', { changes }, t)).json()) as PushResult

test('free cap: a 4th active client is refused; editing, archiving and swapping still work', async () => {
  const t = await signup()
  await push(t, [row('trainer', 'me', '2026-01-01T00:00:00.000Z')])
  const r = await push(t, [activeClient('a'), activeClient('b'), activeClient('c'), activeClient('d')])
  assert.deepEqual(r.applied, ['a', 'b', 'c'])
  assert.deepEqual(r.refused, ['d'])
  assert.deepEqual((await push(t, [activeClient('a', '2026-02-01T00:00:00.000Z')])).applied, ['a'], 'editing an active client')
  const archived = row('clients', 'c', '2026-02-01T00:00:00.000Z', { status: 'archived' })
  assert.deepEqual((await push(t, [activeClient('d', '2026-02-01T00:00:00.000Z'), archived])).applied, ['c', 'd'], 'order within a batch does not matter')
  assert.deepEqual((await push(t, [row('clients', 'e', '2026-02-01T00:00:00.000Z', { status: 'paused' })])).applied, ['e'])
  assert.deepEqual((await push(t, [activeClient('c', '2026-03-01T00:00:00.000Z')])).refused, ['c'], 'reactivating over the cap')
})

test('free cap: members and verified one-time licences are uncapped; a forged licence is not', async () => {
  const member = await signup()
  await push(member, [row('trainer', 'me', '2026-01-01T00:00:00.000Z')])
  seedMembership(member, 'active', new Date(Date.now() + 86_400_000).toISOString())
  assert.equal((await push(member, ['a', 'b', 'c', 'd', 'e'].map(id => activeClient(id)))).refused.length, 0)

  const licensed = await signup()
  await push(licensed, [row('trainer', 'me', '2026-01-01T00:00:00.000Z', { licenseKey: mintLicence('independent') })])
  assert.equal((await push(licensed, ['a', 'b', 'c', 'd'].map(id => activeClient(id)))).refused.length, 0)

  const forger = await signup()
  const real = mintLicence('personal').split('.')
  const claims = Buffer.from(JSON.stringify({ name: 'Old Buyer', edition: 'studio', issuedAt: '2026-03-01T00:00:00.000Z', serial: 7 })).toString('base64url')
  await push(forger, [row('trainer', 'me', '2026-01-01T00:00:00.000Z', { licenseKey: `CW1.${claims}.${real[2]}` })])
  assert.deepEqual((await push(forger, ['a', 'b', 'c', 'd'].map(id => activeClient(id)))).refused, ['d'])
  assert.equal(mod.verifiedLicenceEdition(mintLicence('studio')), 'studio')
})

test('free cap: an install that arrives with more clients keeps them (never claw back) but cannot add more', async () => {
  const t = await signup()
  const first = await push(t, [row('trainer', 'me', '2026-01-01T00:00:00.000Z'), ...['a', 'b', 'c', 'd', 'e'].map(id => activeClient(id))])
  assert.equal(first.refused.length, 0)
  assert.deepEqual((await push(t, [activeClient('a', '2026-02-01T00:00:00.000Z')])).applied, ['a'])
  assert.deepEqual((await push(t, [activeClient('f')])).refused, ['f'])
})

// ---------------------------------------------------------------- sync

test('push then pull round-trips rows, with an advancing cursor', async () => {
  const t = await signup()
  const push = await post('/data/push', { changes: [row('clients', 'c1', '2026-01-01T00:00:00.000Z', { firstName: 'Alex' })] }, t)
  assert.deepEqual((await push.json() as { applied: string[] }).applied, ['c1'])
  const p1 = await (await get('/data/pull?since=0', t)).json() as { changes: { id: string; data: { firstName: string } }[]; cursor: number }
  assert.equal(p1.changes[0].data.firstName, 'Alex')
  const p2 = await (await get(`/data/pull?since=${p1.cursor}`, t)).json() as { changes: unknown[] }
  assert.equal(p2.changes.length, 0)
})

test('last-write-wins: an older write never clobbers a newer one', async () => {
  const t = await signup()
  await post('/data/push', { changes: [row('clients', 'c1', '2026-02-01T00:00:00.000Z', { firstName: 'New' })] }, t)
  const r = await (await post('/data/push', { changes: [row('clients', 'c1', '2026-01-01T00:00:00.000Z', { firstName: 'Old' })] }, t)).json() as { stale: string[] }
  assert.deepEqual(r.stale, ['c1'])
  const p = await (await get('/data/pull?since=0', t)).json() as { changes: { data: { firstName: string } }[] }
  assert.equal(p.changes[0].data.firstName, 'New')
})

test('deletes sync as tombstones', async () => {
  const t = await signup()
  await post('/data/push', { changes: [row('clients', 'c1', '2026-01-01T00:00:00.000Z')] }, t)
  await post('/data/push', { changes: [{ table: 'clients', id: 'c1', updatedAt: '2026-01-02T00:00:00.000Z', deleted: true }] }, t)
  const p = await (await get('/data/pull?since=0', t)).json() as { changes: { deleted: boolean; data: unknown }[] }
  assert.deepEqual(p.changes.map(c => [c.deleted, c.data]), [[true, null]])
})

test('accounts are isolated from each other', async () => {
  const a = await signup(); const b = await signup()
  await post('/data/push', { changes: [row('clients', 'secret', '2026-01-01T00:00:00.000Z')] }, a)
  const p = await (await get('/data/pull?since=0', b)).json() as { changes: unknown[] }
  assert.equal(p.changes.length, 0)
})

test('unknown tables and unauthenticated calls are refused', async () => {
  const t = await signup()
  assert.equal((await post('/data/push', { changes: [row('syncConflicts', 'x', '2026-01-01T00:00:00.000Z')] }, t)).status, 400)
  assert.equal((await post('/data/push', { changes: [] })).status, 401)
  assert.equal((await get('/data/pull?since=0')).status, 401)
})

test('pull pages large histories', async () => {
  const t = await signup()
  const changes = Array.from({ length: 500 }, (_, i) => row('metrics', `m${i}`, '2026-01-01T00:00:00.000Z', { clientId: 'c' }))
  await post('/data/push', { changes }, t)
  await post('/data/push', { changes: changes.map(c => ({ ...c, id: `${c.id}b` })) }, t)
  await post('/data/push', { changes: changes.map(c => ({ ...c, id: `${c.id}c` })) }, t)
  const p1 = await (await get('/data/pull?since=0', t)).json() as { changes: unknown[]; cursor: number; more: boolean }
  assert.equal(p1.changes.length, 1000); assert.equal(p1.more, true)
  const p2 = await (await get(`/data/pull?since=${p1.cursor}`, t)).json() as { changes: unknown[]; more: boolean }
  assert.equal(p2.changes.length, 500); assert.equal(p2.more, false)
})

// ---------------------------------------------------------------- companion

async function connectedClient() {
  const coach = await signup('Jordan')
  await post('/data/push', { changes: [
    row('clients', 'c1', '2026-01-01T00:00:00.000Z', { firstName: 'Alex', lastName: 'R' }),
    row('clients', 'c2', '2026-01-01T00:00:00.000Z', { firstName: 'Other' }),
    row('programs', 'p1', '2026-01-01T00:00:00.000Z', { clientId: 'c1', name: 'Base', weeks: [{ days: [{ blocks: [{ exerciseId: 'ex-squat' }] }] }] }),
    row('programs', 'p2', '2026-01-01T00:00:00.000Z', { clientId: 'c2', name: 'Not yours' }),
    row('exercises', 'ex-squat', '2026-01-01T00:00:00.000Z', { name: 'Back Squat' }),
    row('exercises', 'ex-unused', '2026-01-01T00:00:00.000Z', { name: 'Unused' }),
    row('messages', 'msg1', '2026-01-01T00:00:00.000Z', { clientId: 'c1', direction: 'outbound', content: 'hi', date: '2026-01-01' }),
  ] }, coach)
  const { code } = await (await post('/invites', { clientId: 'c1' }, coach)).json() as { code: string }
  const redeem = await (await post('/client/redeem', { code: code.toLowerCase() })).json() as { token: string; coachName: string }
  return { coach, client: redeem.token, coachName: redeem.coachName, code }
}

test('invite → redeem → bundle holds only this client\'s program, its exercises, and thread', async () => {
  const { client, coachName, code } = await connectedClient()
  assert.equal(coachName, 'Jordan')
  const b = await (await get('/client/bundle', client)).json() as { client: { firstName: string }; programs: { id: string }[]; exercises: { id: string }[]; messages: { id: string }[] }
  assert.equal(b.client.firstName, 'Alex')
  assert.deepEqual(b.programs.map(p => p.id), ['p1'])
  assert.deepEqual(b.exercises.map(e => e.id), ['ex-squat'])
  assert.deepEqual(b.messages.map(m => m.id), ['msg1'])
  // Single use.
  assert.equal((await post('/client/redeem', { code })).status, 404)
})

test('client pushes are forced onto its own client id and limited to its tables', async () => {
  const { coach, client } = await connectedClient()
  const ok = await post('/client/push', { changes: [row('sessionLogs', 'log1', '2026-01-02T00:00:00.000Z', { clientId: 'c2', date: '2026-01-02' })] }, client)
  assert.equal(ok.status, 200)
  const p = await (await get('/data/pull?since=0', coach)).json() as { changes: { id: string; data: { clientId: string } }[] }
  assert.equal(p.changes.find(c => c.id === 'log1')!.data.clientId, 'c1')
  // Can't write programs, can't delete, can't send as the coach.
  assert.equal((await post('/client/push', { changes: [row('programs', 'p1', '2027-01-01T00:00:00.000Z')] }, client)).status, 400)
  assert.equal((await post('/client/push', { changes: [{ table: 'sessionLogs', id: 'log1', updatedAt: '2027-01-01T00:00:00.000Z', deleted: true }] }, client)).status, 400)
  assert.equal((await post('/client/push', { changes: [row('messages', 'm9', '2027-01-01T00:00:00.000Z', { direction: 'outbound', content: 'x' })] }, client)).status, 400)
  // Can't overwrite a row that belongs to another client.
  await post('/data/push', { changes: [row('metrics', 'mc2', '2026-01-01T00:00:00.000Z', { clientId: 'c2', value: 1 })] }, coach)
  const hijack = await (await post('/client/push', { changes: [row('metrics', 'mc2', '2027-01-01T00:00:00.000Z', { value: 999 })] }, client)).json() as { stale: string[] }
  assert.deepEqual(hijack.stale, ['mc2'])
})

test('booking: bundle serves published slots past the notice period and only this client\'s sessions', async () => {
  const { coach, client } = await connectedClient()
  const off = await (await get('/client/bundle', client)).json() as { booking: { enabled: boolean }; openSlots: unknown[]; sessions: unknown[] }
  assert.equal(off.booking.enabled, false)
  assert.deepEqual(off.openSlots, [])

  const h = 3_600_000, now = Date.now()
  const at = (ms: number) => new Date(now + ms).toISOString()
  await post('/data/push', { changes: [
    row('trainer', 'trainer', '2026-01-02T00:00:00.000Z', {
      booking: { enabled: true, slotMinutes: 60, noticeHours: 12, windows: [] },
      bookingSlots: [{ start: at(2 * h), end: at(3 * h) }, { start: at(30 * h), end: at(31 * h) }, { bogus: true }],
    }),
    row('appointments', 'ap1', '2026-01-02T00:00:00.000Z', { clientId: 'c1', title: 'PT', start: at(48 * h), end: at(49 * h) }),
    row('appointments', 'ap2', '2026-01-02T00:00:00.000Z', { clientId: 'c2', title: 'Someone else', start: at(50 * h), end: at(51 * h) }),
    row('appointments', 'ap3', '2026-01-02T00:00:00.000Z', { clientId: 'c1', title: 'Old', start: at(-48 * h), end: at(-47 * h) }),
    row('appointments', 'ap4', '2026-01-02T00:00:00.000Z', { clientId: 'c1', title: 'Called off', start: at(60 * h), end: at(61 * h), status: 'canceled' }),
  ] }, coach)
  const on = await (await get('/client/bundle', client)).json() as { booking: { enabled: boolean; slotMinutes: number }; openSlots: { start: string }[]; sessions: { id: string; title: string }[] }
  assert.equal(on.booking.enabled, true)
  assert.equal(on.booking.slotMinutes, 60)
  assert.deepEqual(on.openSlots.map(x => x.start), [at(30 * h)])   // 2h-out slot is inside the 12h notice
  assert.deepEqual(on.sessions.map(x => x.id), ['ap1'])
})

test('booking: a client can request a time but cannot accept its own request', async () => {
  const { coach, client } = await connectedClient()
  const start = '2027-03-01T15:00:00.000Z', end = '2027-03-01T16:00:00.000Z'
  const r = await post('/client/push', { changes: [
    row('messages', 'req1', '2027-01-01T00:00:00.000Z', { direction: 'inbound', content: 'Booking request', booking: { start, end, status: 'accepted', appointmentId: 'x' } }),
    row('messages', 'req2', '2027-01-01T00:00:00.000Z', { direction: 'inbound', content: 'Bad', booking: { start: end, end: start } }),
    row('sessionLogs', 'log9', '2027-01-01T00:00:00.000Z', { date: '2027-01-01' }),
  ] }, client)
  assert.equal(r.status, 200)   // sanitised, not rejected — the log in the same batch still lands
  const p = await (await get('/data/pull?since=0', coach)).json() as { changes: { id: string; data: { booking?: Record<string, unknown> } }[] }
  assert.deepEqual(p.changes.find(c => c.id === 'req1')!.data.booking, { start, end })
  assert.equal(p.changes.find(c => c.id === 'req2')!.data.booking, undefined)
  assert.ok(p.changes.some(c => c.id === 'log9'))
})

test('coach can disconnect a client', async () => {
  const { coach, client } = await connectedClient()
  await fetch(`${base}/invites/c1`, { method: 'DELETE', headers: json(coach) })
  assert.equal((await get('/client/bundle', client)).status, 401)
})

test('another coach cannot invite for a client they do not have', async () => {
  const other = await signup()
  assert.equal((await post('/invites', { clientId: 'c1' }, other)).status, 404)
})

test('reminders: coach schedules, client receives exactly once, other clients never', async () => {
  const { coach, client } = await connectedClient()
  await post('/reminders', { clientId: 'c1', content: 'Log your weigh-in', sendAt: new Date(Date.now() - 1000).toISOString() }, coach)
  await post('/reminders', { clientId: 'c2', content: 'not yours', sendAt: new Date(Date.now() - 1000).toISOString() }, coach)
  const due = await (await get('/client/reminders/due', client)).json() as { reminders: { content: string }[] }
  assert.deepEqual(due.reminders.map(r => r.content), ['Log your weigh-in'])
  const again = await (await get('/client/reminders/due', client)).json() as { reminders: unknown[] }
  assert.equal(again.reminders.length, 0)
})

// ---------------------------------------------------------------- membership

function seedMembership(token: string, status: string, periodEnd: string) {
  const accountId = (mod.db.prepare('SELECT account_id FROM sessions WHERE token_hash = ?').get(mod.sha256Hex(token)) as { account_id: string }).account_id
  mod.db.prepare(`INSERT INTO memberships (account_id, stripe_customer_id, stripe_subscription_id, status, current_period_end) VALUES (?, ?, ?, ?, ?)`)
    .run(accountId, `cus_${accountId}`, `sub_${accountId}`, status, periodEnd)
  return accountId
}

test('membership status: active with grace, lapsed after it, and per account', async () => {
  const t = await signup()
  assert.deepEqual(await (await get('/membership/status', t)).json(), { success: true, active: false, expiresAt: null, status: null })
  seedMembership(t, 'active', new Date(Date.now() + 86_400_000).toISOString())
  const s = await (await get('/membership/status', t)).json() as { active: boolean; expiresAt: string }
  assert.equal(s.active, true)
  assert.ok(Date.parse(s.expiresAt) > Date.now() + 7 * 86_400_000)
  const lapsed = await signup()
  seedMembership(lapsed, 'active', new Date(Date.now() - 30 * 86_400_000).toISOString())
  assert.equal((await (await get('/membership/status', lapsed)).json() as { active: boolean }).active, false)
  assert.equal((await get('/membership/status')).status, 401)
})

test('checkout and portal require sign-in; checkout refuses to double-bill', async () => {
  assert.equal((await post('/membership/checkout', {})).status, 401)
  assert.equal((await post('/membership/portal', {})).status, 401)
  const t = await signup()
  seedMembership(t, 'active', new Date(Date.now() + 86_400_000).toISOString())
  assert.equal((await post('/membership/checkout', {}, t)).status, 409)
})

function signedWebhook(event: object) {
  const payload = JSON.stringify(event)
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET })
  return fetch(`${base}/membership/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': header }, body: payload })
}

test('webhook rejects unsigned events and applies signed cancellations', async () => {
  const bad = await fetch(`${base}/membership/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=00' }, body: '{}' })
  assert.equal(bad.status, 400)
  const t = await signup()
  const accountId = seedMembership(t, 'active', new Date(Date.now() + 86_400_000).toISOString())
  const res = await signedWebhook({ id: 'evt_1', object: 'event', type: 'customer.subscription.deleted',
    data: { object: { id: `sub_${accountId}`, object: 'subscription', customer: `cus_${accountId}`, status: 'canceled', items: { data: [] } } } })
  assert.equal(res.status, 200)
  assert.equal((await (await get('/membership/status', t)).json() as { active: boolean }).active, false)
})

test('webhook ignores a checkout for an account that does not exist', async () => {
  const res = await signedWebhook({ id: 'evt_2', object: 'event', type: 'checkout.session.completed',
    data: { object: { id: 'cs_1', object: 'checkout.session', client_reference_id: 'no-such-account', subscription: 'sub_x', customer: 'cus_x' } } })
  assert.equal(res.status, 200)
  assert.equal(mod.db.prepare(`SELECT 1 FROM memberships WHERE stripe_subscription_id = 'sub_x'`).get(), undefined)
})

// ---------------------------------------------------------------- hygiene

test('a body without a JSON content-type is a clean 400, not a 500 with a stack trace', async () => {
  const r = await fetch(`${base}/auth/signup`, { method: 'POST', body: '{"email":"a@b.co"}' })
  assert.equal(r.status, 400)
  const bad = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' })
  assert.equal(bad.status, 400)
  assert.doesNotMatch(await bad.text(), /node_modules|server\.ts/)
})

test('health is unauthenticated and minimal', async () => {
  const r = await (await get('/health')).json() as Record<string, unknown>
  assert.deepEqual(Object.keys(r).sort(), ['ok', 'uptime'])
})

// HTTP-level tests for the relay + membership routes. Runs the real Express
// app against an in-memory SQLite database on an ephemeral port — no Stripe
// network calls: every membership case here is decided before the server
// would reach Stripe (or, for the webhook, uses a locally signed event).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import Stripe from 'stripe'

const WEBHOOK_SECRET = 'whsec_test_local'
process.env.DB_PATH = ':memory:'
process.env.ADMIN_KEY = 'admin-test'
process.env.STRIPE_SECRET_KEY = 'sk_test_never_used_over_the_network'
process.env.STRIPE_PRICE_ID = 'price_test'
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET
delete process.env.API_KEY

type Mod = typeof import('../server')
let mod: Mod
let server: Server
let base = ''
let publicJwk: webcrypto.JsonWebKey

before(async () => {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  process.env.LICENCE_SIGNING_PRIVATE_JWK = JSON.stringify(await webcrypto.subtle.exportKey('jwk', pair.privateKey))
  publicJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey)
  // require (not import) so the env above is set before server.ts evaluates.
  mod = require('../server') as Mod
  server = mod.app.listen(0)
  await new Promise<void>(r => server.once('listening', () => r()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(() => { server?.close() })

async function keyFor(coachId: string): Promise<string> {
  const res = await fetch(`${base}/keys/register`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': 'admin-test' },
    body: JSON.stringify({ coachId }),
  })
  return ((await res.json()) as { apiKey: string }).apiKey
}
const post = (path: string, key: string, body: unknown, extra: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, ...extra }, body: JSON.stringify(body) })
const get = (path: string, headers: Record<string, string> = {}) => fetch(`${base}${path}`, { headers })

// ---------------------------------------------------------------- sync

test('coach and client packets for one device coexist, and /pull/clients is reachable', async () => {
  const k = await keyFor('coach-sync')
  await post('/sync/push', k, { id: 'dev1', type: 'client', coachId: 'coach-sync', encryptedPayload: 'from-client' })
  await post('/sync/push', k, { id: 'dev1', type: 'coach', coachId: 'coach-sync', encryptedPayload: 'to-client' })
  const c = await (await get('/sync/pull/client/dev1', { 'x-api-key': k })).json() as { encryptedPayload: string }
  const o = await (await get('/sync/pull/coach/dev1', { 'x-api-key': k })).json() as { encryptedPayload: string }
  assert.equal(c.encryptedPayload, 'from-client')
  assert.equal(o.encryptedPayload, 'to-client')
  // Was shadowed by /pull/:type/:id and always answered { encryptedPayload: null }.
  const all = await (await get('/sync/pull/clients/coach-sync', { 'x-api-key': k })).json() as { payloads: Record<string, string> }
  assert.deepEqual(all.payloads, { dev1: 'from-client' })
})

test('a per-coach key cannot read another coach\'s payloads', async () => {
  const a = await keyFor('coach-a'); const b = await keyFor('coach-b')
  await post('/sync/push', a, { id: 'devA', type: 'client', coachId: 'coach-a', encryptedPayload: 'secret' })
  assert.equal((await get('/sync/pull/client/devA', { 'x-api-key': b })).status, 403)
  assert.equal((await post('/sync/push', b, { id: 'x', type: 'client', coachId: 'coach-a', encryptedPayload: 'y' })).status, 403)
})

// ------------------------------------------------------------ messages

test('messages from the same UTC day as `since` are returned (ISO since vs SQLite timestamp)', async () => {
  const k = await keyFor('coach-msg')
  // What both apps actually send as `since`: a JS ISO string from earlier today.
  const since = new Date(Date.now() - 60_000).toISOString()
  await post('/messages/push', k, { id: 'm1', coachId: 'coach-msg', clientId: 'cli', direction: 'client', encryptedPayload: 'hi' })
  const r = await (await get(`/messages/pull?coachId=coach-msg&clientId=cli&for=coach&since=${encodeURIComponent(since)}`, { 'x-api-key': k })).json() as
    { messages: { id: string; createdAt: string }[] }
  assert.deepEqual(r.messages.map(m => m.id), ['m1'])
  // createdAt comes back as real ISO (UTC-marked), not a zone-less SQLite string.
  assert.match(r.messages[0].createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  // A since after the message excludes it.
  const later = new Date(Date.now() + 5_000).toISOString()
  const r2 = await (await get(`/messages/pull?coachId=coach-msg&clientId=cli&for=coach&since=${encodeURIComponent(later)}`, { 'x-api-key': k })).json() as { messages: unknown[] }
  assert.equal(r2.messages.length, 0)
})

// ----------------------------------------------------------- reminders

test('reminders/due is scoped to the caller\'s coach and does not burn other tenants\' reminders', async () => {
  const a = await keyFor('coach-rem-a'); const b = await keyFor('coach-rem-b')
  const past = new Date(Date.now() - 1000).toISOString()
  await post('/reminders/schedule', a, { id: 'r1', coachId: 'coach-rem-a', clientId: 'shared-client', encryptedPayload: 'p', sendAt: past })
  const stolen = await (await get('/reminders/due?clientId=shared-client', { 'x-api-key': b })).json() as { reminders: unknown[] }
  assert.equal(stolen.reminders.length, 0)
  const mine = await (await get('/reminders/due?clientId=shared-client', { 'x-api-key': a })).json() as { reminders: { id: string }[] }
  assert.deepEqual(mine.reminders.map(r => r.id), ['r1'])
  const again = await (await get('/reminders/due?clientId=shared-client', { 'x-api-key': a })).json() as { reminders: unknown[] }
  assert.equal(again.reminders.length, 0, 'delivered exactly once')
})

test('push/unsubscribe cannot delete another coach\'s subscription', async () => {
  const a = await keyFor('coach-push-a'); const b = await keyFor('coach-push-b')
  const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: 'x', auth: 'y' } }
  await post('/push/subscribe', a, { clientId: 'c', coachId: 'coach-push-a', subscription: sub })
  await post('/push/unsubscribe', b, { endpoint: sub.endpoint })
  assert.ok(mod.db.prepare('SELECT 1 FROM push_subscriptions WHERE endpoint = ?').get(sub.endpoint))
  await post('/push/unsubscribe', a, { endpoint: sub.endpoint })
  assert.equal(mod.db.prepare('SELECT 1 FROM push_subscriptions WHERE endpoint = ?').get(sub.endpoint), undefined)
})

// ------------------------------------------------------------ signalling

test('signalling survives a full handshake\'s worth of polling (own rate budget)', async () => {
  const k = await keyFor('coach-sig')
  // ~2 minutes of one device polling at 700ms — more than the general
  // 100/15min budget, which is what used to 429 a handshake.
  for (let i = 0; i < 150; i++) {
    const r = await get('/signal/poll?coachId=coach-sig&deviceId=d', { 'x-api-key': k })
    assert.equal(r.status, 200, `poll ${i}`)
  }
  assert.equal((await post('/signal/send', k, { coachId: 'coach-sig', to: 'd', from: 'e', session: 's', kind: 'offer', payload: 'not sdp' })).status, 400)
})

// ------------------------------------------------------------ membership

const SECRET = 'a'.repeat(64)

function seedMembership(coachId: string, status: string, secret: string | null) {
  mod.db.prepare(`INSERT INTO memberships (coach_id, stripe_customer_id, stripe_subscription_id, status, name, secret_hash)
    VALUES (?, ?, ?, ?, ?, ?)`).run(coachId, `cus_${coachId}`, `sub_${coachId}`, status, 'Test Coach', secret ? mod.sha256Hex(secret) : null)
}

test('membership/status requires the device secret, then mints a verifiable token', async () => {
  seedMembership('coach-m1', 'active', SECRET)
  assert.equal((await get('/membership/status?coachId=coach-m1')).status, 403)
  assert.equal((await get('/membership/status?coachId=coach-m1', { 'x-membership-secret': 'b'.repeat(64) })).status, 403)
  const ok = await (await get('/membership/status?coachId=coach-m1', { 'x-membership-secret': SECRET })).json() as { active: boolean; token: string }
  assert.equal(ok.active, true)
  // Verify exactly the way the app's lib/membership.ts does.
  const [prefix, claimsB64, sigB64] = ok.token.split('.')
  assert.equal(prefix, 'CWM1')
  const claims = JSON.parse(Buffer.from(claimsB64, 'base64url').toString())
  const pub = await webcrypto.subtle.importKey('jwk', publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  const valid = await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, Buffer.from(sigB64, 'base64url'),
    new TextEncoder().encode(JSON.stringify([claims.name, claims.subscriptionId, claims.issuedAt, claims.expiresAt])))
  assert.ok(valid)
})

test('membership/status reports no membership without leaking anything', async () => {
  const r = await (await get('/membership/status?coachId=nobody')).json() as { active: boolean }
  assert.equal(r.active, false)
})

test('a pre-secret (NULL hash) membership row is refused, not trusted on first use', async () => {
  seedMembership('coach-legacy', 'active', null)
  assert.equal((await get('/membership/status?coachId=coach-legacy', { 'x-membership-secret': SECRET })).status, 403)
})

test('membership/portal refuses a caller who only knows the coach id', async () => {
  seedMembership('coach-m2', 'active', SECRET)
  const r = await fetch(`${base}/membership/portal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ coachId: 'coach-m2' }) })
  assert.equal(r.status, 403)
})

test('membership/checkout requires a secret and refuses to double-bill an active member', async () => {
  const noSecret = await fetch(`${base}/membership/checkout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ coachId: 'x' }) })
  assert.equal(noSecret.status, 400)
  seedMembership('coach-m3', 'active', SECRET)
  const dup = await fetch(`${base}/membership/checkout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ coachId: 'coach-m3', secret: SECRET }) })
  assert.equal(dup.status, 409)
})

function signedWebhook(event: object) {
  const payload = JSON.stringify(event)
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET })
  return fetch(`${base}/membership/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': header }, body: payload })
}

test('webhook rejects unsigned events and applies signed subscription updates', async () => {
  const bad = await fetch(`${base}/membership/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=00' }, body: '{}' })
  assert.equal(bad.status, 400)
  seedMembership('coach-m4', 'active', SECRET)
  const res = await signedWebhook({ id: 'evt_1', object: 'event', type: 'customer.subscription.deleted',
    data: { object: { id: 'sub_coach-m4', object: 'subscription', customer: 'cus_coach-m4', status: 'canceled', items: { data: [] } } } })
  assert.equal(res.status, 200)
  const row = mod.db.prepare('SELECT status, secret_hash FROM memberships WHERE coach_id = ?').get('coach-m4') as { status: string; secret_hash: string }
  assert.equal(row.status, 'canceled')
  assert.equal(row.secret_hash, mod.sha256Hex(SECRET), 'secret binding survives status updates')
})

test('webhook will not rebind an active membership to a stranger\'s checkout secret', async () => {
  seedMembership('coach-m5', 'active', SECRET)
  const res = await signedWebhook({ id: 'evt_2', object: 'event', type: 'checkout.session.completed',
    data: { object: { id: 'cs_1', object: 'checkout.session', client_reference_id: 'coach-m5', subscription: 'sub_attacker',
      customer: 'cus_attacker', metadata: { secretHash: mod.sha256Hex('c'.repeat(64)) } } } })
  assert.equal(res.status, 200)
  const row = mod.db.prepare('SELECT stripe_subscription_id, secret_hash FROM memberships WHERE coach_id = ?').get('coach-m5') as { stripe_subscription_id: string; secret_hash: string }
  assert.equal(row.stripe_subscription_id, 'sub_coach-m5')
  assert.equal(row.secret_hash, mod.sha256Hex(SECRET))
})

test('a body without a JSON content-type is a clean 400, not a 500 with a stack trace', async () => {
  const r = await fetch(`${base}/keys/register`, { method: 'POST', headers: { 'x-admin-key': 'admin-test' }, body: '{"coachId":"x"}' })
  assert.equal(r.status, 400)
  const bad = await fetch(`${base}/sync/push`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': await keyFor('c-json') }, body: '{not json' })
  assert.equal(bad.status, 400)
  assert.doesNotMatch(await bad.text(), /node_modules|server\.ts/)
})

test('health is unauthenticated and minimal', async () => {
  const r = await (await get('/health')).json() as Record<string, unknown>
  assert.deepEqual(Object.keys(r).sort(), ['ok', 'uptime'])
})

// The landmine in AGENTS.md §5: token signing is byte-exact across two
// independent implementations. Before S22 that agreement was only ever
// "cross-checked manually". This runs the APP's real verifier against a
// token the SERVER minted, so a drift in either file fails here.
test('app-side verifyMembershipToken accepts a server-minted token, and rejects a tampered one', async () => {
  // Plain require (not import): tsc doesn't follow it into the app's
  // DOM-typed source, and tsx resolves it at runtime.
  const appMembership = require('../../strongsuit/src/lib/membership') as {
    verifyMembershipToken(token: string, jwk: unknown): Promise<{ valid: boolean; claims?: { name: string } }>
  }
  const { signMembershipToken } = require('../membershipTokens') as typeof import('../membershipTokens')
  const claims = { name: 'Sam “Coach” Rivera', subscriptionId: 'sub_x', issuedAt: '2026-08-01T00:00:00.000Z', expiresAt: '2026-09-05T00:00:00.000Z' }
  const token = await signMembershipToken(claims, JSON.parse(process.env.LICENCE_SIGNING_PRIVATE_JWK!))
  const ok = await appMembership.verifyMembershipToken(token, publicJwk)
  assert.equal(ok.valid, true)
  assert.equal(ok.claims?.name, claims.name)

  const [p, , s] = token.split('.')
  const forged = Buffer.from(JSON.stringify({ ...claims, expiresAt: '2099-01-01T00:00:00.000Z' })).toString('base64url')
  assert.equal((await appMembership.verifyMembershipToken(`${p}.${forged}.${s}`, publicJwk)).valid, false)
})

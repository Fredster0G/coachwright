// ===== Coachwright Cloud =====
//
// The one backend for both the desktop app and the website. S23 replaced the
// old E2EE relay (sealed packets, device pairing, WebRTC signalling, per-coach
// relay keys) with ordinary accounts: the coach's data lives here and every
// install of the app is a cache of it.
//
// Deliberately small and cheap to run: Express + one SQLite file, which one
// ~$6/mo VPS (plus Litestream backups) carries to thousands of coaches. The
// sync model is generic — the app pushes rows from its own tables and pulls
// everything newer than its cursor — so adding an app table never needs a
// server change beyond the SYNC_TABLES allowlist below.
//
//   /auth/*        coach accounts (email + scrypt password, bearer sessions)
//   /data/*        row sync: push (last-write-wins by updatedAt), pull (by seq)
//   /invites       coach issues a one-time code for a client's Companion app
//   /client/*      Companion: redeem a code, read its program/messages, send logs
//   /reminders     coach-scheduled reminders, released when Companion checks in
//   /push/*        Web Push for Companion ("new message from your coach")
//   /membership/*  Stripe Checkout / webhook / portal, keyed by account

import express from 'express'
import cors from 'cors'
import Database from 'better-sqlite3'
import * as dotenv from 'dotenv'
import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'crypto'
import { rateLimit } from 'express-rate-limit'
import webpush from 'web-push'
import Stripe from 'stripe'

dotenv.config()

export const app = express()
const port = process.env.PORT || 4000

// Behind a reverse proxy (the documented Caddy deployment) every request
// arrives from 127.0.0.1 — without this the rate limiter buckets the whole
// instance's traffic as one caller. "1" = one proxy hop.
if (process.env.TRUST_PROXY) {
  const v = process.env.TRUST_PROXY
  app.set('trust proxy', /^\d+$/.test(v) ? Number(v) : v === 'true' ? true : v)
}

// General budget. Sync polls are cheap and an open app polls every ~30s, so
// this is sized for several devices behind one gym's NAT. The Stripe webhook
// is exempt: a 429 there only delays a paying coach's access.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_PER_15MIN || 600),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: req => req.path === '/health' || req.path === '/membership/webhook',
})
// Password guessing gets its own, much tighter budget.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT_PER_15MIN || 20),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

app.use(cors())
app.use(limiter)

// ---- Stripe (membership billing) ----
// `null` when unconfigured — an instance without Stripe still runs accounts
// and sync; every /membership route refuses cleanly with a 503.
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null

/** Days of access past Stripe's `current_period_end` before the app treats a
 *  membership as lapsed — covers webhook delays and card retries. */
const MEMBERSHIP_GRACE_DAYS = Number(process.env.MEMBERSHIP_GRACE_DAYS || 7)

/** `past_due` counts: Stripe is still retrying the card, and cutting access on
 *  the first failed charge is the coercive experience we don't want. */
function isActiveSubscriptionStatus(status: string): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due'
}

// Registered BEFORE express.json(): Stripe's signature check needs the raw bytes.
app.post('/membership/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Membership billing is not configured on this instance' })
  }
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'] as string, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return res.status(400).json({ error: 'Webhook signature verification failed' })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const accountId = session.client_reference_id
        if (!accountId || !session.subscription || !session.customer) break
        if (!db.prepare('SELECT 1 FROM accounts WHERE id = ?').get(accountId)) break
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
        upsertMembership({
          accountId,
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: subscription.id,
          status: subscription.status,
          currentPeriodEnd: subscription.items.data[0]?.current_period_end,
        })
        break
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const row = db.prepare('SELECT account_id FROM memberships WHERE stripe_subscription_id = ?').get(subscription.id) as { account_id: string } | undefined
        if (!row) break
        upsertMembership({
          accountId: row.account_id,
          stripeCustomerId: subscription.customer as string,
          stripeSubscriptionId: subscription.id,
          status: event.type === 'customer.subscription.deleted' ? 'canceled' : subscription.status,
          currentPeriodEnd: subscription.items.data[0]?.current_period_end,
        })
        break
      }
    }
    res.json({ received: true })
  } catch (err: any) {
    console.error('Webhook handling failed:', err)
    res.status(500).json({ error: 'Webhook handling failed' })
  }
})

// Photos are resized client-side (lib/media.ts) but a batch of them still
// needs headroom; the app batches pushes well under this.
app.use(express.json({ limit: '10mb' }))
// Express 5 leaves req.body undefined when no parser matched; every handler
// destructures it.
app.use((req, _res, next) => { if (req.body === undefined) req.body = {}; next() })

// ---- Database ----
const db = new Database(process.env.DB_PATH || 'coachwright.db')
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,       -- stored lowercased
    password_hash TEXT NOT NULL,      -- scrypt$<salt hex>$<hash hex>
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Bearer sessions. Only the sha256 of the token is stored, so a copy of the
  -- database can't be replayed as live logins.
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Every synced app row. (account, table, id) is the row's identity; seq is
  -- a per-server monotonically increasing change counter the app pulls by.
  -- client_id is lifted out of the JSON so Companion's reads can be scoped
  -- to one client with an index instead of a scan.
  CREATE TABLE IF NOT EXISTS records (
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    tbl TEXT NOT NULL,
    id TEXT NOT NULL,
    client_id TEXT,
    data TEXT,                        -- JSON row; NULL when deleted
    deleted INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,         -- the ROW's updatedAt (ISO), for last-write-wins
    seq INTEGER NOT NULL,
    PRIMARY KEY (account_id, tbl, id)
  );
  CREATE INDEX IF NOT EXISTS idx_records_seq ON records (account_id, seq);
  CREATE INDEX IF NOT EXISTS idx_records_client ON records (account_id, client_id, tbl);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_records_global_seq ON records (seq);

  -- One-time codes a coach hands a client to connect Companion.
  CREATE TABLE IF NOT EXISTS invites (
    code TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    redeemed INTEGER NOT NULL DEFAULT 0
  );

  -- What a redeemed invite becomes: a token scoped to ONE client of ONE coach.
  CREATE TABLE IF NOT EXISTS client_tokens (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    revoked INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    content TEXT NOT NULL,
    send_at TEXT NOT NULL,
    sent INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    subscription TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS memberships (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT UNIQUE,
    status TEXT,
    current_period_end TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
`)

function upsertMembership(m: {
  accountId: string; stripeCustomerId: string; stripeSubscriptionId: string
  status: string; currentPeriodEnd: number | undefined
}) {
  db.prepare(`
    INSERT INTO memberships (account_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(account_id) DO UPDATE SET
      stripe_customer_id = excluded.stripe_customer_id,
      stripe_subscription_id = excluded.stripe_subscription_id,
      status = excluded.status,
      current_period_end = excluded.current_period_end,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    m.accountId, m.stripeCustomerId, m.stripeSubscriptionId, m.status,
    m.currentPeriodEnd ? new Date(m.currentPeriodEnd * 1000).toISOString() : null,
  )
}

// ---- Crypto helpers ----
export function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}
function newToken(): string { return randomBytes(32).toString('hex') }
function newId(): string { return randomBytes(16).toString('hex') }

// scrypt with Node's defaults (N=16384, r=8, p=1) — no native dependency,
// ~50ms per hash, which is the point.
function hashPassword(password: string): string {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}`
}
function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return timingSafeEqual(actual, expected)
}
/** Run for unknown emails too, so "no such account" and "wrong password"
 *  take the same time. */
const DUMMY_HASH = hashPassword(randomBytes(8).toString('hex'))

// ---- Web Push (VAPID) ----
function vapidKeys(): { publicKey: string; privateKey: string } {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
  }
  const row = db.prepare(`SELECT value FROM kv WHERE key = 'vapid'`).get() as { value: string } | undefined
  if (row) return JSON.parse(row.value)
  const generated = webpush.generateVAPIDKeys()
  db.prepare(`INSERT INTO kv (key, value) VALUES ('vapid', ?)`).run(JSON.stringify(generated))
  return generated
}
const vapid = vapidKeys()
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:ops@coachwright.app', vapid.publicKey, vapid.privateKey)

/** Metadata-only push; message content is fetched by the app itself. Dead
 *  subscriptions (404/410) are pruned. */
function pushToClient(accountId: string, clientId: string, payload: { title: string; body: string }) {
  const subs = db.prepare(`SELECT endpoint, subscription FROM push_subscriptions WHERE account_id = ? AND client_id = ?`)
    .all(accountId, clientId) as { endpoint: string; subscription: string }[]
  for (const s of subs) {
    webpush.sendNotification(JSON.parse(s.subscription), JSON.stringify(payload)).catch((err: { statusCode?: number }) => {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).run(s.endpoint)
      }
    })
  }
}

// ---- Housekeeping ----
function sweep() {
  db.prepare(`DELETE FROM invites WHERE expires_at < ? OR redeemed = 1`).run(new Date().toISOString())
  db.prepare(`DELETE FROM reminders WHERE sent = 1 AND created_at < datetime('now', '-90 days')`).run()
  db.prepare(`DELETE FROM sessions WHERE last_used_at < datetime('now', '-90 days')`).run()
}
sweep()
setInterval(sweep, 6 * 60 * 60 * 1000).unref()

// ---- Auth middleware ----
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { accountId?: string; clientId?: string }
  }
}

function bearer(req: express.Request): string | null {
  const h = req.headers.authorization
  return typeof h === 'string' && h.startsWith('Bearer ') ? h.slice(7).trim() || null : null
}

const touchSession = db.prepare(`UPDATE sessions SET last_used_at = CURRENT_TIMESTAMP WHERE token_hash = ?`)
function requireCoach(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = bearer(req)
  if (!token) return res.status(401).json({ error: 'Sign in required' })
  const hash = sha256Hex(token)
  const row = db.prepare('SELECT account_id FROM sessions WHERE token_hash = ?').get(hash) as { account_id: string } | undefined
  if (!row) return res.status(401).json({ error: 'Session expired — sign in again' })
  touchSession.run(hash)
  req.accountId = row.account_id
  next()
}

function requireClient(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = bearer(req)
  if (!token) return res.status(401).json({ error: 'Not connected to a coach' })
  const row = db.prepare('SELECT account_id, client_id FROM client_tokens WHERE token_hash = ? AND revoked = 0').get(sha256Hex(token)) as
    { account_id: string; client_id: string } | undefined
  if (!row) return res.status(401).json({ error: 'This connection was removed by your coach' })
  req.accountId = row.account_id
  req.clientId = row.client_id
  next()
}

// ---- /auth ----
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function startSession(accountId: string): string {
  const token = newToken()
  db.prepare('INSERT INTO sessions (token_hash, account_id) VALUES (?, ?)').run(sha256Hex(token), accountId)
  return token
}

app.post('/auth/signup', authLimiter, (req, res) => {
  const { email, password, name } = req.body
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) return res.status(400).json({ error: 'Enter a valid email address' })
  if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })
  const normalized = email.trim().toLowerCase()
  if (db.prepare('SELECT 1 FROM accounts WHERE email = ?').get(normalized)) {
    return res.status(409).json({ error: 'An account with that email already exists — sign in instead' })
  }
  const id = newId()
  db.prepare('INSERT INTO accounts (id, email, password_hash, name) VALUES (?, ?, ?, ?)')
    .run(id, normalized, hashPassword(password), typeof name === 'string' ? name.slice(0, 200) : null)
  res.json({ success: true, token: startSession(id), account: { id, email: normalized } })
})

app.post('/auth/login', authLimiter, (req, res) => {
  const { email, password } = req.body
  if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Email and password required' })
  const row = db.prepare('SELECT id, email, password_hash FROM accounts WHERE email = ?').get(email.trim().toLowerCase()) as
    { id: string; email: string; password_hash: string } | undefined
  const ok = verifyPassword(password, row?.password_hash ?? DUMMY_HASH) && !!row
  if (!ok || !row) return res.status(401).json({ error: 'Wrong email or password' })
  res.json({ success: true, token: startSession(row.id), account: { id: row.id, email: row.email } })
})

app.post('/auth/logout', requireCoach, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256Hex(bearer(req)!))
  res.json({ success: true })
})

app.get('/auth/me', requireCoach, (req, res) => {
  const row = db.prepare('SELECT id, email, name FROM accounts WHERE id = ?').get(req.accountId) as { id: string; email: string; name: string | null }
  res.json({ success: true, account: row })
})

app.post('/auth/password', authLimiter, requireCoach, (req, res) => {
  const { currentPassword, newPassword } = req.body
  const row = db.prepare('SELECT password_hash FROM accounts WHERE id = ?').get(req.accountId) as { password_hash: string }
  if (typeof currentPassword !== 'string' || !verifyPassword(currentPassword, row.password_hash)) {
    return res.status(403).json({ error: 'Current password is wrong' })
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })
  // Changing the password signs out every other device.
  const keep = sha256Hex(bearer(req)!)
  db.transaction(() => {
    db.prepare('UPDATE accounts SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), req.accountId)
    db.prepare('DELETE FROM sessions WHERE account_id = ? AND token_hash != ?').run(req.accountId, keep)
  })()
  res.json({ success: true })
})

// ---- /data — row sync ----

/** Tables the app may sync. Anything else is refused, so a bug (or a
 *  hand-crafted request) can't fill the database with arbitrary tables.
 *  Mirrors SYNCED_TABLES in the app's lib/cloud/tables.ts. */
export const SYNC_TABLES = new Set([
  'trainer', 'clients', 'clientNotes', 'exercises', 'exerciseOverrides', 'programs', 'sessionLogs',
  'checkIns', 'metrics', 'payments', 'appointments', 'expenses', 'waivers', 'messages', 'staff',
  'locations', 'leads', 'progressPhotos', 'habits', 'habitEntries', 'challenges', 'invoices',
  'coupons', 'automationRules', 'foodItems', 'foodEntries',
])

export interface Change {
  table: string
  id: string
  updatedAt: string
  deleted?: boolean
  data?: Record<string, unknown> | null
}

const getRecord = db.prepare('SELECT updated_at, client_id FROM records WHERE account_id = ? AND tbl = ? AND id = ?')
const nextSeq = db.prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM records')
const upsertRecord = db.prepare(`
  INSERT INTO records (account_id, tbl, id, client_id, data, deleted, updated_at, seq)
  VALUES (@account_id, @tbl, @id, @client_id, @data, @deleted, @updated_at, @seq)
  ON CONFLICT(account_id, tbl, id) DO UPDATE SET
    client_id = excluded.client_id, data = excluded.data, deleted = excluded.deleted,
    updated_at = excluded.updated_at, seq = excluded.seq
`)

function validChange(c: unknown): c is Change {
  const x = c as Change
  return !!x && typeof x.table === 'string' && SYNC_TABLES.has(x.table)
    && typeof x.id === 'string' && x.id.length > 0 && x.id.length <= 128
    && typeof x.updatedAt === 'string' && !Number.isNaN(Date.parse(x.updatedAt))
    && (x.deleted === true || (!!x.data && typeof x.data === 'object'))
}

/** Last-write-wins by the row's own updatedAt. Ties go to the incoming write
 *  so a device re-pushing its own row is idempotent. `forceClientId` is the
 *  Companion path: the row is stamped with the token's client and may never
 *  overwrite a row that belongs to a different client. */
export function applyChanges(accountId: string, changes: Change[], forceClientId?: string): { applied: string[]; stale: string[] } {
  const applied: string[] = []
  const stale: string[] = []
  db.transaction(() => {
    for (const c of changes) {
      const existing = getRecord.get(accountId, c.table, c.id) as { updated_at: string; client_id: string | null } | undefined
      if (forceClientId && existing && existing.client_id !== forceClientId) { stale.push(c.id); continue }
      if (existing && Date.parse(existing.updated_at) > Date.parse(c.updatedAt)) { stale.push(c.id); continue }
      const data: Record<string, unknown> | null = c.deleted ? null : { ...c.data, ...(forceClientId ? { clientId: forceClientId } : {}) }
      const clientId = forceClientId ?? (typeof data?.clientId === 'string' ? data.clientId : c.table === 'clients' ? c.id : null)
      upsertRecord.run({
        account_id: accountId, tbl: c.table, id: c.id, client_id: clientId,
        data: data ? JSON.stringify(data) : null, deleted: c.deleted ? 1 : 0,
        updated_at: c.updatedAt, seq: (nextSeq.get() as { seq: number }).seq,
      })
      applied.push(c.id)
      // Coach → client message: wake the client's phone (metadata only).
      if (!forceClientId && !existing && c.table === 'messages' && data?.direction === 'outbound' && clientId) {
        pushToClient(accountId, clientId, { title: 'Your coach', body: 'New message — open Companion to read it.' })
      }
    }
  })()
  return { applied, stale }
}

const MAX_CHANGES_PER_PUSH = 500

app.post('/data/push', requireCoach, (req, res) => {
  const { changes } = req.body
  if (!Array.isArray(changes) || changes.length > MAX_CHANGES_PER_PUSH) {
    return res.status(400).json({ error: `changes must be an array of at most ${MAX_CHANGES_PER_PUSH}` })
  }
  const bad = changes.findIndex(c => !validChange(c))
  if (bad !== -1) return res.status(400).json({ error: `Invalid change at index ${bad}` })
  res.json({ success: true, ...applyChanges(req.accountId!, changes) })
})

const PULL_PAGE = 1000

app.get('/data/pull', requireCoach, (req, res) => {
  const since = Number(req.query.since ?? 0)
  if (!Number.isFinite(since) || since < 0) return res.status(400).json({ error: 'since must be a non-negative number' })
  const rows = db.prepare(`
    SELECT tbl, id, data, deleted, updated_at, seq FROM records
    WHERE account_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?
  `).all(req.accountId, since, PULL_PAGE + 1) as { tbl: string; id: string; data: string | null; deleted: number; updated_at: string; seq: number }[]
  const more = rows.length > PULL_PAGE
  const page = more ? rows.slice(0, PULL_PAGE) : rows
  res.json({
    success: true,
    changes: page.map(r => ({ table: r.tbl, id: r.id, updatedAt: r.updated_at, deleted: !!r.deleted, data: r.data ? JSON.parse(r.data) : null })),
    cursor: page.length ? page[page.length - 1].seq : since,
    more,
  })
})

// ---- /invites — coach connects a client's Companion app ----
// Codes are short enough to read over the phone, single-use, and expire in a
// week. Unambiguous alphabet (no 0/O, 1/I/L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function newInviteCode(): string {
  const bytes = randomBytes(8)
  return Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

app.post('/invites', requireCoach, (req, res) => {
  const { clientId } = req.body
  if (typeof clientId !== 'string' || !clientId) return res.status(400).json({ error: 'Missing clientId' })
  const client = db.prepare(`SELECT 1 FROM records WHERE account_id = ? AND tbl = 'clients' AND id = ? AND deleted = 0`).get(req.accountId, clientId)
  if (!client) return res.status(404).json({ error: 'That client has not synced to the cloud yet — try again in a moment' })
  const code = newInviteCode()
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString()
  db.prepare('INSERT INTO invites (code, account_id, client_id, expires_at) VALUES (?, ?, ?, ?)').run(code, req.accountId, clientId, expiresAt)
  res.json({ success: true, code, expiresAt })
})

/** Coach disconnects every Companion signed in for this client. */
app.delete('/invites/:clientId', requireCoach, (req, res) => {
  db.prepare('UPDATE client_tokens SET revoked = 1 WHERE account_id = ? AND client_id = ?').run(req.accountId, req.params.clientId)
  db.prepare('DELETE FROM push_subscriptions WHERE account_id = ? AND client_id = ?').run(req.accountId, req.params.clientId)
  res.json({ success: true })
})

// ---- /client — the Companion side ----
app.post('/client/redeem', authLimiter, (req, res) => {
  const code = typeof req.body.code === 'string' ? req.body.code.toUpperCase().replace(/[^A-Z0-9]/g, '') : ''
  const invite = db.prepare('SELECT account_id, client_id, expires_at, redeemed FROM invites WHERE code = ?').get(code) as
    { account_id: string; client_id: string; expires_at: string; redeemed: number } | undefined
  if (!invite || invite.redeemed || invite.expires_at < new Date().toISOString()) {
    return res.status(404).json({ error: 'That code is wrong or has expired — ask your coach for a new one' })
  }
  const token = newToken()
  db.transaction(() => {
    db.prepare('UPDATE invites SET redeemed = 1 WHERE code = ?').run(code)
    db.prepare('INSERT INTO client_tokens (token_hash, account_id, client_id) VALUES (?, ?, ?)').run(sha256Hex(token), invite.account_id, invite.client_id)
  })()
  const coach = db.prepare('SELECT name FROM accounts WHERE id = ?').get(invite.account_id) as { name: string | null }
  res.json({ success: true, token, clientId: invite.client_id, coachName: coach.name || 'Your coach' })
})

/** Collects every exerciseId referenced anywhere inside a program's nested
 *  weeks/days/blocks, without the server needing to know that shape. */
function referencedExerciseIds(value: unknown, out: Set<string>) {
  if (Array.isArray(value)) { for (const v of value) referencedExerciseIds(v, out); return }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'exerciseId' && typeof v === 'string') out.add(v)
      else referencedExerciseIds(v, out)
    }
  }
}

/** Everything Companion shows: its own client row, its programs, the
 *  exercises those programs use, and the message thread. */
app.get('/client/bundle', requireClient, (req, res) => {
  const rows = db.prepare(`
    SELECT tbl, data FROM records
    WHERE account_id = ? AND client_id = ? AND deleted = 0 AND tbl IN ('clients', 'programs', 'messages')
  `).all(req.accountId, req.clientId) as { tbl: string; data: string }[]
  const parsed = rows.map(r => ({ tbl: r.tbl, data: JSON.parse(r.data) as Record<string, unknown> }))
  const client = parsed.find(r => r.tbl === 'clients')?.data ?? null
  const programs = parsed.filter(r => r.tbl === 'programs').map(r => r.data)
  const messages = parsed.filter(r => r.tbl === 'messages').map(r => r.data)
    .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))

  const ids = new Set<string>()
  referencedExerciseIds(programs, ids)
  const exercises = ids.size
    ? (db.prepare(`SELECT data FROM records WHERE account_id = ? AND tbl = 'exercises' AND deleted = 0 AND id IN (${[...ids].map(() => '?').join(',')})`)
        .all(req.accountId, ...ids) as { data: string }[]).map(r => JSON.parse(r.data))
    : []
  const coach = db.prepare('SELECT name FROM accounts WHERE id = ?').get(req.accountId) as { name: string | null }
  res.json({
    success: true,
    coachName: coach.name || 'Your coach',
    client: client && { id: client.id, firstName: client.firstName, lastName: client.lastName },
    programs, exercises, messages,
  })
})

/** Companion's writes: logged sessions, metrics, check-ins and its side of
 *  the thread — nothing else. Rows are forced onto this token's client. */
const CLIENT_WRITABLE = new Set(['sessionLogs', 'metrics', 'checkIns', 'messages'])
app.post('/client/push', requireClient, (req, res) => {
  const { changes } = req.body
  if (!Array.isArray(changes) || changes.length > MAX_CHANGES_PER_PUSH) {
    return res.status(400).json({ error: `changes must be an array of at most ${MAX_CHANGES_PER_PUSH}` })
  }
  const bad = changes.findIndex(c => !validChange(c) || !CLIENT_WRITABLE.has(c.table) || c.deleted
    || (c.table === 'messages' && (c.data as { direction?: unknown } | undefined)?.direction !== 'inbound'))
  if (bad !== -1) return res.status(400).json({ error: `Invalid change at index ${bad}` })
  res.json({ success: true, ...applyChanges(req.accountId!, changes, req.clientId) })
})

app.get('/client/reminders/due', requireClient, (req, res) => {
  const rows = db.prepare(`
    SELECT id, content, send_at FROM reminders
    WHERE account_id = ? AND client_id = ? AND sent = 0 AND send_at <= ?
  `).all(req.accountId, req.clientId, new Date().toISOString()) as { id: string; content: string; send_at: string }[]
  if (rows.length) {
    const mark = db.prepare('UPDATE reminders SET sent = 1 WHERE id = ?')
    db.transaction(() => { for (const r of rows) mark.run(r.id) })()
  }
  res.json({ success: true, reminders: rows.map(r => ({ id: r.id, content: r.content, sendAt: r.send_at })) })
})

app.get('/client/push/vapid', requireClient, (_req, res) => res.json({ success: true, publicKey: vapid.publicKey }))

app.post('/client/push/subscribe', requireClient, (req, res) => {
  const { subscription } = req.body
  if (!subscription?.endpoint) return res.status(400).json({ error: 'Missing subscription' })
  db.prepare(`
    INSERT INTO push_subscriptions (endpoint, account_id, client_id, subscription) VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET account_id = excluded.account_id, client_id = excluded.client_id, subscription = excluded.subscription
  `).run(subscription.endpoint, req.accountId, req.clientId, JSON.stringify(subscription))
  res.json({ success: true })
})

app.post('/client/push/unsubscribe', requireClient, (req, res) => {
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND account_id = ? AND client_id = ?')
    .run(req.body.endpoint, req.accountId, req.clientId)
  res.json({ success: true })
})

// ---- /reminders — coach side ----
app.post('/reminders', requireCoach, (req, res) => {
  const { id, clientId, content, sendAt } = req.body
  if (typeof clientId !== 'string' || typeof content !== 'string' || !content.trim() || typeof sendAt !== 'string' || Number.isNaN(Date.parse(sendAt))) {
    return res.status(400).json({ error: 'clientId, content and sendAt are required' })
  }
  const rid = typeof id === 'string' && id ? id : newId()
  db.prepare(`
    INSERT INTO reminders (id, account_id, client_id, content, send_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET content = excluded.content, send_at = excluded.send_at, sent = 0
    WHERE reminders.account_id = excluded.account_id
  `).run(rid, req.accountId, clientId, content.slice(0, 2000), new Date(sendAt).toISOString())
  res.json({ success: true, id: rid })
})

app.get('/reminders', requireCoach, (req, res) => {
  const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : null
  const rows = db.prepare(`
    SELECT id, client_id, content, send_at FROM reminders
    WHERE account_id = ? AND sent = 0 AND (? IS NULL OR client_id = ?) ORDER BY send_at ASC
  `).all(req.accountId, clientId, clientId) as { id: string; client_id: string; content: string; send_at: string }[]
  res.json({ success: true, reminders: rows.map(r => ({ id: r.id, clientId: r.client_id, content: r.content, sendAt: r.send_at })) })
})

app.delete('/reminders/:id', requireCoach, (req, res) => {
  const changes = db.prepare('DELETE FROM reminders WHERE id = ? AND account_id = ? AND sent = 0').run(req.params.id, req.accountId).changes
  // Already sent or gone — say so, rather than telling the coach a reminder
  // was cancelled that the client will still see.
  if (!changes) return res.status(404).json({ error: 'No pending reminder with that id' })
  res.json({ success: true })
})

// ---- /membership ----
app.post('/membership/checkout', requireCoach, async (req, res) => {
  if (!stripe || !process.env.STRIPE_PRICE_ID) {
    return res.status(503).json({ error: 'Membership billing is not configured on this instance' })
  }
  const existing = db.prepare('SELECT status FROM memberships WHERE account_id = ?').get(req.accountId) as { status: string } | undefined
  if (existing && isActiveSubscriptionStatus(existing.status)) {
    return res.status(409).json({ error: 'You already have an active membership — use Manage billing instead.' })
  }
  const account = db.prepare('SELECT email FROM accounts WHERE id = ?').get(req.accountId) as { email: string }
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      client_reference_id: req.accountId,
      customer_email: account.email,
      success_url: process.env.STRIPE_SUCCESS_URL || 'https://coachwright.app/membership/success',
      cancel_url: process.env.STRIPE_CANCEL_URL || 'https://coachwright.app/membership/cancelled',
    })
    res.json({ success: true, url: session.url })
  } catch (err: any) {
    console.error('Checkout session creation failed:', err)
    res.status(502).json({ error: 'Could not start checkout — try again shortly' })
  }
})

/** Membership as the app should treat it right now. `expiresAt` is Stripe's
 *  period end plus a grace window; the app keeps honouring it if it can't
 *  reach the server for a while, and drops to free-tier limits after. */
export function membershipStatus(accountId: string): { active: boolean; expiresAt: string | null; status: string | null } {
  const row = db.prepare('SELECT status, current_period_end FROM memberships WHERE account_id = ?').get(accountId) as
    { status: string; current_period_end: string | null } | undefined
  if (!row) return { active: false, expiresAt: null, status: null }
  const end = row.current_period_end ? Date.parse(row.current_period_end) + MEMBERSHIP_GRACE_DAYS * 86_400_000 : null
  const active = isActiveSubscriptionStatus(row.status) && (end === null || end > Date.now())
  return { active, expiresAt: end ? new Date(end).toISOString() : null, status: row.status }
}

app.get('/membership/status', requireCoach, (req, res) => {
  res.json({ success: true, ...membershipStatus(req.accountId!) })
})

app.post('/membership/portal', requireCoach, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Membership billing is not configured on this instance' })
  const row = db.prepare('SELECT stripe_customer_id FROM memberships WHERE account_id = ?').get(req.accountId) as { stripe_customer_id: string } | undefined
  if (!row) return res.status(404).json({ error: 'No membership on file' })
  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: process.env.STRIPE_SUCCESS_URL || 'https://coachwright.app/membership/success',
    })
    res.json({ success: true, url: portal.url })
  } catch (err: any) {
    console.error('Billing portal session creation failed:', err)
    res.status(502).json({ error: 'Could not open billing — try again shortly' })
  }
})

// Unauthenticated liveness probe — returns nothing beyond "up".
app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()) })
})

// JSON errors without stack traces (Express's default handler renders the
// trace whenever NODE_ENV isn't 'production').
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = (err as { status?: number })?.status
  if (!status || status >= 500) console.error(err)
  res.status(typeof status === 'number' && status >= 400 && status < 600 ? status : 500)
    .json({ error: status && status < 500 ? (err as Error).message : 'Internal server error' })
})

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Coachwright Cloud running on port ${port}`)
  })
}

export { db }

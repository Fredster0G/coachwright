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
//   /auth/*        coach accounts (email + scrypt password, bearer sessions),
//                  password reset by emailed one-time link, account deletion
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
import { randomBytes, createHash, scryptSync, timingSafeEqual, createPublicKey, verify as verifySig } from 'crypto'
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

  -- Emailed password-reset links. Only the sha256 is stored; single use,
  -- one hour, and a new request replaces any older unused one.
  CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
`)

// Added S24. `client_allowance`: the free-tier active-client ceiling for an
// account that arrived with more than FREE_TIER_CLIENT_LIMIT already (a
// pre-cloud install uploading its database) — "gate new, never claw back".
if (!(db.prepare(`SELECT 1 FROM pragma_table_info('accounts') WHERE name = 'client_allowance'`).get())) {
  db.exec(`ALTER TABLE accounts ADD COLUMN client_allowance INTEGER`)
}

// Added S27. When the coach was last emailed about client activity — the
// throttle for coach notification emails (notifyCoachByEmail).
if (!(db.prepare(`SELECT 1 FROM pragma_table_info('accounts') WHERE name = 'notify_email_at'`).get())) {
  db.exec(`ALTER TABLE accounts ADD COLUMN notify_email_at TEXT`)
}

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

// ---- Email ----
// One HTTP call to Postmark (no SDK, no SMTP). Unconfigured = nothing is sent:
// outside production the message is printed to the console so a developer
// can follow a reset link; in production only the fact is logged, never the
// link. Replaceable in tests (`mailer.send = ...`).
export const mailer = {
  async send(to: string, subject: string, text: string): Promise<void> {
    const token = process.env.POSTMARK_SERVER_TOKEN
    if (!token || !process.env.MAIL_FROM) {
      if (process.env.NODE_ENV === 'production') console.warn(`Mail not configured — "${subject}" to ${to} was not sent`)
      else console.log(`\n[mail not configured — would send]\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`)
      return
    }
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Postmark-Server-Token': token },
      body: JSON.stringify({ From: process.env.MAIL_FROM, To: to, Subject: subject, TextBody: text, MessageStream: 'outbound' }),
    })
    if (!res.ok) throw new Error(`Postmark responded ${res.status}`)
  },
}

// ---- Housekeeping ----
function sweep() {
  db.prepare(`DELETE FROM password_resets WHERE expires_at < ?`).run(new Date().toISOString())
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

const RESET_TTL_MS = 60 * 60 * 1000
const APP_URL = (process.env.APP_URL || 'https://app.coachwright.app').replace(/\/$/, '')

/** Always answers the same way, whether or not the email has an account, so
 *  this can't be used to find out who's a customer. The email is sent in the
 *  background for the same reason (timing). */
app.post('/auth/reset/request', authLimiter, (req, res) => {
  const { email } = req.body
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) return res.status(400).json({ error: 'Enter a valid email address' })
  const row = db.prepare('SELECT id, email FROM accounts WHERE email = ?').get(email.trim().toLowerCase()) as { id: string; email: string } | undefined
  // At most one email a minute per account, so the endpoint can't be used to
  // flood someone's inbox. The answer is the same either way.
  const recent = row && db.prepare('SELECT 1 FROM password_resets WHERE account_id = ? AND expires_at > ?')
    .get(row.id, new Date(Date.now() + RESET_TTL_MS - 60_000).toISOString())
  if (row && !recent) {
    const token = newId()
    db.transaction(() => {
      db.prepare('DELETE FROM password_resets WHERE account_id = ?').run(row.id)
      db.prepare('INSERT INTO password_resets (token_hash, account_id, expires_at) VALUES (?, ?, ?)')
        .run(sha256Hex(token), row.id, new Date(Date.now() + RESET_TTL_MS).toISOString())
    })()
    const text = [
      'Someone (hopefully you) asked to reset the password for your Coachwright account.',
      '',
      `Open this link within the next hour: ${APP_URL}/#/reset-password?token=${token}`,
      '',
      `Or, in the Coachwright desktop app, choose "Forgot password?" → "I have a reset code" and paste: ${token}`,
      '',
      "If you didn't ask for this, ignore this email — your password hasn't changed.",
    ].join('\n')
    mailer.send(row.email, 'Reset your Coachwright password', text)
      .catch(err => console.error('Password reset email failed:', err))
  }
  res.json({ success: true })
})

/** Sets the new password, signs out every device, and signs this one in. */
app.post('/auth/reset/confirm', authLimiter, (req, res) => {
  const { token, newPassword } = req.body
  if (typeof newPassword !== 'string' || newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })
  const hash = typeof token === 'string' ? sha256Hex(token.trim()) : ''
  const row = db.prepare('SELECT account_id, expires_at FROM password_resets WHERE token_hash = ?').get(hash) as
    { account_id: string; expires_at: string } | undefined
  if (!row || Date.parse(row.expires_at) < Date.now()) {
    return res.status(400).json({ error: 'That reset link has expired or was already used — request a new one' })
  }
  db.transaction(() => {
    db.prepare('UPDATE accounts SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), row.account_id)
    db.prepare('DELETE FROM password_resets WHERE account_id = ?').run(row.account_id)
    db.prepare('DELETE FROM sessions WHERE account_id = ?').run(row.account_id)
  })()
  const account = db.prepare('SELECT id, email FROM accounts WHERE id = ?').get(row.account_id) as { id: string; email: string }
  res.json({ success: true, token: startSession(account.id), account })
})

/** Erase the account and everything in it: synced rows, sessions, Companion
 *  connections, reminders, push subscriptions, membership record (all
 *  `ON DELETE CASCADE`). A live Stripe subscription is cancelled first; if
 *  that fails nothing is deleted, so a coach is never billed for an account
 *  that no longer exists. */
app.delete('/auth/account', authLimiter, requireCoach, async (req, res) => {
  const { password } = req.body ?? {}
  const acct = db.prepare('SELECT password_hash FROM accounts WHERE id = ?').get(req.accountId) as { password_hash: string }
  if (typeof password !== 'string' || !verifyPassword(password, acct.password_hash)) {
    return res.status(403).json({ error: 'Password is wrong' })
  }
  const m = db.prepare('SELECT stripe_subscription_id, status FROM memberships WHERE account_id = ?').get(req.accountId) as
    { stripe_subscription_id: string | null; status: string } | undefined
  if (m?.stripe_subscription_id && m.status !== 'canceled' && m.status !== 'incomplete_expired') {
    if (!stripe) return res.status(503).json({ error: 'Billing is unavailable right now, so your membership can’t be cancelled — try again later' })
    try {
      await stripe.subscriptions.cancel(m.stripe_subscription_id)
    } catch (err: any) {
      if (err?.code !== 'resource_missing') {
        console.error('Subscription cancel on account deletion failed:', err)
        return res.status(502).json({ error: 'Could not cancel your membership, so nothing was deleted — try again shortly' })
      }
    }
  }
  db.prepare('DELETE FROM accounts WHERE id = ?').run(req.accountId)
  res.json({ success: true })
})

// ---- Free-tier cap (server side) ----
// Mirrors the app's lib/membership.ts: without a live membership or a
// one-time licence, an account may have FREE_TIER_CLIENT_LIMIT active
// clients. Only a client BECOMING active is refused — edits to clients that
// are already active, and archiving, always go through.
const FREE_TIER_CLIENT_LIMIT = 3

/** The app's embedded licence-verification key (lib/licence.ts
 *  RELEASE_PUBLIC_JWK); an app test asserts the two are equal. */
export const LICENCE_PUBLIC_JWK = {
  kty: 'EC', crv: 'P-256',
  x: 'f0teaQeJV8_PsV_JQvH-laSddAWT7SVi7ygbG27LOws',
  y: 'qGF80fkhviu5SZA79vtLxaVJf2keydfFCY7WiznaarY',
}
const licenceKey = createPublicKey({ key: process.env.LICENCE_PUBLIC_JWK ? JSON.parse(process.env.LICENCE_PUBLIC_JWK) : LICENCE_PUBLIC_JWK, format: 'jwk' })

/** Same format and signature as lib/licence.ts: `CW1.<b64url claims>.<b64url
 *  P-256 sig over canonicalClaims>`. Returns the edition, or null. */
export function verifiedLicenceEdition(key: unknown): string | null {
  if (typeof key !== 'string') return null
  const parts = key.trim().split('.')
  if (parts.length !== 3 || parts[0] !== 'CW1') return null
  try {
    const c = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    if (typeof c?.name !== 'string' || typeof c.issuedAt !== 'string') return null
    const canonical = JSON.stringify([c.name, c.edition, c.seats ?? 0, c.issuedAt, c.serial ?? 0, c.programme ?? 'standard'])
    const ok = verifySig('sha256', Buffer.from(canonical), { key: licenceKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url'))
    return ok ? c.edition : null
  } catch {
    return null
  }
}

function hasPaidAccess(accountId: string): boolean {
  if (membershipStatus(accountId).active) return true
  const rows = db.prepare(`SELECT data FROM records WHERE account_id = ? AND tbl = 'trainer' AND deleted = 0`).all(accountId) as { data: string }[]
  return rows.some(r => {
    const edition = verifiedLicenceEdition(JSON.parse(r.data).licenseKey)
    return edition === 'independent' || edition === 'studio'
  })
}

const countActiveClients = db.prepare(`
  SELECT COUNT(*) AS n FROM records
  WHERE account_id = ? AND tbl = 'clients' AND deleted = 0 AND json_extract(data, '$.status') = 'active'
    AND COALESCE(json_extract(data, '$.isDemo'), 0) = 0
`)
function activeClientCount(accountId: string): number {
  return (countActiveClients.get(accountId) as { n: number }).n
}

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

const getRecord = db.prepare(`
  SELECT updated_at, client_id, deleted, json_extract(data, '$.status') AS status
  FROM records WHERE account_id = ? AND tbl = ? AND id = ?
`)
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
 *  overwrite a row that belongs to a different client. `clientCap` (coach
 *  pushes from a free account) refuses a client that would become the
 *  cap+1'th active one. */
export function applyChanges(
  accountId: string, changes: Change[], forceClientId?: string, clientCap?: number,
): { applied: string[]; stale: string[]; refused: string[] } {
  const applied: string[] = []
  const stale: string[] = []
  const refused: string[] = []
  // Under a cap, apply everything else before clients becoming active, so a
  // batch that archives one client and adds another is order-independent.
  // Onboarding's sample clients (isDemo) never count toward the free cap.
  const activates = (c: Change) => c.table === 'clients' && !c.deleted && c.data?.status === 'active' && !c.data?.isDemo
  const ordered = clientCap === undefined ? changes : [...changes.filter(c => !activates(c)), ...changes.filter(activates)]
  db.transaction(() => {
    for (const c of ordered) {
      const existing = getRecord.get(accountId, c.table, c.id) as
        { updated_at: string; client_id: string | null; deleted: number; status: string | null } | undefined
      if (forceClientId && existing && existing.client_id !== forceClientId) { stale.push(c.id); continue }
      // A client's messages are append-only: Companion never edits one after
      // sending, and letting it would let it overwrite the coach's answer on a
      // booking request (reopening it, or a second appointment on accept).
      if (forceClientId && existing && c.table === 'messages') { stale.push(c.id); continue }
      if (existing && Date.parse(existing.updated_at) > Date.parse(c.updatedAt)) { stale.push(c.id); continue }
      if (clientCap !== undefined && activates(c)
        && !(existing && !existing.deleted && existing.status === 'active')
        && activeClientCount(accountId) >= clientCap) {
        refused.push(c.id); continue
      }
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
  return { applied, stale, refused }
}

const MAX_CHANGES_PER_PUSH = 500

app.post('/data/push', requireCoach, (req, res) => {
  const { changes } = req.body
  if (!Array.isArray(changes) || changes.length > MAX_CHANGES_PER_PUSH) {
    return res.status(400).json({ error: `changes must be an array of at most ${MAX_CHANGES_PER_PUSH}` })
  }
  const bad = changes.findIndex(c => !validChange(c))
  if (bad !== -1) return res.status(400).json({ error: `Invalid change at index ${bad}` })
  const accountId = req.accountId!
  // An account's very first push is a device uploading what it already had;
  // whatever it arrives with becomes its allowance (never claw back).
  const firstPush = !db.prepare('SELECT 1 FROM records WHERE account_id = ? LIMIT 1').get(accountId)
  let cap: number | undefined
  if (!firstPush && !hasPaidAccess(accountId)) {
    const { client_allowance } = db.prepare('SELECT client_allowance FROM accounts WHERE id = ?').get(accountId) as { client_allowance: number | null }
    cap = Math.max(FREE_TIER_CLIENT_LIMIT, client_allowance ?? 0)
  }
  const result = applyChanges(accountId, changes, undefined, cap)
  if (firstPush) {
    const n = activeClientCount(accountId)
    if (n > FREE_TIER_CLIENT_LIMIT) db.prepare('UPDATE accounts SET client_allowance = ? WHERE id = ?').run(n, accountId)
  }
  res.json({ success: true, ...result })
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
    brand: brandFor(req.accountId!),
    units: unitsFor(req.accountId!),
    ...bookingFor(req.accountId!, req.clientId!, Date.now()),
  })
})

/** The coach's load units. Prescriptions are written in them, and Companion
 *  converts its own logged loads into them before upload. */
export function unitsFor(accountId: string): 'lb' | 'kg' {
  const t = db.prepare(`SELECT data FROM records WHERE account_id = ? AND tbl = 'trainer' AND deleted = 0 LIMIT 1`).get(accountId) as { data: string } | undefined
  return t && (JSON.parse(t.data) as { units?: unknown }).units === 'kg' ? 'kg' : 'lb'
}

/** Companion logs exercises by the name the client typed (it only knows the
 *  exercises in its own program). Point each entry at the coach's library
 *  exercise of that name, so the session shows up in the coach's history and
 *  analytics instead of as "Unknown exercise". Unmatched entries keep their
 *  `exerciseName` for display. */
export function resolveExerciseNames(accountId: string, changes: Change[]): Change[] {
  const logs = changes.filter(c => c.table === 'sessionLogs' && Array.isArray((c.data as { entries?: unknown } | undefined)?.entries))
  if (!logs.length) return changes
  const byName = new Map<string, string>()
  for (const r of db.prepare(`SELECT id, data FROM records WHERE account_id = ? AND tbl = 'exercises' AND deleted = 0`).all(accountId) as { id: string; data: string }[]) {
    const ex = JSON.parse(r.data) as { name?: unknown; aliases?: unknown }
    for (const n of [ex.name, ...(Array.isArray(ex.aliases) ? ex.aliases : [])]) {
      if (typeof n === 'string' && n.trim() && !byName.has(n.trim().toLowerCase())) byName.set(n.trim().toLowerCase(), r.id)
    }
  }
  return changes.map(c => {
    if (!logs.includes(c)) return c
    const data = c.data as { entries: { exerciseId?: unknown; exerciseName?: unknown }[] }
    const entries = data.entries.map(e => {
      const id = typeof e.exerciseName === 'string' ? byName.get(e.exerciseName.trim().toLowerCase()) : undefined
      return id ? { ...e, exerciseId: id } : e
    })
    return { ...c, data: { ...c.data, entries } }
  })
}

/** The coach's own branding for Companion — same rule as the app's
 *  canUseCustomBranding (lib/membership.ts): paid access, or an account
 *  from before the 2026-08-15 cutoff (gate new, never claw back). Null
 *  otherwise, and Companion shows plain Coachwright. */
const BRANDING_GRANDFATHER_CUTOFF = '2026-08-15T00:00:00.000Z'
export function brandFor(accountId: string): { name?: string; logo?: string; color?: string } | null {
  const t = db.prepare(`SELECT data FROM records WHERE account_id = ? AND tbl = 'trainer' AND deleted = 0 LIMIT 1`).get(accountId) as { data: string } | undefined
  if (!t) return null
  const tr = JSON.parse(t.data) as { createdAt?: string; businessName?: string; logoDataUrl?: string; brandColor?: string }
  const allowed = hasPaidAccess(accountId) || (typeof tr.createdAt === 'string' && tr.createdAt < BRANDING_GRANDFATHER_CUTOFF)
  if (!allowed) return null
  const logo = typeof tr.logoDataUrl === 'string' && tr.logoDataUrl.startsWith('data:image/') && tr.logoDataUrl.length < 400_000 ? tr.logoDataUrl : undefined
  const color = typeof tr.brandColor === 'string' && /^#[0-9a-f]{6}$/i.test(tr.brandColor) ? tr.brandColor : undefined
  const name = typeof tr.businessName === 'string' && tr.businessName.trim() ? tr.businessName.trim().slice(0, 80) : undefined
  return name || logo || color ? { name, logo, color } : null
}

/** Client self-booking (coach app lib/booking.ts). `openSlots` is the slot
 *  list the coach's app published on its trainer row, minus anything inside
 *  the notice period — times only, nothing about who fills the rest of the
 *  calendar. `sessions` is this client's own upcoming appointments (one-offs
 *  and series masters; Companion expands nothing, it shows the next dates). */
const MAX_SLOTS = 400
export function bookingFor(accountId: string, clientId: string, now: number): {
  booking: { enabled: boolean; slotMinutes?: number }
  openSlots: { start: string; end: string }[]
  sessions: { id: string; title: string; start: string; end: string; recurring: boolean }[]
} {
  const t = db.prepare(`SELECT data FROM records WHERE account_id = ? AND tbl = 'trainer' AND deleted = 0 LIMIT 1`).get(accountId) as { data: string } | undefined
  const trainer = t ? JSON.parse(t.data) as { booking?: { enabled?: boolean; noticeHours?: number; slotMinutes?: number }; bookingSlots?: unknown } : {}
  const enabled = !!trainer.booking?.enabled
  const notice = Math.max(0, Number(trainer.booking?.noticeHours) || 0) * 3_600_000
  const openSlots = enabled && Array.isArray(trainer.bookingSlots)
    ? (trainer.bookingSlots as { start?: unknown; end?: unknown }[])
        .filter((x): x is { start: string; end: string } => typeof x?.start === 'string' && typeof x?.end === 'string')
        .filter(x => Date.parse(x.start) > now + notice)
        .slice(0, MAX_SLOTS)
        .map(x => ({ start: x.start, end: x.end }))
    : []
  const nowIso = new Date(now).toISOString()
  const sessions = (db.prepare(`SELECT data FROM records WHERE account_id = ? AND client_id = ? AND tbl = 'appointments' AND deleted = 0`)
    .all(accountId, clientId) as { data: string }[])
    .map(r => JSON.parse(r.data) as { id: string; title?: string; start: string; end: string; status?: string; recurrenceRule?: unknown })
    .filter(a => a.status !== 'canceled' && (a.recurrenceRule || a.end > nowIso))
    .map(a => ({ id: a.id, title: a.title || 'Session', start: a.start, end: a.end, recurring: !!a.recurrenceRule }))
    .sort((a, b) => a.start.localeCompare(b.start))
  return { booking: { enabled, slotMinutes: enabled ? trainer.booking?.slotMinutes : undefined }, openSlots, sessions }
}

/** A client may ASK for a time; only the coach answers. Keep a booking
 *  request's start/end (if they're sane) and drop anything else — notably
 *  `status`/`appointmentId`, which would let a client accept its own
 *  request. Sanitised rather than rejected: a 400 would also block whatever
 *  logs were queued in the same batch. */
const MAX_BOOKING_MS = 4 * 3_600_000
function clientBookingOnly(c: Change): Change {
  if (c.table !== 'messages' || !c.data || !('booking' in c.data)) return c
  const { booking, ...rest } = c.data as Record<string, unknown> & { booking?: { start?: unknown; end?: unknown } }
  const s = typeof booking?.start === 'string' ? Date.parse(booking.start) : NaN
  const e = typeof booking?.end === 'string' ? Date.parse(booking.end) : NaN
  const ok = Number.isFinite(s) && Number.isFinite(e) && e > s && e - s <= MAX_BOOKING_MS
  return { ...c, data: ok ? { ...rest, booking: { start: new Date(s).toISOString(), end: new Date(e).toISOString() } } : rest }
}

/** Companion's writes: logged sessions, metrics, check-ins and its side of
 *  the thread — nothing else. Rows are forced onto this token's client, and
 *  data rows are stamped `source: 'companion-import'` — the mark of a row the
 *  client authored. A client may delete only rows carrying that mark (its
 *  own logs), never anything the coach wrote about it. */
const CLIENT_WRITABLE = new Set(['sessionLogs', 'metrics', 'checkIns', 'messages'])
const CLIENT_DELETABLE = new Set(['sessionLogs', 'metrics', 'checkIns'])
const getClientRow = db.prepare(`SELECT client_id, json_extract(data, '$.source') AS source FROM records WHERE account_id = ? AND tbl = ? AND id = ? AND deleted = 0`)
function clientAuthored(accountId: string, clientId: string, c: Change): boolean {
  const r = getClientRow.get(accountId, c.table, c.id) as { client_id: string | null; source: string | null } | undefined
  return !!r && r.client_id === clientId && r.source === 'companion-import'
}
app.post('/client/push', requireClient, (req, res) => {
  const { changes } = req.body
  if (!Array.isArray(changes) || changes.length > MAX_CHANGES_PER_PUSH) {
    return res.status(400).json({ error: `changes must be an array of at most ${MAX_CHANGES_PER_PUSH}` })
  }
  const bad = changes.findIndex(c => !validChange(c) || !CLIENT_WRITABLE.has(c.table)
    || (c.deleted && !CLIENT_DELETABLE.has(c.table))
    || (c.table === 'messages' && (c.data as { direction?: unknown } | undefined)?.direction !== 'inbound'))
  if (bad !== -1) return res.status(400).json({ error: `Invalid change at index ${bad}` })
  // A delete of anything the client didn't author is dropped (reported stale),
  // not a 400 — the same batch may carry new logs that must still land.
  const notOwn = (changes as Change[]).filter(c => c.deleted && !clientAuthored(req.accountId!, req.clientId!, c)).map(c => c.id)
  const stamped = (changes as Change[]).filter(c => !notOwn.includes(c.id)).map(c =>
    !c.deleted && CLIENT_DELETABLE.has(c.table) ? { ...c, data: { ...c.data, source: 'companion-import' } } : c)
  const result = applyChanges(req.accountId!, resolveExerciseNames(req.accountId!, stamped.map(clientBookingOnly)), req.clientId)
  result.stale.push(...notOwn)
  const applied = new Set(result.applied)
  const newMessages = (changes as Change[]).filter(c => c.table === 'messages' && applied.has(c.id))
  if (newMessages.length) {
    notifyCoachByEmail(req.accountId!, req.clientId!, newMessages.some(c => !!(c.data as { booking?: unknown })?.booking))
      .catch(err => console.error('coach notification email failed:', err instanceof Error ? err.message : err))
  }
  res.json({ success: true, ...result })
})

/** Email the coach that a client wrote (or asked for a session) — only if
 *  they opted in (trainer.emailNotify, Settings → Notifications), and at most
 *  once per COACH_EMAIL_EVERY_MS so a chatty thread is one email, not twenty.
 *  Names the client, never quotes the message: it may be health data, and an
 *  inbox is not where that should be copied. */
const COACH_EMAIL_EVERY_MS = 30 * 60_000
export async function notifyCoachByEmail(accountId: string, clientId: string, booking: boolean, now = Date.now()): Promise<boolean> {
  const t = db.prepare(`SELECT data FROM records WHERE account_id = ? AND tbl = 'trainer' AND deleted = 0 LIMIT 1`).get(accountId) as { data: string } | undefined
  if (!t || (JSON.parse(t.data) as { emailNotify?: unknown }).emailNotify !== true) return false
  const acct = db.prepare('SELECT email, notify_email_at FROM accounts WHERE id = ?').get(accountId) as { email: string; notify_email_at: string | null } | undefined
  if (!acct) return false
  if (acct.notify_email_at && now - Date.parse(acct.notify_email_at) < COACH_EMAIL_EVERY_MS) return false
  // Claim the slot before the network call, so two pushes racing can't both send.
  const claimed = db.prepare(`UPDATE accounts SET notify_email_at = ? WHERE id = ? AND (notify_email_at IS NULL OR notify_email_at = ?)`)
    .run(new Date(now).toISOString(), accountId, acct.notify_email_at).changes
  if (!claimed) return false
  const c = db.prepare(`SELECT data FROM records WHERE account_id = ? AND tbl = 'clients' AND id = ? AND deleted = 0`).get(accountId, clientId) as { data: string } | undefined
  const name = (c && (JSON.parse(c.data) as { firstName?: string }).firstName?.trim()) || 'A client'
  const subject = booking ? `${name} asked for a session` : `${name} sent you a message`
  await mailer.send(acct.email, subject, [
    `${subject} in Coachwright.`,
    '',
    `Open Coachwright to read and reply: ${APP_URL}`,
    '',
    `You get at most one of these every ${COACH_EMAIL_EVERY_MS / 60_000} minutes. Turn them off in Settings → Notifications.`,
  ].join('\n'))
  return true
}

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

// Unauthenticated probe — returns nothing beyond "up". It touches the
// database, so an uptime monitor also catches a full disk or a broken file.
app.get('/health', (_req, res) => {
  try {
    db.prepare('SELECT 1').get()
    res.json({ ok: true, uptime: Math.round(process.uptime()) })
  } catch (err) {
    console.error('Health check: database unavailable:', err)
    res.status(503).json({ ok: false, uptime: Math.round(process.uptime()) })
  }
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
  const server = app.listen(port, () => {
    console.log(`Coachwright Cloud running on port ${port}`)
  })
  // systemd stops with SIGTERM: finish in-flight requests, then close the
  // database cleanly (checkpoints the WAL for Litestream) before exiting.
  const shutdown = (signal: string) => {
    console.log(`${signal} — shutting down`)
    server.close(() => { db.close(); process.exit(0) })
    setTimeout(() => process.exit(1), 10_000).unref()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

export { db }

import express from 'express'
import cors from 'cors'
import Database from 'better-sqlite3'
import * as dotenv from 'dotenv'
import { randomBytes, createHash, timingSafeEqual } from 'crypto'
import { rateLimit } from 'express-rate-limit'
import webpush from 'web-push'
import Stripe from 'stripe'
import { loadSigningKey, signMembershipToken, type MembershipClaims } from './membershipTokens'

dotenv.config()

export const app = express()
const port = process.env.PORT || 4000

// Behind a reverse proxy (the documented Caddy deployment), every request
// arrives from 127.0.0.1 — without this, the rate limiter below buckets the
// ENTIRE instance's traffic under one IP and 100 requests from all coaches
// combined locks everyone out. Set TRUST_PROXY to the hop count ("1") or an
// express trust-proxy value ("loopback") when a proxy is in front.
if (process.env.TRUST_PROXY) {
  const v = process.env.TRUST_PROXY
  app.set('trust proxy', /^\d+$/.test(v) ? Number(v) : v === 'true' ? true : v)
}

// Rate limit: 100 requests per 15 minutes per IP, for everything except the
// routes below that have their own budget. WebRTC signalling polls every
// 700ms during a handshake (lib/sync/p2pSession.ts's POLL_INTERVAL_MS) — two
// devices on one NAT would exhaust the general budget in ~35s and the
// handshake would die with a 429 — and /health is the operator's monitor.
// The Stripe webhook is exempt because a 429 there only delays a paying
// coach's access until Stripe's retry.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_PER_15MIN || 100),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/signal/') || req.path === '/health' || req.path === '/membership/webhook',
})
const signalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.SIGNAL_RATE_LIMIT_PER_MIN || 400),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

app.use(cors())
app.use(limiter)

// ---- Stripe (membership billing, S15) ----
// `null` when unconfigured — a self-hoster who isn't selling memberships
// doesn't need a Stripe account, and every route below refuses cleanly
// rather than crashing the process on a missing key. See docs/MEMBERSHIP.md
// for the full setup checklist (create the product/price, set the env vars,
// point a webhook at /membership/webhook).
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null

/** A token stays valid this many days after being minted — real headroom
 *  past a 30-day billing cycle so a coach without internet for a stretch
 *  isn't locked out mid-cycle (see lib/membership.ts's header on the
 *  workstation side for the offline-grace reasoning). */
const MEMBERSHIP_TOKEN_LIFETIME_DAYS = Number(process.env.MEMBERSHIP_TOKEN_LIFETIME_DAYS || 35)

/** Stripe subscription statuses that mean "the coach should have access
 *  right now". `past_due` counts — Stripe is still retrying the card and
 *  cutting access on the first failed charge is exactly the kind of
 *  coercive billing experience worth avoiding; `unpaid`/`canceled` do not. */
function isActiveSubscriptionStatus(status: string): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due'
}

// Webhook route is registered BEFORE the global express.json() below,
// with its own express.raw() middleware — Stripe's signature check
// (`stripe.webhooks.constructEvent`) needs the exact raw request bytes,
// which a JSON-parsing body reader would already have consumed and
// reserialized (losing byte-for-byte fidelity) by the time a route handler
// further down the file ran.
app.post('/membership/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Membership billing is not configured on this instance' })
  }
  const signature = req.headers['stripe-signature']
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(req.body, signature as string, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return res.status(400).json({ error: `Webhook signature verification failed` })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const coachId = session.client_reference_id
        if (!coachId || !session.subscription || !session.customer) break
        const secretHash = session.metadata?.secretHash
        if (!secretHash) break // not created by /membership/checkout — nothing to bind it to
        const existing = db.prepare('SELECT status, secret_hash, stripe_subscription_id FROM memberships WHERE coach_id = ?').get(coachId) as
          | { status: string; secret_hash: string | null; stripe_subscription_id: string }
          | undefined
        // /checkout already refuses a second checkout for an active member,
        // but a session opened before the first one completed can still land
        // here. Never let it rebind an active membership to a different
        // device secret — that would lock the real coach out of their own
        // (still-billing) subscription.
        if (existing && isActiveSubscriptionStatus(existing.status) && existing.secret_hash !== secretHash
          && existing.stripe_subscription_id !== session.subscription) {
          console.error(`Refusing to rebind active membership for ${coachId} to a different checkout secret`)
          break
        }
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
        upsertMembership({
          coachId,
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: subscription.id,
          status: subscription.status,
          currentPeriodEnd: subscription.items.data[0]?.current_period_end,
          name: session.customer_details?.name || 'Coachwright member',
          secretHash,
        })
        break
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const row = db.prepare('SELECT coach_id, name, secret_hash FROM memberships WHERE stripe_subscription_id = ?').get(subscription.id) as { coach_id: string; name: string; secret_hash: string | null } | undefined
        if (!row) break
        upsertMembership({
          coachId: row.coach_id,
          stripeCustomerId: subscription.customer as string,
          stripeSubscriptionId: subscription.id,
          status: event.type === 'customer.subscription.deleted' ? 'canceled' : subscription.status,
          currentPeriodEnd: subscription.items.data[0]?.current_period_end,
          name: row.name,
          secretHash: row.secret_hash,
        })
        break
      }
    }
    res.json({ received: true })
  } catch (err: any) {
    console.error('Webhook handling failed:', err)
    res.status(500).json({ error: err.message })
  }
})

app.use(express.json({ limit: '5mb' })) // Reduced from 50mb to prevent memory exhaustion
// Express 5 leaves req.body undefined when no parser matched (e.g. a curl
// with -d but no JSON content-type, which is exactly what MANAGED_HOSTING.md
// §3's provisioning command used to be). Every handler destructures it, so
// that was a 500 with a stack trace instead of a clean 400.
app.use((req, _res, next) => { if (req.body === undefined) req.body = {}; next() })

// Initialize SQLite database
// This stores encrypted JSON blobs for each "Coach" and their "Clients" —
// the server never sees plaintext; everything is E2EE by the client apps.
// DB_PATH lets the test suite run against ':memory:' and lets an operator
// put the database on a mounted volume without changing the working dir.
const db = new Database(process.env.DB_PATH || 'coachwright.db')

db.exec(`
  -- Keyed by (id, type), not id alone: a client device pushes its packet
  -- under its own id with type 'client', and the coach pushes the packet
  -- ADDRESSED TO that device under the same id with type 'coach'. Both
  -- directions coexist per device; different clients never collide because
  -- each pair's row ids are that client's own device id.
  CREATE TABLE IF NOT EXISTS sync_payloads (
    id TEXT,                   -- device id (see comment above)
    type TEXT,                 -- 'coach' or 'client' — who authored the payload
    coach_id TEXT,             -- The coach this belongs to
    encrypted_payload TEXT,    -- The E2E encrypted JSON blob
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, type)
  );

  -- Per-coach API keys, so one shared managed-hosting instance can serve
  -- many $15/mo customers without one coach's key reading another's data.
  -- Provisioned by the operator via POST /keys/register (gated on ADMIN_KEY)
  -- after confirming payment out-of-band (see docs/SERVER_STRATEGY.md) —
  -- there's no Stripe webhook wired up here, this is deliberately manual.
  CREATE TABLE IF NOT EXISTS api_keys (
    key TEXT PRIMARY KEY,
    coach_id TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    revoked INTEGER DEFAULT 0
  );

  -- Coach <-> client messaging relay. Rides the same E2EE trust model as
  -- sync_payloads: the server stores and forwards opaque ciphertext only.
  CREATE TABLE IF NOT EXISTS message_relay (
    id TEXT PRIMARY KEY,
    coach_id TEXT,
    client_id TEXT,
    direction TEXT,             -- 'coach' or 'client' — who sent it
    encrypted_payload TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Proactive reminders, poll-based (no APNs/FCM wiring here — a client's
  -- Companion app polls /reminders/due when opened and shows anything due).
  CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    coach_id TEXT,
    client_id TEXT,
    encrypted_payload TEXT,
    send_at DATETIME,
    sent INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Web Push subscriptions (S13). The pushed payload is metadata only
  -- ("new message") — message content stays E2EE and is fetched by the app
  -- itself; the browser push service never carries anything readable.
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    client_id TEXT,
    coach_id TEXT,
    subscription TEXT,          -- full PushSubscription JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Tiny operator key/value store (currently: auto-generated VAPID keys).
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  -- WebRTC signalling mailbox (docs/plans/01-CONNECTIVITY.md §6.4).
  --
  -- This is the ONE part of the P2P path that is not end-to-end encrypted,
  -- because it fundamentally cannot be: it is how two devices that have never
  -- met on the network exchange "here is how to reach me". It carries SDP and
  -- ICE candidates and NOTHING ELSE — never a training payload. The app
  -- enforces that on both sides (see lib/sync/p2pProtocol.ts's validator,
  -- which rejects an offer whose payload isn't SDP), and the size cap below
  -- is the server's own version of the same refusal.
  --
  -- Rows are consumed on read and swept aggressively: a signalling message is
  -- worthless within seconds of being written, so keeping it is pure risk.
  CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coach_id TEXT,
    to_device TEXT,
    from_device TEXT,
    session TEXT,
    kind TEXT,                  -- 'offer' | 'answer' | 'ice'
    payload TEXT,
    sdp_mid TEXT,
    sdp_mline_index INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_signals_to ON signals (coach_id, to_device, id);

  -- $29/mo membership subscriptions (S15). One row per coach who has ever
  -- checked out — status tracks Stripe's own subscription status verbatim
  -- rather than a boolean, so "active", "past_due" (grace period, see
  -- isActiveSubscriptionStatus below) and "canceled" are all distinguishable
  -- without a second lookup. The server never mints a token past what
  -- Stripe currently reports here — this table, not the app, is the source
  -- of truth for "is this subscription real right now".
  CREATE TABLE IF NOT EXISTS memberships (
    coach_id TEXT PRIMARY KEY,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT UNIQUE,
    status TEXT,
    current_period_end DATETIME,
    name TEXT,
    secret_hash TEXT,           -- sha256 of the coach device's membership secret (see membershipSecretMatches)
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`)

// Migration: memberships predates secret_hash on any instance that ran S15's
// schema. Old rows keep a NULL hash and are refused by /status and /portal
// until the coach checks out again — no live keys ever shipped with S15's
// schema, so no real member can be stranded by this.
if (!(db.prepare(`PRAGMA table_info(memberships)`).all() as { name: string }[]).some(c => c.name === 'secret_hash')) {
  db.exec(`ALTER TABLE memberships ADD COLUMN secret_hash TEXT`)
}

// ---- Membership persistence ----
function upsertMembership(m: {
  coachId: string; stripeCustomerId: string; stripeSubscriptionId: string
  status: string; currentPeriodEnd: number | undefined; name: string; secretHash: string | null
}) {
  db.prepare(`
    INSERT INTO memberships (coach_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, name, secret_hash, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(coach_id) DO UPDATE SET
      stripe_customer_id = excluded.stripe_customer_id,
      stripe_subscription_id = excluded.stripe_subscription_id,
      status = excluded.status,
      current_period_end = excluded.current_period_end,
      name = excluded.name,
      secret_hash = excluded.secret_hash,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    m.coachId, m.stripeCustomerId, m.stripeSubscriptionId, m.status,
    m.currentPeriodEnd ? new Date(m.currentPeriodEnd * 1000).toISOString() : null,
    m.name, m.secretHash,
  )
}

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

/** A coach's device id is NOT a secret — every paired client device holds it
 *  (it's the coachId on every relay call Companion makes). So "knows the
 *  coachId" can't be the gate for anything billing-related: before this,
 *  any paired client could open the coach's Stripe billing portal (cancel
 *  their subscription, see their billing email) with one unauthenticated
 *  POST. The app generates a random secret once, sends it at checkout (only
 *  its hash is stored — in Stripe metadata and here), and presents it on
 *  every later /status and /portal call. */
function membershipSecretMatches(row: { secret_hash: string | null }, presented: unknown): boolean {
  if (!row.secret_hash || typeof presented !== 'string' || !presented) return false
  const a = Buffer.from(sha256Hex(presented), 'hex')
  const b = Buffer.from(row.secret_hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

// ---- Web Push (VAPID) setup ----
// Keys come from env when the operator sets them; otherwise generated once
// and persisted in kv so restarts keep the same identity (changing VAPID
// keys silently invalidates every existing subscription).
function vapidKeys(): { publicKey: string; privateKey: string } {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
  }
  const row = db.prepare(`SELECT value FROM kv WHERE key = 'vapid'`).get() as { value: string } | undefined
  if (row) return JSON.parse(row.value)
  const generated = webpush.generateVAPIDKeys()
  db.prepare(`INSERT INTO kv (key, value) VALUES ('vapid', ?)`).run(JSON.stringify(generated))
  console.log('Generated new VAPID keypair (persisted in kv).')
  return generated
}
const vapid = vapidKeys()
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:ops@coachwright.app', vapid.publicKey, vapid.privateKey)

/** Fire-and-forget metadata-only push to every subscription a client holds.
 *  410/404 responses mean the subscription is dead — prune it. */
function pushToClient(clientId: string, payload: { title: string; body: string }) {
  const subs = db.prepare(`SELECT endpoint, subscription FROM push_subscriptions WHERE client_id = ?`).all(clientId) as { endpoint: string; subscription: string }[]
  for (const s of subs) {
    webpush.sendNotification(JSON.parse(s.subscription), JSON.stringify(payload)).catch((err: { statusCode?: number }) => {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).run(s.endpoint)
      }
    })
  }
}

// ---- Retention sweep ----
// Relayed ciphertext is a delivery buffer, not an archive — both real
// databases live on the two devices. Sweep old rows so a managed instance's
// disk (and blast radius) stays bounded. Runs at boot and daily.
const RETENTION_DAYS = Number(process.env.RELAY_RETENTION_DAYS || 90)
function retentionSweep() {
  const cutoff = `-${RETENTION_DAYS} days`
  const msgs = db.prepare(`DELETE FROM message_relay WHERE created_at < datetime('now', ?)`).run(cutoff).changes
  const rems = db.prepare(`DELETE FROM reminders WHERE sent = 1 AND created_at < datetime('now', ?)`).run(cutoff).changes
  if (msgs || rems) console.log(`Retention sweep: pruned ${msgs} messages, ${rems} sent reminders older than ${RETENTION_DAYS}d.`)
}

// Signalling rows are swept on a completely different clock — minutes, not
// days. An SDP offer is useless once its connection attempt is over, so an
// old row is pure liability: it's the only data here that isn't ciphertext.
const SIGNAL_TTL_MINUTES = Number(process.env.RELAY_SIGNAL_TTL_MINUTES || 5)
function signalSweep() {
  db.prepare(`DELETE FROM signals WHERE created_at < datetime('now', ?)`).run(`-${SIGNAL_TTL_MINUTES} minutes`)
}
signalSweep()
setInterval(signalSweep, 60 * 1000).unref()
retentionSweep()
setInterval(retentionSweep, 24 * 60 * 60 * 1000).unref()

// Migration: rebuild sync_payloads if it predates the composite (id, type)
// primary key — an old single-column-PK table would silently let a coach's
// outbound packet overwrite the client's inbound one under the same id.
{
  const pkCols = (db.prepare(`PRAGMA table_info(sync_payloads)`).all() as { name: string; pk: number }[])
    .filter(c => c.pk > 0)
  if (pkCols.length === 1) {
    db.exec(`
      BEGIN;
      ALTER TABLE sync_payloads RENAME TO sync_payloads_old;
      CREATE TABLE sync_payloads (
        id TEXT, type TEXT, coach_id TEXT, encrypted_payload TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id, type)
      );
      INSERT OR IGNORE INTO sync_payloads SELECT * FROM sync_payloads_old;
      DROP TABLE sync_payloads_old;
      COMMIT;
    `)
    console.log('Migrated sync_payloads to composite (id, type) primary key.')
  }
}

// ---- Auth ----
// Two modes, both supported at once:
//  1. Legacy single shared key (process.env.API_KEY) — self-hosted,
//     single-tenant. No cross-coach scoping is enforced (there's only one
//     coach on the box), matching the trust model this shipped with.
//  2. Per-coach keys (api_keys table) — the managed multi-tenant instance.
//     Sets req.coachId so handlers can refuse cross-tenant reads/writes.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { coachId?: string }
  }
}

const findKeyStmt = db.prepare('SELECT coach_id FROM api_keys WHERE key = ? AND revoked = 0')

function requireApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  const apiKey = req.headers['x-api-key']
  if (typeof apiKey !== 'string') return res.status(401).json({ error: 'Unauthorized' })

  const sharedKey = process.env.API_KEY
  if (sharedKey && apiKey === sharedKey) return next() // legacy single-tenant

  const row = findKeyStmt.get(apiKey) as { coach_id: string } | undefined
  if (row) { req.coachId = row.coach_id; return next() }

  return res.status(401).json({ error: 'Unauthorized' })
}

/** When authenticated via a per-coach key, refuse to touch another coach's data. */
function assertOwnsCoach(req: express.Request, coachId: string | undefined): boolean {
  return !req.coachId || req.coachId === coachId
}

function requireAdminKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  const adminKey = req.headers['x-admin-key']
  if (!process.env.ADMIN_KEY || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

// ---- Key provisioning (operator-only) ----
app.post('/keys/register', requireAdminKey, (req, res) => {
  const { coachId } = req.body
  if (!coachId) return res.status(400).json({ error: 'Missing coachId' })

  const existing = db.prepare('SELECT key FROM api_keys WHERE coach_id = ? AND revoked = 0').get(coachId) as { key: string } | undefined
  if (existing) return res.json({ success: true, apiKey: existing.key })

  const key = randomBytes(24).toString('hex')
  db.prepare('INSERT INTO api_keys (key, coach_id) VALUES (?, ?)').run(key, coachId)
  res.json({ success: true, apiKey: key })
})

app.post('/keys/revoke', requireAdminKey, (req, res) => {
  const { coachId } = req.body
  if (!coachId) return res.status(400).json({ error: 'Missing coachId' })
  db.prepare('UPDATE api_keys SET revoked = 1 WHERE coach_id = ?').run(coachId)
  res.json({ success: true })
})

// ---- Device sync (existing) ----
const syncRouter = express.Router()
syncRouter.use(requireApiKey)

// Push an encrypted payload to the server
syncRouter.post('/push', (req, res) => {
  const { id, type, coachId, encryptedPayload } = req.body

  if (!id || !type || !coachId || !encryptedPayload) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  if (!assertOwnsCoach(req, coachId)) return res.status(403).json({ error: 'Forbidden' })

  const stmt = db.prepare(`
    INSERT INTO sync_payloads (id, type, coach_id, encrypted_payload, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id, type) DO UPDATE SET
      encrypted_payload = excluded.encrypted_payload,
      updated_at = CURRENT_TIMESTAMP
  `)

  try {
    stmt.run(id, type, coachId, encryptedPayload)
    res.json({ success: true })
  } catch (err: any) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// Coach pulls all their clients' payloads. Registered BEFORE /pull/:type/:id:
// Express matches in order, and that route would otherwise swallow this path
// as type='clients' and answer an empty payload — which it did until S22.
syncRouter.get('/pull/clients/:coachId', (req, res) => {
  const { coachId } = req.params
  if (!assertOwnsCoach(req, coachId)) return res.status(403).json({ error: 'Forbidden' })

  const stmt = db.prepare(`SELECT id, encrypted_payload FROM sync_payloads WHERE coach_id = ? AND type = 'client'`)
  const rows = stmt.all(coachId) as any[]

  const payloads: Record<string, string> = {}
  for (const row of rows) {
    payloads[row.id] = row.encrypted_payload
  }

  res.json({ success: true, payloads })
})

// Pull an encrypted payload from the server
// Type: 'coach' (clients pull this) or 'client' (coach pulls this)
// For 'client', id = clientId. For 'coach', id = coachId.
syncRouter.get('/pull/:type/:id', (req, res) => {
  const { type, id } = req.params

  const stmt = db.prepare(`SELECT encrypted_payload, coach_id FROM sync_payloads WHERE id = ? AND type = ?`)
  const row = stmt.get(id, type) as any

  if (row) {
    if (!assertOwnsCoach(req, row.coach_id)) return res.status(403).json({ error: 'Forbidden' })
    res.json({ success: true, encryptedPayload: row.encrypted_payload })
  } else {
    // Return empty state if no payload found
    res.json({ success: true, encryptedPayload: null })
  }
})

app.use('/sync', syncRouter)

// ---- Messaging relay ----
const messagesRouter = express.Router()
messagesRouter.use(requireApiKey)

messagesRouter.post('/push', (req, res) => {
  const { id, coachId, clientId, direction, encryptedPayload } = req.body
  if (!id || !coachId || !clientId || !direction || !encryptedPayload) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  if (direction !== 'coach' && direction !== 'client') {
    return res.status(400).json({ error: "direction must be 'coach' or 'client'" })
  }
  if (!assertOwnsCoach(req, coachId)) return res.status(403).json({ error: 'Forbidden' })

  try {
    db.prepare(`
      INSERT INTO message_relay (id, coach_id, client_id, direction, encrypted_payload)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).run(id, coachId, clientId, direction, encryptedPayload)
    // Coach → client messages wake the client's device via Web Push, if
    // they've subscribed. Metadata only — the ciphertext stays here until
    // the app itself pulls and decrypts it.
    if (direction === 'coach') {
      pushToClient(clientId, { title: 'Your coach', body: 'New message — open Companion to read it.' })
    }
    res.json({ success: true })
  } catch (err: any) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// `created_at` is SQLite's 'YYYY-MM-DD HH:MM:SS' (UTC, no zone); both apps
// send `since` as a JS ISO string ('YYYY-MM-DDTHH:MM:SS.sssZ'). Compared as
// raw strings, ' ' sorts before 'T', so every message from the same UTC day
// as `since` was silently never returned — a coach who'd sent anything today
// could not see any of today's replies. `datetime(?)` normalizes the input;
// `>=` (second resolution, the column has no millis) can re-return a message
// from the boundary second, which both callers already dedupe by id.
function sqliteToIso(s: string): string {
  return new Date(s.replace(' ', 'T') + 'Z').toISOString()
}

// for=coach → messages the coach still needs (ones the client sent).
// for=client → messages the client still needs (ones the coach sent).
messagesRouter.get('/pull', (req, res) => {
  const { coachId, clientId, since, for: forWhom } = req.query as Record<string, string>
  if (!coachId || !clientId || !forWhom) return res.status(400).json({ error: 'Missing required query params' })
  if (!assertOwnsCoach(req, coachId)) return res.status(403).json({ error: 'Forbidden' })

  const wantDirection = forWhom === 'coach' ? 'client' : 'coach'
  const rows = db.prepare(`
    SELECT id, direction, encrypted_payload, created_at FROM message_relay
    WHERE coach_id = ? AND client_id = ? AND direction = ? AND created_at >= COALESCE(datetime(?), '1970-01-01')
    ORDER BY created_at ASC
  `).all(coachId, clientId, wantDirection, since || null) as any[]

  res.json({
    success: true,
    messages: rows.map(r => ({ id: r.id, direction: r.direction, encryptedPayload: r.encrypted_payload, createdAt: sqliteToIso(r.created_at) })),
  })
})

app.use('/messages', messagesRouter)

// ---- WebRTC signalling (docs/plans/01-CONNECTIVITY.md §6.4) ----
//
// Reuses this relay rather than adding a service: it already has per-coach
// keys and knows about pairings, so a self-hoster gets P2P for free with the
// relay they already run — which is the whole point of "it shouldn't matter
// whose server it is."
//
// What this is NOT: a data path. It carries connection details only. The
// payload cap and the SDP shape check below are the server refusing to be
// turned into one, independently of the client-side validator.
const signalRouter = express.Router()
signalRouter.use(requireApiKey)

/** A real SDP is a few KB. This is far above that and far below anything
 *  worth smuggling a training payload through. */
const MAX_SIGNAL_PAYLOAD = 64 * 1024

signalRouter.post('/send', (req, res) => {
  const { coachId, to, from, session, kind, payload, sdpMid, sdpMLineIndex } = req.body
  if (!coachId || !to || !from || !session || !kind || !payload) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  if (!assertOwnsCoach(req, coachId)) return res.status(403).json({ error: 'Forbidden' })
  if (kind !== 'offer' && kind !== 'answer' && kind !== 'ice') {
    return res.status(400).json({ error: "kind must be 'offer', 'answer' or 'ice'" })
  }
  if (typeof payload !== 'string' || payload.length > MAX_SIGNAL_PAYLOAD) {
    return res.status(413).json({ error: 'Signalling payload too large' })
  }
  // Offers and answers are SDP or they are something else pretending to be.
  if (kind !== 'ice' && !payload.startsWith('v=')) {
    return res.status(400).json({ error: 'Offer/answer payload must be SDP' })
  }

  try {
    db.prepare(`
      INSERT INTO signals (coach_id, to_device, from_device, session, kind, payload, sdp_mid, sdp_mline_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(coachId, to, from, session, kind, payload, sdpMid ?? null,
      typeof sdpMLineIndex === 'number' ? sdpMLineIndex : null)
    res.json({ success: true })
  } catch (err: any) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// Consumed on read: a signalling message is for exactly one attempt by
// exactly one device, and leaving it behind only creates a chance of it being
// replayed into a later attempt.
signalRouter.get('/poll', (req, res) => {
  const { coachId, deviceId } = req.query as Record<string, string>
  if (!coachId || !deviceId) return res.status(400).json({ error: 'Missing required query params' })
  if (!assertOwnsCoach(req, coachId)) return res.status(403).json({ error: 'Forbidden' })

  const rows = db.prepare(`
    SELECT id, from_device, to_device, session, kind, payload, sdp_mid, sdp_mline_index, created_at
    FROM signals WHERE coach_id = ? AND to_device = ? ORDER BY id ASC LIMIT 200
  `).all(coachId, deviceId) as any[]

  if (rows.length) {
    db.prepare(`DELETE FROM signals WHERE id IN (${rows.map(() => '?').join(',')})`).run(...rows.map(r => r.id))
  }

  res.json({
    success: true,
    messages: rows.map(r => ({
      kind: r.kind,
      from: r.from_device,
      to: r.to_device,
      session: r.session,
      payload: r.payload,
      ...(r.sdp_mid !== null ? { sdpMid: r.sdp_mid } : {}),
      ...(r.sdp_mline_index !== null ? { sdpMLineIndex: r.sdp_mline_index } : {}),
      createdAt: sqliteToIso(r.created_at),
    })),
  })
})

// Is anyone trying to reach this device? Answers WITHOUT consuming, because
// /poll deliberately consumes on read and the offer has to still be there for
// the handshake that follows. Returns only the session id — enough to decide
// "someone is calling", nothing more.
signalRouter.get('/peek', (req, res) => {
  const { coachId, deviceId } = req.query as Record<string, string>
  if (!coachId || !deviceId) return res.status(400).json({ error: 'Missing required query params' })
  if (!assertOwnsCoach(req, coachId)) return res.status(403).json({ error: 'Forbidden' })

  const row = db.prepare(`
    SELECT session FROM signals
    WHERE coach_id = ? AND to_device = ? AND kind = 'offer'
    ORDER BY id DESC LIMIT 1
  `).get(coachId, deviceId) as { session?: string } | undefined

  res.json({ success: true, session: row?.session ?? null })
})

app.use('/signal', signalLimiter, signalRouter)

// ---- Reminders (poll-based — see table comment above) ----
const remindersRouter = express.Router()
remindersRouter.use(requireApiKey)

remindersRouter.post('/schedule', (req, res) => {
  const { id, coachId, clientId, encryptedPayload, sendAt } = req.body
  if (!id || !coachId || !clientId || !encryptedPayload || !sendAt) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  if (!assertOwnsCoach(req, coachId)) return res.status(403).json({ error: 'Forbidden' })

  db.prepare(`
    INSERT INTO reminders (id, coach_id, client_id, encrypted_payload, send_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      encrypted_payload = excluded.encrypted_payload,
      send_at = excluded.send_at,
      sent = 0
  `).run(id, coachId, clientId, encryptedPayload, sendAt)
  res.json({ success: true })
})

// Fetched reminders are marked sent immediately — this is a pull/poll model,
// not a push notification. The caller (Companion app) is responsible for
// actually surfacing them (in-app banner, Notification API if permitted).
remindersRouter.get('/due', (req, res) => {
  const { clientId, before } = req.query as Record<string, string>
  if (!clientId) return res.status(400).json({ error: 'Missing clientId' })

  // Scoped to the caller's coach when a per-coach key is in play: without
  // this, coach A's key could read — and, worse, mark as sent, so they were
  // never delivered — coach B's reminders for any client id it learned.
  const cutoff = before || new Date().toISOString()
  const rows = db.prepare(`
    SELECT id, encrypted_payload, send_at FROM reminders
    WHERE client_id = ? AND sent = 0 AND send_at <= ? AND (? IS NULL OR coach_id = ?)
  `).all(clientId, cutoff, req.coachId ?? null, req.coachId ?? null) as any[]

  if (rows.length) {
    const markSent = db.prepare('UPDATE reminders SET sent = 1 WHERE id = ?')
    const tx = db.transaction((ids: string[]) => { for (const id of ids) markSent.run(id) })
    tx(rows.map(r => r.id))
  }

  res.json({
    success: true,
    reminders: rows.map(r => ({ id: r.id, encryptedPayload: r.encrypted_payload, sendAt: r.send_at })),
  })
})

// Coach-side review list — does NOT mark anything sent.
remindersRouter.get('/upcoming', (req, res) => {
  const { coachId } = req.query as Record<string, string>
  if (!coachId) return res.status(400).json({ error: 'Missing coachId' })
  if (!assertOwnsCoach(req, coachId)) return res.status(403).json({ error: 'Forbidden' })

  const rows = db.prepare(`
    SELECT id, client_id, encrypted_payload, send_at, sent FROM reminders
    WHERE coach_id = ? AND sent = 0
    ORDER BY send_at ASC
  `).all(coachId) as any[]

  res.json({
    success: true,
    reminders: rows.map(r => ({ id: r.id, clientId: r.client_id, encryptedPayload: r.encrypted_payload, sendAt: r.send_at })),
  })
})

// Cancel a scheduled reminder that hasn't gone out yet. Scoped by coach_id in
// the WHERE clause as well as the ownership assert, so a valid key for coach A
// can't delete coach B's row even if it guesses the id.
remindersRouter.delete('/:id', (req, res) => {
  const { coachId } = req.query as Record<string, string>
  if (!coachId) return res.status(400).json({ error: 'Missing coachId' })
  if (!assertOwnsCoach(req, coachId)) return res.status(403).json({ error: 'Forbidden' })

  const changes = db.prepare('DELETE FROM reminders WHERE id = ? AND coach_id = ? AND sent = 0')
    .run(req.params.id, coachId).changes
  // Already sent or already gone — report it rather than pretending it worked,
  // so the coach isn't told a reminder was cancelled that the client will
  // still receive.
  if (!changes) return res.status(404).json({ error: 'No pending reminder with that id' })
  res.json({ success: true })
})

app.use('/reminders', remindersRouter)

// ---- Web Push subscription management ----
const pushRouter = express.Router()
pushRouter.use(requireApiKey)

pushRouter.get('/vapid', (_req, res) => {
  res.json({ success: true, publicKey: vapid.publicKey })
})

pushRouter.post('/subscribe', (req, res) => {
  const { clientId, coachId, subscription } = req.body
  if (!clientId || !subscription?.endpoint) return res.status(400).json({ error: 'Missing clientId or subscription' })
  if (!assertOwnsCoach(req, coachId)) return res.status(403).json({ error: 'Forbidden' })
  db.prepare(`
    INSERT INTO push_subscriptions (endpoint, client_id, coach_id, subscription)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET client_id = excluded.client_id, coach_id = excluded.coach_id, subscription = excluded.subscription
    WHERE ? IS NULL OR push_subscriptions.coach_id IS NULL OR push_subscriptions.coach_id = ?
  `).run(subscription.endpoint, clientId, coachId ?? null, JSON.stringify(subscription), req.coachId ?? null, req.coachId ?? null)
  res.json({ success: true })
})

pushRouter.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' })
  db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ? AND (? IS NULL OR coach_id = ?)`)
    .run(endpoint, req.coachId ?? null, req.coachId ?? null)
  res.json({ success: true })
})

app.use('/push', pushRouter)

// ---- Membership billing (S15) — self-serve, unlike the manual $15/mo relay
// provisioning above. No API key: these routes run against the official
// server regardless of which relay (if any) a coach uses. Authorization is
// the per-device membership secret instead (see membershipSecretMatches) —
// checkout binds it, /status and /portal require it. ----
const membershipRouter = express.Router()

membershipRouter.post('/checkout', async (req, res) => {
  if (!stripe || !process.env.STRIPE_PRICE_ID) {
    return res.status(503).json({ error: 'Membership billing is not configured on this instance' })
  }
  const { coachId, name, email, secret } = req.body
  if (!coachId) return res.status(400).json({ error: 'Missing coachId' })
  if (typeof secret !== 'string' || secret.length < 32) {
    return res.status(400).json({ error: 'Missing or too-short membership secret' })
  }
  const existing = db.prepare('SELECT status FROM memberships WHERE coach_id = ?').get(coachId) as { status: string } | undefined
  if (existing && isActiveSubscriptionStatus(existing.status)) {
    // A second checkout would start a second $29/mo subscription for the
    // same coach — refuse rather than double-bill.
    return res.status(409).json({ error: 'This device already has an active membership — use Manage billing instead.' })
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      client_reference_id: coachId,
      customer_email: typeof email === 'string' && email ? email : undefined,
      success_url: process.env.STRIPE_SUCCESS_URL || 'https://coachwright.app/membership/success',
      cancel_url: process.env.STRIPE_CANCEL_URL || 'https://coachwright.app/membership/cancelled',
      // Carried through to the customer record so a support lookup by name
      // is possible without ever storing it separately ourselves.
      // secretHash rides the session so the webhook can bind it; the raw
      // secret never leaves the coach's device and this request.
      metadata: { coachId, name: typeof name === 'string' ? name : '', secretHash: sha256Hex(secret) },
    })
    res.json({ success: true, url: session.url })
  } catch (err: any) {
    console.error('Checkout session creation failed:', err)
    res.status(500).json({ error: err.message })
  }
})

// The app polls this (on launch, and roughly daily) to refresh its signed
// token well before expiry. Always re-derives the token from this table's
// current `status`, never from whatever the app last had — a coach whose
// card failed is a `status` change here, and the very next poll reflects it,
// same latency as the webhook that wrote it.
membershipRouter.get('/status', async (req, res) => {
  const { coachId } = req.query as Record<string, string>
  if (!coachId) return res.status(400).json({ error: 'Missing coachId' })

  const row = db.prepare('SELECT * FROM memberships WHERE coach_id = ?').get(coachId) as
    | { coach_id: string; status: string; name: string; stripe_subscription_id: string; secret_hash: string | null }
    | undefined

  if (row && !membershipSecretMatches(row, req.headers['x-membership-secret'])) {
    return res.status(403).json({ error: 'Membership secret does not match this coach' })
  }
  if (!row || !isActiveSubscriptionStatus(row.status)) {
    return res.json({ success: true, active: false, reason: row ? `Subscription is ${row.status}` : 'No membership on file' })
  }

  const signingKey = loadSigningKey()
  if (!signingKey) {
    // Configuration error, not a billing one — the subscription IS active,
    // we just can't attest to it right now. Distinguished in the response so
    // the app can retry later rather than treating it as "not a member".
    return res.status(503).json({ error: 'Membership signing key is not configured on this instance' })
  }

  const issuedAt = new Date()
  const expiresAt = new Date(issuedAt.getTime() + MEMBERSHIP_TOKEN_LIFETIME_DAYS * 86_400_000)
  const claims: MembershipClaims = {
    name: row.name,
    subscriptionId: row.stripe_subscription_id,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  }
  const token = await signMembershipToken(claims, signingKey)
  res.json({ success: true, active: true, token, expiresAt: claims.expiresAt })
})

// Hands the coach off to Stripe's own hosted billing portal for
// cancel/card-update flows — per MANAGED_HOSTING.md's existing doctrine
// ("do not build a customer portal, Stripe's own portal handles card/cancel
// flows"), applied here to the automated tier too.
membershipRouter.post('/portal', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Membership billing is not configured on this instance' })
  const { coachId } = req.body
  if (!coachId) return res.status(400).json({ error: 'Missing coachId' })

  const row = db.prepare('SELECT stripe_customer_id, secret_hash FROM memberships WHERE coach_id = ?').get(coachId) as { stripe_customer_id: string; secret_hash: string | null } | undefined
  if (!row) return res.status(404).json({ error: 'No membership on file for this coach' })
  if (!membershipSecretMatches(row, req.headers['x-membership-secret'])) {
    return res.status(403).json({ error: 'Membership secret does not match this coach' })
  }

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: process.env.STRIPE_SUCCESS_URL || 'https://coachwright.app/membership/success',
    })
    res.json({ success: true, url: portalSession.url })
  } catch (err: any) {
    console.error('Billing portal session creation failed:', err)
    res.status(500).json({ error: err.message })
  }
})

app.use('/membership', membershipRouter)

// Unauthenticated liveness probe for the operator's monitoring — returns no
// data beyond "up" (see docs/MANAGED_HOSTING.md).
app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()) })
})

// Last-resort handler: a JSON 500 without the stack. Express's default
// handler renders the full trace (file paths included) in the response body
// whenever NODE_ENV isn't 'production', and nothing sets NODE_ENV here.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  const status = (err as { status?: number })?.status
  res.status(typeof status === 'number' && status >= 400 && status < 600 ? status : 500)
    .json({ error: status && status < 500 ? (err as Error).message : 'Internal server error' })
})

// Only listen when run as the entry point — the test suite imports `app`
// and binds its own ephemeral port.
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Coachwright Cloud Sync Server running on port ${port}`)
  })
}

export { db }

# MANAGED HOSTING — how we actually run the $15/mo relay

This is the operator's manual for the managed tier: what to deploy, what it costs us, how a coach gets
provisioned, and where the ceilings are. Written S13. It deliberately stays boring — the relay is a
store-and-forward buffer for ciphertext, and the whole design goal is that running it is a small,
low-stakes job. `SERVER_STRATEGY.md` §2.5 is the doctrine; this file is the runbook.

## 1. What the relay is NOT (sets every sizing decision below)

The relay never sees plaintext, never holds the system of record, and never does per-user compute. Every
row is a sealed AES-GCM blob a device will pick up later. Total loss of the relay's disk is an
inconvenience (clients re-push on next sync), not a data-loss event — both real databases live on the
coach's and client's own devices. Size and operate it like a message queue, not like a SaaS backend.

## 2. Reference deployment (one box, one binary, one domain)

- **Host:** any $5–8/mo VPS (Hetzner CX22 / Fly.io shared-1x / DigitalOcean basic). 1 vCPU, 1–2GB RAM is
  genuinely enough — see §5 capacity math.
- **Process:** `sync-server/` run under systemd (or Fly's supervisor): `npx tsx server.ts` is fine at this
  scale; compile with `tsc` + `node` if you want faster cold starts.
- **TLS:** Caddy in front (`relay.coachwright.app`), auto-Let's-Encrypt. TLS is not optional — Web Push
  subscription and the PWA's fetch calls both require HTTPS in production.
- **Storage:** the SQLite file (`coachwright.db`) on the box, with **Litestream** streaming replication to
  any S3-compatible bucket (~$1/mo). That's the whole backup story; restore = `litestream restore`.
- **Env (all of these exist in code today):**
  | Var | Purpose |
  |---|---|
  | `PORT` | listen port (Caddy proxies to it) |
  | `ADMIN_KEY` | gates `/keys/register` + `/keys/revoke` — long random string, never shared |
  | `API_KEY` | legacy single-tenant shared key — do NOT set on the managed instance; per-coach keys only |
  | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push identity. If unset the server generates and persists a pair in the `kv` table — fine, but back it up: rotating VAPID keys silently kills every existing push subscription |
  | `RELAY_RETENTION_DAYS` | ciphertext retention (default 90) — see §6 |
  | `TRUST_PROXY` | **set to `1`** — Caddy is in front. Unset, every coach's traffic arrives as `127.0.0.1` and shares ONE rate-limit bucket: 100 requests per 15 minutes for the entire instance |
  | `RATE_LIMIT_PER_15MIN` / `SIGNAL_RATE_LIMIT_PER_MIN` | per-IP budgets (defaults 100 / 400); signalling has its own because P2P setup polls every 700ms |
  | `DB_PATH` | SQLite location (default `./coachwright.db`) — point it at the Litestream-replicated path |
  | Stripe / `LICENCE_SIGNING_PRIVATE_JWK` / `MEMBERSHIP_TOKEN_LIFETIME_DAYS` | the $29/mo membership tier — see `MEMBERSHIP.md` §5 |
- **Monitoring:** `GET /health` (unauthenticated, returns `{ok, uptime}` and nothing else) wired to any
  uptime pinger (UptimeRobot free tier is enough). That plus disk-space alerting is the entire pager story.

## 3. Provisioning a coach (the honest, manual-first flow)

1. Coach pays through a **Stripe Payment Link** (subscription, $15/mo) — no payment code in any app,
   per `SERVER_STRATEGY.md` §3's bring-your-own-account doctrine.
2. Stripe emails the operator (or you check the dashboard). Run:
   `curl -X POST https://relay.coachwright.app/keys/register -H "x-admin-key: $ADMIN_KEY" -H "Content-Type: application/json" -d '{"coachId":"<their device id>"}'`
   (The `Content-Type` header is required — without it the body isn't parsed. Before S22 this command
   was printed without it and the server answered 500.)
   (their device id is shown on their Studio Link page; the key comes back in the response).
3. Send the coach their API key. They paste it once into Studio Link → Cloud Sync Server — and from S13
   onward their pairing QR carries it to clients automatically.
4. Churn = `/keys/revoke` (same curl, same gate). Their app falls back to WiFi/file sync gracefully —
   nothing breaks for existing data, because nothing of record ever lived on the relay.

At low volume this is minutes per month of work. **The upgrade path once volume justifies it** (not
before): a Stripe webhook endpoint on the same box that calls the same two admin routes automatically.
That's the entire "billing integration" — do not build a customer portal, Stripe's own portal handles
card/cancel flows.

## 4. Security posture (what a buyer should be told, verbatim-able)

- Everything stored is E2EE ciphertext sealed by device-held keys; the operator cannot read training
  data, messages, or programs, and neither can anyone who steals the disk.
- Per-coach API keys scope every read/write (`assertOwnsCoach`) — no cross-tenant path exists even on the
  shared instance.
- Web Push payloads are metadata only ("new message"); Google/Apple/Mozilla's push services carry nothing
  readable.
- What the relay DOES see and a coach should know: traffic metadata (which device ids sync with which,
  when, payload sizes) and push endpoints. Retention (§6) bounds how long even that exists.
- Current honest gaps, in priority order if this ever hardens further: API keys stored plaintext in
  SQLite (hash them like passwords once >50 coaches), no per-key rate limiting (global IP limit only),
  no request signing beyond the bearer key.

## 5. Capacity math (why one box is the right answer for a long time)

A coach's real traffic: a client sync is one ~10–100KB POST + two GETs, a few times a day, per client.
A 20-client coach ≈ a few hundred requests/day ≈ **well under one request/minute**. SQLite in WAL mode
handles thousands of writes/sec; the 5MB JSON body cap bounds the worst case. One small VPS comfortably
serves **hundreds of coaches**; the first real ceiling is operational (backup size, blast radius of one
box), not compute. When that day comes: second box + region split by coach, still SQLite — not a
database migration. Margin math: 100 coaches = $1,500/mo revenue against ~$10/mo infrastructure.

## 6. Retention (implemented, S13)

Relayed message ciphertext and delivered reminders are pruned after `RELAY_RETENTION_DAYS` (default 90)
— boot-time plus daily sweep, logged. Sync payloads are one-row-per-device upserts and self-bound.
Dead push subscriptions are pruned automatically on 404/410 push failures. Say this in marketing copy
plainly: "the relay holds your encrypted traffic only long enough to deliver it."

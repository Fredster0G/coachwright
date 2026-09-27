# SELF-HOSTING THE SYNC RELAY — a guide for a coach running their own box

`SERVER_STRATEGY.md` §2.5 names the self-hosted tier — "free, you run a small server yourself" — but
until now the only documentation for it was `sync-server/server.ts` itself. `MANAGED_HOSTING.md` is the
*operator's* runbook for Coachwright's own $15/mo shared instance (Stripe links, per-coach keys,
`relay.coachwright.app`) — none of that applies to you running your own box for yourself. This is the
guide that was missing: one coach, one server, no business logic.

**You don't need this at all to use Coachwright.** Fully local (file export/import, same-WiFi pairing) is
free forever and needs nothing below. Read this only if you want always-on sync/messaging from anywhere
and would rather run a $5/mo box than pay us $15/mo to run it for you.

## 1. What you're standing up

One small Node process (`sync-server/`) that stores and forwards **end-to-end-encrypted ciphertext only**
— it never sees a client's name, a program, a message, anything readable. Total loss of this box is an
inconvenience (everyone re-syncs), not a data-loss event: the real databases live on your devices and your
clients' devices, same as the fully-local tier. Size expectations accordingly — this is not a database you
need to babysit.

## 2. What you need

- A cheap VPS (Hetzner CX22, DigitalOcean's $6/mo droplet, Fly.io's free/shared tier) **or** a spare
  Raspberry Pi on your own network if you don't need clients to sync from outside your WiFi.
- Node 20+ installed on it.
- A domain (or subdomain) pointed at the box, if you want it reachable outside your LAN — Web Push and the
  Companion PWA's `fetch` calls both require HTTPS in production, not just a bare IP.

## 3. Get the code and install

```bash
git clone <your fork or copy of this repo> coachwright
cd coachwright/strongsuit-v0.1/sync-server
npm install
```

## 4. Configure

Create `sync-server/.env`:

```bash
PORT=4000
# One long random string — this is the ONE password protecting every coach
# using this box. Generate it once, keep it secret, never commit it.
# `openssl rand -hex 24` or `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`
API_KEY=<paste a long random string here>
```

That's the minimum. Everything else is optional:

| Var | Default if unset | When to set it |
|---|---|---|
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Auto-generated on first boot, persisted in the SQLite `kv` table | Only if you're moving the box (a fresh keypair silently invalidates every client's existing Web Push subscription — carry the old one forward instead of letting it regenerate) |
| `RELAY_RETENTION_DAYS` | `90` | Lower it if you'd rather ciphertext get swept sooner; it's a delivery buffer, not an archive either way |
| `RELAY_SIGNAL_TTL_MINUTES` | `5` | Rarely worth touching — this is WebRTC connection-setup data, useless within seconds |
| `TRUST_PROXY` | unset (trust nobody) | **Set to `1` as soon as you put Caddy/nginx in front (§6).** Otherwise every request appears to come from `127.0.0.1` and the rate limiter below treats all your devices as one caller |
| `RATE_LIMIT_PER_15MIN` | `100` | Per-IP budget for everything except signalling, `/health` and the Stripe webhook |
| `SIGNAL_RATE_LIMIT_PER_MIN` | `400` | Per-IP budget for WebRTC signalling, which polls every 700ms during a connection attempt |
| `DB_PATH` | `coachwright.db` in the working directory | Put the database on a mounted volume / backup path |

**Do not set `ADMIN_KEY`.** That gates `/keys/register`/`/keys/revoke`, the *multi-tenant* provisioning
routes for a shared managed instance serving many coaches under separate keys. You're the only coach on
this box — `API_KEY` alone (the "legacy single shared key" path `server.ts` already supports) is the right
mode, and leaving `ADMIN_KEY` unset means those two routes simply 401 for anyone who tries them, which is
correct here.

## 5. Run it

Quick check it works at all:

```bash
npx tsx server.ts
# Coachwright Cloud Sync Server running on port 4000
```

For always-on, a systemd unit (`/etc/systemd/system/coachwright-relay.service`):

```ini
[Unit]
Description=Coachwright sync relay
After=network.target

[Service]
WorkingDirectory=/path/to/coachwright/strongsuit-v0.1/sync-server
ExecStart=/usr/bin/npx tsx server.ts
Restart=on-failure
EnvironmentFile=/path/to/coachwright/strongsuit-v0.1/sync-server/.env
User=coachwright

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now coachwright-relay
sudo systemctl status coachwright-relay   # confirm it's running
curl localhost:4000/health                # {"ok":true,"uptime":N}
```

On a Raspberry Pi staying on your own LAN, this is the whole setup — skip straight to step 7 with your
Pi's local IP.

## 6. Put HTTPS in front of it (skip this for LAN-only)

Any reverse proxy with automatic Let's Encrypt works; Caddy needs the least configuration. A `Caddyfile`:

```
relay.yourdomain.com {
    reverse_proxy localhost:4000
}
```

```bash
sudo caddy run
```

Then add `TRUST_PROXY=1` to `.env` and restart the relay — see the table in §4.

That's it — Caddy handles the certificate and renewal on its own.

## 7. Point Coachwright at it

In the coach app: **Settings → Hosting & sync → Self-hosted relay**, enter your server's URL
(`https://relay.yourdomain.com`, or `http://<pi's LAN IP>:4000` for LAN-only) and the `API_KEY` you
generated in step 4. From then on, pairing a client's Companion app carries the same URL and key to them
automatically — nobody has to type it in twice.

## 8. Back it up

Everything lives in one file: `sync-server/coachwright.db` (SQLite). It's a delivery buffer, not a system
of record — see §1 — so backing it up is a nice-to-have (smoother recovery after a crash) rather than the
thing standing between you and data loss. Simplest approach, a nightly cron job:

```bash
0 3 * * * sqlite3 /path/to/coachwright.db ".backup /path/to/backups/coachwright-$(date +\%F).db"
```

(`MANAGED_HOSTING.md` §2 uses Litestream for continuous off-box replication if you want something fancier
than a nightly copy — entirely optional at this scale.)

## 9. Updating

```bash
cd coachwright && git pull
cd strongsuit-v0.1/sync-server && npm install
sudo systemctl restart coachwright-relay
```

The database schema migrates itself on boot (`server.ts` runs its `CREATE TABLE IF NOT EXISTS` block and
one composite-key migration check every start) — no separate migration step to remember.

## 10. What running this box does and doesn't expose

- You (and anyone with shell access to the box) can see **traffic metadata**: which device ids are
  syncing, when, and how large the encrypted payloads are. You cannot see client names, programs,
  messages, or anything else — it's sealed ciphertext, not readable data, by construction.
- Web Push subscriptions are stored so the relay knows *where* to deliver a "new message" ping — the ping
  itself carries no message content.
- If this box is ever compromised, the honest exposure is that metadata plus whichever `API_KEY` is in the
  `.env` file — rotate the key (update `.env`, restart, re-paste the new key into Coachwright on every
  device) and the old key stops working immediately. No client data needs re-keying, since none of it ever
  lived here unencrypted.

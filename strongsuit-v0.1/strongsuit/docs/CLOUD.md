# CLOUD — how Coachwright's backend works, and how to run it

Written S23 (2026-09-27), when Coachwright moved from local-first + optional E2EE relay to **cloud
accounts**. This is the one canonical backend doc; `MANAGED_HOSTING.md` and `SELF_HOSTING.md` now point
here.

## 1. The shape, in one picture

```
 Coach desktop app (Electron) ─┐                         ┌─ Companion (client's phone, PWA)
 Coach web app (VITE_TARGET=web)├── HTTPS ── Coachwright Cloud ── HTTPS ──┘   /client/* with a
   both: local IndexedDB cache  │            sync-server/server.ts            client-scoped token
   + lib/cloud/syncEngine.ts ───┘            Express + one SQLite file
```

- **The account is the source of truth.** Every coach install is a cache of it. Sign in anywhere and it's
  all there; the app keeps working through a dropped connection and uploads when it's back.
- **One codebase, two coach builds.** `npm run build` (desktop/full) and `npm run build:web` (the website —
  identical except all on-device AI is removed: assistant, voice logging, OCR, semantic search, check-in
  digest; the AI runtimes are aliased to stubs so ~23MB of wasm never ships). Film Room pose tracking is
  in both.
- **Companion** connects with a one-time code the coach creates (client page → Connect Companion). The code
  becomes a token that can only read that client's programs/exercises/messages/reminders and add that
  client's own logs, check-ins, metrics and messages.

## 2. Sync model (`strongsuit/src/lib/cloud/`)

| Piece | What it does |
|---|---|
| `tables.ts` | `SYNCED_TABLES` — must match `SYNC_TABLES` in `server.ts`. Device-only trainer fields (`membershipActive`, `membershipExpiresAt`) are never uploaded. |
| `syncEngine.ts` | Dexie `creating/updating/deleting` hooks mark `(table,id)` dirty in localStorage (synchronously, so a crash loses nothing). Push sends the current row or a tombstone; pull fetches everything past a `seq` cursor. Remote writes run in tagged transactions the hooks ignore, so pulls never echo back. |
| conflicts | Last-write-wins on each row's own `updatedAt` — decided by the server on push and by `mergeIncoming()` on pull (a newer, still-dirty local row is kept). |
| `linkDevice()` | First sign-in on a device: if the account has data, the device becomes a copy of it (local rows cleared — the sign-in screen warns and offers a backup first). If the account is empty and the device was never linked to another account, local data is uploaded. A device linked to account A **never** uploads into account B. |
| cadence | Push 1.5s after a local write; full sync every 30s while visible, on focus, and when the network returns. Companion syncs on open/focus/online, throttled to 15 min, plus its "Sync now" button. |

**Things that bypass the hooks and therefore don't sync:** `Table.clear()`. Use
`table.toCollection().delete()` if a deletion must reach the cloud (backup "replace" restore does).

Exercises sync in full (~1,100 rows, ~1MB per account, once): seed ids are random per install, so a second
device must receive the first device's ids or its programs would point at nothing.

## 3. API (`sync-server/server.ts`)

| Route | Auth | Purpose |
|---|---|---|
| `POST /auth/signup`, `/auth/login` | — (20 req/15min/IP) | returns a bearer token; passwords are scrypt, tokens stored as sha256 |
| `POST /auth/logout`, `GET /auth/me`, `POST /auth/password` | coach | password change signs out other devices |
| `POST /auth/reset/request`, `/auth/reset/confirm` | — (auth-rate-limited) | emails a one-time link (sha256-stored, 1 hour, newest only); same answer for unknown emails; confirming signs out every device and signs this one in |
| `DELETE /auth/account` | coach + password | cancels a live Stripe subscription (nothing is deleted if that fails), then erases the account — every table cascades from `accounts`. The app then clears the device |
| `POST /data/push`, `GET /data/pull?since=N` | coach | ≤500 changes per push; pull pages 1,000 at a time. Push also returns `refused` — clients over the free cap (`MEMBERSHIP.md` §4) |
| `POST /invites`, `DELETE /invites/:clientId` | coach | connect code (8 chars, single use, 7 days) / disconnect every Companion for a client |
| `POST /client/redeem` | — (auth-rate-limited) | code → client token |
| `GET /client/bundle`, `POST /client/push`, `GET /client/reminders/due`, `/client/push/*` | client | Companion's whole surface |
| `POST/GET/DELETE /reminders` | coach | released to Companion on its next check-in after `sendAt` |
| `/membership/checkout`, `/status`, `/portal` | coach | Stripe, keyed by account — see `MEMBERSHIP.md` |
| `POST /membership/webhook` | Stripe signature | |
| `GET /health` | — | `{ok, uptime}` only |

Tests: `cd sync-server && npm test` (27 HTTP tests). The app's sync engine and Companion's sync code each
have integration tests that start this real server in-process (`lib/cloud/syncEngine.test.ts`,
`companion-app/src/features/sync/companionSyncApi.test.ts`).

## 4. Running it (operator runbook)

One small VPS is the whole deployment. Nothing below needs a real key to try in test mode.

1. **Box:** any 1 vCPU / 1–2GB Linux VPS with Node 22 (~$5–6/mo at Hetzner/DigitalOcean).
   `cd sync-server && npm ci && npm test`.
2. **TLS:** Caddy in front (`api.coachwright.app { reverse_proxy localhost:4000 }`) — automatic HTTPS.
3. **Env** (`sync-server/.env`):
   ```
   PORT=4000
   TRUST_PROXY=1                       # Caddy is in front — required, or rate limits are global
   DB_PATH=/var/lib/coachwright/coachwright.db
   STRIPE_SECRET_KEY=sk_live_...       # see MEMBERSHIP.md §5
   STRIPE_PRICE_ID=price_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_SUCCESS_URL=https://coachwright.app/membership/success
   STRIPE_CANCEL_URL=https://coachwright.app/membership/cancelled
   POSTMARK_SERVER_TOKEN=...           # password-reset email; without it nothing is sent (see below)
   MAIL_FROM=Coachwright <support@coachwright.app>   # a Postmark-verified sender
   APP_URL=https://app.coachwright.app # where the web app lives; reset links point here
   # optional: VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT (else generated once, kept in the DB),
   # RATE_LIMIT_PER_15MIN (600), AUTH_RATE_LIMIT_PER_15MIN (20), MEMBERSHIP_GRACE_DAYS (7),
   # LICENCE_PUBLIC_JWK (defaults to the key the app embeds — leave it)
   ```
   **Email:** one HTTPS call to Postmark per reset — no SDK, no SMTP (Postmark has a small free tier;
   paid plans from roughly $15/mo — check current pricing). Unconfigured, a reset request still answers
   normally; in production the server logs that it couldn't send (never the link), in development it
   prints the whole email so the link can be clicked. Until Postmark is set up, a locked-out coach is a
   manual job: set a new scrypt hash in `accounts` by hand.
4. **Backups:** Litestream streaming the SQLite file to any S3-compatible bucket (~$1/mo). Restore =
   `litestream restore`. **This is now the only copy of every coach's data that isn't on their own
   devices — do not skip it.**
5. **Process:** systemd unit running `npx tsx server.ts` (or `tsc` + `node`), `Restart=always`.
6. **Point the apps at it:** build with `VITE_CLOUD_URL=https://api.coachwright.app` (that URL is also the
   production default in `lib/cloud/config.ts` and `companion-app/src/lib/cloud.ts`).
7. **Monitoring:** uptime check on `/health`, disk-space alert.

**Cost, honestly:** ~$7–8/mo fixed (VPS + backup bucket), plus a domain. SQLite on one box is
comfortable into the thousands of coaches; it has **not been load-tested** here. The largest per-coach
cost is progress photos, stored as resized data URLs inside rows (DEBT-77).

## 5. What changed for privacy — said plainly

Before S23 the server only ever saw ciphertext. **Now it stores coach and client data readable by the
operator** (it has to: the web app and every signed-in device read it). Transport is HTTPS; passwords are
scrypt-hashed; access is per account, per client token. Cycle-tracking data still never leaves the
client's phone (`companion-app/src/features/sync/cyclePrivacy.test.ts` enforces it). The in-app EULA's
storage/privacy clauses were rewritten to match — **a lawyer should read them and a privacy policy should
exist before launch** (DEBT-75).

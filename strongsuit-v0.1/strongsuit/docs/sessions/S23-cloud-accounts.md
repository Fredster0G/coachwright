# S23 — cloud accounts, web build, DEBT-68

**Tool:** Claude Code · **Date:** 2026-09-27
**Tests:** app 655/655 · companion 107/107 · sync-server 21/21 · **Typecheck:** all clean (`tsc -b --force` app + companion, electron, server `tsc --noEmit`) · lint:tailwind 0 errors · oxlint 0 · no import cycles

## Asked
"Fix DEBT-68 food entries in client portability, also make it all cloud based. There will be a software
version and one that's a website. The website version will not have any tracking AI etc. Be reasonable and
cost effective. Get rid of those weird offline things." Decisions confirmed with Caleb: account + local
cache; extend existing sync-server; remove WiFi/LAN/file/P2P sync, E2EE pairing + self-host, offline SW,
offline membership tokens; web build drops all local AI (Film Room tracking stays).

## Shipped
- **DEBT-68 closed** — `db/portability.ts` exports food entries + exactly the FoodItems they reference;
  import re-keys both and reuses a destination item with the same barcode. 4 new tests incl. round-trip.
- **Coachwright Cloud** (`sync-server/server.ts`, rewritten): scrypt accounts + sha256-stored bearer
  sessions, generic row sync (LWW by `updatedAt`, `seq` cursor, tombstones, paging), connect codes →
  client-scoped tokens, `/client/*` for Companion (writes forced onto its client), plaintext reminders,
  Web Push, Stripe membership keyed by account. 21 HTTP tests.
- **Coach app** (`src/lib/cloud/`): sign-in screen gating boot, Dexie-hook dirty tracking, push/pull loop,
  `linkDevice()` rules (download / upload / never mix accounts), Account & sync page, Connect Companion
  dialog, messages + reminders through the account. Integration test runs the real engine against the
  real server in-process (7 tests).
- **Removed**: `features/sync/`, `lib/sync*`, `lib/cloudCapability.ts`, CloudCard, devices + syncConflicts
  tables (Dexie v14), Electron LAN server + preload APIs, offline SW (replaced by a self-unregistering
  one), membership token signing, `express`/`cors`/`qrcode.react`/`html5-qrcode` deps, ~110 dead strings.
- **Companion**: connect-code flow replaces pairing/QR/P2P/LAN/file; push via cloud; SW keeps push only.
  4 integration tests against the real server (added `fake-indexeddb` devDep).
- **Web build**: `dev:web`/`build:web`; `LOCAL_AI_ENABLED` hides every AI surface; transformers.js and
  tesseract.js aliased to stubs → main JS 974KB → 456KB, no 23MB ort wasm, no tesseract assets.
- **Live-verified in Chromium** (server + app + Companion running): sign-up → client → connect code →
  Companion connects → messages both ways → second browser signs in and sees the client. 0 console
  errors, 0 off-origin requests. Web vs desktop: AI surfaces absent/present as intended.
- **Docs**: new `docs/CLOUD.md`; rewrote HOW-TO-OWN-IT, MEMBERSHIP §1/§4/§5, STATUS, ROADMAP §0/§1/§5,
  AGENTS §2/§5/§7, in-app Guide + onboarding copy, EULA §3/§4; pointer-ised MANAGED/SELF_HOSTING;
  superseded banners on SERVER_STRATEGY, CLIENT_APP_STRATEGY, ANDROID_STRATEGY, PRODUCT_OVERVIEW.

## Closed debt
68, 71 (membership now on the account), 54 (LAN loop gone), 62 (no caching SW), 49 (no PWA plugin needed).

## Didn't do / couldn't
- Not deployed — no VPS/domain/keys (Caleb). Not load-tested.
- No password reset / account deletion / server-side free cap (DEBT-73/76/74).
- EULA privacy text rewritten but not legally reviewed; no privacy policy (DEBT-75, 🔴).
- Didn't rewrite strategy/marketing docs or PRODUCT_OVERVIEW §8 — banners only (DEBT-79/72).

## New debt
`DEBT-73` password reset · `74` server-side free cap · `75` privacy/legal 🔴 · `76` account deletion ·
`77` photos as data URLs · `78` web `/assistant` error page · `79` old tiers in strategy docs

## For the next session
Deploy (ROADMAP §1.1) — without a server nobody can sign in. Then §1.1b account basics.

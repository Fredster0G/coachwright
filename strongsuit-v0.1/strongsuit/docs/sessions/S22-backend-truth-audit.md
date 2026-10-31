# S22 — backend + docs truth audit

**Tool:** Claude Code · **Date:** 2026-09-27
**Tests:** app 740/740 · companion 153/153 · sync-server 16/16 (new) · **Typecheck:** all three clean (`tsc -b --force` ×2, `tsc --noEmit` server) · lint:tailwind 0 errors · oxlint 0 errors

## Asked
"Finish all of the backend and documentation and find where it lied and diagnose and fix it."

## Shipped — code that was wrong (each reproduced, then fixed, then tested)
- **Relay dropped same-day messages.** `/messages/pull` compared SQLite `created_at` ('… 10:05:00') to an ISO `since` ('…T10:00Z') as strings; ' ' < 'T', so any message from the reader's last-sync UTC day never came back. `datetime(?)` + ISO `createdAt` out. `sync-server/server.ts`
- **Billing portal open to any paired client.** `/membership/portal` + `/status` trusted `coachId` (the device id every Companion holds). Now a per-install secret (hash in Stripe metadata + `memberships.secret_hash`); checkout refuses double-billing (409); webhook won't rebind an active member. `lib/membershipApi.ts`, `db/types.ts`
- **Membership never expired.** Gates read cached `membershipActive`; refresh only ran when Settings mounted. Added `hasActiveMembership()`/`hasPaidAccess()`, `startMembershipRefreshLoop()` in `AppRoot`. Free-tier installs make no membership calls. Live-verified: expired cached member renders as free tier.
- **Cross-tenant:** `/reminders/due` read + burned other coaches' reminders; `/push/unsubscribe` deleted anyone's. Scoped.
- **`/sync/pull/clients/:coachId` unreachable** (shadowed by `/pull/:type/:id`). Reordered.
- **Rate limiter:** no `trust proxy` → behind Caddy all coaches share one 100/15min bucket; P2P signalling (700ms polls) 429'd a handshake in ~35s. `TRUST_PROXY`, separate signal budget.
- **Non-JSON body → 500 + stack trace** (the documented provisioning curl did this). Empty-body default + JSON error handler.
- **OCR loaded executable JS/wasm from jsdelivr** (tesseract.js defaults). Now `public/tesseract/` via `scripts/copy-ocr-assets.mjs` (pre dev/build); the orphan 5MB `eng.traineddata` at app root moved there. Live Chromium: correct text, 0 off-origin requests; negative control reproduced the CDN load.
- **`npm ci` failed on Linux/macOS** — direct dep on `@rolldown/binding-win32-x64-msvc`; companion lockfile out of sync. Both fixed.
- **False UI copy:** Membership "unlocks program builder, full Film Room, business tools" (nothing gates those); Team page told paying members to buy Membership. OCR registry promised handwriting + nutrition labels.
- `bg-wash` (undefined, ×3) — DEBT-20 regressed in S18 after being marked done. ⌘K Assistant entry restored (DEBT-69), live-verified.
- `sync-server/test/server.test.ts`: 16 HTTP tests incl. automated app↔server token cross-check (was "manual").

## Shipped — docs that were wrong
- `AGENTS.md`: companion path, "companion `tsc --noEmit` is fine" (it checks 0 files), per-project check table.
- `STATUS.md`: companion 146→153 tests, "relay is the only network use", test runtime, S22 facts.
- `HOW-TO-OWN-IT.md` §4: "one-time purchase", "no activation server", "zero network requests".
- `ROADMAP.md` §1.2 (said 277; counted 1,099), §4, §5. `MEMBERSHIP.md`, `MANAGED_HOSTING.md` (curl), `SELF_HOSTING.md` env.
- App-dir `BRANDING_PLAN.md` was a diverged duplicate → pointer. Superseded banners on master spec + branding §5.

## Closed debt
DEBT-5 (file already gone), DEBT-69 (fixed).

## Didn't do / couldn't
- Pitch deck, `BRANDING_PLAN` positioning, `PRODUCT_OVERVIEW.md` §8 still imply old model/gating — Caleb-only (DEBT-72).
- No real Stripe round trip (no keys). Webhook `checkout.session.completed` success path needs Stripe network; covered only up to the no-rebind guard.

## New debt
- `DEBT-70` edition flags dead / `maxAiTier` ignores Membership · `DEBT-71` no membership re-link after reinstall · `DEBT-72` deck + §8 copy

## For the next session
DEBT-70 needs Caleb's call first. Otherwise DEBT-68 (food entries in portability).

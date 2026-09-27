# STATUS — read this first

**Last updated:** 2026-09-27 (S22, Claude Code)
**Health:** app 50 files · 740 tests · `tsc -b --force` 0 errors · `lint:tailwind` 0 errors · oxlint 0 errors
· companion 7 files · 153 tests · `tsc -b --force` clean · sync-server `tsc --noEmit` clean · **16 server tests (new)**

> ⚠️ **The `tsc` command above is not a typo — read `AGENTS.md` §4 before you trust any prior "clean
> typecheck" claim, including ones in older session files.** The root `tsc --noEmit` invocation silently
> checks zero files (solution-file config quirk). S21 discovered this the hard way: running the *correct*
> command (`tsc -b --force`) surfaced **265 real, previously-invisible compile errors** — a corrupted i18n
> catalogue, a component with unreachable dead code, several variable-shadowing bugs, calls to methods
> that don't exist. All fixed and verified live in-browser this session. Every "clean" claim in S15–S20
> below was made in good faith against the broken command; none of them were lying, the command was.

---

## Baton — what the last session left

| | |
|---|---|
| **Last worked on** | S22: backend audit + doc-vs-code audit. Fixed 9 real server/app bugs (see `sessions/S22-backend-truth-audit.md`), gave `sync-server` its first test suite, moved OCR off the jsdelivr CDN, and corrected every doc claim found false. |
| **Safe to pick up** | Anything in `ROADMAP.md`. All three projects install with `npm ci` on Linux now (they didn't). |
| **Half-done / in flight** | Nothing mid-edit. |
| **Don't touch without reading first** | The membership secret (`MEMBERSHIP.md` §4) — `/membership/status` and `/portal` now 403 without it. DEBT-70 (edition flags vs Membership) needs a product call before anyone "wires" those flags. |
| **Blocked on Caleb (no AI can do these)** | Real Stripe keys · deploy the relay domain · run the Windows installer on real hardware · a Mac to build on · real-phone Film Room footage |

---

## What the product is (one paragraph)

A local-first coaching workstation for personal trainers. Every client, program, and session lives in
IndexedDB on the coach's own machine — no account required, works fully offline. **Free tier: up to 3
clients. Coachwright Membership: $29/mo, unlimited.** Optional E2EE sync relay (self-hosted free, or
managed $15/mo) only ever sees ciphertext. Every network call is opt-in and named in `HOW-TO-OWN-IT.md` §4
(relay, membership refresh after checkout, Open Food Facts in cloud tiers, one-time AI model downloads).
Companion is a separate free client-facing PWA. See `PRODUCT_OVERVIEW.md` for positioning.

---

## What genuinely works, verified live this session

- **Core coaching loop** — roster, program builder (keyboard-first, undo/redo, dnd), session logger,
  progression engine, exercise history, analytics, reports.
- **Exercise library — 1,099 entries**, verified by direct IndexedDB count on a fresh boot. Grew from 277
  via Engine A (Free Exercise DB import, S16). **Seed-update mechanism (DEBT-67) works correctly** — S21
  simplified S17's original version, which had a real latent flaw: it diffed stored content against
  *incoming* seed content to guess "did the coach edit this," which would have silently frozen any
  legitimate future content update behind a phantom override for every coach who never touched that row.
  A coach edit never lands in the base `exercises` table in the first place (`exercisesRepo.update()`
  always routes it into the separate `exerciseOverrides` table), so the migration can now safely
  overwrite stock rows unconditionally on a version bump. Two new/rewritten tests in `db/boot.test.ts`
  cover both the real coach-edit path and this exact regression.
- **Food logging (S18)** — barcode scanning (`BarcodeDetector` API + `zxing-wasm` fallback, no CDN
  scripts), Open Food Facts lookup gated behind `cloudCapabilities().barcodeLookup` (off in fully-local
  mode, on otherwise — verified live: correct "fully-local mode" message with no network call attempted).
  **S21 fixed a real bug**: the camera scan loop checked a stale closure of React state and would never
  actually have detected a barcode (fixed with a ref instead); also fixed calls to repo methods that
  never existed (`.add()`/`.delete()` → `.create()`/`.remove()`) and a `rationale.protein.target`
  reference that doesn't exist on that type (→ `plan.proteinG` etc.).
- **Roster check-in digest (S19)** — grounded LLM summary of the week's check-ins. **S21 added a missing
  gate**: it previously called the same model pipeline the Assistant page uses with no
  installed-model check, so clicking "Generate" from the Dashboard without ever visiting Settings would
  have silently started a ~1.1GB background download behind a spinner that just said "thinking." Verified
  live: now shows "Needs the local Assistant model... install it in Settings first" with an Install-model
  link instead.
- **Branding gating (S20)** — custom branding (logo, color, business name in exports) correctly gated
  behind Membership for new installs, with existing installs grandfathered by `createdAt`. Verified live
  in onboarding.
- **Film Room** — dual-clip video comparison, frame-step, sync-lock w/ drift correction, line/angle
  tools, and on-device MediaPipe pose tracking (reps, tempo, depth, symmetry, bar path) including true
  *simultaneous* two-clip tracking with a comparison breakdown.
- **Science engines** — nutrition (Mifflin-St Jeor + cited macros, carb cycling, diet-break), readiness
  v2, cycle tracking, energy availability. All pure + unit-tested.
- **Business** — Profit Planner, expenses, ledger, invoicing w/ coupons, gym cut, staff commissions.
- **Studio/team** — staff, locations, leads CRM, leaderboards, TV mode.
- **Sync** — E2EE device pairing (ECDH + AES-GCM + spoken safety number), three transports (relay /
  LAN / file) through one merge path. Messaging + poll-based reminders. **S21 fixed a real, previously
  undetected bug**: `WiFiSyncDialog.tsx` had a module-scope IPC handler referencing component-local
  variables (`api`, `t`) and unimported functions (`applyPacket`, `buildPacket`) — dead code that could
  never have run, and a `port` variable used in the QR-code URL that was never declared anywhere. Both
  fixed (handler moved into a proper `useEffect`, `port` now comes from the server's own response).
- **i18n** — RTL + the translation layer are real and, as of S21, actually type-checked for the first
  time (a 100+-line nested-object block that broke the *entire* catalogue's type system silently — see
  banner above — is now flattened to match the rest of the file).
- **Local AI, 4 kinds wired** — semantic exercise search, voice set logging (Whisper), the grounded
  assistant (Qwen3 + Film Room context), OCR log-sheet scanning (Tesseract). Each proven against a real
  model before app code was written. **S22:** OCR was loading its worker *script* and wasm core from
  cdn.jsdelivr.net at runtime (tesseract.js defaults) — remote executable code, against the "no CDN
  scripts" precedent, and broken offline. Now served from `public/tesseract/`; live-verified in Chromium:
  correct text, zero off-origin requests (negative control reproduced the jsdelivr load).
- **Membership billing** — Stripe Checkout + webhook + billing portal + offline-verified signed tokens.
  **S22:** the app↔server token agreement is now an automated test (`sync-server/test`), not a manual
  check. Also fixed: the billing portal and status routes were authorized by the coach's device id alone,
  which every paired client knows — any client could cancel its coach's subscription. Now gated on a
  per-install secret. And the token's expiry was never enforced: a lapsed coach who stayed offline (or just
  never opened Settings, the only place refresh ran) kept Membership forever. Now `hasActiveMembership()`
  checks expiry everywhere, and refresh runs at launch + daily. Membership unlocks exactly two things —
  unlimited clients and custom branding; the in-app copy claimed builder/Film Room/business too (false).
- **Relay (sync-server) — S22 fixes, all test-covered:** messages sent on the same UTC day as the
  reader's last sync were silently never returned (ISO vs SQLite string compare); `/sync/pull/clients`
  was unreachable (route shadowed); per-coach keys could read and burn other coaches' reminders and delete
  their push subscriptions; the rate limiter would lump every coach into one bucket behind Caddy and
  kill P2P handshakes (700ms signal polling) in ~35s; a non-JSON body was a 500 with a stack trace (and
  `MANAGED_HOSTING.md`'s own provisioning curl triggered it).
- **Companion PWA** — standalone logging, assigned programs, messaging, Film Room self-review, 153 tests.
- **Desktop** — Electron shell, native menu, window-state persistence, splash. One real GUI launch done.

## What is thin, stubbed, or unverified — the honest list

| Thing | Reality |
|---|---|
| **Local AI registry** | 12 entries, **5 unwired** (`multilingual-e5-small`, `whisper-small`, `qwen3-4b`, `qwen3-8b`, `rtmpose-m`) and visibly tagged "not downloadable yet" in the UI. |
| **Membership billing** | Code complete + verified, but **cannot take a single real dollar today** — no live Stripe keys, and `MEMBERSHIP_SERVER_URL` points at an undeployed placeholder domain. |
| **i18n string conversion** | Layer + RTL + (now) real type-checking all work. Conversion coverage itself unmeasured this session — recheck the "~53 of 57 components hardcoded" figure, it predates S16–S21's changes. |
| **Client portability** | Excludes `foodEntries` (DEBT-68, same shape as the already-documented DEBT-26 for invoices/expenses). |
| **Edition flags vs Membership** | DEBT-70 — `programBuilder`/`filmRoomPro`/`business` flags are dead; `maxAiTier` still keys off the pre-pivot edition, so a member sees "Independent/Studio" upsell on the (inert) larger assistant tiers. |
| **Membership recovery** | DEBT-71 — reinstall without a backup restore can't re-link a membership; support job for now. |
| **Film Room accuracy** | Rep-counter thresholds tuned against *synthetic* data only. Never run on real human footage or a real mid-range phone. |
| **Mac** | Never attempted. No Mac in any build environment so far. |
| **Android** | Real Capacitor project generated, **never compiled or run**. |
| **Windows installer** | Builds, never run on real hardware. |
| **Mobile responsive** | Verified: Dashboard, Clients, Programs, Builder. **Unverified:** Film Room dual-video, Calendar, Business/Billing, Settings. |
| **Lighthouse / cross-browser** | Never run — one browser engine available, no Lighthouse CLI. |
| **Free-tier cap** | Enforced locally and honestly, not unbreakably. Fine by design, but it now guards revenue, not just cosmetics. |

---

## Commands

```bash
npx vitest run          # 740 tests, ~15s on the S22 container
npx tsc -b --force      # app typecheck — NOT `tsc --noEmit`, see banner at top of this file
npm run dev             # vite dev server (port 5173/5174)
npm run dev:electron    # desktop shell — ALWAYS confirm the process died after
npm run lint:tailwind   # undefined-class check (DEBT-20 regressed once already)
cd ../sync-server && npm test   # relay + membership, 16 tests
```

Before any Electron build: `Get-Process node,electron -ErrorAction SilentlyContinue` — orphaned
processes cause `EPERM` failures that look like antivirus. This burned a full session once.

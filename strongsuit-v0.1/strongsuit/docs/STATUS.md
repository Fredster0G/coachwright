# STATUS — read this first

**Last updated:** 2026-09-27 (S23, Claude Code)
**Health:** app 46 files · 655 tests · `tsc -b --force` 0 errors · lint:tailwind 0 errors · oxlint 0 · no import cycles
· companion 6 files · 107 tests · clean · sync-server `tsc --noEmit` clean · 21 server tests

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
| **Last worked on** | S23: **moved to cloud accounts** (Caleb's call). Coach data lives on Coachwright Cloud (`sync-server/`), every install is a synced cache, Companion connects with a coach-issued code. Removed: E2EE pairing, WiFi/LAN/file/P2P sync, self-hosted/managed relay tiers, offline service worker, offline membership tokens. Added a `build:web` target with no on-device AI. Closed DEBT-68 (food log now travels in client packages). Design + runbook: `docs/CLOUD.md`. |
| **Safe to pick up** | Anything in `ROADMAP.md`. |
| **Half-done / in flight** | Nothing mid-edit. **Not done:** password reset (needs an email sender — DEBT-73), server-side free-tier cap (DEBT-74), legal review of the rewritten EULA + a privacy policy (DEBT-75), account deletion (DEBT-76). |
| **Don't touch without reading first** | `docs/CLOUD.md` §2 — `SYNCED_TABLES` (app) must match `SYNC_TABLES` (server); `Table.clear()` bypasses the sync hooks. |
| **Blocked on Caleb (no AI can do these)** | Real Stripe keys · a VPS + domain for Coachwright Cloud (`CLOUD.md` §4) · lawyer read of EULA/privacy · run the Windows installer on real hardware · a Mac · real-phone Film Room footage |

---

## What the product is (one paragraph)

A coaching workstation for personal trainers, on a cloud account: desktop app (Electron) and a website
build, both backed by Coachwright Cloud and keeping a local working copy so they survive a dropped
connection. **Free tier: up to 3 clients. Coachwright Membership: $29/mo, unlimited.** Companion is a separate free client-facing PWA. See `PRODUCT_OVERVIEW.md` for positioning.

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
- **Cloud accounts + sync (S23)** — sign-up/sign-in, incremental two-way sync (last-write-wins per row),
  offline queueing, first-link rules that never mix two accounts' data, Companion connect codes,
  messages + reminders through the account. **Verified live in Chromium** with the real server: sign up
  → add client → connect code → Companion connects → messages both ways → a second browser signs in and
  sees the client. Zero console errors, zero off-origin requests. Plus integration tests that run the
  app's and Companion's real sync code against the real server in-process.
- **i18n** — RTL + the translation layer are real and, as of S21, actually type-checked for the first
  time (a 100+-line nested-object block that broke the *entire* catalogue's type system silently — see
  banner above — is now flattened to match the rest of the file).
- **Local AI, 4 kinds wired** — semantic exercise search, voice set logging (Whisper), the grounded
  assistant (Qwen3 + Film Room context), OCR log-sheet scanning (Tesseract). Each proven against a real
  model before app code was written. **S22:** OCR was loading its worker *script* and wasm core from
  cdn.jsdelivr.net at runtime (tesseract.js defaults) — remote executable code, against the "no CDN
  scripts" precedent, and broken offline. Now served from `public/tesseract/`; live-verified in Chromium:
  correct text, zero off-origin requests (negative control reproduced the jsdelivr load).
- **Membership billing** — Stripe Checkout + webhook + billing portal, keyed by account (S23; the offline
  token scheme is gone). Status refreshes at launch, every few hours and on reconnect; access holds until
  period end + 7 days if the server is unreachable. Unlocks exactly: unlimited clients + custom branding.
- **Web build (S23)** — `npm run build:web`: same app minus all on-device AI (routes/cards/buttons hidden,
  AI runtimes aliased to stubs). Main bundle 974KB → 456KB. Film Room pose tracking stays. Verified live:
  assistant, AI card and "Ask assistant" absent on web, present on desktop.
- **Companion PWA** — standalone logging, assigned programs, messaging, reminders, Film Room self-review.
  Connects with a code; push notifications via the cloud. 107 tests (P2P/E2EE suites deleted with the code).
- **Desktop** — Electron shell, native menu, window-state persistence, splash. One real GUI launch done.

## What is thin, stubbed, or unverified — the honest list

| Thing | Reality |
|---|---|
| **Local AI registry** | 12 entries, **5 unwired** (`multilingual-e5-small`, `whisper-small`, `qwen3-4b`, `qwen3-8b`, `rtmpose-m`) and visibly tagged "not downloadable yet" in the UI. |
| **Coachwright Cloud** | Code complete + tested, **not deployed** — no server, no domain, no live Stripe keys. Not load-tested. No password reset (DEBT-73), no account deletion (DEBT-76). |
| **i18n string conversion** | Layer + RTL + (now) real type-checking all work. Conversion coverage itself unmeasured this session — recheck the "~53 of 57 components hardcoded" figure, it predates S16–S21's changes. |
| **Edition flags vs Membership** | DEBT-70 — `programBuilder`/`filmRoomPro`/`business` flags are dead; `maxAiTier` still keys off the pre-pivot edition, so a member sees "Independent/Studio" upsell on the (inert) larger assistant tiers. |
| **Film Room accuracy** | Rep-counter thresholds tuned against *synthetic* data only. Never run on real human footage or a real mid-range phone. |
| **Mac** | Never attempted. No Mac in any build environment so far. |
| **Android** | Real Capacitor project generated, **never compiled or run**. |
| **Windows installer** | Builds, never run on real hardware. |
| **Mobile responsive** | Verified: Dashboard, Clients, Programs, Builder. **Unverified:** Film Room dual-video, Calendar, Business/Billing, Settings. |
| **Lighthouse / cross-browser** | Never run — one browser engine available, no Lighthouse CLI. |
| **Free-tier cap** | Still checked on the device only. The server now has what it needs to enforce it but doesn't (DEBT-74). |
| **Privacy/legal** | Data is no longer E2EE. EULA storage/privacy clauses rewritten to say so; needs a lawyer and a privacy policy (DEBT-75). |

---

## Commands

```bash
npx vitest run          # 655 tests, ~15s
npx tsc -b --force      # app typecheck — NOT `tsc --noEmit`, see banner at top of this file
npm run dev             # vite dev server — talks to http://localhost:4000 (run the server below)
npm run dev:web         # the website build (no on-device AI)
npm run build:web       # → dist-web/
npm run dev:electron    # desktop shell — ALWAYS confirm the process died after
npm run lint:tailwind   # undefined-class check (DEBT-20 regressed once already)
cd ../sync-server && npm test   # Coachwright Cloud, 21 tests
cd ../sync-server && npm run dev # the backend on :4000 (DB_PATH=... to choose the file)
```

Before any Electron build: `Get-Process node,electron -ErrorAction SilentlyContinue` — orphaned
processes cause `EPERM` failures that look like antivirus. This burned a full session once.

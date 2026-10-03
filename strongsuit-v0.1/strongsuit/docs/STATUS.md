# STATUS — read this first

**Last updated:** 2026-10-03 (S28, Claude Code)
**Health:** app 62 files · 731 tests · `tsc -b --force` 0 errors · lint:tailwind 0 errors · oxlint 0 errors · no import cycles
· companion 8 files · 112 tests · clean · sync-server `tsc --noEmit` clean · 32 server tests

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
| **Last worked on** | S28: onboarding sample clients now real (program, history, check-ins; removable; don't count toward the free cap); assigning a program now copies templates and sets the client's active program (it never did); builder no longer drops edits made just before leaving, and week duplicate "+1 rep" no longer makes 5 → 51; Quick log (⌘L) actually opens, dialogs focus their input, and ticking a set done in the logger records its load/reps (`sessions/S28-program-assign.md`). S27: opt-in **system notifications** + **coach email** (when the app is closed) for client messages and session requests plus 4 bugs from a self-review (recurring catch-up, notification seen-list, client re-push reopening a booking, input glitches) (`sessions/S27-coach-notifications.md`). S26: **branding made real** (logo/colour settings, printouts, Companion); **welcome sequence** for new Companion clients; **client self-booking** through Companion (coach hours → open slots → request → accept); calendar no longer files evening/morning appointments under the UTC day; **recurring invoices** ("Repeat monthly" → a draft each month, sync-safe ids); progress-photo compare picks any two photos, shows days apart + bodyweight change; duplicate Resting-HR preset chip fixed; stale `cloudCapabilities` doc claims corrected (`sessions/S26-booking-invoices.md`). S25: CI workflow added; desktop startup bundle 979KB → 461KB (AI runtime lazy); client page fixed on phones (unreachable tabs, off-screen actions); Dashboard facts one-pass; last UTC-date sites; server health/shutdown/reset-throttle. S24: **account basics** — password reset by emailed one-time link (Postmark, off until keys exist), account deletion (cancels Stripe, erases server + device), server-side free-tier cap. Debt sweep: local-vs-UTC date bugs in both apps, real session-pack ledger, dead edition flags removed, 11MB unused wasm dropped per app, Film Room Reference keys, web `/assistant` redirect. S23 (before): moved to cloud accounts — `docs/CLOUD.md`. |
| **Safe to pick up** | Anything in `ROADMAP.md`. |
| **Half-done / in flight** | Nothing mid-edit. **Not done:** legal review of the EULA + a privacy policy (DEBT-75). Reset emails need a Postmark account + a verified sender (`CLOUD.md` §4) — until then the server logs that it couldn't send. |
| **Don't touch without reading first** | `docs/CLOUD.md` §2 — `SYNCED_TABLES` (app) must match `SYNC_TABLES` (server); `Table.clear()` bypasses the sync hooks. |
| **Blocked on Caleb (no AI can do these)** | Plain-language checklist: **`TODO-FOR-CALEB.txt`** at the repo root (keep it current).  Real Stripe keys · a Postmark account (password-reset email) · a VPS + domain for Coachwright Cloud (`CLOUD.md` §4) · lawyer read of EULA/privacy · run the Windows installer on real hardware · a Mac · real-phone Film Room footage |

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
  scripts), Open Food Facts lookup on any barcode not already cached in `foodItems` (S26: the old
  `cloudCapabilities()` gate and its "fully-local mode" went with the S23 move to cloud accounts — the
  lookup is now always on).
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
- **Desktop** — Electron shell, native menu, window-state persistence, splash. One real GUI launch done (Windows). **S25:** the packaged-mode renderer (`app://`, via `CW_SERVE_DIST=1 electron .`) driven in Electron under Xvfb on Linux — loads, Print/TV windows now open (they silently didn't), `app://` path traversal refused. Film Room tracking falls back GPU→CPU without WebGL2; OCR reads a sheet end to end. Desktop now reports RAM to Local AI (it never did — every larger model was hidden).

## What is thin, stubbed, or unverified — the honest list

| Thing | Reality |
|---|---|
| **Local AI registry** | 12 entries, **5 unwired** (`multilingual-e5-small`, `whisper-small`, `qwen3-4b`, `qwen3-8b`, `rtmpose-m`) and visibly tagged "not downloadable yet" in the UI. |
| **Coachwright Cloud** | Code complete + tested, **not deployed** — no server, no domain, no live Stripe or Postmark keys. Not load-tested. Password reset + account deletion built and verified live in Chromium (S24), but a real email has never been sent. |
| **i18n string conversion** | Layer + RTL + (now) real type-checking all work. Conversion coverage itself unmeasured this session — recheck the "~53 of 57 components hardcoded" figure, it predates S16–S21's changes. |
| **Film Room accuracy** | Rep-counter thresholds tuned against *synthetic* data only. Never run on real human footage or a real mid-range phone. |
| **Mac** | Never attempted. No Mac in any build environment so far. |
| **Android** | Real Capacitor project generated, **never compiled or run**. |
| **Windows installer** | Builds, never run on real hardware. |
| **Mobile responsive** | S25: every main page measured at 375px in Chromium — no horizontal overflow. Fixed the client page (header actions ran off-screen; last tabs were unreachable — `Tabs` now scrolls). Film Room checked with one clip loaded (stage stacks below `lg`), not with two long real videos. |
| **Lighthouse / cross-browser** | Never run — one browser engine available, no Lighthouse CLI. |
| **Free-tier cap** | Enforced by the server since S24 (members and verified one-time licences exempt; an install that arrives with more keeps them). Refused clients stay on the device and show on Account & sync. |
| **Privacy/legal** | Data is no longer E2EE. EULA storage/privacy clauses rewritten to say so; needs a lawyer and a privacy policy (DEBT-75). |

---

## Commands

```bash
npx vitest run          # 676 tests, ~15s
npx tsc -b --force      # app typecheck — NOT `tsc --noEmit`, see banner at top of this file
npm run dev             # vite dev server — talks to http://localhost:4000 (run the server below)
npm run dev:web         # the website build (no on-device AI)
npm run build:web       # → dist-web/
npm run dev:electron    # desktop shell — ALWAYS confirm the process died after
npm run lint:tailwind   # undefined-class check (DEBT-20 regressed once already)
cd ../sync-server && npm test   # Coachwright Cloud, 27 tests
cd ../sync-server && npm run dev # the backend on :4000 (DB_PATH=... to choose the file)
```

Before any Electron build: `Get-Process node,electron -ErrorAction SilentlyContinue` — orphaned
processes cause `EPERM` failures that look like antivirus. This burned a full session once.

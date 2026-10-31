# S27 — coach notifications, review fixes

**Tool:** Claude Code · **Date:** 2026-10-02
**Tests:** app 726/726 (60 files) · server 31/31 · **Typecheck:** `tsc -b --force` clean · electron tsc clean · oxlint/lint:tailwind 0 errors · no import cycles

## Asked
Standing instruction: "always continue" — work through everything that doesn't need Caleb; keep
`TODO-FOR-CALEB.txt` current.

## Shipped
- **System notifications for the coach** (DEBT-84). Companion replies and booking requests used to
  arrive silently. Settings → Notifications (per device, opt-in, asks the OS/browser); after each sync,
  new inbound messages raise ONE notification ("2 new messages from Alex", "Session request from Sam");
  clicking opens that client. "New" is tracked by message id (a phone can deliver an offline-queued
  message with an older timestamp); enabling marks history as seen so it doesn't announce the past.
  `lib/coachNotify.ts` + 6 tests. Electron sets the Windows AppUserModelID (required for renderer
  notifications on Windows; matches the installer's appId).
  Verified live: Companion sent two messages → coach sync → exactly one notification
  ("2 new messages from Alex"), none on the next sync, zero console errors.

- **Email the coach when the app is closed** (rest of DEBT-84): opt-in "Also email me" (synced
  `trainer.emailNotify`); the server emails on new client messages — first name only, never the text
  (health data stays out of inboxes), at most one per 30 min (`accounts.notify_email_at`, claimed before
  sending so racing pushes can't double-send). 1 server test (opt-in, throttle, no content, re-push
  isn't activity). Needs Postmark like password reset.
- **Self-review of S26–S27 (`/code-review` high) — 4 real bugs fixed, each with a test that fails on
  the old code where testable:**
  - Recurring invoices' 3-month catch-up was per run, so every sync generated 3 more older months
    until the whole gap was filled. Now a fixed window (months within the last 3 of today).
  - Notification seen-list was capped at 2000 ids; dropped ids would re-announce forever. Now bounded
    by age (30 days) and rebuilt from the messages each time.
  - A modified client could re-push its booking request after the coach answered and reopen it
    (or get a second appointment on re-accept). Client messages are now append-only on the server.
  - Welcome-message textarea and booking time fields were controlled inputs fed by an async save
    (lost keystrokes). Textarea commits on blur; time fields are uncontrolled and commit each complete
    value — a blur commit lost the last edit (Tab stays inside a time input), found by the live e2e.
  - Not changed: old UTC-day `exceptions` aren't migrated to local days — nothing is deployed, and the
    dual-match fallback would wrongly cancel adjacent-weekday series.
- **Live crawl after the S26–S27 changes:** every coach route + all 11 client tabs at 1280 and 375px,
  and every Companion route at 360px — zero console errors. Only finding: two printouts overflowed a
  phone (header didn't wrap; intake's blank-line underscores can't break) — fixed, re-measured clean.
- **i18n (DEBT-64):** re-measured (≈23 components left, not 53); Calendar, Messages tab, Team, Leads, Leaderboard, Reports, Studio, Library converted (~350 keys;
  weekday/month names and day headings now use the browser locale). Verified live: no raw keys.
  Leaderboard: "1 sessions" → plural; the volume unit said "lb·reps"/"lb" (Leaderboard, Reports) even for kg coaches — now the coach's unit.
  Studio: staff roles showed raw ("front-desk"); "Delete location" deleted on one click — now asks.
  **Library: custom exercises could not be created** — "New exercise" stamped the draft with an id, so it
  opened as "Edit" and Save updated a nonexistent row (silent no-op, still toasted "Updated"). Fixed;
  verified live (1,099 → 1,100).
- Not doable here: the 4B/8B assistant tiers need a verified real download and Hugging Face is
  blocked by this environment's network policy (403 at the proxy).

## Didn't do / couldn't
- Coach emails have never really been sent (needs Postmark — DEBT-80/84).
- Not tried on a real Windows/macOS desktop (TODO-FOR-CALEB).

## New debt
- None (DEBT-84 narrowed).

## For the next session
DEBT-64 i18n conversion, or make the 4B/8B assistant tiers loadable (ROADMAP §3).

# S27 — coach notifications

**Tool:** Claude Code · **Date:** 2026-10-02
**Tests:** app 724/724 (60 files) · **Typecheck:** `tsc -b --force` clean · electron tsc clean · oxlint/lint:tailwind 0 errors · no import cycles

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

## Didn't do / couldn't
- Nothing reaches a coach whose app is closed (needs server push/email — DEBT-84, DEBT-80).
- Not tried on a real Windows/macOS desktop (TODO-FOR-CALEB).

## New debt
- None (DEBT-84 narrowed).

## For the next session
DEBT-64 i18n conversion, or make the 4B/8B assistant tiers loadable (ROADMAP §3).

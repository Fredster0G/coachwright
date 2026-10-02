# S26 — photo compare, recurring invoices, preset dedupe, stale-doc fixes

**Tool:** Claude Code · **Date:** 2026-10-02
**Tests:** app 694/694 (54 files) · **Typecheck:** `tsc -b --force` clean · electron tsc clean · oxlint/lint:tailwind 0 errors · no import cycles

## Asked
"keep going" — continue optimizing and adding to the app.

## Shipped
- **Progress-photo compare, any two photos** (ROADMAP §2.6 gap row). The dialog used to be fixed at
  first vs. latest. Now each side has a date picker (default first/latest), the header shows days
  apart and the bodyweight change, and each photo shows the bodyweight reading within a week of it
  (or says there isn't one) plus its note. Pure helpers in `lib/photoCompare.ts` (`daysApart` counts
  calendar days in UTC so DST can't shift it; `nearestReading` with a ±7-day window). 6 tests.
  `features/clients/MetricsTab.tsx`, i18n keys in `locales/en.ts` (plural "day/days apart").
  Verified live in Chromium at 1280 and 375px: "92 days apart · -11.6 lb", re-pick → "48 days apart",
  "No bodyweight within a week", no horizontal scroll, zero console errors.
- **Bug: duplicate "Resting heart rate" chip** with no training goal set — two preset groups share the
  `resting-hr` key, React warned about duplicate keys. Found by the live run's console check.
  `suggestedItems()` in `lib/metricPresets.ts` dedupes by key (first group wins); 2 tests.
- **Recurring invoices** (ROADMAP §2.6 "recurring billing" row). "Repeat monthly" checkbox on a new
  invoice; that invoice becomes a template and each later month gets a **draft** copy on the same day
  (Jan 31 → Feb 28 → Mar 31, no drift), with the same due-date gap. "Stop repeating" turns it off;
  voiding the template stops it too. Copies are tagged "Recurring", templates "Repeats monthly".
  - Idempotent across devices: a copy's id is `<templateId>~<yyyy-MM>`, and it's timestamped at its
    billing date (not now), so two devices generating the same month write the same row and any real
    edit (send, mark paid) is always newer — last-write-wins can't revert a sent invoice to draft.
  - Runs only right after a successful sync (`AppRoot.tsx`), never before this session's first pull.
    Catch-up is capped at 3 months per template.
  - No schema bump, no server change: two optional fields on `Invoice` (`repeatMonthly`, `repeatOf`).
  - `lib/recurringInvoices.ts` + `invoicesRepo.generateRecurring()` (one transaction); 11 tests incl.
    the fake-IndexedDB run and the sync-race timestamp. Verified live: a template dated 2026-08-10
    produced `TPL1~2026-09` #2 draft due 09-17 after the first sync (October not yet due on 10-02),
    and the row reached the server with `updated_at` 2026-09-10; UI checkbox → "Repeats monthly";
    "Stop repeating" cleared it; zero console errors.
- Photo card header wraps instead of breaking "Add photo" across two lines on a phone.
- **Docs that lied:** STATUS and ROADMAP §2.1 still said barcode lookup was gated by
  `cloudCapabilities()` / `lib/cloudCapability.ts` in a "fully-local mode". Both went in S23; the lookup
  is always on. Corrected.

## Didn't do / couldn't
- Nothing half-done.

## New debt
- None.

## For the next session
ROADMAP §2.6: client self-booking is the next "Build" row (needs a public, unauthenticated surface —
design it against `CLOUD.md` first).

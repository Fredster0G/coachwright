# S26 — photo compare, preset dedupe, stale-doc fixes

**Tool:** Claude Code · **Date:** 2026-10-02
**Tests:** app 683/683 (53 files) · **Typecheck:** `tsc -b --force` clean · electron tsc clean · oxlint/lint:tailwind 0 errors · no import cycles

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
- Photo card header wraps instead of breaking "Add photo" across two lines on a phone.
- **Docs that lied:** STATUS and ROADMAP §2.1 still said barcode lookup was gated by
  `cloudCapabilities()` / `lib/cloudCapability.ts` in a "fully-local mode". Both went in S23; the lookup
  is always on. Corrected.

## Didn't do / couldn't
- Nothing half-done.

## New debt
- None.

## For the next session
ROADMAP §2.6: client self-booking or recurring billing are the next "Build" rows.

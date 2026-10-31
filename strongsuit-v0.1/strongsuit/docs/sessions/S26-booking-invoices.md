# S26 — self-booking, recurring invoices, welcome sequence, branding, calendar day fix

**Tool:** Claude Code · **Date:** 2026-10-02
**Tests:** app 718/718 (59 files) · companion 112/112 · server 30/30 · **Typecheck:** `tsc -b --force` clean · electron tsc clean · oxlint/lint:tailwind 0 errors · no import cycles

## Asked
"keep going" (twice); then "always continue" — do everything possible without Caleb and list the rest
in a text file for him (→ `TODO-FOR-CALEB.txt` at the repo root; AGENTS.md §3 step 5 keeps it current).

## Shipped (each verified live in Chromium, zero console errors)
- **Client self-booking via Companion.** Settings → Client booking (weekly hours, length, notice).
  After each sync the app publishes 14 days of free slots on the trainer row (`lib/booking.ts`: skips
  appointment occurrences incl. series and slots held by pending requests; writes only on change).
  `/client/bundle` adds `booking`, `openSlots` (notice applied server-side), the client's `sessions`;
  client pushes keep only `booking.{start,end}`. Companion `/book`; coach answers from Today, Calendar
  or Messages (`messagesRepo.answerBooking`, one transaction). 18 tests incl. Companion↔server.
  The e2e caught two Settings-card bugs pre-commit (stale-copy saves; queued saves reading a reset
  `e.target`) — fixed.
- **Recurring invoices.** "Repeat monthly" → a draft copy each month on the same day (clamped, no
  drift). Copy id `<template>~<yyyy-MM>`, stamped at its billing date so devices can't double-bill or
  revert a sent invoice. Runs only after a successful sync; catch-up ≤3 months. 11 tests.
- **Welcome sequence.** Settings → Welcome sequence (day offsets, `{firstName}`); client's Messages
  tab → "Start welcome sequence" schedules Companion reminders `onb~<client>~<step>` and stamps
  `client.onboardingStartedAt` (the server's reminder upsert resets `sent`, so never twice). 4 tests.
- **Branding was half a feature** (found): logo/colour fields existed and the membership copy sold
  them, but nothing could set them and Companion got no branding after S23. Logo (PNG 256px) + colour
  in Settings → Brand; `lib/branding.ts` is the one rule for four printouts + the Companion file;
  server `brandFor()` sends it only when branding is allowed. 5 tests.
- **Calendar filed appointments under the UTC day** (`lib/schedule.ts`, pre-existing): US evenings
  showed tomorrow, evening weekly series lost their first occurrence, Asian mornings showed yesterday.
  3 tests pinned to LA/Tokyo fail on the old code. No migration (nothing deployed).
- **Progress photos:** compare any two, days apart + bodyweight change (`lib/photoCompare.ts`, 6 tests).
- Bugs: duplicate "Resting heart rate" chip (React key warning); Log Message dialog pre-filled UTC time.
- Docs that lied: barcode lookup "gated by cloudCapabilities()" (removed S23) in STATUS/ROADMAP.

## Didn't do / couldn't
- Nothing half-done. Booking requests don't push-notify the coach (DEBT-84).

## New debt
- DEBT-83 booking slots + logo ride on the trainer row / every bundle.
- DEBT-84 booking requests don't notify the coach (only Companion gets push).

## For the next session
DEBT-64 i18n conversion, or make the 4B/8B assistant tiers loadable (ROADMAP §3) after verifying a
real download.

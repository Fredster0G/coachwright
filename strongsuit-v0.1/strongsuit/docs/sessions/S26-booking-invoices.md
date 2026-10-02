# S26 — client self-booking, recurring invoices, photo compare, calendar day fix

**Tool:** Claude Code · **Date:** 2026-10-02
**Tests:** app 718/718 (59 files) · companion 112/112 · server 30/30 · **Typecheck:** `tsc -b --force` clean · electron tsc clean · oxlint/lint:tailwind 0 errors · no import cycles

## Asked
"keep going" (twice) — continue optimizing and adding to the app; later "always continue" and leave Caleb a
list of what only he can do (→ `CALEB-TODO.md` at the repo root).

## Shipped
- **Client self-booking via Companion** (ROADMAP §2.6). Coach: Settings → Client booking (weekly hours,
  session length, minimum notice). The app publishes free slots for the next 14 days on the trainer row
  after each sync (`lib/booking.ts` `computeOpenSlots`: skips any non-canceled appointment occurrence,
  incl. series, and slots held by pending requests; republishes only on change). Server: `/client/bundle`
  adds `booking`, `openSlots` (notice applied server-side) and the client's own `sessions`; client pushes
  keep only `booking.{start,end}` (no self-accepting). Companion: `/book` page — sessions, requests with
  status, slots by local day, request bar. Coach: requests on Calendar ("Booking requests") and inline in
  Messages, and a "requests waiting" card on Today; Accept creates the appointment + confirmation message, Decline replies (`messagesRepo.answerBooking`,
  one transaction). Tests: 9 slot tests, 4 repo, 2 server, 1 Companion↔server integration, 2 Companion
  helpers. **Live e2e in Chromium** (coach UI → Companion at 390px → coach accept → Companion "Confirmed"):
  3 slots/day, Mon 8:00 hidden by an existing session, zero console errors, zero off-origin requests.
  - The e2e caught two bugs in the new Settings card before commit: quick edits saved over a stale copy
    (From then To → only To kept), and queued saves read `e.target` after React reset it. Both fixed.
- **Welcome sequence** (ROADMAP §2.6 onboarding). Settings → Welcome sequence edits the messages
  (`{firstName}`, day offsets; default 4 steps); a client's Messages tab → "Start welcome sequence"
  previews and schedules them as Companion reminders with ids `onb~<client>~<step>`, then stamps
  `client.onboardingStartedAt` so it's never offered twice (the server's reminder upsert resets `sent`).
  4 tests; verified live (edited step used, 4 reminders listed, button replaced by "started").
- **Branding was half a feature** (found, not asked): `logoDataUrl`/`brandColor` existed and the
  membership copy sold "logos, colors, and branded client apps", but nothing could set them and
  Companion got no branding after S23. Now: logo upload (PNG, 256px) + colour in Settings → Brand;
  `lib/branding.ts` `artifactBrand()` is the one rule for all four printouts + the Companion file
  (they each re-implemented it); server `brandFor()` sends name/logo/colour in the bundle only when
  branding is allowed. Verified live: logo + name on every printout; Companion header/home show
  "Iron Den Coaching", the logo and the accent rule.
- **Calendar showed appointments on the wrong day** (`lib/schedule.ts`, pre-existing): occurrence dates
  were the UTC day, so in the Americas everything after ~5pm sat on tomorrow and an evening weekly
  series lost its first occurrence; mornings in Asia landed on yesterday. Now the local day. 3 tests
  pinned to Los Angeles/Tokyo fail on the old code. No migration needed (nothing deployed).
- "Log Message" dialog pre-filled the UTC time into a local-time field; now local.
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
- **Docs that lied:** STATUS and ROADMAP §2.1 still said barcode lookup was gated by
  `cloudCapabilities()` / `lib/cloudCapability.ts` in a "fully-local mode". Both went in S23; the lookup
  is always on. Corrected.

## Didn't do / couldn't
- Nothing half-done.

## New debt
- DEBT-83 booking slots ride on the trainer row (re-uploads incl. logo on change).
- DEBT-84 booking requests don't notify the coach (only Companion gets push).

## For the next session
ROADMAP §2.6 "automated onboarding sequences" (the automations engine is the host), or DEBT-64 i18n.

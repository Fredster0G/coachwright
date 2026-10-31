# S28 — program assignment, sample data, a live-testing bug sweep, i18n continues

**Tool:** Claude Code · **Date:** 2026-10-03
**Tests:** app 756/756 · server 32/32 · companion 116/116 · CI also builds both web bundles · **Typecheck:** `tsc -b --force` clean (app, companion, electron, server) · oxlint/lint:tailwind 0 errors

## Asked
Standing instruction: "always continue" — work through everything not blocked on Caleb.

## Shipped (every item verified live in the browser, 0 console errors)
- **Program assignment** rewrote templates in place and never set `activeProgramId` → `assignToClient()`.
- **Onboarding sample clients** were bare rows with no remove path that ate the free cap. `db/demo.ts`
  now seeds program, 9 sessions, check-ins, weigh-ins; Clients page "Remove sample clients"; samples are
  outside the free cap (app + server). 2 + 1 tests.
- **Companion → coach logs were unreadable** (biggest find): workouts went up in Companion's own
  `{reps, load}` shape with the typed name as `exerciseId`, so the coach saw "Unknown exercise" and no
  sets. Now: coach `LoggedSet` shape (done sets, empty sets dropped), loads converted to the coach's units
  (bundle carries `units`), server `resolveExerciseNames()` maps names/aliases to the coach's library id,
  unmatched names kept as `exerciseName`. Companion pulls before pushing (units known on first sync) and
  labels prescriptions in the coach's units ("225 kg" for a 225 lb prescription before). E2E test via the
  real server; live: client "back squat 5×225 lb" → coach "Back Squat 102.1 × 5".
  Measurements too: bodyweight went up as a unitless "measurement" (missing from the coach's chart, read as
  lb by nutrition) → coach `bodyweight` type in coach units; tape measurements were shown as "32 lb" → in/cm.
- **Quick log never opened** (palette returned `null` while closed). **Dialogs never focused their input**
  (`autoFocus` fires before `showModal()`) → `Dialog` focuses `[data-autofocus]`.
- **Session logger "done" saved nothing** though the box showed the target → `completeSet()`; %1RM/RPE
  targets no longer shown as weights. 4 tests.
- **Builder:** edits within the 2 s autosave lost on leaving (flush on unmount); duplicate-week "+1 rep"
  made "5"→"51" (`bumpReps`, 5 tests); cleared load stored 0; delete week/day confirm.
- **Stale dialog forms:** Edit client reverted changes made on another device; check-in / payment /
  appointment / PAR-Q dialogs kept the previous entry. All mount per open.
- **"Log session" always opened Week 1 · Day 1** → `lib/programDay.ts` `nextProgramDay()` (day after the
  last one logged; stays on the last day at the end; 4 tests). Client page prefers `activeProgramId`.
- **Archived clients could never be restored** → "Restore client" (free-cap gated). **Lead → client
  skipped the free cap** (server then refused the 4th client) → gated like New client. Verified live.
- **Templates and supersets had no UI:** nothing could mark a program a template (the Templates filter and
  template-copy were unreachable) or create a superset (row ⌘S hook unwired; drag between blocks no-op).
  Now: Program settings "Reusable template", Programs list "Duplicate", a link/unlink button per exercise.
  The Settings Guide claimed both, plus a 7-day backup shield (it's 30) — Guide corrected and extended.
- **HTML Companion file** (Export Companion App): dated sessions by the UTC day (evening US workouts →
  tomorrow) and logged a %1RM target as the weight lifted; the Logs tab hid "Import" until a client already
  had a log, so the first returned file couldn't be imported. All fixed; round trip verified live (LA time).
- **TV display** showed only the first set (5/3/1 read "3×5") → every set, current program.
- **Food Log** targets disagreed with Nutrition → `goalPlan()`; float totals; hover-only Remove; camera leak.
- **Business:** last-month income and the 6-month chart skipped refunds (gross vs this month's net).
  **Coupons couldn't be created anywhere** (STATUS claimed "invoicing w/ coupons") → Settings → Coupons;
  an applied coupon froze its discount (10% stayed $10 after adding a line) and inactive codes applied at $0.
- **Settings:** Membership bar counted sample clients; Licence card's "key never leaves your computer"
  (false since S23) corrected. Companion disconnect/delete/restore confirm.
- **Nutrition engine:** the cut note always claimed "inside the 0.5–1%/week range" (a typical client is
  under it) → states slower/inside/faster, classified on the printed rounding. Engine prose keyed via
  `lib/i18n/msg.ts` (also progression, readiness); Nutrition + Science tabs translated.
- **i18n:** ~25 more components; engines keyed (progression, readiness, nutrition ×3, training load, goals).

## Didn't do / couldn't
- Settings Guide (rich JSX), Film Room, Assistant still English (DEBT-64). PAR-Q needs an official translation.

## New debt
- **86** Nutrition tab's default cut trips its own red energy-availability warning — science call, logged.
- **85** Companion deletions never reached the coach — opened and resolved this session (client may delete
  only rows it authored; soft-delete → upload → purge; verified live).

## For the next session
DEBT-64 remainder; keep driving flows end to end (Film Room on real video, multi-device sync conflicts).

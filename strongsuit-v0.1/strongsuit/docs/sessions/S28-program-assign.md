# S28 — program assignment, sample data, a live-testing bug sweep, i18n continues

**Tool:** Claude Code · **Date:** 2026-10-03
**Tests:** app 743/743 · server 32/32 · companion 115/115 · **Typecheck:** `tsc -b --force` clean (app, companion, electron, server) · oxlint/lint:tailwind 0 errors

## Asked
Standing instruction: "always continue" — work through everything not blocked on Caleb.

## Shipped (every item verified live in the browser, 0 console errors)
- **Program assignment:** "Assign to client" rewrote the program in place (a template vanished from the
  library) and nothing ever set `client.activeProgramId`. Now `programsRepo.assignToClient()` copies
  templates, sets start date + active program, retires the previous one. 3 repo tests.
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
- **Quick log never opened** (palette returned `null` while closed; Quick log lives inside it).
- **Dialogs never focused their input** — React `autoFocus` fires before `showModal()`, which then focuses
  Close: typing after ⌘K went nowhere, Enter closed the palette. `Dialog` focuses `[data-autofocus]`.
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
- **TV display** showed only the first set (5/3/1 read "3×5") and any active program → every set + the
  client's current program.
- **Food Log** targets disagreed with Nutrition (own goal shortcut) → `goalPlan()`; float totals rounded;
  hover-only Remove; barcode camera left on if granted after close.
- **Business:** last-month income and the 6-month chart skipped refunds (gross vs this month's net).
  **Coupons couldn't be created anywhere** (STATUS claimed "invoicing w/ coupons") → Settings → Coupons;
  an applied coupon froze its discount (10% stayed $10 after adding a line) and inactive codes applied at $0.
- **Settings:** Membership bar counted sample clients; Licence card claimed "the key never leaves your
  computer" (false since S23 — trainer row syncs, server re-verifies) → copy corrected. Companion
  disconnect and Companion workout delete now confirm.
- **i18n:** onboarding, Program Builder + sub-views, sign-in/reset, Account, Programs list, session
  logger, Quick log (questions keyed by `status`), rest timer, scan, history drawer, TV, Membership,
  Licence, Connect Companion, Food Log, barcode scanner.

## Didn't do / couldn't
- Settings Guide, Film Room, Nutrition, Science, Assistant still hold English; Nutrition/Science prose
  comes from `lib/` engines (DEBT-64).

## New debt
- **85** Companion deletions never reached the coach — opened and resolved this session (client may delete
  only rows it authored; soft-delete → upload → purge; verified live).

## For the next session
DEBT-64 (key the engines' prose: `progression.ts` reason, nutrition rationale); keep live-testing flows
not yet driven end to end (Reports export, invoices email, Film Room on real video).

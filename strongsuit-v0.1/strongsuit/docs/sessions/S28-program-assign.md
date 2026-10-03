# S28 — program assignment, onboarding sample data, i18n continues

**Tool:** Claude Code · **Date:** 2026-10-03
**Tests:** app 731/731 (62 files) · server 32/32 · **Typecheck:** `tsc -b --force` clean · oxlint/lint:tailwind 0 errors

## Asked
Standing instruction: "always continue" (and "Continue") — work through everything not blocked on Caleb.

## Shipped
- **Assigning a program was half-wired** (found during the Program Builder i18n pass):
  - The builder's "Assign to client" rewrote the program in place, so assigning a **template** removed
    it from the library.
  - `client.activeProgramId` was never set by any UI path — `programsRepo.assignToClient()` existed but
    had no callers — so Quick Log never showed the client's program and roster adherence always
    assumed 3 sessions/week.
  - Now the builder saves, then calls `assignToClient()`: a template is **copied** (library keeps it,
    copy records `sourceTemplateId`), anything else is reassigned in place, the start date and
    `activeProgramId` are set, and the client's previous active program becomes `completed` (one active
    program per client). 3 repo tests. Verified live: template stays a template with no client; the
    client's active program is the copy.
- **Onboarding's sample clients were a promise the code didn't keep** (found during the wizard i18n pass):
  step 3 promised "sample history, check-ins, and active programs … Remove them anytime in one click";
  it created three bare client rows (with a timestamp as `startDate`), and `purgeDemo()` had no caller.
  Now `db/demo.ts` gives each an active program, 9 logged sessions with progressing loads (plate-friendly
  in the coach's units), 3 check-ins and 4 weigh-ins; the Clients page shows "N sample clients … Remove
  sample clients" (confirm → `purgeDemo()` removes everything). Sample clients no longer count toward
  the free 3-client cap (app + server) — before, adding them left a new free coach unable to add a real
  client. The "we'll remind you every 7 days" backup line now matches the 30-day indicator.
  2 seeder tests + 1 server test. Verified live through the real wizard + EULA: 3 clients / 27 sessions /
  9 check-ins / 3 programs; New client not blocked; remove → 0 clients, 0 logs, 0 programs.
- **i18n:** Onboarding wizard (onboard.* keys), Program Builder incl. its sub-views — outline, day canvas,
  exercise rows, exercise search, grid (builder.* keys); icon-only buttons and set inputs got aria-labels.
- **Builder bugs found in that pass:** (1) leaving the builder within the 2 s autosave debounce (Done, back,
  sidebar) dropped the edit — now flushed on unmount (not after Assign, which already saved and may have
  changed the row). (2) Duplicate week "+1 rep" did `"5" + 1` → `"51"`; now `bumpReps` ("8-10" → "9-11",
  AMRAP untouched) and "+2.5% load" skips %1RM/RPE loads (`builderMutations.ts`, 5 tests). (3) Clearing a
  load stored 0; now unset. (4) Delete week/day had no confirm. Verified live: copies `5→6` reps /
  `100→102.5`, confirm text, fast rename+Done persists, 0 raw keys, 0 console errors.

- **Three more bugs found by live-testing the i18n pass:** (1) **Quick log never opened** — the command
  palette returned `null` while closed, and Quick log is rendered inside it, so ⌘/Ctrl+L and the palette
  action both did nothing. (2) **Dialogs never focused their input** — React `autoFocus` fires while the
  `<dialog>` is still closed, then `showModal()` focuses the Close button: typing after ⌘K went nowhere and
  Enter closed the palette; same for exercise search and every "name" field. `Dialog` now focuses
  `[data-autofocus]` after `showModal()`; `Input` sets it from `autoFocus`. (3) **Session logger: "done"
  saved nothing** — the load box showed the target, but ticking a set done stored no load/reps, so sets
  done as prescribed reached history and analytics empty. `completeSet()` records the shown values (reps
  only from a plain number); a %1RM/RPE target is no longer shown as a weight. 4 tests. Verified live:
  saved `{100 kg × 5}` / `{}` for a 75%-1RM 8–10 set; ⌘K → "quick" → Enter opens Quick log; New client
  dialog takes typing immediately.
- **i18n (cont.):** sign-in/reset screens, Account & sync, Programs list (status tags no longer raw
  `draft`), session logger, Quick log (clarifying questions keyed by `status`), rest timer, log-sheet scan.

- **TV display showed only the first set** for every set (a 5/3/1 pyramid read "3×5 @100") and dropped
  %1RM/RPE; it also showed any "active" program rather than the client's current one. Now uses the
  builder's `formatSetsSummary` and `activeProgramId`. Verified live: "5 @100, 3 @110, 1 @120 · rest 180s",
  "2×8 @70%".

- **Settings → Membership** counted sample clients in its "N/3" bar (nothing else does since S28).
  **Licence card** promised "the key never leaves your computer" — false since S23 (trainer row syncs; the
  server re-verifies the key for the cap exemption); copy corrected. Companion disconnect now confirms.
  Translated: Membership, Licence, Connect Companion, TV display, exercise history.

- **Food Log** targets disagreed with the Nutrition tab (own goal shortcut: hypertrophy → "cut"); now
  `goalPlan()` like Nutrition (verified both 2445 kcal). Totals rounded (0.7 × 151.3 kcal showed 15 digits),
  "/ g" when no targets → "—", Remove was hover-only (unusable on touch). Barcode scanner: a camera granted
  after the dialog closed stayed on; lookup errors are now translated messages.

- **Stale dialog forms:** Edit client seeded its form once and stayed mounted — reopening after a change
  from another device showed old values and Save reverted them. Log check-in / Record payment / New
  appointment kept the previous entry's values; PAR-Q re-screen kept old ticks. All now mount per open.
  Verified live (edit shows the newer phone; reopened check-in is blank).

## Didn't do / couldn't
- Settings Guide, Film Room, Nutrition, Science, Assistant still hold English (DEBT-64).

## New debt
- None.

## For the next session
Continue DEBT-64: Settings Guide, then the science engines' prose.

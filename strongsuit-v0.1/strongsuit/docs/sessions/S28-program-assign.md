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
- **i18n:** Onboarding wizard (onboard.* keys), Program Builder (header, assign dialog, settings/progression dialog; builder.* keys).

## Didn't do / couldn't
- Builder sub-views (outline, grid, exercise rows) still hold English (DEBT-64).

## New debt
- None.

## For the next session
Continue DEBT-64: builder sub-views, Settings Guide, then the science engines' prose.

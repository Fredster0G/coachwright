# S28 — program assignment fix, i18n continues

**Tool:** Claude Code · **Date:** 2026-10-03
**Tests:** app 729/729 (61 files) · **Typecheck:** `tsc -b --force` clean · oxlint/lint:tailwind 0 errors

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
- **i18n:** Program Builder (header, assign dialog, settings/progression dialog; builder.* keys).

## Didn't do / couldn't
- Builder sub-views (outline, grid, exercise rows) still hold English (DEBT-64).

## New debt
- None.

## For the next session
Continue DEBT-64: builder sub-views, Onboarding wizard, Settings Guide.

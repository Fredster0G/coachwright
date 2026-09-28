# S25 — CI, mobile layouts, bundle size, date + server hardening

**Tool:** Claude Code · **Date:** 2026-09-28
**Tests:** app 671/671 (50 files) · companion 109/109 (7) · sync-server 27/27 · **Typecheck:** all clean (`tsc -b --force` app + companion, electron, server `tsc --noEmit`) · lint:tailwind 0 errors · oxlint 0 errors · no import cycles

## Asked
"Just continue to work, add on and optimize and etc." — open-ended; picked verifiable wins inside
`AGENTS.md` §7 (no spend, no deploy, no pricing changes).

## Shipped
- **CI** — `.github/workflows/ci.yml`: server typecheck + tests, app `tsc -b` + electron tsc + vitest +
  oxlint + tailwind lint + import cycles, Companion `tsc -b` + vitest. Not yet seen running (first push).
- **Desktop startup bundle 979KB → 461KB.** The Dashboard's roster card imported `lib/assistant.ts`,
  which statically imported transformers.js. `assistant`/`speech`/`embeddings` now import the runtime on
  first use (its own 518KB chunk); `cos_sim` replaced by a local cosine (tested). Verified on a
  production build in Chromium: boot never requests the chunk; the chunk imports on demand.
- **Mobile (DEBT-24 closed)** — every main page measured at 375px for horizontal overflow. Two real
  bugs on the client page: header actions ran off-screen, and the last tabs (Messages, Billing) were
  unreachable because `Tabs` couldn't scroll. `Tabs` now scrolls and keeps the active tab in view;
  header wraps; Gym's cut fields stack. Verified at 375 and 1280.
- **Dashboard (DEBT-1 closed)** — per-client facts built in one grouped pass and memoised
  (`lib/clientFacts.ts`), instead of re-filtering every row per client each render. Test proves it's
  identical to the old code on randomised data.
- **Dates** — five more records were stamped with the UTC day (new check-in, new payment, new
  appointment, roster-summary window, Film Room/Companion filenames). All local now; only
  FoodLogTab's UTC-noon arithmetic remains, which is correct.
- **Server** — `/health` checks the database (503 when it can't); graceful SIGTERM shutdown closes the
  DB cleanly (verified); reset emails throttled to one a minute per account (tested).

## Closed debt
1, 24.

## Didn't do / couldn't
- Companion still shows a "Personal Cloud" pricing card from the superseded strategy — pricing is
  Caleb's (noted on DEBT-79).
- No real phone; Film Room checked with one generated clip, not two real videos.

## For the next session
Watch the first CI run on the PR; fix anything environment-specific it surfaces.

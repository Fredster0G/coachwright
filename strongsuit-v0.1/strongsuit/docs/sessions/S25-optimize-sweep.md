# S25 — CI, mobile layouts, bundle size, date + server hardening

**Tool:** Claude Code · **Date:** 2026-09-28
**Tests:** app 676/676 (51 files) · companion 109/109 (7) · sync-server 27/27 · **Typecheck:** all clean (`tsc -b --force` app + companion, electron, server `tsc --noEmit`) · lint:tailwind 0 errors · oxlint 0 errors · no import cycles

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

- **Second pass (Caleb: "keep going, delete the personal cloud card")** — Companion's Personal Cloud
  pricing card and its `personalCloudTier` field deleted. Sidebar gained an always-visible **sync
  indicator** (Synced / Syncing / Offline · N waiting / Sync problem / Over free client limit) — verified
  live through an offline → online cycle. Backup indicator no longer alarms new accounts (neutral until
  a backup is 30 days old). Dashboard bug: a never-logged client read "No session logged in ever days"
  (fixed + test). Copy still describing the pre-cloud app corrected: "No account needed — there isn't
  one" (Dashboard), photos "stay on this device", backups "everything lives on this device", restore
  warnings (replace now wipes every signed-in device), Companion's "WiFi or packet file", Guide's
  import location, onboarding storage note.

- **Electron** — Print sheets and TV mode did nothing in the packaged app (`window.open` of an `app://`
  page was denied); they now open as locked-down app windows. The `app://` handler could be asked for
  paths that decode outside `dist/` (`..%2F`); now refused (hardening — the old code's fetch failed
  rather than leaking a file). Both decisions moved to `electron/policy.ts` with tests; verified in real
  Electron under Xvfb (old code: no window; new: window opens, traversal 404). Untracked stale
  `dist-electron/*.js` that `.gitignore` already excluded.

- **Desktop, third pass** — the desktop app never reported RAM: `hardwareProbe.ts` called a
  `systemInfo()` bridge that main/preload never implemented, so every model needing RAM (OCR, voice,
  assistant, bigger pose models) showed "can't tell how much memory" on desktop. Added the `system-info`
  IPC (os.totalmem, cores, statfs free disk). Then verified in packaged-mode Electron under Xvfb:
  Film Room tracking loads its wasm/model over app:// and **falls back GPU→CPU** when WebGL2 is missing
  (closes DEBT-29); OCR installs and reads a generated sheet ("225 ×5 / 225 ×5 / 235× 3" → 3 sets).
  Dialogs now named by their title (`aria-labelledby`); exercise search is a proper combobox/listbox.

- **Local AI for everyone (Caleb: "the models run on their own systems… up to you")** — removed the
  edition gate: `offerFor`/`offersFor`/`defaultSelection` take no edition, `maxAiTier` and the
  `blocked-edition` state are gone. Hardware alone decides; OCR/voice/assistant open to every plan.

## Closed debt
1, 24, 29, 70.

## Didn't do / couldn't
- No real phone; Film Room checked with one generated clip, not two real videos.

## For the next session
Watch the first CI run on the PR; fix anything environment-specific it surfaces.

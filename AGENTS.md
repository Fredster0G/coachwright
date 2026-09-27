# AGENTS.md — how to work on Coachwright

Read by any AI coding tool (Claude Code, Antigravity/Gemini, Cursor, …). `CLAUDE.md` points here so
there is exactly one protocol, not one per tool. **Caleb switches tools mid-project on purpose** — this
file is what makes stopping in one and resuming in the other safe.

---

## 1. Read this much, and no more

| When | Read | Cost |
|---|---|---|
| **Every session, first thing** | `docs/STATUS.md` | ~120 lines |
| Picking what to do | `docs/ROADMAP.md` | ~200 lines |
| Before touching anything | `docs/DEBT.md` (skim for your area) | ~120 lines |
| Deep context on one subsystem | that subsystem's `docs/*.md` | varies |

**Do NOT read `PROGRESS.md` front-to-back.** It is a 380-line *archive* of sessions S1–S15, and several
entries are single 5,000-character paragraphs. It is kept for history and is no longer appended to.
Grep it when you need the story behind a specific decision; never load it wholesale.

## 2. Where things live (one canonical copy — this was violated and caused a real bug)

```
coachwright/                       ← repo root
  AGENTS.md   CLAUDE.md            ← this protocol
  PROGRESS.md  HANDOFF_SONNET.md   ← FROZEN ARCHIVES. Do not edit. Do not append.
  PRODUCT_OVERVIEW.md              ← marketing/positioning source of truth
  BRANDING_PLAN.md                 ← brand source of truth (the app-dir file is a pointer)
  strongsuit-v0.1/strongsuit/      ← THE APP. All code + all live docs.
    docs/STATUS.md                 ← current state (read first)
    docs/ROADMAP.md                ← what's left, prioritized, with tool routing
    docs/DEBT.md                   ← open debts only, unique ids
    docs/CLOUD.md                  ← backend architecture, sync model, API, operator runbook
    docs/sessions/S##-slug.md      ← append-only session logs, one small file each
  strongsuit-v0.1/sync-server/     ← Coachwright Cloud: accounts, sync, Companion API, Stripe (`npm test`)
  strongsuit-v0.1/companion-app/   ← the client-facing PWA (separate npm project)
  client-pwa/                      ← empty stub (a bare package-lock.json) — not a project, ignore it
```

**Rule:** live docs live in `strongsuit-v0.1/strongsuit/docs/` **only**. Root-level `PROGRESS.md` and
`HANDOFF_SONNET.md` used to be duplicated into the app dir and **silently diverged** — by S15 the two
copies disagreed about what had shipped. Never recreate that pattern. If you need a root-level pointer,
make it a pointer, not a copy.

## 3. Session protocol

**On start**
0. Install: `npm ci` in each project you'll touch. (Before S22 the app's `package.json` depended directly
   on a Windows-only rolldown binary, so `npm ci` failed on Linux/macOS; and `companion-app`'s lockfile
   was out of sync. Both fixed — if either comes back, a platform-specific package was added by hand.)
1. Read `docs/STATUS.md`.
2. Check its "Baton" section — what the previous tool left half-done, and what not to touch.
3. Confirm the tree is clean-ish: `git status`, `npx tsc -b --force`, `npx vitest run`.

**On finish (all four, every time — even a 20-minute session)**
1. Write `docs/sessions/S##-slug.md` — a **new file**, never an edit to an existing one.
2. Update `docs/STATUS.md` in place (it is the only file that gets rewritten).
3. Add any new debt to `docs/DEBT.md` with the next free id. **Never reuse an id.**
4. Re-run the per-project checks in §4 for every project you touched and put the real numbers in the
   session file.

Session files are capped at **~60 lines**. If yours is longer, you are writing narrative — cut it. The
format is in `docs/sessions/TEMPLATE.md`.

## 4. Verification bar (this project's actual standard — do not lower it)

### ⚠️ `npx tsc --noEmit` at the repo root checks ZERO files. Use `npx tsc -b --force`.

Discovered S15, the hard way: the app's root `tsconfig.json` is a **solution file** — `"files": []` with
only `references` to `tsconfig.app.json`/`tsconfig.node.json`. Running plain `tsc --noEmit` against it
(no `-b`) compiles nothing and reports zero errors, **always**, regardless of what's actually broken.
Every "clean typecheck" claimed against the app in every session before this one — including within this
same session, before this was caught — was a false negative.

The real check surfaced **265 genuine compile errors** the moment it was run correctly, including: a
100+-line duplicate-key/wrongly-nested block in the i18n catalogue that broke the entire translation type
system app-wide; a component (`WiFiSyncDialog.tsx`) with a module-scope handler referencing component-local
variables that don't exist at that scope (dead code, never reachable, sat unnoticed for an unknown number
of sessions); several `t`-shadowed-by-a-local-variable bugs where a translated string silently tried to
call a data object instead of the translator; and calls to repo methods (`.add()`, `.delete()`) that were
never defined. **None of this showed up in any session's reported "clean typecheck" until build mode was
used.** If a "clean typecheck" is ever claimed again from a bare `tsc --noEmit` at the app root, distrust
it and re-run with `-b --force`.

**`companion-app/` has the exact same solution-file setup** — `npx tsc --noEmit` there also checks zero
files (confirmed S22 with `--listFilesOnly`). Use `npx tsc -b --force` in `companion-app/` too. (Until S22
this section said the opposite; it happened to be clean under `-b`, so nothing was hidden, but the
instruction was wrong.) Only `sync-server/` has a plain `tsconfig.json` where `npx tsc --noEmit` is the
right command — and it now includes `test/`.

**Per-project checks, all three:**

| Project | Typecheck | Tests |
|---|---|---|
| `strongsuit/` | `npx tsc -b --force` | `npx vitest run` (+ `npm run lint:tailwind`, `npx oxlint`) |
| `companion-app/` | `npx tsc -b --force` | `npx vitest run` |
| `sync-server/` | `npx tsc --noEmit` | `npm test` (needs `npm rebuild better-sqlite3` if installed with `--ignore-scripts`) |

This codebase has a consistent, unusually high bar otherwise. Match it:

- **Verify before building.** Every local-AI feature was proven against a real model in a standalone
  script *before* app code was written. Twice that caught a wrong assumption (a model size that only
  matched one quantization; an image that was silently corrupted).
- **Live-verify UI, don't assume.** Run the dev server, read the console, click the thing. Several
  "working" features in this project's history were broken in ways only a live click revealed
  (`DayCanvas`'s Add Exercise silently no-op'd for every user, desktop and mobile, for multiple sessions).
- **Report honestly.** If a thing is unmeasured, say "unmeasured," not "works." The existing docs do
  this everywhere and it is why they are trustworthy. Fabricated confidence is the one unrecoverable
  mistake here.
- **Tests are pure-logic-first.** Every `lib/*.ts` with real logic has a `lib/*.test.ts`. I/O glue is
  verified live instead. Follow the existing split.

## 5. Landmines — read before touching these

| Area | Why it bites |
|---|---|
| `lib/licence.ts` | Pre-2026-08 one-time licence keys, verified offline, **never expire**. Don't change the claim shape or canonicalization — already-issued keys would stop verifying. (Membership no longer uses signed tokens since S23; it's an account lookup.) |
| `lib/cloud/` + `sync-server/server.ts` | `SYNCED_TABLES` (app) and `SYNC_TABLES` (server) must match — a table missing on either side silently never syncs. `Table.clear()` skips the Dexie hooks, so its deletions never reach the cloud; use `toCollection().delete()`. `linkDevice()`'s rules are what stop two accounts' data mixing on one machine — read `docs/CLOUD.md` §2 before touching them. Companion's writes are forced onto its own client server-side (`/client/push`); keep it that way. |
| `electron/` | Packaging has burned two sessions. Orphaned `node.exe` processes hold file locks and produce `EPERM` failures that look like antivirus. Always `Get-Process node,electron` before a build. |
| Tailwind classes | **Systemic recurring bug (DEBT-20).** Undefined classes silently no-op instead of erroring. Every model writing classes from memory reintroduces them. Grep `tailwind.config.js` before using any color/shadow/animation class you did not just look up. |
| `trainerRepo.getOrCreate()` | First-boot race, fixed twice, observed live again once. Single-flighted now. Don't "simplify" it. |

## 6. House style

- Comments explain **why**, not what. Look at `lib/licence.ts`'s header for the register — it explains a
  business promise and names the test that enforces it.
- Match surrounding comment density. This codebase is heavily commented **at decision points** and bare
  elsewhere. Don't uniformly comment everything.
- Brand strings come from `lib/brand.ts`. Never hardcode "Coachwright" in a component.
- Prefer honest UI copy that explains *why* something is unavailable over hiding it.

## 7. Do not do these without asking Caleb

- Spend real money, use real Stripe keys, or deploy anything (including Coachwright Cloud).
- Delete data, force-push, or rewrite git history.
- Change the pricing model, the brand promise, or anything in `PRODUCT_OVERVIEW.md` §8.
- Add a dependency over ~10MB, or any **third-party** service the app calls at runtime (Coachwright Cloud
  itself and Open Food Facts are the only ones today; Stripe is server-side).
- Mark a roadmap item done that you could not verify.

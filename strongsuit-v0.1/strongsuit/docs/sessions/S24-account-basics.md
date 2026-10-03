# S24 — password reset, account deletion, server-side cap, debt sweep

**Tool:** Claude Code · **Date:** 2026-09-27
**Tests:** app 667/667 (48 files) · companion 109/109 (7) · sync-server 27/27 · **Typecheck:** all clean (`tsc -b --force` app + companion, electron, server `tsc --noEmit`) · lint:tailwind 0 errors · oxlint 0 errors · no import cycles

## Asked
"Do password reset and account deletion / also handle the debts."

## Shipped
- **Password reset (DEBT-73)** — `POST /auth/reset/request` (same answer for unknown emails, sends in the
  background, sha256-stored token, 1h, newest only) + `/auth/reset/confirm` (sets password, signs out
  every device, signs this one in). Email = one `fetch` to Postmark, off until `POSTMARK_SERVER_TOKEN` +
  `MAIL_FROM` exist; dev prints the email. App: "Forgot password?" → email → link opens a prefilled
  "Choose a new password" screen; desktop users paste the code. Signed-in devices opening the link go
  to Account.
- **Account deletion (DEBT-76)** — `DELETE /auth/account` (password required; cancels a live Stripe
  subscription first and deletes nothing if that fails; cascades every table). App: Delete account card
  on Account & sync — backup button, password + typed DELETE, then `eraseThisDevice()` wipes every
  local table and the account link, back to first run.
- **Server-side free cap (DEBT-74/66)** — `/data/push` refuses a client becoming the 4th active one for
  non-members; members and server-verified one-time licences exempt; first push sets a never-claw-back
  allowance; archives apply before activations in a batch. App keeps refused clients dirty and explains
  on Account & sync.
- **Date bugs found + fixed** — several places used `toISOString().slice(0, 10)` (the UTC day):
  Companion's `today()` (evening workouts in the Americas logged as tomorrow), training-load day keys
  (east of UTC every session landed a day off → ACWR/monotony wrong), quick-log "yesterday", invoice and
  PAR-Q dates, progress-report range, coupon expiry. Regression tests run in Asia/Tokyo and fail on the
  old code.
- **DEBT-21** real session-pack ledger (`lib/sessionPacks.ts`), shown on the Billing tab.
- **DEBT-70 (part)** deleted six edition flags nothing read. **DEBT-11** dropped the unused
  `vision_wasm_module_internal.*` (11MB) from both apps. **DEBT-13** Alt+Space/←/→ drive the Reference
  clip. **DEBT-78** web `/#/assistant` redirects home. **DEBT-60 (part)** copies now checked by tests.
- **Live-verified in Chromium** (real server + app): cap notice after a 4th client → sign out → forgot
  password → link from the dev mail log opens prefilled → new password signs in → delete account →
  first-run screen, 0 local clients, login 401. Web build: `/#/assistant` → `/#/`. 0 console errors.

## Closed debt
3 (stale — oxlint has a config; ESLint is tailwind-only), 11, 13, 21, 66, 73, 74, 76, 78.

## Didn't do / couldn't
- No real email sent — no Postmark account (DEBT-80, Caleb). Not deployed.
- DEBT-70's remaining question (does Membership include a bigger AI tier) is pricing — Caleb.
- Not touched, with reason: 75/72/79 (legal/brand, Caleb) · 17/7/10/61/29/48/57/58/24 (need real
  hardware, footage or other browsers) · 64 i18n (large; routed to Antigravity) · 65 (product decision) ·
  77 (needs an object-storage provider — a third-party service, `AGENTS.md` §7) · 26 (deliberate scope) ·
  1/2/14 (harmless; renaming spec files breaks cross-refs).
- EULA doesn't mention deletion — left for the lawyer (noted on DEBT-75).

## New debt
`80` reset email never really sent · `81` first-push allowance is trusted · `82` deletion clears only
the device it ran on

## For the next session
Deploy (ROADMAP §1.1) + Postmark, then one real reset email (DEBT-80).

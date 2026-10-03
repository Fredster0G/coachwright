# DEBT — open items only

**Original numbering preserved** so older docs' cross-references still resolve. **Never reuse an id** —
duplicate ids have already caused a fixed bug to be "rediscovered" and re-fixed a session later.
Next free id: **85**.

Closed debts are *not* listed here. Pre-S21 closures live in the frozen `PROGRESS.md` archive; later ones
are recorded in the closing session's file under `docs/sessions/` — grep by number.

**Status key:** 🔴 active risk · 🟡 known limitation, accepted for now · ⚪ cosmetic / cleanup · ✅ deliberate won't-do

---

## 🔴 Active risk

**9 · Docs were duplicated at repo root and in the app dir, and diverged.** By S15 the two `PROGRESS.md`
copies disagreed about what had shipped. **Partially resolved S15** — live docs now exist only in
`strongsuit-v0.1/strongsuit/docs/`, root copies frozen as archives. *Remaining: don't recreate the
pattern. See `AGENTS.md` §2.* **S22 found one more live instance:** `BRANDING_PLAN.md` existed at the root
and in the app dir, already diverged (the app copy predated S11's shipped logo). App copy is now a pointer.

**75 · (S23, NEW) Privacy & legal after dropping E2EE.** Coach and client data (incl. health data:
check-ins, PAR-Q, food logs, photos) is now readable by the operator. The EULA's §3/§4 were rewritten
to say so (`EulaScreen.tsx`); there is no privacy policy, no DPA, and nobody legal has read either.
**Blocker before real customers.** Consider encryption at rest on the VPS disk. S24 notes for the
lawyer: account deletion now exists (`DELETE /auth/account`, `CLOUD.md` §3) but the EULA doesn't
mention it, and deleted rows survive in Litestream backups for the bucket's retention window.

**17 · Android has never been compiled.** `android/` is a real generated Capacitor project, but no SDK
has existed in any build environment. "Next step ready," not "done."


**7 / 10 / 61 · Film Room has never seen real human footage.** Rep-counter thresholds (35%/12% of
observed ROM, 10-sample warm-up, 25° min range) are unit-tested against *synthetic* series only. Expect
a tuning pass after real-footage QA. Same gap in Companion, and nothing has been measured on a real
mid-range phone.

---

## 🟡 Known limitation

**26 · Client portability excludes** invoices/expenses/challenges — a ported client's payment ledger
doesn't travel. Documented scope choice, not an oversight.

**48 · Dual-clip tracking's hardware cost is unmeasured.** `'both'` mode runs two concurrent MediaPipe
instances. It's opt-in *because* of this, but never tested on hardware marginal for even one.

**57 · Web Push needs one real-device round trip.** Server side fully verified via curl; the
grant→subscribe→deliver→notification path can't be exercised in a sandbox that hard-denies prompts.

**57b · Reminders are pull-only by design** — released when Companion next opens and syncs, not at the
minute. UI says so. Minute-accuracy needs the Capacitor wrap.

**58 · Lighthouse and cross-browser never run.** One browser engine available, no Lighthouse CLI.
Unmeasured, not failing.

**60 · Code copied between the two apps and the server** — separate npm projects, no shared package.
S24 made the copies *checked*, not shared: `pose.ts` must be byte-identical (Companion `lib/core.test.ts`),
and the synced-table list + licence public key must match between app and server (`lib/cloud/syncEngine.test.ts`).
`core.ts` is deliberately different per app (Companion's is a small subset) — S24 found its `today()` was
the UTC day, fixed.

**64 · i18n: about 13 components still hold hardcoded English** (re-measured S27 — the old "~53 of 57"
was stale: 30 of 55 feature components already use `t()`). Calendar, Messages, Team, Leads, Leaderboard, Reports, Studio (hub + location), Library (+ video viewer) converted S27; Program Builder (incl. outline, grid, rows, exercise search), Onboarding wizard, sign-in/Account, Programs list,
session logger, Quick log, rest timer, log-sheet scan S28. Biggest left: Settings
Guide, Film Room, Nutrition tab, Science, Assistant. Pattern for engine prose: `lib/quickLog.ts` clarifications now carry
`status` + `query` and the UI picks the message key — do the same for `progression.ts` `reason` and `describePlan`. `lib/schedule.ts` `describeRule()` still returns English. **The science screens (Nutrition, Film Room
summaries, readiness) are mostly engine-written prose from `lib/` (rationale, notes, warnings)** — translating
only their component labels yields a half-English page; those engines need message keys + params first. Layer + RTL are done.
`es.json`/`ar.json` are **seed translations** marked in their own `_meta` — must not ship to customers
as finished locales.

**65 · `symptomReadinessContribution()` has zero callers.** Correct and tested, but the only device with
cycle data is Companion, which has no readiness engine, and cycle rows are kept out of the sync payload
by construction. **Do not close this by adding cycle rows to the payload** — a test forbids it. Needs a
product decision: build readiness in Companion, or a per-field opt-in sharing only this number.

**72 · (S22, NEW) The pitch deck still sells the old model.** `Coachwright Pitch Deck.dc.html` headlines
"$60. Forever." / "$60 once", and root `BRANDING_PLAN.md` §1's positioning says "buy once and own
outright". `BRANDING_PLAN.md` §5 and `STRONGSUIT_MASTER_SPEC.md` now carry a superseded banner; the deck
and the positioning statement were left alone because rewriting a pitch is a brand decision, not a doc
sweep (`AGENTS.md` §7). Caleb to rewrite or retire the deck. **Same for `PRODUCT_OVERVIEW.md` §8's
Membership row** ("Everything in Free, uncapped: unlimited clients, program builder, full Film Room,
business tools") — it reads as if Free lacks those, which the code does not do (DEBT-70). §8 is
Caleb-only per `AGENTS.md` §7, so it was not edited.

**77 · (S23, NEW) Progress photos sync as data URLs inside JSON rows.** Simple and works, but it's the
largest storage/bandwidth cost per coach and makes every photo edit re-upload the image. Move to object
storage (S3/R2) with signed URLs when volume justifies it.

**80 · (S24, NEW) Password-reset email has never really been sent.** The flow is tested end to end with
the mailer stubbed, and live in Chromium via the dev console "mail"; the Postmark call itself
(`mailer.send` in `server.ts`) has never hit Postmark. Needs an account + verified sender (Caleb), then
one real reset.

**81 · (S24, NEW) The free cap's "never claw back" allowance trusts the first push.** An account's first
`/data/push` sets its allowance to however many active clients it carries — that's how a pre-cloud
install keeps its roster. A hand-crafted first push could claim a bigger allowance once. Accepted: the
cap is a nudge, and the in-app check still applies. Same for `isDemo` (S28): sample clients don't count,
so a crafted push could mark real clients as samples.

**82 · (S24, NEW) Deleting the account clears only the device it was deleted from.** Other signed-in
devices are signed out (their session is gone) but keep their local copy until someone signs in there
(which replaces it) or they export and wipe it. Say so if a coach asks for erasure "everywhere".

**83 · (S26, NEW) Booking slots ride on the trainer row.** The open slots are published as
`trainer.bookingSlots`, so the whole trainer row (logo data URL included) re-uploads whenever the offer
changes — about once a day as the 14-day window rolls, plus on every booking/calendar change. Fine at
today's sizes; move slots to their own row if the logo grows or coaches have many locations. Same
family: since S26 the logo (≤256px PNG) also rides in every Companion `/client/bundle` response.

**84 · (S26; built S27) Coach notifications — code done, email never really sent.** While the app is
open: opt-in system notifications (`lib/coachNotify.ts`). While it's closed: opt-in email
(Settings → Notifications → "Also email me", server `notifyCoachByEmail`: client's first name only, never
the message text, at most one per 30 min). The email path is tested with the mailer stubbed and has
never reached Postmark (same blocker as DEBT-80). Neither has been seen on a real desktop.

**79 · (S23, NEW) Old pricing tiers still described in strategy docs.** The $15/mo managed relay and the
free self-hosted relay no longer exist. `SERVER_STRATEGY.md`, `CLIENT_APP_STRATEGY.md`,
`PRODUCT_OVERVIEW.md` carry a superseded banner rather than a rewrite (§8 is Caleb-only). Also decide
whether cloud storage for free-tier coaches needs a limit.

---

## ⚪ Cosmetic / cleanup

**2** Two `as any` casts at Dexie generic boundaries — documented, contained.
**14** Spec/doc *filenames* still say STRONGSUIT (`STRONGSUIT_MASTER_SPEC.md`). Product is Coachwright.

---

## ✅ Deliberate won't-do

**59 · No live relay messaging or WiFi sync in `companion/template.html`.** The request rested on a false
premise — that file has no keys and is not a paired Device. Doing it would mean either baking a private
key into an emailed file, or reimplementing the pairing handshake in vanilla JS against `file://`.
Chose neither. The broken WiFi button (which POSTed plaintext to an endpoint requiring a sealed packet,
failing at two layers) was removed, along with a CDN `<script>` that violated offline doctrine.
**Precedent: no CDN scripts, anywhere.** Revisit only if the HTML export needs live sync badly enough to
justify on-device key generation.

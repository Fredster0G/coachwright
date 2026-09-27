# DEBT — open items only

**Original numbering preserved** so older docs' cross-references still resolve. **Never reuse an id** —
duplicate ids have already caused a fixed bug to be "rediscovered" and re-fixed a session later.
Next free id: **80**.

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
**Blocker before real customers.** Consider encryption at rest on the VPS disk.

**17 · Android has never been compiled.** `android/` is a real generated Capacitor project, but no SDK
has existed in any build environment. "Next step ready," not "done."


**7 / 10 / 61 · Film Room has never seen real human footage.** Rep-counter thresholds (35%/12% of
observed ROM, 10-sample warm-up, 25° min range) are unit-tested against *synthetic* series only. Expect
a tuning pass after real-footage QA. Same gap in Companion, and nothing has been measured on a real
mid-range phone.

---

## 🟡 Known limitation

**11 · Distribution carries ~22MB of wasm + pose models** in `public/mediapipe/`. Must stay bundled
(offline doctrine). Could prune to SIMD + nosimd only.

**21 · `sessionsRemaining` is an estimate**, not a decrementing pack ledger — it's `purchased credits −
all-time logged sessions`. Fine as a nudge; do not present it to a buyer as exact. *Now that money is
involved, worth making real.*

**24 · Responsive unverified** on Film Room's dual-video stage (will not fit 375px side-by-side),
Calendar, Business/Billing tabs, and Settings. Verified fine: Dashboard, Clients, Programs, Builder.

**26 · Client portability excludes** invoices/expenses/challenges — a ported client's payment ledger
doesn't travel. Documented scope choice, not an oversight.

**29 · GPU→CPU delegate fallback never tested** on hardware actually lacking WebGL2. The fallback path
is structurally sound; the GPU path is what's been verified.

**48 · Dual-clip tracking's hardware cost is unmeasured.** `'both'` mode runs two concurrent MediaPipe
instances. It's opt-in *because* of this, but never tested on hardware marginal for even one.

**57 · Web Push needs one real-device round trip.** Server side fully verified via curl; the
grant→subscribe→deliver→notification path can't be exercised in a sandbox that hard-denies prompts.

**57b · Reminders are pull-only by design** — released when Companion next opens and syncs, not at the
minute. UI says so. Minute-accuracy needs the Capacitor wrap.

**58 · Lighthouse and cross-browser never run.** One browser engine available, no Lighthouse CLI.
Unmeasured, not failing.

**60 · `pose.ts`, `core.ts`, `singleFlight` duplicated** across the two apps — separate npm projects, no
shared package. (`sync.ts` was the fourth; S23 deleted it from both.) Also now: the synced-table list lives
in the app (`lib/cloud/tables.ts`) and the server (`SYNC_TABLES`) and must be kept equal by hand.

**64 · i18n: ~53 of 57 components still hold hardcoded English.** Layer + RTL are done and the pattern
is proven. `es.json`/`ar.json` are **seed translations** marked in their own `_meta` — must not ship to
customers as finished locales.

**65 · `symptomReadinessContribution()` has zero callers.** Correct and tested, but the only device with
cycle data is Companion, which has no readiness engine, and cycle rows are kept out of the sync payload
by construction. **Do not close this by adding cycle rows to the payload** — a test forbids it. Needs a
product decision: build readiness in Companion, or a per-field opt-in sharing only this number.

**70 · (S22, NEW) Edition capability flags still describe the pre-pivot product.** `lib/edition.ts`'s
`programBuilder`, `filmRoomPro` and `business` flags are `false` for Personal but **nothing reads them** —
every tier gets those features, which is what S15's pricing actually promises. Two flags ARE enforced and
are now wrong-shaped for Membership: `maxAiTier` (a $29 member is still `personal`, so the standard/pro
assistant tiers show "Included with the Independent and Studio editions" — editions nobody can buy since
S15; the tiers are inert anyway, see ROADMAP §3) and `multiSeat` (fine — Studio really is separate). Needs
a product decision: does Membership map to an AI tier? Then either delete the three dead flags or wire
them. S22 fixed only the false *copy* (`PERSONAL.upgradeReason`, `MembershipCard`).

**72 · (S22, NEW) The pitch deck still sells the old model.** `Coachwright Pitch Deck.dc.html` headlines
"$60. Forever." / "$60 once", and root `BRANDING_PLAN.md` §1's positioning says "buy once and own
outright". `BRANDING_PLAN.md` §5 and `STRONGSUIT_MASTER_SPEC.md` now carry a superseded banner; the deck
and the positioning statement were left alone because rewriting a pitch is a brand decision, not a doc
sweep (`AGENTS.md` §7). Caleb to rewrite or retire the deck. **Same for `PRODUCT_OVERVIEW.md` §8's
Membership row** ("Everything in Free, uncapped: unlimited clients, program builder, full Film Room,
business tools") — it reads as if Free lacks those, which the code does not do (DEBT-70). §8 is
Caleb-only per `AGENTS.md` §7, so it was not edited.

**66 · (S15) The free-tier client cap is soft.** `canAddClient()` checks the coach's own IndexedDB; a
determined user can edit it. S23 made it *fixable* (accounts are server-authoritative now) — see DEBT-74.

**73 · (S23, NEW) No password reset.** A coach who forgets their password is locked out of the account
(their devices keep working and can export). Needs an email sender (Postmark/SES, ~$0–15/mo) and a
`/auth/reset` token flow. Until then it's a manual support job: set a new scrypt hash in `accounts`.

**74 · (S23, NEW) Free-tier cap isn't enforced server-side.** The server knows membership and can count a
coach's active `clients` records, so `/data/push` could refuse a 4th active client for a non-member. Not
built: it needs a clear UX for "your push was refused" and care with archived/restored clients.

**76 · (S23, NEW) No account or data deletion.** No `/auth/delete`; GDPR/CCPA erasure is a manual SQL job.
Cascades are already in the schema (`ON DELETE CASCADE` from `accounts`), so the route is small.

**77 · (S23, NEW) Progress photos sync as data URLs inside JSON rows.** Simple and works, but it's the
largest storage/bandwidth cost per coach and makes every photo edit re-upload the image. Move to object
storage (S3/R2) with signed URLs when volume justifies it.

**78 · (S23, NEW) Web build: `/#/assistant` typed by hand shows the route error page** rather than
redirecting. Every link to it is hidden on web; cosmetic.

**79 · (S23, NEW) Old pricing tiers still described in strategy docs.** The $15/mo managed relay and the
free self-hosted relay no longer exist. `SERVER_STRATEGY.md`, `CLIENT_APP_STRATEGY.md`,
`PRODUCT_OVERVIEW.md` carry a superseded banner rather than a rewrite (§8 is Caleb-only). Also decide
whether cloud storage for free-tier coaches needs a limit.

---

## ⚪ Cosmetic / cleanup

**1** Dashboard attention-queue scans all logs in memory — fine at current scale.
**2** Two `as any` casts at Dexie generic boundaries — documented, contained.
**3** No ESLint flat-config customization yet.
**13** Keyboard transport (Space/←/→) drives only the master video; the Reference bar is mouse-only.
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

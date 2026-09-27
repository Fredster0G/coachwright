# DEBT — open items only

**Original numbering preserved** so older docs' cross-references still resolve. **Never reuse an id** —
duplicate ids have already caused a fixed bug to be "rediscovered" and re-fixed a session later.
Next free id: **73**.

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

**68 · (S20/S21, NEW) Client portability also excludes `foodEntries` — same shape as DEBT-26, not yet
documented as a choice.** `db/portability.ts`'s `exportClientPackage`/`rekeyClientPackage` never gained a
food-log branch when the food feature shipped. A client's diet history doesn't travel with them to a new
coach or a rekeyed package. Real health data, worth closing deliberately rather than leaving silent —
note `FoodEntry.foodItemId` points at a *shared*, non-client-scoped `FoodItem` cache row (keyed by
barcode), so a correct fix needs to decide whether to bundle the referenced `FoodItem`s into the package
too, not just remap `FoodEntry` the way `habitEntries` remaps `habitId`.

**29 · GPU→CPU delegate fallback never tested** on hardware actually lacking WebGL2. The fallback path
is structurally sound; the GPU path is what's been verified.

**48 · Dual-clip tracking's hardware cost is unmeasured.** `'both'` mode runs two concurrent MediaPipe
instances. It's opt-in *because* of this, but never tested on hardware marginal for even one.

**49 · `vite-plugin-pwa` blocked** by its Vite `^6` peer cap; both apps are on Vite 8. Manifest + service
worker are hand-rolled instead. Revisit when the plugin supports Vite 8.

**54 · Electron LAN sync loop needs one two-device pass.** Contract-verified against a stub and the IPC
response bug is fixed, but the real GUI-hosting-a-phone-sync loop has never run.

**57 · Web Push needs one real-device round trip.** Server side fully verified via curl; the
grant→subscribe→deliver→notification path can't be exercised in a sandbox that hard-denies prompts.

**57b · Reminders are pull-only by design** — released when Companion next opens and syncs, not at the
minute. UI says so. Minute-accuracy needs the Capacitor wrap.

**58 · Lighthouse and cross-browser never run.** One browser engine available, no Lighthouse CLI.
Unmeasured, not failing.

**60 · `sync.ts`, `pose.ts`, `core.ts`, `singleFlight` duplicated** across the two apps — separate npm
projects, no shared package. Three copies was the stated trigger for extracting a workspace. We're past it.

**62 · Service worker is cache-first with background revalidate**, so the first load after an update can
serve the previous build. "Reload twice" is the honest answer. Bump `CACHE` in `public/sw.js` on
releases where it matters.

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

**71 · (S22, NEW) A membership can't survive a reinstall without a backup restore.** Membership is keyed
by the device id and authorized by `trainer.membershipSecret`; both live in the trainer row. A backup
restore brings both back. A fresh install without one gets a new device id, and the server (correctly)
won't hand the old membership to it. There is no self-serve re-link — today it's a support job (look the
coach up by Stripe customer, update `memberships.coach_id`/`secret_hash` by hand). Build a re-link flow
(e.g. Stripe portal round-trip that proves card ownership) before this matters at volume.

**72 · (S22, NEW) The pitch deck still sells the old model.** `Coachwright Pitch Deck.dc.html` headlines
"$60. Forever." / "$60 once", and root `BRANDING_PLAN.md` §1's positioning says "buy once and own
outright". `BRANDING_PLAN.md` §5 and `STRONGSUIT_MASTER_SPEC.md` now carry a superseded banner; the deck
and the positioning statement were left alone because rewriting a pitch is a brand decision, not a doc
sweep (`AGENTS.md` §7). Caleb to rewrite or retire the deck. **Same for `PRODUCT_OVERVIEW.md` §8's
Membership row** ("Everything in Free, uncapped: unlimited clients, program builder, full Film Room,
business tools") — it reads as if Free lacks those, which the code does not do (DEBT-70). §8 is
Caleb-only per `AGENTS.md` §7, so it was not edited.

**66 · (S15, NEW) The free-tier client cap is soft.** `canAddClient()` checks the coach's own IndexedDB;
a determined user can edit it. This was fine when licensing was cosmetic — it now guards revenue.
Unfixable without server-authoritative accounts, which would mean a different product. Accepted, but
name it honestly rather than assuming it's enforcement.

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

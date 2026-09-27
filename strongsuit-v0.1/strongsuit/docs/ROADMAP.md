# ROADMAP

Prioritized by *what unblocks revenue*, not by what's fun to build. Every item carries a **depth flag**
(is the existing version real or thin?), an **effort**, and a **routing** call — which tool should do it.

**Routing legend**
- 🟦 **Claude Code** — crypto, sync, Electron, anything cross-cutting or where a silent failure is costly
- 🟨 **Antigravity / Gemini** — bulk content, mechanical conversion, self-contained UI, well-specified features with a clear acceptance test
- 🟥 **Caleb only** — real money, real keys, real hardware, real decisions

---

## 0. The business-model question (decide before building much else)

Gemini's advice was: kill the offline/self-hosted option, go pure hosted SaaS, protect the IP, build MRR
for a buyout. **Parts of that are right and parts rest on a false premise.** Separating the three things
it bundles together:

| Question | Verdict |
|---|---|
| **One-time vs. subscription pricing?** | **Gemini is right, and it's already done (S15).** $29/mo membership + free tier ships today. The MRR argument is fully satisfied without changing anything else. |
| **Should data live on our server instead of the coach's machine?** | **No.** This is not a config change, it's a **rewrite**: auth, multi-tenant DB, migrating every Dexie repo call, session management — months of work — and it deletes the E2EE privacy story that is currently the only thing no competitor can copy. Local-first is also *why* the app works on a gym floor with bad wifi. |
| **Should we keep advertising the self-hosted relay?** | **Probably not — and this is the only real decision here.** Gemini's support-burden argument is genuinely correct: trainers are not DevOps. But you don't need to delete code to act on it. Demote self-hosting to a documented, unadvertised option; make managed hosting the default and only path in the UI. ~90% of the benefit, ~1% of the cost. |

**The false premise:** "offering a self-hosted version leaks your IP." The self-hosted thing is
`sync-server/` — a ~700-line Express ciphertext mailbox. That is *not* the valuable IP. The valuable IP
is the workstation itself (Film Room pose analysis, the science engines, the library, the program
builder), which **already ships to every user as an Electron app** — readable JS on their disk the
moment they install it. That exposure exists today and is unrelated to the relay. Killing self-hosting
protects almost nothing.

**Also worth naming:** the $250k ISSA/NASM buyout is an *unvalidated assumption*. Building the whole
strategy around it is a bet. MRR is good for a buyer, but it's also just good — it funds the thing
whether or not anyone ever acquires it. Don't burn the differentiator chasing a hypothetical acquirer.

> **Recommended:** keep local-first. Make managed hosting the default and stop marketing self-hosting.
> Consider a **hosted web build** as an *additional* channel (the app is already a PWA — data still
> local in browser IndexedDB, zero rewrite) so "just open it in a browser" becomes possible without
> giving up anything. ⬅ *Caleb to confirm before anyone builds against it.*

---

## 1. Ship-blockers — nothing else matters until these are true

### 1.1 🟥 Make billing real
**Depth: code complete, commercially non-functional.** Everything is built and cross-verified, but there
are no live Stripe keys and the relay domain isn't deployed. **The app cannot take one dollar today.**
Checklist is copy-pasteable in `docs/MEMBERSHIP.md` §5. Then update `MEMBERSHIP_SERVER_URL` in
`lib/membershipApi.ts`. *Effort: an afternoon. Caleb only — real keys.*
**S22:** the server side is now test-covered (`sync-server && npm test`, 16 tests incl. an automated
app↔server token cross-check) and a billing-portal hole was closed (any paired client could cancel its
coach's subscription). Set `TRUST_PROXY=1` behind Caddy or the whole instance shares one rate-limit bucket.

### 1.2 🟨 Exercise library: ~1,100 → ~3,000
**Depth: 1,099 entries (counted S22 via `buildSeedExercises()`), up from 277 via S16's public-domain
import.** The ~1,000 milestone is met. `06-EDITIONS-PRICING.md` §4.2 still says 3,000 — now annotated as
a target, not a fact. Keep it out of copy until true. Remaining work is quality (the 822 imported rows
are thinner than the 277 hand-written ones — see `LIBRARY_GROWTH.md`) and the path to 3,000.
Brief already written: `docs/plans/05a-LIBRARY-AUTHORING-BRIEF.md` (voice, quality bar, target
composition). **This is the single best Antigravity task in the whole project** — bulk structured content
generation against an existing quality exemplar, verifiable by schema + tests, zero architectural risk.
*Effort: large but parallelizable. Do it in batches of ~100 with a schema test per batch.*

### 1.3 🟥 Prove the packaged apps run
Windows installer built but never run on real hardware. Android generated but never compiled. Mac never
attempted. Any of these failing at launch is a launch-day disaster. *Caleb + a real machine.*

---

## 2. Competitor parity — the gaps that cost deals

Benchmarked against TrueCoach, QuickCoach, Trainerize, MyPTHub.

### 2.1 🟩 Food logging + barcode nutrition scanning (DONE in S18)
**Depth: COMPLETED.** QuickCoach charges $10.75/mo extra for this. Including it in the base $29/mo is a direct, provable pricing win.

Design that fits this codebase's doctrine:
- **Data:** `FoodEntry` + `FoodItem` tables (Dexie v13). `FoodItem` caches every product ever scanned, keyed by barcode — so a re-scan is offline and instant.
- **Lookup:** [Open Food Facts](https://world.openfoodfacts.org/data) — free, open, no API key.
- **Doctrine handled explicitly:** the capability is gated by the `cloudTier` in `lib/cloudCapability.ts`. Fully local tiers are prevented from making Open Food Facts API calls.
- **Scanning:** native `BarcodeDetector` API first, falls back to bundled `zxing-wasm`.

### 2.2 🟩 Automated check-in summaries (DONE in S19)
**Depth: COMPLETED.** Added an automated, on-demand check-in summary feature on the Dashboard.
It fetches all check-ins across the active roster over the last 7 days and uses the `qwen3-1.7b-instruct` local model to generate a rapid, privacy-preserving digest emphasizing clients needing attention.

### 2.3 🟨 Wearable / health-app sync ⭐ **the other big one**
**Depth: DOES NOT EXIST.** TrueCoach, Trainerize and Everfit all pull steps/HR/sleep/weight from Apple
Health, Google Fit, Garmin, Whoop, or Oura. We have a readiness engine that asks coaches to *hand-enter*
sleep — while the phone in their client's pocket already knows.

**This is a strong fit, not a compromise:** Health Connect (Android) and HealthKit (iOS) are **on-device**
APIs. Reading them in Companion via Capacitor keeps the local-first promise completely intact — no
third-party cloud, no OAuth to a vendor, no data leaving the phone except through the existing E2EE sync
the client already opted into. It would make readiness dramatically better with *zero* doctrine cost.
*Blocked on: Companion being a real Capacitor build (see §1.3). Effort: medium once that exists.*

### 2.4 🟨 Branding on Membership + the tier story
QuickCoach gates "brand your client app, welcome emails and printouts" behind Pro. **We already built
most of this** — brand kit, logo variants, branded printouts, branded Companion export. Gating it for
*new free-tier* accounts is standard and defensible.

⚠️ **Don't retroactively remove it from anyone already using it.** Same discipline as the licence
grandfathering in S15: gate new, never claw back.

**The headline number, and it's checkable:**

| | QuickCoach, fully loaded | Coachwright Membership |
|---|---|---|
| Base | $32.50/mo *(billed annually — $468 up front)* | **$29/mo** |
| Automated check-in summaries | +$12.42/mo | included |
| Barcode / food logging | +$10.75/mo | included *(shipped S18)* |
| **Total** | **$55.67/mo · $668/yr** | **$29/mo · $348/yr** |

**~48% cheaper, month-to-month, with no annual prepay.** That's the ad. Note their $468 is billed
*annually* — "cancel anytime" on an annual prepay is a weaker promise than genuine monthly. Say so.

Their free tier is **20 clients** vs our 3 — the one place they beat us. Either raise ours or don't
invite the comparison; don't claim "best free tier" while it's false.

### 2.5 🟥→🟦 Stripe Connect: 1% platform fee on client payments
Caleb's proposal: coaches can optionally take client payments through us via Stripe Connect, and we take
~1% on top of Stripe's ~2.9% + 30¢. Optional, never required.

**This is a real revenue line** — a coach billing $3k/mo yields ~$30/mo, more than their subscription.
And at 1% we'd be **genuinely cheaper than TrueCoach/Trainerize/Mindbody, who take 2–3% on top**. That's
a defensible, honest position. But three things have to be true first:

**① It contradicts a current headline claim — fix the copy, don't ignore it.**
`SERVER_STRATEGY.md` §3 currently says our payment approach has "**no platform markup**... the difference
between paying one processor once and paying a processor *and* a SaaS company both." Ship a 1% fee and
that sentence is false as written. It becomes true again only if scoped: *"bring-your-own payment link
stays free forever, with no markup — or let us handle it for 1%, still less than half what TrueCoach
takes."* Both paths must stay visible. **Do not quietly delete the old claim.**

**② Use Stripe Connect *Standard*, not Express or Custom.** This is the whole risk decision:
- **Standard** — the coach has their own full Stripe account and is **merchant of record**. They own
  disputes, refunds, payouts, and their own tax reporting. We collect `application_fee_percent` and
  carry minimal liability. ✅ **This one.**
- **Express / Custom** — we onboard them, and meaningful chargeback/negative-balance liability and
  1099-K obligations shift onto us. That is exactly the "financial infrastructure nightmare"
  `SERVER_STRATEGY.md` §3 warned about, and it is not worth 1%.

**③ The 1% has to buy something real.** If it's "a payment link, but we take a cut," no rational coach
opts in. It's worth 1% only if it does work they'd otherwise do by hand: **auto-reconcile into The
Ledger, auto-mark invoices paid, and real recurring billing for their clients** (§2.4's gap table —
coaches re-invoice retainers manually today). Build the reconciliation, then the fee is earned.

*Effort: medium-large. 🟦 Claude for the Connect integration + webhook reconciliation (money paths and
idempotency are unforgiving); 🟨 Gemini for the settings/onboarding UI after. **🟥 Caleb must accept the
Stripe Connect platform agreement personally** — that's a business/legal commitment, not a code change.*

### 2.6 The full gap table
Everything else competitors ship that we don't, with an honest call on each:

| Feature | Them | Us | Call |
|---|---|---|---|
| **Client self-booking** | ✅ | Calendar exists, coach-entered only | 🟨 **Build.** Real friction; a booking link clients can use is high value, low risk. |
| **Recurring billing for *their* clients** | ✅ | One-off invoices + pay-link | 🟨 **Build.** Coaches on retainer re-invoice manually every month today. |
| **Progress photo side-by-side** | ✅ | Photos stored, no comparison view | 🟨 **Build.** Cheap — the data's already there, it's a view. |
| **Automated onboarding sequences** | ✅ | Manual | 🟨 Medium value. The automations engine is a natural host. |
| **Meal plans / recipes** | ✅ | ❌ | 🟡 Only after §2.1 food logging. Validate demand first. |
| **Groups / community / challenges** | ✅ | Leaderboards + challenges exist | 🟡 Partial already. Extend only if asked. |
| **In-app video calls** | ✅ | ❌ | 🔴 **Don't build.** Zoom/Meet links in the calendar cover it. Real infra, no differentiation. |
| **Payment processing (their clients)** | ✅ (takes a cut) | Bring-your-own link | ✅ **Deliberate won't-do.** `SERVER_STRATEGY.md` §3. Our approach is *better* for the coach — no platform markup. Market it. |
| **Zapier / API / webhooks** | ✅ | ❌ | 🟡 Low priority for solo coaches. Revisit for Studio. |
| **White-label client app** | ✅ (upsell) | Brand kit exists, partial | 🟨 Finish it — QuickCoach charges for branding; we can include it. |
| **Exercise video recording in-app** | ✅ | Film Room does more | ✅ Already ahead. |
| **Offline mode** | ❌ | ✅ | ✅ **We're ahead. Lead with it.** |
| **On-device movement AI** | ❌ | ✅ | ✅ **Nobody else has this.** Lead with it. |

**Pattern worth noticing:** the three things we're *ahead* on (offline, on-device AI, no-per-client
pricing) are all structural — they come from the local-first architecture. That's the case for §0's
recommendation to keep it.

---

## 3. Depth passes — make thin things real

| Item | Depth | Routing | Notes |
|---|---|---|---|
| **i18n string conversion** | Layer done, ~53/57 components hardcoded | 🟨 | Mechanical, compile-checked (typo can't reach runtime), high volume. **Ideal Antigravity task.** Keep using logical properties (`ms-`/`me-`/`ps-`/`pe-`) or RTL regresses. |
| **Wire remaining 5 AI models** | 5 of 12 registry entries dead in the UI | 🟨 | Same runtime, different model ids for 4 of them — bounded. `rtmpose-m` is a different framework entirely; consider deleting the row instead of building it. |
| **Film Room on real footage** | Thresholds tuned on synthetic data only | 🟥 | Needs a real phone + a real set. Then a tuning pass. |
| **Mobile responsive gaps** | Film Room / Calendar / Business / Settings unverified | 🟨 | Film Room's dual-video stage almost certainly needs a stacked layout under ~768px. |
| **Assistant depth** | ✅ **Copy corrected S21** — was actively misleading in two ways, not one. `qwen3-4b`/`qwen3-8b`'s "program drafting"/"best quality" claims were unbuilt *and* the tiers are functionally inert even if downloaded (`lib/assistant.ts`'s `MODEL_REPO` is hardcoded to the 1.7B model — nothing switches on which tier is "installed"). Separately, the light tier's "turns typed notes into logged sets" claim was misattributing an already-free, zero-AI feature (`lib/quickLog.ts`, pure regex, works with no model installed) to a 1.1GB download. All three registry `purpose` strings now say what's real. | 🟦 | **Real follow-up, properly scoped now:** (1) make `qwen3-4b`/`qwen3-8b` actually loadable — `MODEL_REPO` needs to read the *installed* tier's real HF repo id, not a hardcoded constant; verify each against a real download first, same bar every other local-AI feature met. (2) Program drafting is a genuinely new feature — prompt a model for a *structured* `Program`/`Week`/`Day`/`Block` shape, parse+validate the output, and route it through a review-before-apply UI (never auto-write, matching `lib/quickLog.ts`'s own stated design rule: "it feeds this pipeline, it doesn't bypass it"). Two separable tasks — don't build both in one pass. |
| **`sessionsRemaining`** | An estimate, not a real pack ledger (DEBT-21) | 🟨 | Now that money is involved, a real decrementing ledger is worth it. |
| **Lighthouse + cross-browser** | Never run (DEBT-58) | 🟥 | Needs Firefox/Safari + Lighthouse CLI. |
| **`symptomReadinessContribution()`** | Correct, tested, **zero callers** (DEBT-65) | 🟦 | Needs a *product* decision, not wiring. Do not close it by adding cycle data to the sync payload — a test forbids it. |

---

## 4. Hygiene

- **[DONE in S17, regressed S18, re-fixed S22] Tailwind undefined-class sweep** (DEBT-20) — S18's food
  logging reintroduced `bg-wash` (3 uses) after the sweep was marked done. `npm run lint:tailwind` is at 0
  errors again. **Run it before claiming any UI work done** — the lint exists; it just wasn't being run.
- **Sweep remaining `$60`/one-time copy** — *mostly done S22:* `HOW-TO-OWN-IT.md` §4 rewritten (it also
  claimed "zero network requests", untrue since S15/S18); `STRONGSUIT_MASTER_SPEC.md` and
  `BRANDING_PLAN.md` §5 carry superseded banners. **Left for Caleb (DEBT-72):** the pitch deck and the
  positioning statement. 🟥
- **[DONE S22] "3,000 exercises" claim** — the one place it was stated as fact (`06` §4.2) is annotated;
  the other hits are plans *targeting* 3,000, which is accurate.
- **Shared workspace** — `sync.ts`, `pose.ts`, `core.ts`, `singleFlight` are all duplicated across the
  two apps (DEBT-60). Three copies was the stated trigger. We're past it. 🟦

---

## 5. Suggested next session

**If Antigravity:** i18n conversion (§3) — guaranteed-safe, compile-checked. Or library quality: lift
the 822 imported rows toward the hand-written bar (§1.2).

**If Claude Code:** DEBT-68 (food entries in client portability — needs the `FoodItem` bundling decision)
or DEBT-70 once Caleb decides whether Membership maps to an AI tier. Both touch data/entitlement paths
where a silent mistake is expensive.

**If Caleb has an hour:** §1.1 Stripe keys. Nothing else in this document earns a dollar until that's done.

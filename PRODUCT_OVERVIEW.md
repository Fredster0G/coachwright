# COACHWRIGHT + COMPANION — PRODUCT OVERVIEW & MARKETING REFERENCE

> **⚠️ SUPERSEDED IN PART (S23, 2026-09-27).** Coachwright moved to cloud accounts: coach data lives on
> Coachwright Cloud (readable by the operator, not end-to-end encrypted), the self-hosted and $15/mo
> managed relay tiers no longer exist, and Companion connects with a coach-issued code instead of E2EE
> pairing / WiFi / file sync. Anything below that says otherwise is history. Current design:
> `strongsuit-v0.1/strongsuit/docs/CLOUD.md`.

One reference doc with everything needed to write posts, store listings, landing-page copy, or answer
"what does this actually do" — for **both** apps. Pulls together `BRANDING_PLAN.md`, the pitch deck
(`Coachwright Pitch Deck.dc.html`), `STRONGSUIT_MASTER_SPEC.md`, `docs/CLIENT_APP_STRATEGY.md`, and
`PROGRESS.md` into one place, updated to include **Companion** (the client-facing app), which didn't exist
yet when the pitch deck and branding plan were written. Where those source docs disagree slightly (see
§8, pricing), this file flags it rather than silently picking one — that's a decision for you, not me.

---

## 1. The 30-second pitch

**Coachwright** is a coaching workstation that runs entirely on the trainer's own machine — every client,
program, and session lives locally, never in our cloud, whether or not they ever pay us anything. Free
covers up to 3 clients, genuinely — no card required, no trial clock. **Coachwright Membership is
$29/mo** and removes that cap: unlimited clients, the full program builder, Film Room, and business tools.
No per-client tax, ever — the price doesn't change whether you coach 4 people or 400.

**Companion** is the client-side half: a free app for the person being coached. It works completely
offline on its own — logging, progress tracking, on-device video review — and optionally links to a coach
for program delivery and messaging, over whichever hosting the coach chose (their own server, ours, or
none at all).

One brand, two apps, one honest promise: **your data is yours, on your device, by default — always.**

---

## 2. One-liners & taglines (ready to use)

- *Free for up to 3 clients. $29/mo for the rest of your practice.*
- *Your data lives on your machine — whether you're on the free tier or the membership.*
- *No per-client tax. $29/mo is $29/mo whether you coach 4 people or 400.*
- *Everything you use TrueCoach for — minus the $137/month and the per-client tax.*
- *No account required to try it. We couldn't read your data if we wanted to — there's nothing to breach.*
- *Built like an instrument, not a dashboard.*
- *Your clients get a real app — no downloads, no accounts, no subscription.* (Companion — still and always free)
- *Private by construction, priced like it should be.*

**Category we create, not join:** "coaching software you own." Never call it "a TrueCoach alternative" in
headline copy — that borrows the rented-SaaS frame we're trying to escape. We sell ownership; they sell
access.

---

## 3. Who it's for

**Coachwright (the coach app):**
- Primary: independent personal trainers (in-person + hybrid), 5–60 clients, currently paying $30–160/mo
  for TrueCoach/Trainerize/Everfit-style software.
- Secondary: online coaches leaving a per-client SaaS; small studio owners with 1–5 coaches.
- What they feel (mine this in every piece of copy):
  1. **Punished for growing** — per-client pricing means every new client raises the rent.
  2. **Held hostage** — client data lives in a vendor's cloud; canceling feels like losing the business.
  3. **Nickeled & dimed** — payment surcharges, feature paywalls, "contact sales."
  4. **Unseen** — treated like a consumer by a billion-dollar platform, when they're a small business owner.

**Companion (the client app):**
- Anyone being coached by a Coachwright user — no purchase required, no account, nothing to set up beyond
  opening the app.
- Also stands alone: someone training themselves with no coach at all gets a full, free, local training
  log and on-device video self-review, and can pair with a coach later without losing anything they've
  already logged.

---

## 4. What each app actually does

### Coachwright (coach app) — full feature list

| Category | What's in it |
|---|---|
| **Client management** | Full roster, workspace per client, injury tracking (visible everywhere it matters), archive/restore, tags, notes |
| **Program Builder** | Keyboard-first, spreadsheet-style set editing, drag-and-drop reordering, supersets, undo/redo, duplicate-week auto-progression, save as reusable templates, fuzzy exercise search (`/` to focus, understands gym slang like "rdl"/"ohp") |
| **Exercise library** | 200+ seeded movements with real coaching cues, multiple labeled video links per exercise, in-app video playback (YouTube/Vimeo/direct file) |
| **Session logging** | Program-driven logger prefilled with prescribed targets, big touch targets for the gym floor, auto-save, per-exercise history drawer with e1RM trend and a "Suggested next" load *with the reasoning shown*, a rest timer |
| **Progression engine** | Auto-suggests the next session's load/reps using linear, double-progression, or RPE-target policies (or a policy-free heuristic) — every suggestion shows *why*, never just a number |
| **Film Room** | Local, on-device video analysis. Side-by-side or overlaid comparison, frame-by-frame stepping, sync-lock between two clips, line/angle measurement tools, and **on-device AI movement tracking** — live skeleton overlay, rep counting, tempo, depth %, left/right symmetry. Can now track a client's lift *and* a reference clip **simultaneously**, with a rep-by-rep and joint-angle comparison breakdown. Videos never leave the device. |
| **Nutrition** | Evidence-based calorie/macro targets (Mifflin-St Jeor, cited protein/fiber/water research) — every number shows the research behind it. Carb cycling and diet-break guidance. |
| **Readiness & check-ins** | Sleep/mood/energy/adherence check-ins roll into a 0–100 readiness score with a plain-language coaching cue (train hard / cap intensity / back off) |
| **Metrics & measurements** | Bodyweight and body measurements, plus research-backed testing-battery presets (vertical jump, sprint time, etc.) |
| **Business tools** | **Profit Planner** (set a monthly profit target, see the gap and a projection, factoring in the gym's cut), expense tracking, per-client billing, invoicing with coupons, account balances, a "Pay now" bring-your-own-payment-link button |
| **Calendar** | Real month-grid view plus a list view, recurring appointments, reschedule/cancel a single occurrence |
| **Team & studio tools** | Staff/location rosters with commission math, a CRM-style leads pipeline, opt-in cross-client leaderboards & challenges, a full-screen "TV Workout" gym-floor display mode |
| **Reports** | Cross-client analytics, PR feed, roster overview |
| **Automations** | A configurable local rule engine (e.g. "no session logged in N days") drives the dashboard's attention queue — no cloud, runs entirely on the coach's own data |
| **Client delivery — Companion File** | Export a single branded HTML file per client — the coach's logo and colors, that client's program — opens in any browser, zero install, zero account. Ticks off sets, answers check-ins, sends progress back with one button. |
| **Sync & messaging** | Pair devices (or a client's Companion app) with end-to-end encryption and a spoken safety-number check — same trust model as Signal. Three hosting choices, coach's pick (see pricing): fully local (free), self-hosted relay (free, coach runs it), or managed by us ($15/mo). Live messaging and poll-based reminders ride whichever relay is active. |
| **Data portability** | Encrypted backup/restore (AES-GCM, passphrase only the coach holds), full client-history export/import (for a client changing coaches, or a coach's business changing hands), and CSV import from any competitor's roster export (TrueCoach, Trainerize, a plain spreadsheet) |
| **Printable documents** | Branded program sheets, progress reports (with charts), PAR-Q+ intake forms, message digests |
| **Desktop app** | Windows & Mac (Electron) — this is a real installed app, not just a browser tab |
| **Privacy architecture** | No account, ever. Zero network calls in the core app — auditable, and we invite the audit. No telemetry. |

### Companion (client app) — full feature list

| Category | What's in it |
|---|---|
| **No account, ever** | Opens and works immediately — the local profile *is* the account |
| **Standalone training log** | Log any workout (exercise/sets/reps/load/RPE) with or without a coach — a full, free, local training diary |
| **Progress tracking** | Bodyweight and body measurements, logged and charted over time |
| **Installable app** | A real installable PWA (add-to-home-screen icon, works offline) — not just a bookmark |
| **Optional coach pairing** | Pair with a coach via a code + a spoken safety-number confirmation (the exact same E2EE trust model as the coach app's own device sync) |
| **Real sync, whatever the coach's setup** | Works on every coach setup, verified end-to-end: their server (self-hosted or our managed hosting), **straight to their computer over the gym's WiFi** (no server, no internet — one tap is a full two-way sync), or an encrypted file sent any way at all. Same data, same encryption, every path. |
| **Assigned programs** | The coach's assigned program syncs down and renders in-app — weeks, days, exercises, sets, coach's notes — over any of the three paths above |
| **Messaging** | A real message thread with the coach on every setup — live when a relay is active, and queued-with-your-next-sync (WiFi or file) when the coach runs no server at all. No message ever duplicates, whichever way it traveled. |
| **Backup/restore** | A client's own full history exports to a file and re-imports on a new device, regardless of what their coach's hosting situation is |
| **Personal Cloud (optional, paid)** | Cross-device sync of a client's *own* data (their own phone + laptop) without needing a coach at all — see pricing |
| **Film Room self-review** | **Shipped (S14).** Film a set on your phone and get your reps, tempo, depth, left/right symmetry and bar path back — the same on-device tracking as the coach app. Free, works with no coach and no connection, and **the video never leaves the phone**: it isn't uploaded, isn't synced, and isn't even saved to the app's database. Only the plain-English text summary can be sent to a coach, and only if the client taps the button. |

---

## 5. What makes this different (positioning vs. competitors)

| Capability | Coachwright | TrueCoach | Trainerize | Everfit |
|---|:---:|:---:|:---:|:---:|
| Program builder + logging | Yes | Yes | Yes | Yes |
| Video Film Room (frame analysis) | Yes | — | — | Basic |
| On-device movement-tracking AI | Yes | — | — | — |
| Profit Planner (business math) | Yes | — | — | — |
| Offline client app, no account | Yes | — | — | — |
| Data owned & stored locally | Yes | — | — | — |
| In-app client chat | Yes — E2EE (live via relay; works offline-queued on every other setup) | Yes | Yes | Yes |
| Pricing model | **Free ≤3 clients, then $29/mo flat** | per-client, $26→$129/mo | per-client | tiered |

*(Fair-play rule, carried over from `BRANDING_PLAN.md`: never claim hosted live chat as a Coachwright
*default* — it isn't, by design, and the honest reason is part of the pitch. It's real when a coach turns
on self-hosted or managed sync; just not there out of the box the way a rented SaaS product's is.)*

**The math (lead with this in any cost-comparison post):**

| Platform | 5-year cost (coach growing to ~50 clients) |
|---|---|
| TrueCoach (Pro) | ≈ $7,740 |
| Trainerize + nutrition + branding | ≈ $7,069 |
| Everfit (annual + add-ons) | ≈ $7,680 |
| QuickCoach Pro **fully loaded** (see below) | ≈ $3,340 |
| **Coachwright Membership** | **$1,740** ($29/mo × 60mo, flat regardless of roster size) |

**The QuickCoach comparison specifically** — they're the closest competitor on price, and the honest
apples-to-apples is their base *plus* the add-ons that cover what we include:

| | QuickCoach, fully loaded | Coachwright |
|---|---|---|
| Base | $32.50/mo *(billed annually — $468 up front)* | **$29/mo, monthly** |
| Automated check-in summaries | +$12.42/mo | included |
| Barcode / food logging | +$10.75/mo | included *(in build)* |
| **Total** | **$55.67/mo · $668/yr** | **$29/mo · $348/yr** |

**~48% cheaper, month-to-month, no annual prepay.** Worth saying plainly: their "cancel anytime" sits on
top of an annual charge; ours is genuinely monthly.

⚠️ **Where they beat us, don't pretend otherwise:** their free tier is **20 clients**; ours is 3. Never
claim "the best free tier" — claim the best *paid* value, which is true and checkable.

The honest comparison isn't "free forever" anymore — it's flat-fee vs. per-client. A coach growing past 50
clients on QuickCoach or TrueCoach pays more as they grow; a Coachwright Member pays the same $29/mo whether
they coach 4 people or 400. **A coach who never grows past 3 clients pays nothing, indefinitely** — that's
the free tier, not a trial.

**Market context** (for pitch/investor-flavored posts): personal trainer software is a ~$780M market in
2025, projected to ~$1.85B by 2033 (11.4% CAGR). 72% of usage is individual coaches, not gyms — that's
exactly Coachwright's buyer. The US is the largest single market at 22% share.
*(Sources: Future Market Report & Future Market Insights, 2025–2026; TrueCoach/Trainerize published
pricing, 2026; assistantcoach.fit hidden-fees audit, May 2026.)*

---

## 6. Privacy & ownership — the moat, stated plainly

- **No account, no login.** The app doesn't know who you are. Nothing to sign into, nothing to leak.
- **Zero network calls in the core app.** No telemetry, no beacons. Auditable — we invite the audit.
- **Encrypted backups.** AES-GCM, passphrase only the coach/client holds. Your export, your key, your
  machine — there's no recovery if you lose the passphrase, and that's the point: we genuinely can't get
  in either.
- **No servers means no data breaches, no vendor lock-in, no cloud-liability exposure.** If a coach leaves,
  they lose nothing — it was always theirs.
- **Cloud is opt-in, always, on both apps.** A coach can turn on sync (self-hosted, free, or managed,
  $15/mo) without ever losing the "nothing leaves this device" guarantee for anyone who doesn't want it —
  and even then, the relay only ever handles end-to-end-encrypted ciphertext it cannot read.

---

## 7. Brand identity essentials

- **Name meaning:** "Coachwright" — a *wright* is a craftsperson who builds (wheelwright, shipwright,
  playwright). Coach + wright = the instrument a coach builds their business on.
- **Brand promise, three words:** **Private. Local-first. Fairly priced.** *(Changed S15 from "Owned.
  Private. Forever." when the pricing model moved to membership — "Owned...Forever" is no longer literally
  true of the paid tier and shouldn't be said that way. "Private" and "local-first" remain fully true
  regardless of tier: free or Membership, client data never leaves the coach's machine. This is a
  judgment-call replacement, not a final decision — revisit before it goes on anything printed.)*
- **The mark:** a "C" formed from a barbell collar seen end-on — machined, not sporty, no swooshes or
  flames. Always monochrome (ink/porcelain only, never the jade/ember accent colors) — the confidence is in
  the contrast, not color. Full variant family exists (badge, wordmark, monogram, horizontal lockup, full
  hero lockup).
- **Colors:** jade `#155E4E` + porcelain `#F7F6F3` + ember `#D9730D` accent. Deliberately not
  blue/black/neon like every competitor — unowned territory, reads as "trustworthy instrument."
- **Typography:** Inter Tight (display/wordmark, 800 weight, tight tracking), Inter (body), JetBrains Mono
  for every number that appears in marketing copy (prices, comparisons, stats) — carries the product's own
  tabular-number styling into promo material.
- **Voice:** plain, capable, sentence case. Talk to the buyer like a fellow tradesperson, never like a
  startup pitching "users." No hype, no exclamation marks, no "supercharge your fitness empire."
  - **Yes:** *"Your data lives on your machine. Back it up like you mean it — we made that a one-click habit."*
  - **Yes:** *"$3,450 to go this month. About 12 more sessions. You've got 15 days."*
  - **No:** *"Supercharge your coaching empire with AI-powered insights!!"*
  - **No:** *"We're on a mission to democratize fitness entrepreneurship."*
- **Banned outright:** gradients on purple/indigo, glassmorphism, emoji-as-icons, AI-looking hero
  illustrations, confetti, stock "smiling trainer with clipboard" photography.
- **Feature names — keep these consistent everywhere, they're part of the brand:** Film Room, Companion,
  Profit Planner, The Ledger, Studio Link, Ironworks (the design system, fine to mention in "how it's
  built" content).

---

## 8. Pricing — S15 membership model (supersedes the earlier $60-once numbers)

**Changed 2026-08-14.** Every earlier version of this section (and of `STRONGSUIT_MASTER_SPEC.md` §9,
`BRANDING_PLAN.md` §5, the pitch deck, and `docs/plans/06-EDITIONS-PRICING.md` §4) described a one-time
purchase — that promise is retired for new customers going forward. See `docs/MEMBERSHIP.md` for the full
reasoning, the free-tier-limit rationale, and the technical honesty notes (what "membership" actually
requires that a one-time licence didn't — periodic online reverification, in particular).

### Coachwright (the coach app)
| Tier | Price | What it is |
|---|---|---|
| **Free** | $0, indefinitely | Every feature, capped at 3 active clients. Not a trial — no card, no clock, no nag. Genuinely usable to run a small practice forever. |
| **Coachwright Membership** | **$29/mo** | Everything in Free, uncapped: unlimited clients, program builder, full Film Room, business tools. Billed and cancelled through Stripe's own portal — we never touch a card number. |
| **Host your own sync relay** | Free | Independent of the tier above — self-hosted `sync-server/` still works exactly as before, on either Free or Membership. |
| **Our hosting (optional)** | **$15/mo** | We run the sync relay for you. Independent of Membership — a Free-tier coach can pay for hosting without a membership, and a Member can self-host without paying us anything extra. |

*(A Membership token is periodically re-verified against the sync server rather than checked once forever
— the one real architectural change from the old model. It's still verified fully offline between checks,
and the app keeps working on the last verified state for weeks past a missed check, not an instant cutoff
— see `docs/MEMBERSHIP.md`.)*

### Companion (the client app)
| Tier | Price | What it unlocks |
|---|---|---|
| **Free (default)** | $0, forever | Full local training log, progress tracking, on-device Film Room self-review (once shipped) — never paywalled, it's zero marginal cost to run. Pairing with a coach is *also* always free for the client — that side rides the coach's own subscription, not this one. |
| **Companion Cloud (personal)** | **$3.99/mo or $29/yr** | Automatic cross-device sync of the client's *own* data (their phone + a laptop, say) and automatic cloud backup — for someone who wants that convenience without needing a coach at all. |

**The one sentence that keeps these two pricing tables from ever getting confused in copy:** *a client
never pays anything to be coached — Companion Cloud is only for a client who wants their own personal sync,
completely independent of whatever their coach does or doesn't pay for.*

---

## 9. Roadmap (say this part honestly)

- **Shipping now:** the full-featured desktop app (Windows & Mac), and Companion as a real installable web
  app (works today, no app-store review needed to use it).
- **In active development:** an Android app for coaches (Capacitor-based).
- **Shipped since this doc was first written (S13):** the full two-way sync loop between Companion and a
  coach on ANY setup — relay, direct-over-WiFi to the coach's computer, or encrypted file — including
  assigned programs rendering in Companion and messaging that works even when the coach runs no server.
- **Shipped since (S14):** Film Room self-review inside Companion (free, on-device); scheduled reminders a
  coach can queue for a client; a native desktop menu bar and remembered window position; and a hardening
  pass — the app now installs as an offline PWA, survives a crash on any single page without losing the
  rest of the app, and loads noticeably faster (the main bundle dropped by ~40%).
- **Explicitly not planned yet — say so if asked, don't dodge:** an iOS app store submission.
- **Honest caveat worth having ready:** the Windows *installer* and the Android build have not yet been
  run on real hardware. The apps themselves work; the packaged distributables are the last untested step.
- **Shipped (S15):** Coachwright Membership — $29/mo, unlimited clients, Stripe Checkout + billing portal
  (no card details ever touch our own servers). Free tier introduced alongside it, capped at 3 clients.
  Superseded the earlier one-time-purchase model — see `docs/MEMBERSHIP.md`.
- **Every feature a tier includes stays included for as long as that tier is active** — no in-app
  purchases, no surprise feature paywalls added after the fact within a tier.

---

## 10. Ready-to-use copy blocks

**Short (social post length):**
> Coaching software that runs on your machine, not our cloud. Free for up to 3 clients — no card, no
> trial clock. $29/mo removes the cap, flat, no matter how big your roster gets. Your data stays on your
> machine either way. We built the client app the same way: Companion is free, works offline, and doesn't
> need an account either.

**Medium (App/Play store style description):**
> Coachwright is a professional coaching workstation for personal trainers — program building, session
> logging, progress analytics, on-device video analysis with AI movement tracking, and a business-math
> Profit Planner. Free for up to 3 clients, genuinely — no trial, no nag. Coachwright Membership is
> $29/mo flat, unlimited clients, no per-client pricing that punishes you for growing. Pair it, optionally,
> with Companion — the free app your clients use to see their program and log their own workouts, with
> the same zero-account, your-data-stays-yours philosophy built in from day one.

**Feature-bullet block (for a landing page or store listing):**
> - Keyboard-first program builder with drag-and-drop, undo/redo, and instant exercise search
> - Session logging built for the gym floor — big touch targets, auto-save, offline
> - Film Room: side-by-side or overlaid video comparison with on-device AI movement tracking — reps,
>   tempo, depth, symmetry, and now full client-vs-reference comparison, live
> - Profit Planner: know exactly what you need to hit your income goal this month
> - Companion: your clients get a real app, no account required, that works whether or not you ever turn
>   on cloud sync
> - Free for up to 3 clients. $29/mo, flat, for everyone else — no per-client tax, ever.

---

*Living document — update this whenever a feature ships or a number changes, the same way `PROGRESS.md`
gets updated for engineering state. This file is the marketing-facing counterpart; keep the feature claims
in sync with what `PROGRESS.md`'s "what works right now" section actually verifies as built, not aspirational.*

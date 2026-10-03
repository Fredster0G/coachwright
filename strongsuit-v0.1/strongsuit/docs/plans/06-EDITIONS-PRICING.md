# 06 — Editions & pricing

---

## 1. ⚠️ First decision: how many products is this?

Three names, but there are only two sensible structures:

| | Structure A — *One product, three editions* | Structure B — *Two products* |
|---|---|---|
| **Shape** | Coachwright ships as Personal / Independent / Studio | Coachwright (Independent + Studio) and Companion (Personal) stay separate apps |
| **Codebase** | One, capability-flagged | Two, as today |
| **Upgrade** | In-app licence key upgrade | Migration between apps |
| **Reality check** | The Personal user needs a *phone-first* app; the coach needs a *desk workstation*. Forcing one UI to be both makes both worse. | Already true today and it works. |

**My recommendation: Structure B, presented as Structure A.**

Keep two codebases (`strongsuit/` = coach workstation, `companion-app/` = phone-first personal app) because the form factors genuinely differ — but market them as **one ecosystem with three tiers**, share the science engines, the exercise library, the AI runtime, and the sync layer as **common packages**.

That means introducing a real shared workspace:

```
packages/
  core-science/     nutrition, readiness, progression, cycle  (shared)
  core-library/     exercise taxonomy + generator + search    (shared)
  core-sync/        crypto, transports, broker                (shared — kills the lib/sync.ts duplication)
  core-ai/          model manager, runtime, corpus, RAG       (shared)
  core-i18n/        locale catalogues                         (shared)
apps/
  workstation/      Independent + Studio (Electron/web)
  personal/         Personal (PWA/mobile)
  relay/            sync-server
```

This also retires debts #49/#51/#60 (the byte-for-byte duplicated `sync.ts`, `pose.ts`, `core.ts`). Three copies is the signal to stop duplicating — we're at three.

---

## 2. The three editions

### 2.1 Personal — *"Own your training."*
**Who:** an individual training themselves. Also every client a coach onboards — which makes it the top of the funnel.

Standalone logging · assigned programs from a coach · Film Room self-review · progress tracking · nutrition targets · readiness · cycle tracking · full exercise library · local AI add-ons · complete data export.

**Not included:** managing other people, business tools.

### 2.2 Independent Trainer — *"Your whole practice, on your computer."*
**Who:** solo trainers and small online coaches (1–100 clients). The core commercial product.

Everything in Personal, plus: unlimited clients · program builder · full Film Room (dual-clip, VBT, all models) · check-ins, metrics, photos, habits · nutrition & readiness engines for clients · messaging & reminders · calendar · business/ledger/profit planner · invoicing · reports · printable branded documents · Companion export · CSV import from competitors · client-data portability.

### 2.3 Studio — *"A business, not a spreadsheet."*
**Who:** gyms and multi-trainer studios (2–50 staff).

Everything in Independent, plus: **multi-seat with roles** (owner/manager/trainer/front-desk) · Studio Hub topology ([01](01-CONNECTIVITY.md) §5) · shared client roster with assignment & handover · staff commission & payroll reporting · locations · **business-owned client pairings** (a departing trainer doesn't take the crypto relationship) · leaderboards & challenges · TV workout mode · multi-person Film Room · CRM/leads pipeline · consolidated reporting · audit log · bulk operations.

---

## 3. Feature matrix

| | Personal | Independent | Studio |
|---|:--:|:--:|:--:|
| Local-first, offline, own your data | ● | ● | ● |
| Exercise library (3k curated) + tracks | ● | ● | ● |
| Nutrition & readiness engines | ● | ● | ● |
| Cycle & symptom tracking | ● | ● | ● |
| Film Room — self review | ● | ● | ● |
| Film Room — dual-clip, VBT, all models | ○ | ● | ● |
| Local AI add-ons | ● | ● | ● |
| Manage clients | — | Unlimited | Unlimited |
| Program builder | View | ● | ● |
| Business, invoicing, ledger | — | ● | ● |
| Messaging & reminders | ● | ● | ● |
| Multi-seat + roles | — | — | ● |
| Studio Hub | — | — | ● |
| Commission & payroll | — | — | ● |
| Shared roster / handover | — | — | ● |
| Audit log | — | — | ● |
| Sync: file / LAN | ● | ● | ● |
| Sync: relay | Personal Cloud | Cloud add-on | Included w/ Studio Cloud |

---

## 4. Pricing

> ⚠️ **Superseded S15 (2026-08-14) — kept as historical record, not current pricing.** Every dollar figure
> in this section (§4.1–4.7) describes the one-time-purchase model this app shipped with through S14. The
> current model is Coachwright Membership, $29/mo, with a free tier up to 3 clients — see
> `docs/MEMBERSHIP.md` and `PRODUCT_OVERVIEW.md` §8 for the numbers actually in effect. Left intact below
> because the competitive-landscape research in §4.1 and the reasoning in §4.5 are still real and still
> worth having; only the concluding price points changed.

### 4.1 The competitive reality

What a trainer pays elsewhere, per year:

| Product | 20 clients | 50 clients |
|---|---|---|
| TrueCoach | ~$600–1,200 | ~$1,200+ |
| Trainerize | ~$600–900 | ~$1,400+ |
| PT Distinction | ~$600–1,000 | ~$1,200+ |
| My PT Hub | ~$400–700 | ~$700+ |

**A working trainer spends $2,000–5,000 over five years, and owns nothing at the end.**

### 4.2 The v1 price was too low

`$59–99` was set when this was a program builder with a logger. It now has a cited nutrition engine, an evidence-based readiness model, on-device movement analysis with VBT, a 3,000-exercise curated library, local AI, and a business ledger.
*(S22 correction: the library is ~1,100 entries today, not 3,000 — 3,000 is the target in
`05-EXERCISE-LIBRARY.md`. Don't quote the number in copy until it's true.)*

**$60 actively hurts you.** It signals hobby software to exactly the professional buyer you want, and it leaves the "one year of TrueCoach costs 10× this" argument unused. There is no positioning where $60 is the right number for this product.

### 4.3 Recommended pricing

| Edition | Price | Model |
|---|---|---|
| **Personal** | **Free** | Full local app. No client limit (there are no clients). No ads, no upsell nagging. |
| **Personal Cloud** | **$3.99/mo · $29/yr** | *(unchanged — already validated)* Cross-device sync of your own data |
| **Independent Trainer** | **$249 one-time** | Perpetual. **Every future version included, forever.** Unlimited clients. |
| **Independent — launch price** | **$179** | First 6 months / first 500 licences. Creates urgency honestly. |
| **Studio** | **$199 per seat one-time**, min 3 seats | Volume: 3–5 seats $199 · 6–15 $169 · 16+ $139 |
| **Studio Hub Cloud** | **$29/mo** | Optional. Managed relay for the whole business, any number of staff. |
| **Coach Cloud** | **$15/mo** | *(unchanged)* Optional relay for Independent |

### 4.4 Why $249 works

- **Undercuts one year of every competitor**, while being 4× the old number.
- Payback is ~2 client-sessions. Trivially justified to a professional.
- High enough to signal professional tooling; low enough to be an impulse purchase for a working trainer.
- Leaves room for the launch price to feel like a genuine deal rather than a permanent fake discount.

### 4.5 Sustainability — DECIDED: buy once, updates forever ⚠️ SUPERSEDED S15

> **Superseded (Caleb, 2026-08-14):** the paid coach tier moved from a one-time purchase to Coachwright
> Membership, $29/mo, alongside a new free tier (up to 3 clients, uncapped otherwise). This section is kept
> below **verbatim, not deleted** — it's the real reasoning behind the original decision, and that
> reasoning (the funding-source table, the honest risk framing) is worth reading before touching pricing
> again, even though the concluding decision itself no longer holds. See `docs/MEMBERSHIP.md` for the
> current model, the free-tier-limit rationale, and what a "membership" costs the architecture that a
> one-time licence didn't (periodic reverification instead of pure offline-forever). Any licence already
> issued under the model below is untouched — it still never expires, exactly as decided at the time.

**Decision (Caleb, 2026-07-27): no paid version upgrades. Ever.** One purchase, every future version included — v3, v4, all of it. *(Historical — see the superseding note above.)*

That's the strongest possible version of the brand promise, and it's a genuine differentiator. It also removes the single biggest recurring revenue line, so the rest of the model has to carry it. Here's the honest accounting.

**The ongoing costs that need funding:** link-pack maintenance (~6,000 links, monthly checks), citation-corpus updates as new consensus statements publish, model updates, OS/browser compatibility, translations across 15+ locales, support, and continued development.

**What funds it, in order of realistic contribution:**

| Source | Realistic weight | Honest note |
|---|---|---|
| **New customer sales** | ~70% | The primary engine. Works while the market grows; the risk is that revenue tracks *new* customers, not the installed base. This is the model's real exposure. |
| **Optional cloud subscriptions** | ~20% | Coach Cloud $15/mo · Studio Hub $29/mo · Personal Cloud $3.99/mo. Honest recurring revenue for an honest recurring cost (servers, TURN bandwidth). At ~25% attach, this is meaningful and it grows with the installed base. |
| **Studio seat expansion** | ~7% | Gyms grow and buy more seats. Natural, non-predatory expansion. |
| **Optional content packs** | ~2% | See below. |
| **Donations** | ~1% | Real, and worth doing — but prosumer donation conversion is typically 0.5–2%. It is a supplement, never a plan. |

**Optional content packs** (the one addition I'd recommend, because it's honest): the *app* is bought once and never charged for again, but professionally produced *content* can be sold separately without breaking that promise — federation-specific prep tracks, specialist tactical/rehab track packs, premium demonstration video packs. Nothing already shipped ever moves behind a paywall. **The rule: we never charge for a feature, only for new content someone chose to buy.**

**The risk, stated plainly:** if growth stalls, development funding stalls with it. Mitigations are (a) keep the cloud attach rate healthy by making it genuinely good rather than coercive, (b) the community programme in §4.6 which converts advocacy into *reduced cost* rather than more revenue, and (c) keep the team small enough that the model works at modest volume.

### 4.6 Loyalty, community & advocacy programme

You asked for loyalty mechanics, a donation ask, and social follow. Designed so each one **also reduces an ongoing cost** — that's what makes it worth building rather than a gimmick.

**Founding Members — first 500 licences**
Permanent in-app badge · name in the credits (opt-in) · **1 year of Coach Cloud free** · direct line to the roadmap and a private beta channel. Costs us server time, not cash, and creates the early advocates that carry a launch.

**Referrals — give $30, get $30**
An existing owner's referral link gives the new buyer $30 off and the referrer $30 in **cloud credit** (or a content pack). Credit, not cash — it costs margin instead of money and it deepens product engagement.

**Advocacy rewards — one-time, low-friction**
Follow on LinkedIn · leave a public review · share a case study · post a before/after with attribution → **cloud credit** (1–3 months, scaled). Each action is verifiable and each buys real distribution. This is where the LinkedIn follow lives: as a small, clearly-labelled optional ask in the app after a coach has had a genuine win — **never a modal on first launch**, never nagging, dismissible forever.

**Community contribution credits — the highest-leverage piece**
The two largest *recurring* content costs are link maintenance (6,000 links) and Tier-2 translations. Both are things engaged users can genuinely do well:

| Contribution | Reward |
|---|---|
| Submit a replacement for a dead demo link (accepted after review) | Cloud credit |
| Contribute or correct a translation string | Cloud credit |
| Submit an exercise entry that passes SME review | Cloud credit + attribution |
| Report a reproducible bug with steps | Cloud credit |

This turns the loyalty programme into an actual solution for §4.5's cost problem, and it gives professional coaches something they value more than a discount: **credited authorship in a tool their peers use.**

**Donation ask — done tastefully**
A single, quiet "Support development" entry in Settings (never a popup, never a banner), with **honest impact framing**: what the money funds, and a public changelog of what donations paid for. Optional recurring "supporter" tier with no functional benefit whatsoever — because the moment it buys a feature, the "pay once" promise is dead.

**Anniversary touch**
On each purchase anniversary: a short, genuine summary of what shipped that year, free because they own it. No upsell. This is the moment the promise pays off emotionally, and it's when people tell their peers.

### 4.6 Other terms

- **30-day refund**, no questions. Easy to offer for software with no server cost.
- **Education / student:** 50% off Independent.
- **Non-profit / community gym:** 40% off Studio.
- **Bundle:** Independent + 1 year Coach Cloud = $299 (saves $130).
- **No client limits, ever.** Metering a local-first app is unenforceable, user-hostile, and contradicts the entire pitch.
- **Licence keys are offline-verifiable** (signed, checked locally, no activation server) — a licence server would break the "works if we vanish" promise in `HOW-TO-OWN-IT.md`.

### 4.7 Five-year cost comparison (the sales page table)

| | Coachwright | TrueCoach | Trainerize |
|---|---|---|---|
| Year 1 | $249 | ~$720 | ~$780 |
| Years 2–5 | **$0** | ~$2,880 | ~$3,120 |
| **5-year total** | **$249** | **~$3,600** | **~$3,900** |
| Future versions | **Included, forever** | n/a | n/a |
| You own it at the end | **Yes** | No | No |
| Works if the company folds | **Yes** | No | No |

*(Launch price $179 makes the 5-year total **$179** — roughly **1/20th** of a competitor.)*

---

## 5. Launch plan per edition

| Edition | Ships | Channel | Why this order |
|---|---|---|---|
| **Personal** | First | Web (PWA), then app stores | Free, lowest risk, seeds the ecosystem, and every coach's clients become users |
| **Independent** | Second | Direct (site) + Windows/Mac installers | The revenue product. Needs Personal to exist so the client-side story is real. |
| **Studio** | Third, ~3–6 months later | Direct sales + onboarding call | Multi-seat is the most new logic and the highest support burden. Don't launch it half-built. |

**Do not launch all three simultaneously.** Studio has a genuinely different sales motion (demos, onboarding, migration from existing gym software) and launching it alongside the others will starve it of attention.

---

## 6. Technical work this implies

| Item | Notes |
|---|---|
| **Licence system** | Offline signed keys (Ed25519). Verify locally. No activation server. Seat count encoded for Studio. |
| **Edition capability flags** | Extends `lib/cloudCapability.ts`'s proven pattern: ask "can I?", get a reason when no. |
| **Upgrade flow** | Personal → Independent must preserve all data. Enter a key, features appear. |
| **Seat management (Studio)** | Assign/revoke seats offline; the hub is the record of truth. |
| **Three onboarding flows** | Different first-run for each edition — see [08](08-CLAUDE-DESIGN-PROMPTS.md) |
| **Edition matrix tests** | Assert a Personal build genuinely cannot reach coach features, and that no Studio-only code leaks into the Personal bundle |

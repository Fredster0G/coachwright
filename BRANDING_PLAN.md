# COACHWRIGHT — BRANDING PLAN v1.1
Prepared 2026-07-16. Companion to `STRONGSUIT_MASTER_SPEC.md` §7 (Ironworks design system) and §9 (commercial notes). This document covers the *market-facing* brand; the spec covers the in-product identity.

> **Rename note (2026-07-16):** the product was renamed **Strongsuit → Coachwright** because "Strongsuit" was already trademarked by an established (~$10M) company. In code the brand lives in one file, `src/lib/brand.ts`; data-level identifiers (IndexedDB name, backup `app` id) intentionally keep the legacy `strongsuit` value so existing data and old backups keep working. Spec filenames still say STRONGSUIT — treat "Strongsuit" in the spec as "Coachwright."

---

## 1. Brand foundation

**Name:** **Coachwright** — a "wright" is a craftsperson who *builds* (wheelwright, shipwright, playwright). Coach + wright = the instrument a coach builds their business on. One word, ownable, unmistakably coaching, and it harmonizes with the "Ironworks" design system (a workshop instrument). .com-friendly variants (`coachwright.app`, `getcoachwright.com`).

**Category we create (not join):** *"Coaching software you own."* Never describe Coachwright as "a TrueCoach alternative" in headline copy — alternatives inherit the category's frame. We sell **ownership**, they rent access.

**One-liner:** *Pay once. Own your coaching business forever.*

**Extended positioning statement:** For independent personal trainers who are tired of renting their own client list back from a SaaS company, Coachwright is a professional coaching workstation they buy once and own outright — every client, program, and session stored on their machine, not our servers, because we don't have servers.

**Brand promise (the three words):** **Owned. Private. Forever.**

## 2. Audience & buyer psychology

Primary: independent PTs (in-person + hybrid), 5–60 clients, currently paying $30–160/mo. Secondary: online coaches leaving Trainerize/Everfit; studio owners with 1–5 coaches (v2).

What they feel (mine this in all copy):
- **Punished for growing** — per-client pricing means success raises rent.
- **Held hostage** — client data lives in a vendor's cloud; canceling feels like losing the business.
- **Nickeled** — payment surcharges, feature paywalls, "contact sales."
- **Unseen** — they're small businesses, treated like consumers.

Voice implication: talk to them like a fellow tradesperson, never like a startup talking to "users." Plain, capable, sentence case (spec §7.6). No hype, no exclamation marks, no "supercharge your fitness empire."

## 3. Messaging architecture

**Pillar 1 — The math (lead with this).**
"TrueCoach Pro is ~$1,600/year. Coachwright is $79. Once."
Anchor every price mention against the annual rent competitors charge. Build the launch page around an interactive "what you're paying now vs. Coachwright" calculator — it's on-brand (the Profit Planner inside the product does the same math for their clients' business).

**Pillar 2 — The privacy story.**
"Your client data never leaves your machine. No account. No login. We couldn't read your data if we wanted to — there's nothing to breach."
This is verifiable (no network calls; auditable Companion files) — invite the skepticism, then win it. Honesty is the moat: no phone-home DRM, no telemetry, and we say so.

**Pillar 3 — The pro-tool feel.**
"Built like an instrument, not a dashboard." Keyboard-first builder, frame-by-frame Film Room, explainable progression engine, command palette. Demo videos should look like Linear/Figma demos: fast hands, no cursor wandering.

**Pillar 4 — The Companion loop.**
"Your clients get *your* app — no downloads, no accounts." The Companion file carries the trainer's logo and colors, with a small "Built with Coachwright" footer (toggleable). Every client is a potential referral surface — this is the organic growth engine; protect its polish above all else.

**Feature naming (keep these names consistent everywhere):**
- **Film Room** — video analysis + on-device movement tracking (borrowed from athletics culture; instantly understood by coaches)
- **Companion** — the client-side file
- **Profit Planner** — the business goal engine (income − the gym's cut − expenses vs. your target)
- **The Ledger** — payments + expenses view
- **Ironworks** — the design system (internal, but fine to mention in "how it's built" content)

## 4. Visual identity (market-facing)

Extends Ironworks (spec §7): jade `#155E4E` + porcelain `#F7F6F3` + ember `#D9730D`. Competitors are blue/black/neon — jade + porcelain is unowned territory and reads "trustworthy instrument."

- **Logo (shipped, S11):** the mark is a "C" formed from a barbell collar seen end-on, its mouth cut with two flat machined faces so the negative space resolves into a hard C — one solid form, not an outline. Machined, not sporty; no swooshes, no flames, no flexing silhouettes. **The mark itself is monochrome-only, always** — absolute black/ink on white/porcelain, or reversed. No jade/ember accent ever touches the mark; the confidence is in the contrast, not color. (Jade/ember stay exactly where they already are: the product's UI chrome, charts, and tags — Ironworks isn't changing, only the mark's own rule is stricter than the rest of the system.) Canonical source: `src/app/brand/Logomark.tsx` (in-product) and the brand-mark reference sheet covering construction, clearspace, min size (16px mark / 120px full lockup), and motion. Wordmark now sets in **Inter Tight** (see typography below), not Archivo.
- **Marketing typography:** Inter Tight 800 weight (display/wordmark, −0.04em tracking) + Inter (body) + JetBrains Mono for every number that appears in marketing (prices, comparisons, stats) and for all uppercase mono labels/eyebrows — the mono-numeral signature carries from product to promo. (Changed from Archivo→Inter Tight in S11 to match the shipped in-product display font exactly; do not mix the two.)
- **Motion doctrine (new, S11):** one easing curve everywhere the mark or wordmark move — `cubic-bezier(0.2,0,0,1)`, sharp arrival, zero overshoot/bounce. Three canonical states: a continuous ring-sweep for indeterminate loading, a left-to-right wipe-build of the mark + a staggered wordmark fade-in for app launch/splash (`cw-wipe`→`cw-word`→`cw-fade`, ~1.25s total), and a determinate bar for known-progress waits. Never use a bouncy/elastic easing or a gradient-filled spinner on anything wearing this brand — that reads as generic, not as a machined instrument.
- **Photography/art:** real gym environments in natural light, chalk and steel textures; screenshots always in the porcelain UI on subtle noise backgrounds. Never stock "smiling trainer with clipboard."
- **Banned in marketing (mirrors spec §0):** gradients on purple/indigo, glassmorphism, emoji-as-icons, AI-looking hero illustrations, confetti.

## 5. Pricing & offer

> **⚠️ SUPERSEDED (S15, 2026-08-14).** Pricing is now a free tier (up to 3 active clients) plus
> **Coachwright Membership at $29/mo** — see `PRODUCT_OVERVIEW.md` §8 and
> `strongsuit-v0.1/strongsuit/docs/MEMBERSHIP.md`. The one-time-purchase offer below, and the "buy once
> and own outright" line in §1's positioning statement, are kept as the record of the original plan and
> must not be used in new copy. Rewriting the positioning itself is Caleb's call, not a doc sweep.

- **Launch:** $79 one-time (test $59–99). Anchor line: *"Less than one month of what you pay now."*
- **Wording:** "Free updates for the current major version" — never "lifetime updates."
- **Guarantee:** 60-day refund, no questions — low risk because there's no infrastructure cost per user.
- **v2 expansions** (paid, honest): Nutrition module, multi-coach studio. Position as "expansion packs you also own," never subscriptions.
- **License key:** cosmetic only (unlocks nothing, phones nowhere) — say this out loud in the FAQ; it builds trust.

## 6. Channels & launch sequence

1. **Pre-launch (2–3 weeks):** landing page with the savings calculator + email capture. Post build-in-public threads (r/personaltraining, X/fitness-coach corners): "Why does coaching software cost $1,600/yr? I built one you buy once."
2. **Launch:** Gumroad primary. Product Hunt for the tech crowd halo. Direct outreach to 20 trainers for testimonial seeding (free licenses in exchange for honest quotes).
3. **Content engine (evergreen):** SEO pages targeting "TrueCoach alternative," "Trainerize alternative," "one-time payment personal training software" — comparison tables that are *scrupulously fair* (concede live messaging; win on price, privacy, Film Room, Profit Planner, ownership).
4. **The Companion loop:** every exported Companion file with the footer on is a referral. Make the footer link to a page that speaks to the *client's trainer's peer* ("Your coach runs their business on software they own").
5. **Community proof:** a public "savings counter" — self-reported dollars users stopped paying in subscriptions.

## 7. Competitive one-liners (sales page / battle cards)

| Against | Line |
|---|---|
| TrueCoach | "Everything you use TrueCoach for — minus the $137/month and the per-client tax." |
| Trainerize | "No upsells hiding behind every tab. One price, every feature." |
| Everfit | "Your clients don't want another account. Send them a Companion instead." |
| Spreadsheets | "Keep the control. Lose the formulas breaking at 6am." |

Fair-play rule: never claim live chat or *hosted* cloud sync as a default — there isn't one, by design, and the copy says why that's the feature. (v1.5 correction: Studio Link's E2EE device pairing + local WiFi/file sync are real and shippable; the *optional* self-hosted cloud relay prototype is real too but unwired/off by default. Marketing copy can say "sync your own devices, end-to-end encrypted, no cloud required" — it just can't imply Coachwright runs a server for you, because it doesn't.)

## 8. Voice examples (calibration)

- Yes: "Your data lives on your machine. Back it up like you mean it — we made that a one-click habit."
- Yes: "$3,450 to go this month. About 12 more sessions. You've got 15 days."
- No: "Supercharge your coaching empire with AI-powered insights!!"
- No: "We're on a mission to democratize fitness entrepreneurship."

## 9. Launch asset checklist

- [x] Wordmark + mark (SVG, ink/porcelain monochrome variants only — see §4) — shipped S11 across the app (sidebar, EULA, onboarding, boot screen, favicon, Electron splash)
- [ ] Landing page w/ savings calculator + 90-second product film (keyboard-driven builder → Companion export → phone)
- [ ] Film Room demo clip (side-by-side squat comparison with angle overlay — the "whoa" moment)
- [ ] Comparison pages ×3 (TrueCoach / Trainerize / Everfit)
- [ ] Gumroad listing + `HOW-TO-OWN-IT.md` buyer readme (Phase 9 deliverable)
- [ ] 10 social cuts: the math, the privacy story, the Film Room, the Profit Planner, the Companion loop

---
*Rule of thumb for anything not covered here: decide in favor of honesty > restraint > boldness — in that order.*

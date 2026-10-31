# SERVER, PAYMENTS & MONETIZATION STRATEGY

> **⚠️ SUPERSEDED IN PART (S23, 2026-09-27).** Coachwright moved to cloud accounts: coach data lives on
> Coachwright Cloud (readable by the operator, not end-to-end encrypted), the self-hosted and $15/mo
> managed relay tiers no longer exist, and Companion connects with a coach-issued code instead of E2EE
> pairing / WiFi / file sync. Anything below that says otherwise is history. Current design:
> `strongsuit-v0.1/strongsuit/docs/CLOUD.md`.
Companion to `STRONGSUIT_MASTER_SPEC.md` §0 (zero-backend doctrine) and `BRANDING_PLAN.md`. Written 2026-07-17 (S10), updated 2026-07-17 (S11) in response to a feature list modeled on full gym-management suites (TrueCoach/Trainerize/Mindbody/PT Distinction). This document draws the line honestly: what Coachwright can do without a server, what genuinely needs one, and — for the pieces that do — the specific, minimal-liability way to add them without breaking the "you own it, zero recurring cost" promise that *is* the product.

**S11 update:** §6 of the S10 version of this doc posed an open question — "should there be an optional paid cloud relay?" That question is now answered and built: **§2.5 below is official doctrine, not speculation.** `CloudCard.tsx` (Settings) ships a real three-way choice — fully local, self-hosted relay, or managed-by-us at $15/mo — and `sync-server/` now has real messaging + poll-based reminder endpoints behind per-coach API keys, not just the original device-sync prototype. If you're reading this before touching anything cloud/relay/hosting-related, read §2.5 first; it supersedes any framing elsewhere in this doc that still calls hosting "future" or "speculative."

**Read this before building any of the "needs infrastructure" rows below.** Do not silently fake a feature (a "Send email" button with no email actually sending, a "Push notification" toggle with no push service behind it). Either build it for real with a bring-your-own-account pattern, or don't build it and point the coach at a real tool. Half-built infrastructure features are worse than an honest gap — they cost the buyer trust the moment they try to use one.

---

## 1. The line, drawn plainly

Coachwright's moat is: **no server, no monthly bill, no one but you holding your client list.** Every feature that needs a server to function *for real* (not a demo) puts that promise at risk. So the rule is:

| If a feature needs… | Verdict |
|---|---|
| Only local computation on data already in IndexedDB | **Build it.** This is 90% of the "enterprise suite" list — see §2. |
| A one-time, coach-initiated, coach-owned external link (a payment link, a mailto:, a scheduling link) | **Build the integration point**, not the service itself. The coach brings their own free/cheap account; Coachwright never touches the credentials or the money. See §3. |
| A standing service that runs while the app is closed (bulk email/SMS sends, push notifications, webhooks, a payment processor's server-side webhook handling) | **Do not fake it.** Document the honest options in §4 and let the coach pick a real tool for that one job. |
| Hosting content for the public internet (landing pages, on-demand video, livestreaming) | **Out of scope for this product.** It's a website/media hosting business, not a coaching workstation. §5 gives the recommended external stack. |

---

## 2. Built without a server (already shipped, S9–S10)

Everything below runs entirely on the coach's device, exactly like the rest of Coachwright:

- **Team & locations** — staff roster, per-staff commission math, multi-location tagging (`/team`).
- **CRM / leads pipeline** — inquiry → contacted → trial → won/lost, convert-to-client (`/leads`).
- **Leaderboards & challenges** — opt-in cross-client ranking on volume/sessions/bodyweight-loss, computed from data already logged (`/leaderboard`).
- **Progress photos & habit tracking** — resized-before-storage photos, daily habit streaks (Metrics/Check-ins tabs).
- **TV Workout mode** — a full-screen, no-chrome display route (`/tv/:clientId`) for a gym-floor screen/monitor. This is *screen mirroring*, not a casting SDK — plug the coach's laptop into the TV or use the OS's built-in screen-mirroring (AirPlay/Miracast/Chromecast's "cast this tab" browser feature all work with a normal web page; none of that requires Coachwright to integrate anything).
- **Automations rule engine** (`Settings → Automations`) — configurable local rules ("no session in N days," "package down to N sessions," "payment overdue," "screening missing") re-evaluated on every dashboard load. This is the honest ceiling for "automation" without a server: instant, on-demand, zero cost — not a background job that fires while the laptop is asleep. Say this plainly to buyers; it's a feature, not an apology (a coach's phone isn't a server room either).
- **Invoicing, coupons, account balances** — numbered invoices with line items, coupon codes (percent/flat), and a real "balance owed" (Billing tab).
- **E-sign waivers, PAR-Q+ screening** — typed-signature acknowledgement with a SHA-256 hash of the exact text signed (tamper-evident, not a notarized e-signature service — see §3 if a coach needs court-grade e-signatures).
- **Secure WiFi/LAN sync** — ECDH P-256 pairing + AES-GCM sealed packets between the coach's device and a client's device on the same network (Studio Link, Electron build only for the live server; file-based export/import works everywhere). No cloud relay required for this to work.

## 2.5. The 3-tier hosting model (official doctrine, built S11)

Coachwright ships with **one app, three ways to run its optional cloud relay** — a coach picks in Settings → Cloud (`CloudCard.tsx`), and the choice changes nothing about the one-time price of the app itself:

| Tier | Cost | Who runs it | What it unlocks |
|---|---|---|---|
| **Fully local** (default) | $0, forever | Nobody — there is no relay | Everything in §2. Cross-device sync is file-export/import or same-WiFi pairing only. |
| **Self-hosted relay** | ~$0–5/mo (a coach's own VPS, or a spare Raspberry Pi) | The coach, running `sync-server/` themselves | Same features as Managed, below — the coach owns the box, the data, and the bill. Coach-facing setup guide: `docs/SELF_HOSTING.md` (S15) — deliberately stripped of anything operator/business-specific (no Stripe, no `ADMIN_KEY`, no multi-tenant provisioning); it's the single-coach `API_KEY` path `server.ts` already supports, start to finish. |
| **Managed by us** | $15/mo, flat | Us, on shared infrastructure | Zero setup — paste a license key (issued by us after payment, see below) and it works. |

**Why $15/mo and not free:** running someone else's relay costs real, ongoing money (a VPS, bandwidth, our time keeping it up) — this is the one place in the product where "zero backend" genuinely can't apply, because *something* has to be listening on the internet 24/7 for a relay to relay anything. The $15/mo is priced to cover that infrastructure plus a small margin, not to replicate a SaaS subscription — the app itself never stops working if a coach cancels this; they just drop back to self-hosted or fully-local.

**What the relay actually does (all three tiers, same code, same E2EE trust model):**
- **Device sync** (`/sync/push`, `/sync/pull/*`) — the original prototype, now hardened with per-coach API keys (see below).
- **Messaging** (`/messages/push`, `/messages/pull`) — a message typed in `MessagesTab.tsx`'s "Live" panel is sealed with the same ECDH+AES-GCM pairing key used for sync (`lib/sync.ts`'s `sealSyncPacket`), pushed as opaque ciphertext, and pulled/decrypted by the other side. **The server never sees plaintext** — this is not a chat backend in the SaaS sense, it's a dumb ciphertext mailbox.
- **Reminders** (`/reminders/schedule`, `/reminders/due`) — **poll-based, not push.** A client's Companion app (when opened) polls `/reminders/due` and shows anything due, decrypted client-side. This is the honest ceiling without FCM/APNs infrastructure (see the §4 "Push notifications" row, updated below) — a real, working feature, just not a phone-wakes-up-while-closed notification.

**Multi-tenancy — per-coach API keys:** the original prototype had one shared `API_KEY` for the whole server, fine for a single self-hosted coach but wrong for a shared managed instance serving many $15/mo customers (one coach's key must never read another's data). `sync-server/server.ts` now has an `api_keys` table; `POST /keys/register` (gated behind a separate `ADMIN_KEY`, operator-only) issues a coach a real per-coach key after payment is confirmed. **There is no Stripe webhook wired to this** — provisioning today is a manual step by whoever runs the managed service (check the payment came in, hit `/keys/register` once). Automating that is a reasonable future addition, not a blocker to launching the tier as-is (a $15/mo business with a manual 30-second provisioning step per customer is completely normal at low volume).

**What a coach sees in Settings, honestly:** "Fully local — free, forever, nothing leaves this device." / "Self-hosted — free, you run a small server yourself, here's the file." / "Managed by us — $15/month, we run it so you don't have to." No tier is framed as required; the data-privacy promise (client data never leaves the coach's device unencrypted) holds at every tier because the relay only ever stores ciphertext it can't read — regardless of whether the coach is on the free Coachwright tier or Membership (see §2.6 below and `docs/MEMBERSHIP.md`).

### 2.6 The one real exception to "never becomes the payment processor" — Membership billing (S15)

§3 below's "don't build a checkout" doctrine is about Coachwright facilitating payments **between a coach
and their client** — that stays exactly as written; nothing changed there. What's new S15 is Coachwright
billing **its own users** for the app itself: Coachwright Membership, $29/mo, replacing the one-time
licence purchase as the paid coach tier (see `docs/MEMBERSHIP.md` for the full reasoning and runbook).

This still respects the spirit of §3's doctrine, not just the letter: `sync-server/server.ts`'s new
`/membership/*` routes create a Stripe Checkout session and a Stripe billing portal session — both fully
hosted by Stripe. **No card number, expiry, or CVC ever reaches Coachwright's server or the app.** What the
server DOES now hold that it didn't before: a `memberships` table (Stripe customer/subscription ids and
status, no payment details) and the private half of the licence-signing keypair, needed to mint membership
tokens. That keypair is the one genuinely new piece of sensitive infrastructure this introduces — see
`docs/MEMBERSHIP.md` §5 for how it's generated and where it's allowed to live (nowhere in this repo).

## 3. Bring-your-own-account integrations (build the link, not the plumbing)

These are real, working features — Coachwright just never becomes the payment processor, the SMS carrier, or the mail server. The coach already has (or can get for free/cheap) the underlying account; we give them a clean place to paste the resulting link or address.

### Payments & e-commerce
**Don't build a checkout.** Taking cards directly means PCI compliance, chargebacks, and a "zero backend" company suddenly running financial infrastructure — the single fastest way to turn a $79 one-time tool into a support and liability nightmare.

**Do build:** a field on each Invoice/client for a **payment link** (Stripe Payment Links, Square, PayPal.me, or Venmo/CashApp handles — all free to create, no code, no API key, the coach's own merchant account). Coachwright renders it as a clickable "Pay now" button/QR on the invoice and printed statement. The Ledger already records payments manually; nothing stops a coach from pasting the Stripe receipt total in after the fact — same workflow trainers already use today, just faster to send.

*Comparison:* TrueCoach/Trainerize/Mindbody take a cut of processed payments (typically 2.9%+30¢ passed through a partner processor, sometimes with an added platform fee) — on top of the monthly fee. A Stripe Payment Link charges the same ~2.9%+30¢ **directly to Stripe**, with **no platform markup**, because there's no platform in the middle. For a $1,000/month coach, that's the difference between paying one processor once and paying a processor *and* a SaaS company both.

### Trainer commissions
Already built locally (§2) — no server needed since it's just math over payments already in the Ledger.

### Email (1:1)
**Don't build a mail server or bulk sender** — deliverability, SPF/DKIM, spam compliance (CAN-SPAM/CASL/GDPR) is a real specialty, not a side feature.
**Do build:** `mailto:` deep links pre-filled with subject/body (e.g., a "Email this client" button on the client page, a "Email invoice" button on Invoices) — opens the coach's own email client, sends from their own address, zero infrastructure. This covers the 1:1 case that's 95% of a solo trainer's actual email use.

### SMS (1:1)
Same pattern: `sms:` deep links open the coach's own phone's Messages app pre-filled with a draft — works when the coach is on their phone (which, for a gym-floor trainer, is most of the time). No Twilio number, no per-message cost, no carrier compliance to worry about.

### E-signatures for real contracts
The built-in typed-signature + hash (§2) is a legitimate lightweight audit trail for waivers/PAR-Q — it is **not** a substitute for DocuSign/HelloSign-grade legal e-signature when a contract actually needs one (some jurisdictions/insurers require it for liability waivers). Recommend a coach use a free-tier DocuSign/HelloSign account for anything they'd need to enforce in court; Coachwright's version is for day-to-day operational documentation, and the Guide says so.

## 4. Genuinely needs a standing service — documented, not faked

| Feature requested | Why it needs a real backend | Recommended path | Est. cost to the coach |
|---|---|---|---|
| Bulk/marketing email | Deliverability infra, unsubscribe/compliance, sending reputation | Mailchimp/Brevo free tier (up to 500–2,500 contacts free as of most providers' 2025–26 plans) | $0–20/mo, only if list > free tier |
| SMS marketing/reminders at scale | Needs a carrier-registered number + compliance (10DLC in the US) | Twilio or SimpleTexting pay-as-you-go | ~$0.01–0.03/message, no platform fee from us |
| **True** push notifications (wakes a closed app) | Needs a push service (FCM/APNs) + a server to trigger sends + HTTPS hosting for a PWA's service worker | Still not built — a local automation rule (§2) covers the coach-side case (surfaces the moment they open the app); a **poll-based** reminder now exists on the self-hosted/managed relay tier (§2.5: `/reminders/due`, checked when the Companion is opened) as the honest middle ground. True wake-while-closed push is a real future addition if FCM/APNs infra is ever taken on — not faked as equivalent to the poll-based version | $0 (poll-based, live) / real infra cost if ever built |
| Sales funnels / landing pages | Needs public web hosting, a domain, form-to-database plumbing | Carrd ($19/yr) or a free Notion/Google Sites page linking to the coach's Gumroad/Stripe link | $0–20/yr |
| Online groups / on-demand video / livestreaming | Needs video hosting/CDN and, for groups, real-time infra | Keep coaching delivery in the Companion file (already built, free, offline); for video content, YouTube (unlisted) or Vimeo for hosting, linked from the Exercise Library's existing `videoUrl` field — already wired up | $0–20/mo if Vimeo Pro wanted |
| Sell workout plans / digital products / memberships-as-a-storefront | Needs a storefront, cart, and payment processing at scale | Gumroad (2.9%+30¢+10% platform fee, zero setup) or Stripe Checkout linked from a Carrd page; deliver the purchased program as a Companion export | Gumroad's cut only — no separate subscription |

**The throughline:** every row above has a **free-or-nearly-free, no-code, coach-owned** answer already on the market. Coachwright's job is to interoperate with those (a pasted link, a `videoUrl` field, an exported file) — not to rebuild Mailchimp, Twilio, and Shopify inside a desktop app. Rebuilding them would also reintroduce the exact recurring-cost, third-party-dependency problem the product exists to eliminate.

## 5. Monetization guidance for the *buyer* (surfaced via Profit Planner + Guide)

Directly answers "help them save and make as much money as possible" — this is coaching-business advice the product should keep surfacing, not just a one-time doc:

1. **Undercut the category on price, not on capability.** BRANDING_PLAN.md's math still holds: TrueCoach Pro-tier runs roughly $130–160/mo at 40+ clients; Coachwright is a flat one-time fee. Show this comparison inside the app (Profit Planner already computes real monthly profit — a future small addition: a "you'd be paying $X/mo elsewhere" ambient reminder is cheap to add and reinforces the purchase decision every session).
2. **Use the Gym's Cut + Commissions math honestly with clients.** A coach who knows their real take-home (after facility cut and staff commission) prices sessions correctly instead of guessing — this is already live in the Profit Planner and Billing tabs.
3. **Turn Leaderboards/Challenges into retention, not just fun.** Time-boxed challenges are a proven low-cost way small studios reduce cancellations — it's now a checkbox away (§2), not a $50/mo add-on tier like some competitors sell it as.
4. **Session packages + Invoicing reduce billing leakage.** Untracked "I'll pay you later" sessions are the single biggest silent revenue leak solo trainers report; the new Invoice/Balance-owed view makes the leak visible before it becomes a bad debt.
5. **The Companion footer is a real, zero-cost referral channel.** Every client who opens a Companion file sees "Built with Coachwright" (toggleable) — worth leaving on for trainers actively trying to grow.
6. **Don't recreate a subscription business by accident.** If a coach asks for hosted email/SMS/payments *from us*, the honest answer is: that would require us to run servers and charge recurring fees, which erases the reason they bought a one-time tool in the first place. Point them at §3/§4's bring-your-own-account options instead — their cost stays usage-based and provider-direct, not marked up by a platform in the middle.

---

## 6. What to build next if this list keeps growing

The S10 version of this section asked whether an optional paid cloud relay made sense as a business model. **Answered: yes, and it's built (§2.5).** The same question format still applies to anything new from §4: the right question isn't "can we build a mini version" — it's **"does the buyer actually need a hosted product, and would they be better served by us selling this as a genuinely separate, clearly-recurring companion service, priced and marketed as such?"** That's the same test the $15/mo managed relay passed. Concretely still open, in priority order (see `HANDOFF_SONNET.md` T8–T11):

1. ~~Companion-side (client) wiring for messaging + reminders.~~ **Done — stale by S15.** This referred to `companion/template.html`, a vanilla-JS artifact that no longer exists in the tree; it was superseded by the real `companion-app/` (Vite+React PWA), whose `src/features/sync/companionSyncApi.ts` already calls `/messages/push`, `/messages/pull`, and `/reminders/due` against this same server. Confirmed by re-reading the code, not assumed from an old note — the doc simply hadn't been updated when the rewrite landed.
2. **Automated key provisioning.** `/keys/register` works but is a manual operator step today (confirm payment, hit the endpoint). A Stripe webhook → auto-register flow removes the manual step once managed-tier volume justifies it.
3. **True push notifications**, if FCM/APNs infra is ever taken on — see the §4 table row above for why this is deliberately not built yet.

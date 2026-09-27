# MEMBERSHIP — the $29/mo tier, what it changes, and how to run it

Written S15 (2026-08-14), the day the pricing model changed from a one-time purchase to a subscription
alongside a free tier. This file is three things: the honest reasoning for the change, what it actually
costs the "buy once, own forever" promise, and the operator runbook for standing up billing for real.
`PRODUCT_OVERVIEW.md` §8 and `docs/plans/06-EDITIONS-PRICING.md` §4 both point here rather than repeating
this.

## 1. What changed, and what didn't

**Changed:** the paid coach tier is now $29/mo (Coachwright Membership) instead of a one-time licence
purchase. A new free tier exists alongside it, capped at 3 active clients.

**Did not change:**
- Any *already-issued* one-time licence key (`lib/licence.ts`). Those keys have no expiry, are still
  verified offline, and never will be revoked.

**Changed again in S23:** membership moved onto the coach's cloud account (see `CLOUD.md`). The S15
design — offline-verified signed `CWM1.` tokens refreshed from the server, and S22's per-device secret —
is gone; with real accounts, the server simply answers "is this account a member, and until when".

## 2. Why this is a real reversal, not a tweak — said plainly

The original pricing doc (`docs/plans/06-EDITIONS-PRICING.md` §4.5) called "buy once, updates forever" a
**decision**, dated and reasoned through in detail — the honest accounting of what funds ongoing
development without a recurring line. That reasoning doesn't disappear because the number changed; it's
worth rereading before touching pricing copy again. The membership model trades that funding uncertainty
for a predictable one, at the real cost of the cleanest differentiator this product had ("you own it, we
can vanish and it still works"). That promise now only fully applies to the free tier and to anyone who
already owns a one-time licence.

## 3. The free tier: why 3, not a bigger or smaller number

QuickCoach's own free tier is 20 clients — genuinely generous, and worth knowing before claiming
"best-priced on the market" anywhere, because a straight per-client comparison does not favor a 3-client
cap. The reasoning for 3 here is different: **enough to genuinely try coaching real clients with the app,
not enough to run a practice on.** A coach who's serious quickly hits the ceiling and has a real, felt
reason to pay; a coach only curious never has to. Revisit this number with real conversion data once there
is any — it was chosen, not measured.

`FREE_TIER_CLIENT_LIMIT` lives in `src/lib/membership.ts`. It's enforced locally (`canAddClient()`),
checked in `NewClientDialog` and `ImportCsvDialog` — same honest-not-unbreakable philosophy as
`lib/licence.ts`'s own header: a determined user could edit their own IndexedDB to raise their stored
client count. The point is a clear, correctly-explained limit for someone acting in good faith, not a wall
against someone who isn't. A local-first app cannot do better than that without becoming a different kind
of product (server-authoritative accounts), which was never on the table here.

## 4. How membership works (S23)

- The coach is signed in (`CLOUD.md`). **Upgrade** calls `POST /membership/checkout`; the server creates a
  Stripe Checkout session with `client_reference_id = <account id>` and the account's email. The app
  never sees a card number.
- The webhook (`checkout.session.completed`, `customer.subscription.updated/.deleted`) records the
  subscription on the account in the `memberships` table. `/checkout` refuses (409) while the account
  already has an active subscription, so nobody is double-billed.
- The app asks `GET /membership/status` at launch, every few hours, when the network returns, and when
  Account/Settings opens (`lib/membershipApi.ts`). The answer is `{active, expiresAt}` where `expiresAt`
  is Stripe's `current_period_end` plus `MEMBERSHIP_GRACE_DAYS` (default 7).
- The app caches that on two **device-only** trainer fields (never uploaded) and `hasActiveMembership()`
  honours it until `expiresAt` even if the server can't be reached. After it, free-tier limits apply.
  Never a lockout, never data loss.
- `past_due` (Stripe still retrying a card) counts as active.
- **What Membership unlocks** — exactly two things: unlimited active clients (`canAddClient`) and custom
  branding for installs created after 2026-08-15 (`canUseCustomBranding`). Everything else is free on
  every tier (DEBT-70 tracks the edition flags that still describe the old split).
- The free-tier cap is still checked on the device only (DEBT-66). The server now *could* enforce it —
  it knows both the membership and the client count — but doesn't yet (DEBT-74).

## 5. Operator runbook — going live for real

Stand up the backend first (`CLOUD.md` §4). Then, in order:

1. **Create the Stripe product & price** (Dashboard → Product catalog): one recurring product, $29.00/mo,
   USD. Copy the **Price ID** (`price_...`).
2. **Create a restricted API key** with Checkout Sessions, Subscriptions, Customers, and Billing Portal
   write access. Copy the **secret key** (`sk_...`).
3. **Set the server env** (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`,
   `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`, optional `MEMBERSHIP_GRACE_DAYS`) — see `CLOUD.md` §4.
   No signing key is needed any more.
4. **Register the webhook** at `https://<api-domain>/membership/webhook` for `checkout.session.completed`,
   `customer.subscription.updated`, `customer.subscription.deleted`; copy its signing secret into
   `STRIPE_WEBHOOK_SECRET`.
5. **Run the tests:** `cd sync-server && npm test`.
6. **Test mode first:** `sk_test_...` and card `4242 4242 4242 4242`; run one real checkout → webhook →
   `/membership/status` loop before switching to live keys.

An instance without these vars still runs accounts and sync; every `/membership/*` route answers 503.

## 6. What this deliberately does not do

- **No card details ever touch our servers or this app.** Stripe Checkout and the Stripe billing portal
  are both fully hosted by Stripe — this is the same "don't build a checkout" doctrine from
  `SERVER_STRATEGY.md`, applied to a now-real payment flow instead of avoiding one.
- **No customer portal was built.** Cancel, update-card, view-invoices all go through Stripe's own hosted
  portal (`openMembershipBillingPortal()` just creates a session and redirects).
- **No hard lockout.** Losing a card, going offline, or letting a subscription lapse never deletes data or
  blocks the app from opening — it reverts to free-tier limits, same UI, same data.

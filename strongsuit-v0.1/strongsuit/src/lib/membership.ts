// ===== Membership — the $29/mo subscription =====
//
// Membership lives on the coach's cloud account (sync-server `/membership`,
// fed by Stripe). `lib/membershipApi.ts` refreshes the cached state onto the
// trainer row's device-only fields; everything here is the pure gating logic
// the UI reads synchronously. One-time licence keys from before the S15
// pivot (`lib/licence.ts`) are separate and never expire.

/** Is the cached membership live RIGHT NOW? The cached `membershipActive`
 *  flag alone is not enough: it's only rewritten by a successful refresh, so
 *  a coach who cancels and then can't reach the server would keep it `true`
 *  forever. `membershipExpiresAt` (the server's period end + grace) is the
 *  promise docs/MEMBERSHIP.md makes, and this is where it's kept. */
export function hasActiveMembership(
  trainer: { membershipActive?: boolean; membershipExpiresAt?: string },
  now = new Date(),
): boolean {
  if (!trainer.membershipActive || !trainer.membershipExpiresAt) return false
  const expires = new Date(trainer.membershipExpiresAt)
  return !Number.isNaN(expires.getTime()) && now.getTime() < expires.getTime()
}

/** Unlimited clients / branding: a live membership OR a grandfathered
 *  one-time licence edition (which never expires — licence.ts's promise). */
export function hasPaidAccess(
  trainer: { membershipActive?: boolean; membershipExpiresAt?: string; edition?: string },
  now = new Date(),
): boolean {
  return hasActiveMembership(trainer, now) || trainer.edition === 'independent' || trainer.edition === 'studio'
}

// ------------------------------------------------------- free tier gating

/** Free Coachwright's client ceiling. Chosen deliberately lower than
 *  QuickCoach's 20-client free tier (see docs/MEMBERSHIP.md) — the honest
 *  reasoning documented there is "enough to genuinely try coaching with the
 *  app, not enough to run a practice on," rather than trying to win on raw
 *  free-tier size against a competitor with venture funding. */
export const FREE_TIER_CLIENT_LIMIT = 3

export interface ClientCapCheck {
  allowed: boolean
  reason?: string
}

/** Whether this coach can add one more active client right now. A LOCAL,
 *  honest gate, not an unbreakable one — same philosophy as licence.ts's own
 *  header comment: this checks the coach's own database, not a server, and a
 *  determined user could edit their own IndexedDB to raise the count. The
 *  point of enforcing it here is a clear, correctly-explained limit, not
 *  pretending a local-first app can meter itself against tampering. */
export function canAddClient(activeClientCount: number, hasActiveMembership: boolean): ClientCapCheck {
  if (hasActiveMembership) return { allowed: true }
  if (activeClientCount < FREE_TIER_CLIENT_LIMIT) return { allowed: true }
  return {
    allowed: false,
    reason: `Free Coachwright covers up to ${FREE_TIER_CLIENT_LIMIT} active clients. Upgrade to Coachwright Membership ($29/mo) for unlimited clients and the full toolset.`,
  }
}

export function canUseCustomBranding(trainer: { edition?: string, membershipActive?: boolean, membershipExpiresAt?: string, createdAt: string }): { allowed: boolean; reason?: string } {
  if (hasPaidAccess(trainer)) return { allowed: true }

  // S15 grandfathering rule: gate new, never claw back.
  // Using an explicit date cutoff instead of checking for `businessName` prevents new installs
  // from accidentally grandfathering themselves during the onboarding wizard.
  const isGrandfathered = trainer.createdAt < '2026-08-15T00:00:00.000Z'
  if (isGrandfathered) return { allowed: true }

  return {
    allowed: false,
    reason: "Custom branding (logos, colors, and branded client apps) is part of Coachwright Membership ($29/mo)."
  }
}

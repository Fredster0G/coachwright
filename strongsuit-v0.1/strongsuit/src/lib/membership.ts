// ===== Membership tokens — the $29/mo subscription, alongside licence.ts's one-time keys =====
//
// A membership token attests "this coach's Stripe subscription was active as
// of `issuedAt`, good until `expiresAt`" — reissued periodically by the sync
// server (see sync-server/server.ts's `/membership` routes) well before that
// date, so a coach who opens the app at least once every few weeks never
// notices the refresh happening. Verification is still 100% offline and uses
// the exact same embedded public key as licence.ts's one-time keys (same
// signing authority, two claim shapes) — the only network dependency is
// periodic REFRESH, handled by `refreshMembership()` below, never
// verification itself.
//
// Deliberately a separate module and a separate token prefix (`CWM1.` vs
// licence.ts's `CW1.`) rather than adding an expiry field to LicenceClaims —
// see licence.ts's header for why: this must never risk invalidating an
// already-issued one-time key.
//
// What happens offline: the app keeps working fully on the last verified
// token until `expiresAt`. The server mints tokens with real headroom past
// the Stripe billing period (see MEMBERSHIP_TOKEN_LIFETIME_DAYS server-side)
// specifically so a coach without internet for a week isn't locked out
// mid-cycle. Past expiry with no successful refresh, the account reverts to
// the free tier's limits — never a hard app lockout, never data loss.

import { b64urlToBytes, utf8, bytesToB64url, RELEASE_PUBLIC_JWK } from './licence'

export interface MembershipClaims {
  name: string
  /** Stripe subscription id — a support/debugging reference, never shown to
   *  the coach as anything more than "your membership". */
  subscriptionId: string
  issuedAt: string   // ISO — when this token was minted
  expiresAt: string  // ISO — token is void after this; refreshMembership() renews it well before then
}

export interface MembershipToken {
  claims: MembershipClaims
  signature: string
}

export type MembershipStatus =
  | { valid: true; claims: MembershipClaims }
  | { valid: false; reason: string }

function canonicalMembershipClaims(c: MembershipClaims): string {
  return JSON.stringify([c.name, c.subscriptionId, c.issuedAt, c.expiresAt])
}

export function encodeMembershipToken(t: MembershipToken): string {
  const claims = bytesToB64url(utf8(JSON.stringify(t.claims)))
  return `CWM1.${claims}.${t.signature}`
}

export function decodeMembershipToken(token: string): MembershipToken | null {
  const parts = token.trim().split('.')
  if (parts.length !== 3 || parts[0] !== 'CWM1') return null
  try {
    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1]))) as MembershipClaims
    if (!claims || typeof claims !== 'object') return null
    if (typeof claims.name !== 'string' || typeof claims.subscriptionId !== 'string') return null
    if (typeof claims.issuedAt !== 'string' || typeof claims.expiresAt !== 'string') return null
    return { claims, signature: parts[2] }
  } catch {
    return null
  }
}

/** Verify a token offline. Mirrors `licence.ts`'s `verifyLicence()` exactly —
 *  same reasoning applies (see that file's header). */
export async function verifyMembershipToken(
  token: string,
  publicJwk: JsonWebKey | null = RELEASE_PUBLIC_JWK,
): Promise<MembershipStatus> {
  const parsed = decodeMembershipToken(token)
  if (!parsed) return { valid: false, reason: 'That doesn’t look like a Coachwright membership token.' }
  if (!publicJwk) {
    return { valid: false, reason: 'This build has no signing key configured, so membership can’t be checked.' }
  }

  try {
    const pub = await crypto.subtle.importKey(
      'jwk', publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
    )
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pub,
      b64urlToBytes(parsed.signature),
      utf8(canonicalMembershipClaims(parsed.claims)),
    )
    return ok
      ? { valid: true, claims: parsed.claims }
      : { valid: false, reason: 'This token’s signature doesn’t match.' }
  } catch {
    return { valid: false, reason: 'This token couldn’t be read.' }
  }
}

/** Sign a membership token. Server-side only (sync-server's `/membership`
 *  routes) — the app itself never has the private key, same as licence.ts. */
export async function signMembershipToken(claims: MembershipClaims, privateJwk: JsonWebKey): Promise<MembershipToken> {
  const priv = await crypto.subtle.importKey(
    'jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, priv,
    utf8(canonicalMembershipClaims(claims)),
  )
  return { claims, signature: bytesToB64url(new Uint8Array(sig)) }
}

/** Pure time check, deliberately separate from signature verification so a
 *  caller can tell "forged/corrupt" (`verifyMembershipToken` failed) apart
 *  from "genuinely a valid token, just past its window" (this returns
 *  false). Only the latter should ever trigger a quiet background refresh
 *  instead of an error. */
export function isMembershipCurrent(claims: MembershipClaims, now = new Date()): boolean {
  const expires = new Date(claims.expiresAt)
  if (Number.isNaN(expires.getTime())) return false
  return now.getTime() < expires.getTime()
}

/** Is the cached membership live RIGHT NOW? The cached `membershipActive`
 *  flag alone is not enough: it's only rewritten by a successful refresh, so
 *  a coach who cancels and then stays offline (or simply never reaches the
 *  server again) would keep it `true` forever. The token's own `expiresAt`
 *  is the promise docs/MEMBERSHIP.md §4 makes — "past expiry with no
 *  successful refresh, the account quietly reverts to free-tier limits" —
 *  and this is where it's actually kept. */
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

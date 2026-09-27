import { describe, it, expect, beforeAll } from 'vitest'
import {
  encodeMembershipToken, decodeMembershipToken, verifyMembershipToken, signMembershipToken,
  isMembershipCurrent, canAddClient, FREE_TIER_CLIENT_LIMIT, hasActiveMembership, hasPaidAccess,
  type MembershipClaims,
} from './membership'

/** A throwaway keypair — the real signing key never enters this repository,
 *  same discipline as licence.test.ts. */
let pub: JsonWebKey
let priv: JsonWebKey

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
  )
  pub = await crypto.subtle.exportKey('jwk', pair.publicKey)
  priv = await crypto.subtle.exportKey('jwk', pair.privateKey)
})

const base: MembershipClaims = {
  name: 'Sam Rivera',
  subscriptionId: 'sub_123',
  issuedAt: '2026-08-01T00:00:00.000Z',
  expiresAt: '2026-09-05T00:00:00.000Z',
}

async function tokenFor(claims: MembershipClaims) {
  return encodeMembershipToken(await signMembershipToken(claims, priv))
}

describe('offline verification', () => {
  it('accepts a genuine token', async () => {
    const status = await verifyMembershipToken(await tokenFor(base), pub)
    expect(status.valid).toBe(true)
    if (!status.valid) return
    expect(status.claims.subscriptionId).toBe('sub_123')
  })

  it('rejects a token whose claims were edited after signing', async () => {
    const token = await tokenFor(base)
    const parsed = decodeMembershipToken(token)!
    const forged = encodeMembershipToken({
      claims: { ...parsed.claims, expiresAt: '2099-01-01T00:00:00.000Z' },
      signature: parsed.signature,
    })
    const status = await verifyMembershipToken(forged, pub)
    expect(status.valid).toBe(false)
  })

  it('rejects a token signed by someone else’s key', async () => {
    const other = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
    )
    const otherPriv = await crypto.subtle.exportKey('jwk', other.privateKey)
    const token = encodeMembershipToken(await signMembershipToken(base, otherPriv))
    expect((await verifyMembershipToken(token, pub)).valid).toBe(false)
  })

  it('rejects malformed input without throwing', async () => {
    for (const junk of ['', 'nonsense', 'CWM1.only-two-parts', 'CW1.a.b', '....']) {
      const status = await verifyMembershipToken(junk, pub)
      expect(status.valid).toBe(false)
    }
  })

  it('is never confused with a one-time licence key — different prefix entirely', async () => {
    const token = await tokenFor(base)
    expect(token.startsWith('CWM1.')).toBe(true)
    expect(decodeMembershipToken('CW1.abc.def')).toBeNull()
  })

  it('round-trips through encode/decode unchanged', async () => {
    const token = await tokenFor(base)
    expect(decodeMembershipToken(token)!.claims).toEqual(base)
  })
})

describe('isMembershipCurrent', () => {
  it('is true before expiry and false after', () => {
    expect(isMembershipCurrent(base, new Date('2026-09-01'))).toBe(true)
    expect(isMembershipCurrent(base, new Date('2026-09-05T00:00:00.001Z'))).toBe(false)
    expect(isMembershipCurrent(base, new Date('2026-10-01'))).toBe(false)
  })

  it('is false for an unparseable expiry rather than throwing', () => {
    expect(isMembershipCurrent({ ...base, expiresAt: 'not a date' })).toBe(false)
  })
})

describe('canAddClient — free tier gating', () => {
  it('allows adding a client below the free-tier limit', () => {
    expect(canAddClient(0, false).allowed).toBe(true)
    expect(canAddClient(FREE_TIER_CLIENT_LIMIT - 1, false).allowed).toBe(true)
  })

  it('blocks adding a client at or above the free-tier limit, with a clear reason', () => {
    const result = canAddClient(FREE_TIER_CLIENT_LIMIT, false)
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/Upgrade to Coachwright Membership/)
    expect(result.reason).toMatch(new RegExp(String(FREE_TIER_CLIENT_LIMIT)))
  })

  it('never blocks an active member, regardless of client count', () => {
    expect(canAddClient(0, true).allowed).toBe(true)
    expect(canAddClient(500, true).allowed).toBe(true)
  })
})

describe('hasActiveMembership / hasPaidAccess — expiry is actually enforced', () => {
  const now = new Date('2026-08-20T00:00:00.000Z')
  it('a cached active flag with a future expiry is live', () => {
    expect(hasActiveMembership({ membershipActive: true, membershipExpiresAt: '2026-09-01T00:00:00.000Z' }, now)).toBe(true)
  })
  it('a cached active flag past its expiry is NOT live — the offline-lapse case', () => {
    expect(hasActiveMembership({ membershipActive: true, membershipExpiresAt: '2026-08-19T00:00:00.000Z' }, now)).toBe(false)
  })
  it('an active flag with no expiry on record is not trusted', () => {
    expect(hasActiveMembership({ membershipActive: true }, now)).toBe(false)
  })
  it('grandfathered one-time editions never expire', () => {
    expect(hasPaidAccess({ edition: 'independent' }, now)).toBe(true)
    expect(hasPaidAccess({ edition: 'personal', membershipActive: true, membershipExpiresAt: '2026-01-01T00:00:00.000Z' }, now)).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { canAddClient, FREE_TIER_CLIENT_LIMIT, hasActiveMembership, hasPaidAccess } from './membership'

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

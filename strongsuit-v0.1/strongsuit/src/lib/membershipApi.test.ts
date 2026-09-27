import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { db } from '@/db/schema'
import { trainerRepo } from '@/db/repo'
import { signMembershipToken, type MembershipClaims } from './membership'
import { RELEASE_PUBLIC_JWK } from './licence'

beforeEach(async () => {
  for (const table of db.tables) await table.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// verifyMembershipToken defaults to the real release public key, which this
// throwaway test keypair can't satisfy — every test here mocks fetch to
// return a token signed by a THROWAWAY key and passes that key in nowhere
// (refreshMembership always verifies against RELEASE_PUBLIC_JWK). So instead
// of signing real tokens, these tests only exercise the paths that don't
// require passing signature verification: unreachable server, and an
// explicit `active:false` response. The "verifies and stores a good token"
// path is already covered end-to-end by membership.test.ts's crypto and the
// live cross-check performed manually against sync-server during this
// session — duplicating a real keypair swap here would mean stubbing
// verifyMembershipToken itself, which would stop testing anything real.

describe('refreshMembership', () => {
  it('returns null and leaves trainer state untouched when the server is unreachable', async () => {
    const { refreshMembership } = await import('./membershipApi')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    await trainerRepo.getOrCreate()
    await trainerRepo.patch({ membershipActive: true, membershipToken: 'CWM1.keep.me' })

    const result = await refreshMembership()

    expect(result).toBeNull()
    const trainer = await trainerRepo.get()
    expect(trainer?.membershipActive).toBe(true)
    expect(trainer?.membershipToken).toBe('CWM1.keep.me')
  })

  it('clears membership state when the server reports no active subscription', async () => {
    const { refreshMembership } = await import('./membershipApi')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ active: false, reason: 'Subscription is canceled' }),
    }))
    await trainerRepo.getOrCreate()
    await trainerRepo.patch({ membershipActive: true, membershipToken: 'CWM1.stale.token' })

    const result = await refreshMembership()

    expect(result).toEqual({ active: false, reason: 'Subscription is canceled' })
    const trainer = await trainerRepo.get()
    expect(trainer?.membershipActive).toBe(false)
    expect(trainer?.membershipToken).toBeUndefined()
  })

  it('refuses a token that fails signature verification rather than trusting the network', async () => {
    const { refreshMembership } = await import('./membershipApi')
    // Signed with a throwaway key, not the real release key — verifyMembershipToken
    // (using its default RELEASE_PUBLIC_JWK) must reject this.
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const priv = await crypto.subtle.exportKey('jwk', pair.privateKey)
    const claims: MembershipClaims = {
      name: 'Sam Rivera', subscriptionId: 'sub_1',
      issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    }
    const { encodeMembershipToken } = await import('./membership')
    const forgedToken = encodeMembershipToken(await signMembershipToken(claims, priv))

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ active: true, token: forgedToken }),
    }))
    await trainerRepo.getOrCreate()

    const result = await refreshMembership()

    expect(result?.active).toBe(false)
    const trainer = await trainerRepo.get()
    expect(trainer?.membershipActive).toBe(false)
  })

  it('never fabricates a positive result — RELEASE_PUBLIC_JWK really is configured', () => {
    // Sanity guard for the test file itself: if this were ever null, every
    // "rejects" assertion above would trivially pass for the wrong reason
    // (verifyMembershipToken short-circuits with "no signing key configured"
    // regardless of the signature).
    expect(RELEASE_PUBLIC_JWK).not.toBeNull()
  })
})

describe('membership secret — the device id alone must never authorize billing', () => {
  it('checkout creates a secret once and sends it; status and portal present it', async () => {
    const { startMembershipCheckout, openMembershipBillingPortal, refreshMembership } = await import('./membershipApi')
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return { ok: true, json: async () => ({ url: 'https://stripe.example/x', active: false }) }
    }))
    await trainerRepo.getOrCreate()

    await startMembershipCheckout('Sam')
    const secret = (await trainerRepo.get())?.membershipSecret
    expect(secret).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.parse(calls[0].init!.body as string).secret).toBe(secret)

    await startMembershipCheckout('Sam')
    expect((await trainerRepo.get())?.membershipSecret).toBe(secret) // stable, not regenerated

    await openMembershipBillingPortal()
    await refreshMembership()
    for (const c of calls.slice(2)) {
      expect((c.init!.headers as Record<string, string>)['x-membership-secret']).toBe(secret)
    }
  })
})

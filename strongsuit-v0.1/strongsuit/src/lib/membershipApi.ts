// ===== Membership networking (S15) =====
//
// Talks to the Coachwright-operated sync-server's `/membership` routes —
// always the OFFICIAL managed server (`MEMBERSHIP_SERVER_URL`), never
// whatever self-hosted `syncServerUrl` a coach configured for their own sync
// relay. Membership billing is inherently a Coachwright-run service (it
// holds the Stripe account and the licence-signing private key) — there's no
// such thing as a self-hosted membership tier the way there's a self-hosted
// sync relay, so this deliberately does NOT read `trainer.syncServerUrl`.
//
// Every function here degrades to "leave things as they were" on failure —
// offline, DNS failure, server down. Only a POSITIVE, VERIFIED response ever
// changes what the app believes about membership status (see
// `refreshMembership()`), matching `lib/membership.ts`'s header: the app
// keeps working fully on its last verified state until that token's own
// `expiresAt`, never an instant cutoff from a failed network call.

import { getIdentity } from '@/features/sync/syncApi'
import { trainerRepo } from '@/db/repo'
import { verifyMembershipToken, isMembershipCurrent } from './membership'

export const MEMBERSHIP_SERVER_URL = 'https://relay.coachwright.app'

/** How often a running app re-checks. Tokens live 35 days server-side, so
 *  daily is far inside the window. */
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

/** The per-install secret the server binds at checkout (it stores only a
 *  hash). Required because the device id is NOT secret — every paired
 *  Companion knows it — so without this any client could open its coach's
 *  Stripe billing portal. Created lazily, only when a coach actually starts
 *  checkout, so a free-tier coach's install never has one. */
async function getOrCreateMembershipSecret(): Promise<string> {
  const trainer = await trainerRepo.getOrCreate()
  if (trainer.membershipSecret) return trainer.membershipSecret
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const secret = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  await trainerRepo.patch({ membershipSecret: secret })
  return secret
}

async function secretHeader(): Promise<Record<string, string>> {
  const trainer = await trainerRepo.getOrCreate()
  return trainer.membershipSecret ? { 'x-membership-secret': trainer.membershipSecret } : {}
}

export interface MembershipRefreshResult {
  active: boolean
  reason?: string
  expiresAt?: string
}

/** Calls `/membership/status`, verifies whatever token comes back (never
 *  trusts the network response's claims without checking the ECDSA
 *  signature — see `verifyMembershipToken`), and persists the result onto
 *  the trainer record. Safe to call often: offline or a down/unconfigured
 *  server just returns `null` and leaves the cached state untouched. */
export async function refreshMembership(): Promise<MembershipRefreshResult | null> {
  const identity = await getIdentity()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    const res = await fetch(
      `${MEMBERSHIP_SERVER_URL}/membership/status?coachId=${encodeURIComponent(identity.deviceId)}`,
      { signal: controller.signal, headers: await secretHeader() },
    )
    clearTimeout(timer)
    if (!res.ok) return null

    const body = await res.json() as { active: boolean; reason?: string; token?: string; expiresAt?: string }

    if (!body.active || !body.token) {
      await trainerRepo.patch({ membershipActive: false, membershipToken: undefined, membershipExpiresAt: undefined })
      return { active: false, reason: body.reason }
    }

    const status = await verifyMembershipToken(body.token)
    if (!status.valid || !isMembershipCurrent(status.claims)) {
      // Server said active but the token itself doesn't check out (or is
      // somehow already expired on arrival) — treat as not-a-member rather
      // than trusting an unverifiable claim from the network.
      await trainerRepo.patch({ membershipActive: false, membershipToken: undefined, membershipExpiresAt: undefined })
      return { active: false, reason: 'Membership token failed verification' }
    }

    await trainerRepo.patch({
      membershipActive: true,
      membershipToken: body.token,
      membershipExpiresAt: status.claims.expiresAt,
    })
    return { active: true, expiresAt: status.claims.expiresAt }
  } catch {
    return null
  }
}

/** Refresh now, then daily while the app stays open — the "on launch and
 *  roughly daily" cadence docs/MEMBERSHIP.md §4 describes. Before S22 the
 *  only caller was MembershipCard's mount effect, i.e. only when the coach
 *  happened to open Settings. Skipped entirely for an install that has
 *  never started checkout (no secret): a free-tier coach's app makes no
 *  membership network calls at all. Returns a stop function. */
export function startMembershipRefreshLoop(): () => void {
  let stopped = false
  const tick = async () => {
    if (stopped) return
    const trainer = await trainerRepo.get()
    if (!trainer?.membershipSecret) return
    await refreshMembership()
  }
  void tick().catch(() => {})
  const timer = setInterval(() => { void tick().catch(() => {}) }, REFRESH_INTERVAL_MS)
  const onOnline = () => { void tick().catch(() => {}) }
  window.addEventListener('online', onOnline)
  return () => { stopped = true; clearInterval(timer); window.removeEventListener('online', onOnline) }
}

/** Opens a Stripe Checkout session and returns the URL to send the coach
 *  to — the app never collects card details itself. */
export async function startMembershipCheckout(name: string, email?: string): Promise<string> {
  const identity = await getIdentity()
  const secret = await getOrCreateMembershipSecret()
  const res = await fetch(`${MEMBERSHIP_SERVER_URL}/membership/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ coachId: identity.deviceId, name, email, secret }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string })
    throw new Error(body.error || `Checkout couldn't start (${res.status}).`)
  }
  const { url } = await res.json() as { url: string }
  return url
}

/** Opens Stripe's own hosted billing portal (card update, cancel) — this app
 *  never builds a customer portal, per docs/MANAGED_HOSTING.md's existing
 *  doctrine, applied here to the automated membership tier too. */
export async function openMembershipBillingPortal(): Promise<string> {
  const identity = await getIdentity()
  const res = await fetch(`${MEMBERSHIP_SERVER_URL}/membership/portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await secretHeader()) },
    body: JSON.stringify({ coachId: identity.deviceId }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string })
    throw new Error(body.error || `Couldn't open billing portal (${res.status}).`)
  }
  const { url } = await res.json() as { url: string }
  return url
}

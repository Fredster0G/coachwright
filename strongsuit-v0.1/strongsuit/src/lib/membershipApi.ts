// ===== Membership, via the coach's cloud account =====
//
// Membership belongs to the account, so every device and the website agree.
// The server answers "active until <expiresAt>" (Stripe's period end plus a
// grace window); the app caches that on the trainer row's device-only fields
// and `hasActiveMembership()` honours it while the server can't be reached,
// dropping to free-tier limits after it passes. Never a lockout, never data
// loss.

import { trainerRepo } from '@/db/repo'
import { api, getSession, CloudError } from './cloud/session'

export interface MembershipRefreshResult {
  active: boolean
  expiresAt?: string
}

/** null = couldn't reach the server (cached state is left alone). */
export async function refreshMembership(): Promise<MembershipRefreshResult | null> {
  if (!getSession()) return null
  try {
    const r = await api<{ active: boolean; expiresAt: string | null }>('/membership/status')
    await trainerRepo.patch({ membershipActive: r.active, membershipExpiresAt: r.expiresAt ?? undefined })
    return { active: r.active, expiresAt: r.expiresAt ?? undefined }
  } catch (err) {
    if (err instanceof CloudError && err.status === 0) return null
    return null
  }
}

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000

/** Refresh at launch, every few hours, and when the network returns. */
export function startMembershipRefreshLoop(): () => void {
  const tick = () => { void refreshMembership() }
  tick()
  const timer = setInterval(tick, REFRESH_INTERVAL_MS)
  window.addEventListener('online', tick)
  return () => { clearInterval(timer); window.removeEventListener('online', tick) }
}

/** Stripe Checkout URL — the app never sees a card number. */
export async function startMembershipCheckout(): Promise<string> {
  return (await api<{ url: string }>('/membership/checkout', { method: 'POST' })).url
}

/** Stripe's hosted billing portal (card update, cancel). */
export async function openMembershipBillingPortal(): Promise<string> {
  return (await api<{ url: string }>('/membership/portal', { method: 'POST' })).url
}

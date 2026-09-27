import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Sparkles, Check, RefreshCw } from 'lucide-react'
import { Button, Card, Tag, Progress, toast, toastError } from '@/design'
import { trainerRepo, clientsRepo } from '@/db/repo'
import { FREE_TIER_CLIENT_LIMIT, hasActiveMembership, hasPaidAccess } from '@/lib/membership'
import { refreshMembership, startMembershipCheckout, openMembershipBillingPortal } from '@/lib/membershipApi'

/**
 * The $29/mo membership — separate card from `LicenceCard`, which still
 * means a one-time purchase from before S15 and is untouched by any of
 * this. A coach could in principle have both on file (a grandfathered
 * one-time licence AND an active membership); this card only ever shows
 * membership state, never edition state.
 */
export function MembershipCard() {
  const trainer = useLiveQuery(() => trainerRepo.get())
  const activeClients = useLiveQuery(() => clientsRepo.active(), [], [])
  const [checking, setChecking] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Refresh once on mount so the card reflects the account right now.
  useEffect(() => {
    refreshMembership().catch(() => {})
  }, [])

  if (!trainer) return null

  const hasUnlimitedClients = hasPaidAccess(trainer)
  const membershipLive = hasActiveMembership(trainer)
  const clientCount = activeClients.length

  async function upgrade() {
    setChecking(true)
    try {
      const url = await startMembershipCheckout()
      window.open(url, '_blank')
      toast('Opening checkout in your browser…')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not start checkout.')
    } finally {
      setChecking(false)
    }
  }

  async function manageBilling() {
    try {
      const url = await openMembershipBillingPortal()
      window.open(url, '_blank')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not open the billing portal.')
    }
  }

  async function manualRefresh() {
    setRefreshing(true)
    try {
      const result = await refreshMembership()
      if (result === null) toastError('Could not reach the membership server. Try again once you’re online.')
      else if (result.active) toast('Membership verified.')
      else toast('No active membership on this account.')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <Sparkles size={16} className="text-verde-600" />
        <p className="font-display text-base font-semibold text-ink">Membership</p>
      </div>

      {membershipLive ? (
        <>
          <p className="mb-3 text-xs text-muted">
            Unlimited clients and custom branding on printouts and client exports — unlocked.
          </p>
          <div className="mb-3 rounded-ctl border border-line bg-surface2 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Check size={13} className="text-verde-600" />
              <p className="text-sm text-ink">Coachwright Membership active</p>
              <Tag tone="verde">$29/mo</Tag>
            </div>
            {trainer.membershipExpiresAt && (
              <p className="mt-1 text-2xs text-faint">
                Verified through {new Date(trainer.membershipExpiresAt).toLocaleDateString()} — refreshed automatically, no action needed.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={manageBilling}>Manage billing</Button>
            <Button size="sm" variant="ghost" onClick={manualRefresh} disabled={refreshing}>
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Checking…' : 'Refresh status'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            Free Coachwright covers up to {FREE_TIER_CLIENT_LIMIT} clients with every feature included. Coachwright
            Membership ($29/mo) removes the client cap and adds custom branding.
          </p>
          {!hasUnlimitedClients && (
            <div className="mb-3">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted">Active clients</span>
                <span className="font-mono tabular-nums text-faint">{clientCount}/{FREE_TIER_CLIENT_LIMIT}</span>
              </div>
              <Progress value={clientCount} max={FREE_TIER_CLIENT_LIMIT} />
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={upgrade} disabled={checking}>
              {checking ? 'Opening checkout…' : 'Upgrade — $29/mo'}
            </Button>
            <Button size="sm" variant="ghost" onClick={manualRefresh} disabled={refreshing}>
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Checking…' : 'Already a member?'}
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}

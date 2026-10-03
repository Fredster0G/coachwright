import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Sparkles, Check, RefreshCw } from 'lucide-react'
import { Button, Card, Tag, Progress, toast, toastError } from '@/design'
import { trainerRepo, clientsRepo } from '@/db/repo'
import { FREE_TIER_CLIENT_LIMIT, hasActiveMembership, hasPaidAccess } from '@/lib/membership'
import { refreshMembership, startMembershipCheckout, openMembershipBillingPortal } from '@/lib/membershipApi'
import { APP_NAME } from '@/lib/brand'
import { useTranslation } from '@/lib/i18n'

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
  const { t } = useTranslation()

  // Refresh once on mount so the card reflects the account right now.
  useEffect(() => {
    refreshMembership().catch(() => {})
  }, [])

  if (!trainer) return null

  const hasUnlimitedClients = hasPaidAccess(trainer)
  const membershipLive = hasActiveMembership(trainer)
  // Sample clients don't count toward the free cap (app or server) — this bar
  // used to show a new coach 3/3 with only the samples.
  const clientCount = activeClients.filter(c => !c.isDemo).length

  async function upgrade() {
    setChecking(true)
    try {
      const url = await startMembershipCheckout()
      window.open(url, '_blank')
      toast(t('membership.opening'))
    } catch (err) {
      toastError(err instanceof Error ? err.message : t('membership.checkoutFailed'))
    } finally {
      setChecking(false)
    }
  }

  async function manageBilling() {
    try {
      const url = await openMembershipBillingPortal()
      window.open(url, '_blank')
    } catch (err) {
      toastError(err instanceof Error ? err.message : t('membership.portalFailed'))
    }
  }

  async function manualRefresh() {
    setRefreshing(true)
    try {
      const result = await refreshMembership()
      if (result === null) toastError(t('membership.unreachable'))
      else if (result.active) toast(t('membership.verified'))
      else toast(t('membership.none'))
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <Sparkles size={16} className="text-verde-600" />
        <p className="font-display text-base font-semibold text-ink">{t('membership.title')}</p>
      </div>

      {membershipLive ? (
        <>
          <p className="mb-3 text-xs text-muted">
            {t('membership.unlocked')}
          </p>
          <div className="mb-3 rounded-ctl border border-line bg-surface2 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Check size={13} className="text-verde-600" />
              <p className="text-sm text-ink">{t('membership.active', { app: APP_NAME })}</p>
              <Tag tone="verde">{t('membership.price')}</Tag>
            </div>
            {trainer.membershipExpiresAt && (
              <p className="mt-1 text-2xs text-faint">
                {t('membership.verifiedThrough', { date: new Date(trainer.membershipExpiresAt).toLocaleDateString() })}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={manageBilling}>{t('membership.manage')}</Button>
            <Button size="sm" variant="ghost" onClick={manualRefresh} disabled={refreshing}>
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? t('membership.checking') : t('membership.refresh')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            {t('membership.freeBody', { app: APP_NAME, limit: FREE_TIER_CLIENT_LIMIT })}
          </p>
          {!hasUnlimitedClients && (
            <div className="mb-3">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted">{t('membership.activeClients')}</span>
                <span className="font-mono tabular-nums text-faint">{clientCount}/{FREE_TIER_CLIENT_LIMIT}</span>
              </div>
              <Progress value={clientCount} max={FREE_TIER_CLIENT_LIMIT} />
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={upgrade} disabled={checking}>
              {checking ? t('membership.openingShort') : t('membership.upgrade')}
            </Button>
            <Button size="sm" variant="ghost" onClick={manualRefresh} disabled={refreshing}>
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? t('membership.checking') : t('membership.alreadyMember')}
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}

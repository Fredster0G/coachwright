import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { KeyRound, Check, Sparkles } from 'lucide-react'
import { Button, Card, Textarea, Tag, toast } from '@/design'
import { trainerRepo } from '@/db/repo'
import {
  verifyLicence, isFoundingMember, ownershipYears, isAnniversary,
  type LicenceStatus,
} from '@/lib/licence'
import { EDITION_NAMES } from '@/lib/edition'
import { useTranslation } from '@/lib/i18n'

/**
 * Enter/replace a licence key (plan §4.5–4.6). Verification is offline —
 * `verifyLicence` checks the key against the public key baked into this
 * build, never a network call. The key itself is NOT device-only any more:
 * it lives on the trainer row, which syncs to the account (S23), and the
 * server re-verifies it to exempt the account from the free-tier cap. The
 * card's copy used to promise "the key never leaves your computer".
 *
 * A verified key immediately becomes the trainer's real `edition` and
 * `licensedSeats` — this is the one place in the app that writes those
 * fields from anything other than `trainerRepo.getOrCreate()`'s default.
 */
export function LicenceCard() {
  const trainer = useLiveQuery(() => trainerRepo.get())
  const [input, setInput] = useState('')
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState<LicenceStatus | null>(null)
  const { t } = useTranslation()

  // Re-verify whatever key is already on file, so "Licensed to" reflects a
  // key that still actually verifies — not just "a string is stored".
  useEffect(() => {
    if (!trainer?.licenseKey) { setStatus(null); return }
    let cancelled = false
    verifyLicence(trainer.licenseKey).then(s => { if (!cancelled) setStatus(s) })
    return () => { cancelled = true }
  }, [trainer?.licenseKey])

  if (!trainer) return null

  async function activate() {
    const key = input.trim()
    if (!key) return
    setChecking(true)
    try {
      const result = await verifyLicence(key)
      setStatus(result)
      if (result.valid) {
        await trainerRepo.patch({
          edition: result.claims.edition,
          licenseKey: key,
          licensedSeats: result.claims.seats,
        })
        setInput('')
        toast(t('licence.activated', { name: result.claims.name, edition: EDITION_NAMES[result.claims.edition] }))
      }
    } finally {
      setChecking(false)
    }
  }

  const activeClaims = status?.valid ? status.claims : null

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <KeyRound size={16} className="text-verde-600" />
        <p className="font-display text-base font-semibold text-ink">{t('licence.title')}</p>
      </div>
      <p className="mb-3 text-xs text-muted">
        {t('licence.body')}
      </p>

      {activeClaims ? (
        <div className="mb-3 rounded-ctl border border-line bg-surface2 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Check size={13} className="text-verde-600" />
            <p className="text-sm text-ink">
              {t('licence.licensedTo', { name: activeClaims.name })}
            </p>
            <Tag tone="verde">{EDITION_NAMES[activeClaims.edition]}</Tag>
            {isFoundingMember(activeClaims) && <Tag tone="ember">{t('licence.founding')}</Tag>}
          </div>
          <p className="mt-1 text-2xs text-faint">
            {t('licence.purchased', { date: activeClaims.issuedAt })}
            {ownershipYears(activeClaims) > 0 && t('licence.owned', { count: ownershipYears(activeClaims) })}
            {activeClaims.edition === 'studio' && activeClaims.seats ? t('licence.seats', { n: activeClaims.seats }) : ''}
          </p>
          {isAnniversary(activeClaims) && (
            <p className="mt-1.5 flex items-center gap-1 text-2xs text-verde-600">
              <Sparkles size={12} /> {t('licence.anniversary')}
            </p>
          )}
        </div>
      ) : trainer.licenseKey ? (
        <p className="mb-3 text-xs text-signal-600">
          {t('licence.noLongerVerifies', { reason: status && !status.valid ? ` (${status.reason})` : '' })}
        </p>
      ) : (
        <p className="mb-3 text-xs text-faint">
          {t('licence.none')}
        </p>
      )}

      <Textarea
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="CW1…."
        aria-label={t('licence.keyLabel')}
        className="font-mono text-xs"
        rows={2}
      />
      {status && !status.valid && input.trim() && (
        <p className="mt-1 text-2xs text-signal-600">{status.reason}</p>
      )}
      <div className="mt-2 flex justify-end">
        <Button variant="primary" size="sm" onClick={activate} disabled={checking || !input.trim()}>
          {checking ? t('licence.checking') : t('licence.activate')}
        </Button>
      </div>
    </Card>
  )
}

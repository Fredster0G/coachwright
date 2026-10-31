import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Ticket, Trash2 } from 'lucide-react'
import { couponsRepo } from '@/db/repo'
import { Button, Card, Checkbox, Field, Input, Select, toastError } from '@/design'
import type { CouponKind } from '@/db/types'
import { useTranslation } from '@/lib/i18n'

/** Discount codes for invoices (Billing → New invoice → Coupon). Until S28
 *  nothing could create one, so the invoice's coupon field never worked. */
export function CouponsCard() {
  const coupons = useLiveQuery(() => couponsRepo.all(), [], [])
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [kind, setKind] = useState<CouponKind>('percent')
  const [value, setValue] = useState('')
  const [expiresAt, setExpiresAt] = useState('')

  const v = Number(value)
  const valid = code.trim().length > 0 && v > 0 && (kind === 'flat' || v <= 100)

  async function add() {
    if (!valid) return
    const clean = code.trim().toUpperCase()
    if (coupons.some(c => c.code.toUpperCase() === clean)) { toastError(t('settings.coupons.duplicate', { code: clean })); return }
    await couponsRepo.create({ code: clean, kind, value: v, active: true, expiresAt: expiresAt || undefined })
    setCode(''); setValue(''); setExpiresAt('')
  }

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <Ticket size={16} className="text-verde-600" />
        <p className="font-display text-base font-semibold">{t('settings.coupons.title')}</p>
      </div>
      <p className="mb-3 text-xs text-muted">{t('settings.coupons.hint')}</p>

      {coupons.length > 0 && (
        <ul className="mb-3 divide-y divide-line rounded-ctl border border-line">
          {coupons.map(c => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <span className="font-mono font-semibold text-ink">{c.code}</span>
              <span className="text-muted">{c.kind === 'percent' ? t('settings.coupons.percentOff', { n: c.value }) : t('settings.coupons.flatOff', { n: c.value.toFixed(2) })}</span>
              {c.expiresAt && <span className="text-2xs text-faint">{t('settings.coupons.until', { date: c.expiresAt })}</span>}
              <span className="ms-auto flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  <Checkbox checked={c.active} onChange={active => couponsRepo.update(c.id, { active })} label={t('settings.coupons.active')} />
                  {t('settings.coupons.active')}
                </label>
                <Button size="sm" variant="ghost" aria-label={t('settings.coupons.remove', { code: c.code })}
                  onClick={() => { if (window.confirm(t('settings.coupons.confirmRemove', { code: c.code }))) void couponsRepo.remove(c.id) }}>
                  <Trash2 size={13} />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={t('settings.coupons.code')}>
          <Input value={code} onChange={e => setCode(e.target.value)} placeholder="SPRING10" className="font-mono uppercase" />
        </Field>
        <Field label={t('settings.coupons.kind')}>
          <Select value={kind} onChange={e => setKind(e.target.value as CouponKind)}>
            <option value="percent">{t('settings.coupons.kindPercent')}</option>
            <option value="flat">{t('settings.coupons.kindFlat')}</option>
          </Select>
        </Field>
        <Field label={kind === 'percent' ? t('settings.coupons.valuePercent') : t('settings.coupons.valueFlat')}>
          <Input type="number" min="0" max={kind === 'percent' ? 100 : undefined} value={value} onChange={e => setValue(e.target.value)} className="font-mono tabular-nums" />
        </Field>
        <Field label={t('settings.coupons.expires')} hint={t('settings.coupons.optional')}>
          <Input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
        </Field>
      </div>
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="primary" onClick={add} disabled={!valid}>{t('settings.coupons.add')}</Button>
      </div>
    </Card>
  )
}

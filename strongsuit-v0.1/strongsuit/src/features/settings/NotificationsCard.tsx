import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bell } from 'lucide-react'
import { trainerRepo } from '@/db/repo'
import { Card, toastError } from '@/design'
import { db } from '@/db/schema'
import { notificationsEnabled, notificationsSupported, setNotificationsEnabled } from '@/lib/coachNotify'
import { useTranslation } from '@/lib/i18n'

/** Opt-in system notifications for client messages and booking requests
 *  (lib/coachNotify.ts). Per device — it's this computer's setting. */
export function NotificationsCard() {
  const { t } = useTranslation()
  const [on, setOn] = useState(notificationsEnabled)
  const supported = notificationsSupported()
  const denied = supported && Notification.permission === 'denied'
  const trainer = useLiveQuery(() => trainerRepo.get())

  async function toggle(next: boolean) {
    try {
      const result = await setNotificationsEnabled(next, await db.messages.toArray())
      setOn(result)
      if (next && !result) toastError(t('settings.notify.blocked'))
    } catch (e) {
      toastError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <Bell size={16} className="text-verde-600" />
        <p className="font-display text-base font-semibold">{t('settings.notify.title')}</p>
      </div>
      <p className="mb-3 text-xs text-muted">{t('settings.notify.hint')}</p>
      {!supported ? (
        <p className="text-xs text-faint">{t('settings.notify.unsupported')}</p>
      ) : (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={on} disabled={denied && !on} onChange={e => { const v = e.target.checked; void toggle(v) }} className="accent-[var(--verde-600)]" />
          {t('settings.notify.enable')}
        </label>
      )}
      {denied && <p className="mt-2 text-2xs text-ember-600">{t('settings.notify.blocked')}</p>}
      {trainer && (
        <label className="mt-3 flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" checked={!!trainer.emailNotify} onChange={e => { const emailNotify = e.target.checked; void trainerRepo.patch({ emailNotify }) }} className="mt-0.5 accent-[var(--verde-600)]" />
          <span>{t('settings.notify.email')}<span className="block text-2xs text-faint">{t('settings.notify.emailHint')}</span></span>
        </label>
      )}
    </Card>
  )
}

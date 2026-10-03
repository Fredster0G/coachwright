import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarClock, AlertTriangle } from 'lucide-react'
import { appointmentsRepo, messagesRepo } from '@/db/repo'
import { Button, toast, toastError } from '@/design'
import { expandAll } from '@/lib/schedule'
import { isoDay } from '@/lib/core'
import type { CoachMessage } from '@/db/types'
import { useTranslation } from '@/lib/i18n'

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** A client's session request from Companion (lib/booking.ts). Accepting puts
 *  it on the calendar and tells the client; declining just tells them. Shows a
 *  clash if something was booked into that time after the slot was offered. */
export function BookingRequestCard({ message }: { message: CoachMessage }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const b = message.booking!
  const clash = useLiveQuery(async () => {
    const day = isoDay(new Date(b.start))
    const s = Date.parse(b.start), e = Date.parse(b.end)
    return expandAll((await appointmentsRepo.masters()).filter(a => a.status !== 'canceled'), day, day)
      .some(o => Date.parse(o.start) < e && Date.parse(o.end) > s)
  }, [b.start, b.end], false)

  async function answer(accept: boolean) {
    setBusy(true)
    try {
      const time = when(b.start)
      await messagesRepo.answerBooking(message.id, accept, accept ? t('booking.replyAccepted', { time }) : t('booking.replyDeclined', { time }))
      toast(accept ? t('booking.toastAccepted') : t('booking.toastDeclined'))
    } catch (e) {
      toastError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  const past = b.end < new Date().toISOString()
  return (
    <div className="mt-2 rounded-ctl border border-line bg-surface2 p-2.5 text-ink">
      <p className="flex items-center gap-1.5 text-xs font-semibold"><CalendarClock size={13} className="text-verde-600" /> {t('booking.requestTitle')}</p>
      <p className="mt-0.5 font-mono text-sm tabular-nums">{when(b.start)}–{new Date(b.end).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</p>
      {b.status ? (
        <p className={`mt-1 text-2xs font-medium ${b.status === 'accepted' ? 'text-verde-600' : 'text-muted'}`}>
          {b.status === 'accepted' ? t('booking.statusAccepted') : t('booking.statusDeclined')}
        </p>
      ) : past ? (
        <p className="mt-1 text-2xs text-faint">{t('booking.statusPast')}</p>
      ) : (
        <>
          {clash && <p className="mt-1 flex items-center gap-1 text-2xs text-ember-600"><AlertTriangle size={11} /> {t('booking.clash')}</p>}
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="primary" disabled={busy} onClick={() => answer(true)}>{t('booking.accept')}</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => answer(false)}>{t('booking.decline')}</Button>
          </div>
        </>
      )}
    </div>
  )
}

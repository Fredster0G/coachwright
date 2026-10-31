import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarClock, Plus, Trash2 } from 'lucide-react'
import { trainerRepo } from '@/db/repo'
import { Button, Card, Field, Input, Select, toastError } from '@/design'
import { DEFAULT_BOOKING, validWindow, BOOKING_HORIZON_DAYS } from '@/lib/booking'
import type { BookingSettings, BookingWindow } from '@/db/types'
import { useTranslation, type MessageKey } from '@/lib/i18n'

let saveQueue: Promise<void> = Promise.resolve()

const DAY_KEYS: MessageKey[] = [
  'settings.booking.day0', 'settings.booking.day1', 'settings.booking.day2', 'settings.booking.day3',
  'settings.booking.day4', 'settings.booking.day5', 'settings.booking.day6',
]

/** Client self-booking hours (lib/booking.ts). Saving republishes the open
 *  slots; Companion picks them up on its next sync. */
export function BookingCard() {
  const trainer = useLiveQuery(() => trainerRepo.get())
  const { t } = useTranslation()
  if (!trainer) return null
  const booking: BookingSettings = trainer.booking ?? DEFAULT_BOOKING
  const open = trainer.bookingSlots?.length ?? 0

  // Times are uncontrolled and commit every complete value: a controlled input
  // fed by an async save is reset between keystrokes, and committing on blur
  // loses the last edit (Tab stays inside a time input's hour/minute parts).
  // Keyed on the row count so adding/removing a row re-seeds the values.
  // Each edit is applied to the row as it is NOW, one at a time. Building it
  // from this render's `booking` lost edits: two quick changes (From, then
  // To) both started from the same stale copy and the second undid the first.
  const save = (edit: (b: BookingSettings) => Partial<BookingSettings>) => {
    saveQueue = saveQueue.then(async () => {
      const cur = (await trainerRepo.get())?.booking ?? DEFAULT_BOOKING
      await trainerRepo.patch({ booking: { ...cur, ...edit(cur) } })
      await trainerRepo.publishBookingSlots()
    }).catch(e => toastError(e instanceof Error ? e.message : String(e)))
  }
  const setWindow = (i: number, patch: Partial<BookingWindow>) =>
    save(b => ({ windows: b.windows.map((w, j) => (j === i ? { ...w, ...patch } : w)) }))

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <CalendarClock size={16} className="text-verde-600" />
        <p className="font-display text-base font-semibold">{t('settings.booking.title')}</p>
      </div>
      <p className="mb-3 text-xs text-muted">{t('settings.booking.hint')}</p>

      <label className="mb-3 flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={booking.enabled} onChange={e => { const enabled = e.target.checked; save(() => ({ enabled })) }} className="accent-[var(--verde-600)]" />
        {t('settings.booking.enable')}
      </label>

      {booking.enabled && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
            <Field label={t('settings.booking.slotLength')}>
              <Select value={booking.slotMinutes} onChange={e => { const slotMinutes = Number(e.target.value); save(() => ({ slotMinutes })) }}>
                {[30, 45, 60, 90].map(m => <option key={m} value={m}>{t('settings.booking.minutes', { n: m })}</option>)}
              </Select>
            </Field>
            <Field label={t('settings.booking.notice')}>
              <Select value={booking.noticeHours} onChange={e => { const noticeHours = Number(e.target.value); save(() => ({ noticeHours })) }}>
                {[2, 12, 24, 48].map(h => <option key={h} value={h}>{t('settings.booking.hours', { n: h })}</option>)}
              </Select>
            </Field>
          </div>

          <div className="space-y-2">
            {booking.windows.map((w, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Select aria-label={t('settings.booking.dayLabel')} value={w.day} onChange={e => setWindow(i, { day: Number(e.target.value) })} className="w-32">
                  {DAY_KEYS.map((k, d) => <option key={d} value={d}>{t(k)}</option>)}
                </Select>
                <Input key={`s${i}/${booking.windows.length}`} type="time" aria-label={t('settings.booking.fromLabel')} defaultValue={w.start} onChange={e => { const v = e.target.value; if (v) setWindow(i, { start: v }) }} className="w-28 font-mono" />
                <span className="text-xs text-faint">–</span>
                <Input key={`e${i}/${booking.windows.length}`} type="time" aria-label={t('settings.booking.toLabel')} defaultValue={w.end} onChange={e => { const v = e.target.value; if (v) setWindow(i, { end: v }) }} className="w-28 font-mono" />
                <Button size="sm" variant="ghost" aria-label={t('settings.booking.removeLabel')} onClick={() => save(b => ({ windows: b.windows.filter((_, j) => j !== i) }))}><Trash2 size={13} /></Button>
                {!validWindow(w) && <span className="text-2xs text-signal-600">{t('settings.booking.badWindow')}</span>}
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => save(b => ({ windows: [...b.windows, { day: 1, start: '09:00', end: '12:00' }] }))}>
              <Plus size={13} /> {t('settings.booking.addHours')}
            </Button>
          </div>

          <p className="text-2xs text-faint">{t('settings.booking.openCount', { count: open, days: BOOKING_HORIZON_DAYS })}</p>
        </div>
      )}
    </Card>
  )
}

import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2, Sparkles } from 'lucide-react'
import { trainerRepo } from '@/db/repo'
import { Button, Card, Input, toastError } from '@/design'
import { DEFAULT_ONBOARDING_STEPS } from '@/lib/onboardingSequence'
import type { OnboardingStep } from '@/db/types'
import { useTranslation } from '@/lib/i18n'

let saveQueue: Promise<void> = Promise.resolve()

/** The welcome sequence's messages (lib/onboardingSequence.ts). Started per
 *  client from their Messages tab; this only edits the template. */
export function OnboardingSequenceCard() {
  const trainer = useLiveQuery(() => trainerRepo.get())
  const { t } = useTranslation()
  if (!trainer) return null
  const steps = trainer.onboardingSteps ?? DEFAULT_ONBOARDING_STEPS

  // Same discipline as BookingCard: apply each edit to the row as it is now,
  // in order, so quick typing can't save over itself.
  const save = (edit: (s: OnboardingStep[]) => OnboardingStep[]) => {
    saveQueue = saveQueue.then(async () => {
      const cur = (await trainerRepo.get())?.onboardingSteps ?? DEFAULT_ONBOARDING_STEPS
      await trainerRepo.patch({ onboardingSteps: edit(cur) })
    }).catch(e => toastError(e instanceof Error ? e.message : String(e)))
  }
  const setStep = (i: number, patch: Partial<OnboardingStep>) => save(s => s.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <Sparkles size={16} className="text-verde-600" />
        <p className="font-display text-base font-semibold">{t('settings.onboarding.title')}</p>
      </div>
      <p className="mb-3 text-xs text-muted">{t('settings.onboarding.hint')}</p>
      <div className="space-y-2">
        {steps.map((s, i) => (
          <div key={i} className="flex items-start gap-2">
            <label className="flex shrink-0 items-center gap-1 pt-2 text-2xs text-faint">
              {t('settings.onboarding.day')}
              <Input
                type="number" min={0} max={365} value={s.dayOffset}
                onChange={e => { const d = Math.max(0, Math.min(365, Number(e.target.value) || 0)); setStep(i, { dayOffset: d }) }}
                className="w-16 font-mono tabular-nums"
              />
            </label>
            <textarea
              value={s.content}
              onChange={e => { const content = e.target.value; setStep(i, { content }) }}
              rows={2}
              aria-label={t('settings.onboarding.messageLabel', { n: i + 1 })}
              className="min-h-[44px] flex-1 resize-y rounded-ctl border border-line bg-surface px-3 py-2 text-sm text-ink"
            />
            <Button size="sm" variant="ghost" aria-label={t('settings.onboarding.remove')} onClick={() => save(x => x.filter((_, j) => j !== i))}><Trash2 size={13} /></Button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" onClick={() => save(x => [...x, { dayOffset: (x.at(-1)?.dayOffset ?? 0) + 7, content: '' }])}><Plus size={13} /> {t('settings.onboarding.add')}</Button>
        {trainer.onboardingSteps && <Button size="sm" variant="ghost" onClick={() => save(() => DEFAULT_ONBOARDING_STEPS)}>{t('settings.onboarding.reset')}</Button>}
      </div>
    </Card>
  )
}

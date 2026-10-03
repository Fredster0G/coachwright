import { Logomark } from './brand/Logomark'
import { Button } from '@/design/controls'
import { APP_NAME, APP_TAGLINE } from '@/lib/brand'
import { useTranslation } from '@/lib/i18n'
import type { MessageKey } from '@/lib/i18n'

/** Shown while the trainer record loads and the exercise library seeds —
 *  keeps first paint from racing IndexedDB (spec: no page should query the
 *  db before boot has had a chance to seed it).
 *
 *  Two phases, matching the brand guide's motion doctrine: `progress` is the
 *  determinate bar tied to genuine boot steps (theme → durable storage →
 *  exercise seed) — real progress, not a decorative loop — then `reveal` is
 *  the wipe-build mark + wordmark/tagline flourish once boot is actually
 *  done. AppRoot.tsx drives the stage transitions. */
export function BootScreen({ stage, progress = 0, fadingOut = false, error = null, onRetry }: {
  stage: 'progress' | 'reveal'
  progress?: number
  fadingOut?: boolean
  /** Set when a boot step threw. Replaces the progress bar with something the
   *  user can act on — a frozen bar with no explanation was the old behaviour. */
  error?: { step: 'trainer' | 'theme' | 'storage' | 'cloud' | 'seed'; message: string } | null
  onRetry?: () => void
}) {
  const { t } = useTranslation()

  if (error) {
    return (
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-surface2 px-6">
        <Logomark size={56} />
        <div className="max-w-sm text-center">
          <div className="font-display text-lg font-bold text-ink">{t('boot.failedTitle', { app: APP_NAME })}</div>
          <p className="mt-1 text-sm text-muted">{t('boot.failedWhile', { step: t(`boot.step.${error.step}` as MessageKey) })}</p>
          <p className="mt-2 break-words font-mono text-2xs text-faint">{error.message}</p>
          <p className="mt-3 text-xs text-muted">
            {t('boot.dataSafe')}
          </p>
        </div>
        <Button variant="primary" onClick={onRetry}>{t('action.retry')}</Button>
      </div>
    )
  }

  return (
    <div
      className={`absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-surface2 ${fadingOut ? 'animate-[fade-out_0.35s_ease-in_both]' : ''}`}
    >
      {stage === 'progress' ? (
        <>
          <Logomark size={56} />
          <div className="h-1 w-40 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-ink transition-[width] duration-150 ease-out" style={{ width: `${progress}%` }} />
          </div>
        </>
      ) : (
        <>
          <Logomark size={56} animated />
          <div className="text-center">
            <div className="font-display text-2xl font-bold tracking-tight text-ink animate-cw-word">{APP_NAME}</div>
            <div className="font-mono text-2xs uppercase tracking-wide text-faint animate-cw-fade mt-1">{APP_TAGLINE}</div>
          </div>
        </>
      )}
    </div>
  )
}

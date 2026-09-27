import { useEffect, useState } from 'react'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { BootScreen } from './BootScreen'
import { trainerRepo } from '@/db/repo'
import { seedExercisesIfEmpty } from '@/db/seed'
import { startMembershipRefreshLoop } from '@/lib/membershipApi'
import { I18nProvider } from '@/lib/i18n'
import { TitleBar } from './TitleBar'

// The determinate-bar phase should read as genuine progress, not flicker by
// on a fast machine where every boot step resolves in a few ms — hold it
// visible for at least this long even if the real work finishes sooner.
const MIN_PROGRESS_PHASE_MS = 500
// How long the wipe-build reveal (mark + wordmark + tagline) stays on
// screen before the whole boot screen starts fading out — roughly covers
// the cw-wipe/cw-word sequence (see tailwind.config.js's cw-* keyframes).
const REVEAL_PHASE_MS = 1300
const FADE_OUT_MS = 380

type BootStage = 'progress' | 'reveal' | 'done'

/** Which boot step was running when it failed — named so the error screen can
 *  say something more useful than "something went wrong". Step labels
 *  themselves are looked up via `t('boot.step.<step>')` in BootScreen.tsx,
 *  not hardcoded here — this type is just the shared vocabulary. */
type BootStep = 'trainer' | 'theme' | 'storage' | 'seed'

/** Gates the router behind the boot sequence (theme + durable storage +
 *  exercise-library seed) so no page can query IndexedDB before it's ready —
 *  previously this ran fire-and-forget while the router mounted immediately.
 *
 *  Two visual phases, matching the brand guide's motion doctrine: a
 *  determinate progress bar tied to the real boot steps below, THEN the
 *  wipe-build mark reveal once boot is actually done — not the other way
 *  around, and not decorative (the bar's width is genuine step progress). */
export function AppRoot() {
  const [stage, setStage] = useState<BootStage>('progress')
  const [progress, setProgress] = useState(0)
  const [ready, setReady] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)
  const [error, setError] = useState<{ step: BootStep; message: string } | null>(null)
  // Bumped by the error screen's Retry so the boot effect runs again without a
  // full page reload (which would lose nothing, but reads as broken).
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const bootStartedAt = Date.now()
    let step: BootStep = 'trainer'

    ;(async () => {
      setProgress(10)
      const t = await trainerRepo.getOrCreate()
      if (cancelled) return
      setProgress(40)

      step = 'theme'
      const dark = t.theme === 'dark' || (t.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.classList.toggle('dark', dark)
      setProgress(55)

      step = 'storage'
      if (navigator.storage?.persist) {
        try { await navigator.storage.persist() } catch { /* not fatal — best effort */ }
      }
      if (cancelled) return
      setProgress(70)

      step = 'seed'
      await seedExercisesIfEmpty()
      if (cancelled) return
      setProgress(100)

      const elapsed = Date.now() - bootStartedAt
      if (elapsed < MIN_PROGRESS_PHASE_MS) await new Promise(r => setTimeout(r, MIN_PROGRESS_PHASE_MS - elapsed))
      if (cancelled) return

      setReady(true)

      // The reveal is pure decoration. Holding a reduced-motion user on a
      // splash screen for another 1.7s to play an animation the CSS has
      // already stripped out is just a delay, so skip straight to the app.
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setStage('done')
        return
      }

      setStage('reveal')
      // Let the wipe-build reveal actually finish playing before starting
      // to fade the whole screen out — fading immediately on entering this
      // stage would visibly cut the wordmark/tagline animation off mid-play.
      setTimeout(() => { if (!cancelled) setFadingOut(true) }, REVEAL_PHASE_MS)
      setTimeout(() => { if (!cancelled) setStage('done') }, REVEAL_PHASE_MS + FADE_OUT_MS)
    })().catch((err: unknown) => {
      // Nothing used to catch this. A rejection here (a failed IndexedDB open,
      // a private-mode storage refusal, the old first-boot ConstraintError)
      // left the boot screen on a frozen progress bar forever, with no message
      // and no way out. Now it always resolves to something actionable.
      if (cancelled) return
      console.error(`[boot] failed while ${step}`, err)
      setError({ step, message: err instanceof Error ? err.message : String(err) })
    })

    return () => { cancelled = true }
  }, [attempt])

  // Membership refresh only after boot: it reads the trainer row, which the
  // boot sequence is what guarantees exists. A no-op for installs that never
  // started checkout — see startMembershipRefreshLoop().
  useEffect(() => (ready ? startMembershipRefreshLoop() : undefined), [ready])

  const retry = () => {
    setError(null)
    setProgress(0)
    setAttempt(a => a + 1)
  }

  return (
    <I18nProvider>
      <div className="flex h-full flex-col">
        <TitleBar />
        <div className="relative min-h-0 flex-1">
          {ready && <RouterProvider router={router} />}
          {stage !== 'done' && (
            <BootScreen
              stage={stage === 'progress' ? 'progress' : 'reveal'}
              progress={progress}
              fadingOut={fadingOut}
              error={error ? { step: error.step, message: error.message } : null}
              onRetry={retry}
            />
          )}
        </div>
      </div>
    </I18nProvider>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Pause, Play, Plus, X } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

// ===== Rest timer (spec §4.5) =====
// A sticky, gym-floor-friendly countdown. WebAudio beep at 3-2-1-0 so a
// trainer/client can glance away and still hear the cue — no permissions,
// no notifications API, just an oscillator, exactly per the original spec
// ("rest timer (setTimeout + optional beep via WebAudio)").

let audioCtx: AudioContext | null = null
function beep(freq: number, durationMs: number) {
  try {
    audioCtx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.frequency.value = freq
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + durationMs / 1000)
    osc.connect(gain).connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + durationMs / 1000)
  } catch {
    // WebAudio unavailable (rare) — the visual countdown still works
  }
}

export function RestTimer({ seconds, onDone, onDismiss, sound = true }: {
  seconds: number
  onDone?: () => void
  onDismiss: () => void
  sound?: boolean
}) {
  const [remaining, setRemaining] = useState(seconds)
  const [paused, setPaused] = useState(false)
  const { t } = useTranslation()
  const beepedRef = useRef(new Set<number>())

  useEffect(() => {
    if (paused) return
    if (remaining <= 0) {
      if (sound) beep(880, 300)
      onDone?.()
      return
    }
    if (sound && remaining <= 3 && !beepedRef.current.has(remaining)) {
      beepedRef.current.add(remaining)
      beep(520, 120)
    }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining, paused, sound, onDone])

  const pct = Math.max(0, Math.min(100, (remaining / seconds) * 100))
  const mm = Math.floor(Math.max(0, remaining) / 60)
  const ss = Math.max(0, remaining) % 60

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur px-4 py-3 shadow-modal">
      <div className="mx-auto flex max-w-2xl items-center gap-4">
        <div className="relative h-14 w-14 shrink-0">
          <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
            <circle cx="18" cy="18" r="16" fill="none" className="stroke-surface2" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="16" fill="none" className={remaining <= 3 ? 'stroke-ember-500' : 'stroke-verde-600'}
              strokeWidth="3" strokeDasharray={`${(pct / 100) * 100.5} 100.5`} strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-mono tabular-nums text-sm font-semibold text-ink">
            {mm}:{String(ss).padStart(2, '0')}
          </span>
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-ink">{t('rest.title')}</p>
          <p className="text-2xs text-faint">{remaining <= 0 ? t('rest.done') : t('rest.hint')}</p>
        </div>
        <button onClick={() => setRemaining(r => r + 15)} className="rounded-ctl border border-line px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-surface2" aria-label={t('rest.add15')}>
          <Plus size={13} className="inline -mt-0.5" /> 15s
        </button>
        <button onClick={() => setPaused(p => !p)} className="rounded-ctl border border-line px-2.5 py-1.5 text-muted hover:bg-surface2" aria-label={paused ? t('rest.resume') : t('rest.pause')}>
          {paused ? <Play size={15} /> : <Pause size={15} />}
        </button>
        <button onClick={onDismiss} className="rounded-ctl border border-line px-2.5 py-1.5 text-muted hover:bg-surface2" aria-label={t('rest.skip')}>
          <X size={15} />
        </button>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState, useMemo } from 'react'
import { X, TrendingUp, Compass } from 'lucide-react'
import { logsRepo, exercisesRepo } from '@/db/repo'
import type { Exercise, SessionLog } from '@/db/types'
import { e1rm, fmtLoad } from '@/lib/core'
import { suggestHeuristic, type Performance } from '@/lib/progression'
import { warmupRamp } from '@/lib/nutrition'
import { parseISO } from 'date-fns'
import { useTranslation } from '@/lib/i18n'

interface ExerciseHistoryDrawerProps {
  clientId: string
  exerciseId: string
  open: boolean
  onClose: () => void
  clientUnits: 'lb' | 'kg'
}

type HistoryRecord = {
  date: string
  sets: SessionLog['entries'][number]['sets']
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null
  
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  
  const width = 120
  const height = 40
  const padding = 4
  
  const pts = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2)
    const y = height - padding - ((d - min) / range) * (height - padding * 2)
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={width} height={height} className="overflow-visible stroke-verde-600 fill-none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points={pts} />
    </svg>
  )
}

export default function ExerciseHistoryDrawer({ clientId, exerciseId, open, onClose, clientUnits }: ExerciseHistoryDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  
  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [history, setHistory] = useState<HistoryRecord[]>([])
  const { t, locale } = useTranslation()
  
  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal()
      // Load data
      exercisesRepo.get(exerciseId).then(ex => ex && setExercise(ex))
      logsRepo.exerciseHistory(clientId, exerciseId, 5).then(setHistory)
    } else {
      dialogRef.current?.close()
    }
  }, [open, clientId, exerciseId])

  // e1rm calculations per session (max e1rm across all done sets)
  const chartData = useMemo(() => {
    // Reverse the history so the chart goes from oldest to newest (left to right)
    const chronological = [...history].reverse()
    return chronological.map(session => {
      let maxE1rm = 0
      for (const set of session.sets) {
        if (set.done && set.actualLoad && set.actualReps) {
          const val = e1rm(set.actualLoad, set.actualReps)
          if (val > maxE1rm) maxE1rm = val
        }
      }
      return maxE1rm
    })
  }, [history])

  // Next-session suggestion (progression engine, spec §4.14) — deterministic
  // and explainable; history arrives newest-first, which suggestHeuristic expects.
  const suggestion = useMemo(() => {
    const performances: Performance[] = history.map(h => ({
      date: h.date,
      sets: h.sets.map(s => ({ load: s.actualLoad, reps: s.actualReps, rpe: s.rpe, done: s.done })),
    }))
    return suggestHeuristic(performances, clientUnits)
  }, [history, clientUnits])

  // Don't render contents if closed (prevents flash of old data)
  if (!open) return (
    <dialog ref={dialogRef} className="m-0 h-full max-h-none w-full max-w-sm ms-auto bg-surface shadow-sheet backdrop:bg-iron-950/20 backdrop:backdrop-blur-sm open:animate-slide-left" onCancel={onClose}></dialog>
  )

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      className="m-0 h-full max-h-none w-full max-w-sm ms-auto bg-surface shadow-sheet backdrop:bg-iron-950/20 backdrop:backdrop-blur-sm open:animate-slide-left p-0"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-line px-4 py-4">
          <h2 className="text-lg font-bold text-ink">{exercise?.name || t('history.title')}</h2>
          <button onClick={onClose} aria-label={t('history.close')} className="p-2 -me-2 text-faint hover:text-ink rounded-full hover:bg-surface2 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-8">
          {history.length > 0 && chartData.some(d => d > 0) && (
            <div className="flex items-center justify-between bg-verde-100/40 rounded-lg p-4 border border-verde-600/20">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-verde-600 mb-1">
                  <TrendingUp size={14} /> {t('history.trend')}
                </div>
                <div className="text-2xl font-bold text-ink">
                  {/* Latest session WITH a loaded set — the last one may be bodyweight-only (0). */}
                  {fmtLoad(chartData.filter(d => d > 0).at(-1) ?? 0, clientUnits)}
                </div>
              </div>
              <Sparkline data={chartData.filter(d => d > 0)} />
            </div>
          )}

          {suggestion && (
            <div className="rounded-card border border-line bg-surface2 p-4">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-verde-600">
                <Compass size={14} /> {t('history.suggested')}
              </div>
              <div className="font-mono tabular-nums text-xl font-semibold text-ink">
                {suggestion.load != null ? fmtLoad(suggestion.load, clientUnits) : '—'}
                {suggestion.reps ? <span className="text-sm font-normal text-muted"> {t('history.repsPlus', { n: suggestion.reps })}</span> : null}
              </div>
              <p className="mt-1 text-xs text-muted">{t(suggestion.msg.key, suggestion.msg.params)}</p>
              {suggestion.load != null && suggestion.load >= 40 && (
                <div className="mt-3 border-t border-line pt-2">
                  <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-faint">{t('history.warmup')}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {warmupRamp(suggestion.load, clientUnits === 'kg' ? 1.25 : 2.5).map(s => (
                      <span key={s.pct} className="font-mono tabular-nums text-xs text-muted">
                        {s.load}×{s.reps} <span className="text-faint">({s.pct}%)</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-6">
            <h3 className="text-sm font-semibold text-ink">{t('history.last5')}</h3>
            {history.length === 0 ? (
              <p className="text-faint text-sm">{t('history.none')}</p>
            ) : (
              history.map((h, i) => (
                <div key={i} className="relative ps-4 border-s-2 border-line">
                  <div className="absolute -start-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-iron-200 dark:bg-iron-700" />
                  <div className="text-xs font-medium text-faint mb-2">
                    {parseISO(h.date).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                  <div className="space-y-1.5">
                    {h.sets.map((set, sIdx) => {
                      if (!set.done) return null
                      return (
                        <div key={sIdx} className="text-sm flex items-center justify-between py-1 border-b border-dashed border-line last:border-0">
                          <span className="text-muted">{t('history.set', { n: sIdx + 1 })}</span>
                          <span className="font-medium text-ink">
                            {set.actualLoad ? `${fmtLoad(set.actualLoad, clientUnits)} × ` : ''}
                            {t('history.reps', { n: set.actualReps ?? set.targetReps ?? '-' })}
                            {set.rpe ? ` @ ${set.rpe}` : ''}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </dialog>
  )
}

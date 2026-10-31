import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { clientsRepo, programsRepo, exercisesRepo } from '@/db/repo'
import { fullName } from '@/lib/core'
import type { Block } from '@/db/types'
import { formatSetsSummary } from '@/features/programs/builder/gridFormat'
import { useTranslation } from '@/lib/i18n'

// ===== TV Workout — a big-screen display mode (spec §4.30) =====
// Read-only, no camera/casting SDK involved: the coach opens this route
// full-screen on a computer plugged into (or mirroring to) a gym TV. Large
// type, high contrast, no chrome. Logging still happens on the trainer's or
// client's own device via the normal Session Logger — this is a wall display.

function BlockCard({ block, exNames }: { block: Block; exNames: Map<string, string> }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      {block.label && (
        <div className="mb-4 text-xl font-semibold uppercase tracking-wide text-ember-500">
          {block.label}{block.intervalSpec ? ` — ${block.intervalSpec}` : ''}
        </div>
      )}
      <div className="space-y-4">
        {block.exercises.map(ex => (
          <div key={ex.id} className="flex items-baseline justify-between gap-6 border-b border-white/10 pb-3 last:border-0">
            <span className="text-2xl font-medium text-white">{exNames.get(ex.exerciseId) ?? t('tv.exercise')}</span>
            <span className="whitespace-nowrap font-mono text-xl text-white/70">
              {/* Every set, not just the first: a 5/3/1 pyramid used to read "3×5". */}
              {formatSetsSummary(ex.sets)}
              {ex.restSeconds ? ` · ${t('tv.rest', { n: ex.restSeconds })}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TvWorkoutPage() {
  const { clientId = '' } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const client = useLiveQuery(() => clientsRepo.get(clientId), [clientId])
  // The client's current program first; any active one as a fallback.
  const program = useLiveQuery(async () => {
    const c = await clientsRepo.get(clientId)
    const current = c?.activeProgramId ? await programsRepo.get(c.activeProgramId) : undefined
    if (current && current.status === 'active') return current
    const progs = await programsRepo.forClient(clientId)
    return progs.find(p => p.status === 'active') ?? null
  }, [clientId])
  const exercises = useLiveQuery(() => exercisesRepo.all(), [], [])
  const exNames = useMemo(() => new Map(exercises.map(e => [e.id, e.name])), [exercises])

  const [dayIdx, setDayIdx] = useState(0)
  const allDays = useMemo(() => program?.weeks.flatMap(w => w.days.map(d => ({ week: w.label, day: d }))) ?? [], [program])
  const current = allDays[dayIdx]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setDayIdx(i => Math.min(allDays.length - 1, i + 1))
      if (e.key === 'ArrowLeft') setDayIdx(i => Math.max(0, i - 1))
      if (e.key === 'Escape') navigate(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [allDays.length, navigate])

  if (client === undefined || program === undefined) {
    return <div className="flex h-screen items-center justify-center bg-iron-950 text-white/60">{t('tv.loading')}</div>
  }
  if (!client || !program) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-iron-950 text-center text-white">
        <p className="text-2xl">{t('tv.noProgram')}</p>
        <button onClick={() => navigate(-1)} className="rounded-ctl bg-white/10 px-4 py-2 text-sm hover:bg-white/20">{t('tv.back')}</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-iron-950 p-10 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <p className="text-lg text-white/50">{fullName(client)}</p>
            <h1 className="font-display text-5xl font-bold tracking-tight">{program.name}</h1>
            {current && <p className="mt-2 text-2xl text-ember-500">{current.week} · {current.day.name}</p>}
          </div>
          <button onClick={() => navigate(-1)} className="rounded-full bg-white/10 p-3 hover:bg-white/20" aria-label={t('tv.close')}>
            <X size={28} />
          </button>
        </div>

        {current && (
          <div className="space-y-6">
            {current.day.blocks.map(block => <BlockCard key={block.id} block={block} exNames={exNames} />)}
          </div>
        )}

        <div className="mt-10 flex items-center justify-center gap-6">
          <button onClick={() => setDayIdx(i => Math.max(0, i - 1))} disabled={dayIdx === 0} aria-label={t('tv.prevDay')} className="rounded-full bg-white/10 p-4 hover:bg-white/20 disabled:opacity-30">
            <ChevronLeft size={28} />
          </button>
          <span className="font-mono text-lg text-white/50">{dayIdx + 1} / {allDays.length}</span>
          <button onClick={() => setDayIdx(i => Math.min(allDays.length - 1, i + 1))} disabled={dayIdx === allDays.length - 1} aria-label={t('tv.nextDay')} className="rounded-full bg-white/10 p-4 hover:bg-white/20 disabled:opacity-30">
            <ChevronRight size={28} />
          </button>
        </div>
        <p className="mt-4 text-center text-xs text-white/30">{t('tv.keys')}</p>
      </div>
    </div>
  )
}

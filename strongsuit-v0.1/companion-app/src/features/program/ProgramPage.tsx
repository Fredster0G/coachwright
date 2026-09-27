import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ClipboardList } from 'lucide-react'
import { Card, EmptyState } from '@/design'
import { assignedProgramsRepo, coachExercisesRepo } from '@/db/repo'
import { fmtSet } from '@/lib/programFormat'
import type { AssignedProgram, Block, CoachExercise, Units, Week } from '@/db/types'

/** Read-only viewer for programs the coach assigned — rendered exactly from
 *  the synced rows, no client-side editing (a client logs against a program;
 *  they don't rewrite it). Arrives with each sync from Coachwright Cloud. */
export function ProgramPage({ units }: { units: Units }) {
  const [programs, setPrograms] = useState<AssignedProgram[] | undefined>()
  const [exercises, setExercises] = useState<Map<string, CoachExercise>>(new Map())

  useEffect(() => {
    assignedProgramsRepo.display().then(setPrograms)
    coachExercisesRepo.byId().then(setExercises)
  }, [])

  if (!programs) return null

  if (programs.length === 0) {
    return (
      <div className="space-y-4">
        <Title />
        <EmptyState
          icon={<ClipboardList size={28} strokeWidth={1.5} />}
          title="No program yet"
          body="When your coach assigns you a program, it shows up here after your next sync — over their server, WiFi, or a packet file they send you."
        />
        <p className="text-center text-2xs text-faint">
          Connected already? Pull the latest from the <Link to="/coach" className="text-verde-600 hover:underline">Coach</Link> tab.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Title />
      {programs.map(p => <ProgramCard key={p.id} program={p} exercises={exercises} units={units} />)}
    </div>
  )
}

function Title() {
  return (
    <div>
      <p className="text-xs text-muted">From your coach</p>
      <h1 className="font-display text-xl font-semibold text-ink">Program</h1>
    </div>
  )
}

function ProgramCard({ program, exercises, units }: {
  program: AssignedProgram; exercises: Map<string, CoachExercise>; units: Units
}) {
  const [openWeek, setOpenWeek] = useState<string | null>(program.weeks[0]?.id ?? null)
  return (
    <Card className="space-y-3">
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="font-display text-base font-semibold text-ink">{program.name}</p>
          {program.status === 'active' && (
            <span className="rounded-full bg-verde-600/10 px-2 py-0.5 text-2xs font-medium text-verde-600">Active</span>
          )}
        </div>
        {program.description && <p className="mt-0.5 text-xs text-muted">{program.description}</p>}
        <p className="mt-1 text-2xs text-faint">
          {program.weeks.length} week{program.weeks.length === 1 ? '' : 's'}
          {program.startDate ? ` · starts ${program.startDate}` : ''}
        </p>
      </div>
      <div className="space-y-2">
        {program.weeks.map(w => (
          <WeekSection
            key={w.id} week={w} exercises={exercises} units={units}
            open={openWeek === w.id} onToggle={() => setOpenWeek(openWeek === w.id ? null : w.id)}
          />
        ))}
      </div>
    </Card>
  )
}

function WeekSection({ week, exercises, units, open, onToggle }: {
  week: Week; exercises: Map<string, CoachExercise>; units: Units; open: boolean; onToggle: () => void
}) {
  return (
    <div className="rounded-ctl border border-line">
      <button onClick={onToggle} className="flex w-full items-center justify-between px-3 py-2 text-left">
        <span className="text-sm font-medium text-ink">{week.label}</span>
        <ChevronDown size={16} className={`text-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-line px-3 py-3">
          {week.days.length === 0
            ? <p className="text-2xs text-muted">Rest week — nothing scheduled.</p>
            : week.days.map(d => (
              <div key={d.id}>
                <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-faint">{d.name}</p>
                <div className="space-y-2">
                  {d.blocks.map(b => <BlockRow key={b.id} block={b} exercises={exercises} units={units} />)}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

function BlockRow({ block, exercises, units }: { block: Block; exercises: Map<string, CoachExercise>; units: Units }) {
  const heading = [block.label, block.type !== 'straight' ? block.type : null, block.intervalSpec]
    .filter(Boolean).join(' · ')
  return (
    <div className="rounded-ctl bg-surface2 px-2.5 py-2">
      {heading && <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-faint">{heading}</p>}
      <div className="space-y-1">
        {block.exercises.map(ex => (
          <div key={ex.id} className="text-sm">
            <span className="font-medium text-ink">{exercises.get(ex.exerciseId)?.name ?? 'Exercise'}</span>
            <span className="ml-2 font-mono tnum text-xs text-muted">{ex.sets.map(s => fmtSet(s, units)).join(', ')}</span>
            {ex.note && <p className="text-2xs text-faint">{ex.note}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Card, Button } from '@/design'
import { workoutsRepo, coachLinkRepo, assignedProgramsRepo, messagesRepo } from '@/db/repo'
import type { AssignedProgram, CoachLink, CoachMessage, CompanionProfile, PersonalWorkout } from '@/db/types'
import {
  CornerFrame,
  EmblemCoach,
  EmblemFilm,
  EmblemKettle,
  EmblemLifter,
  EmblemPlates,
  EmblemSpotter,
  EmblemStamp,
  EmblemStride,
} from '@/brand/Emblems'

export function HomePage({ profile }: { profile: CompanionProfile }) {
  const [recent, setRecent] = useState<PersonalWorkout[]>([])
  const [coachLink, setCoachLink] = useState<CoachLink | undefined>()
  const [program, setProgram] = useState<AssignedProgram | undefined>()
  const [lastCoachMsg, setLastCoachMsg] = useState<CoachMessage | undefined>()

  useEffect(() => {
    workoutsRepo.all().then(w => setRecent(w.slice(0, 3)))
    coachLinkRepo.get().then(setCoachLink)
    assignedProgramsRepo.display().then(p => setProgram(p[0]))
    messagesRepo.all().then(ms => setLastCoachMsg([...ms].reverse().find(m => m.direction === 'from-coach')))
  }, [])

  return (
    <div className="space-y-5">
      <CornerFrame className="overflow-hidden rounded-card border border-line/80 bg-surface/90 shadow-bench animate-rise-in chalk-mesh">
        <header className="relative px-4 py-5">
          <EmblemStride
            size={108}
            className="pointer-events-none absolute -end-1 bottom-0 opacity-25 animate-float-soft"
          />
          <div className="relative">
            <div className="flex items-center gap-2.5">
              <EmblemStamp className="text-ink">
                <EmblemLifter size={40} />
              </EmblemStamp>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-faint">
                Companion
              </p>
            </div>
            <h1 className="mt-2 font-display text-[1.85rem] font-extrabold tracking-[-0.04em] text-ink leading-none">
              {profile.name || 'You'}
            </h1>
            <p className="mt-2 max-w-[15rem] text-sm leading-relaxed text-muted">
              Your training log lives on this phone — no account, no cloud tax.
            </p>
            <div aria-hidden className="mt-4 h-1 w-14 rounded-full bg-ember-500 ember-pulse" />
          </div>
        </header>
      </CornerFrame>

      <div className="stagger-in relative overflow-hidden rounded-card border border-nav-line bg-[linear-gradient(180deg,#1C2228_0%,#14181C_100%)] px-3 py-3.5 text-nav-text shadow-bench">
        <EmblemLifter size={72} className="pointer-events-none absolute -end-2 top-1/2 -translate-y-1/2 opacity-15" />
        <div className="relative flex items-end justify-between gap-2">
          {[
            { Emblem: EmblemLifter, label: 'Lift' },
            { Emblem: EmblemStride, label: 'Move' },
            { Emblem: EmblemFilm, label: 'Form' },
            { Emblem: EmblemCoach, label: 'Coach' },
          ].map(({ Emblem, label }) => (
            <EmblemStamp key={label} label={label} className="text-nav-text/90">
              <Emblem size={36} />
            </EmblemStamp>
          ))}
        </div>
      </div>

      <div className="stagger-in space-y-3">
        {coachLink && (
          <Card className="hover-lift flex items-center gap-2.5 text-xs">
            <EmblemSpotter size={32} className="shrink-0" />
            <span className="text-muted">
              {coachLink.pending ? 'Connecting to your coach…' : `Paired with ${coachLink.coachName}`}
            </span>
            {coachLink.lastSyncAt && (
              <span className="ml-auto font-mono text-2xs text-faint">
                synced {new Date(coachLink.lastSyncAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            )}
          </Card>
        )}

        {program && (
          <Link to="/program" className="block">
            <Card className="hover-lift stamp-panel relative flex items-center gap-3 overflow-hidden hover:border-verde-600/50">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-ctl border border-verde-600/20 bg-verde-100">
                <EmblemPlates size={36} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-semibold text-ink">{program.name}</p>
                <p className="text-2xs text-muted">
                  Your program · {program.weeks.length} week{program.weeks.length === 1 ? '' : 's'}
                  {program.status === 'active' ? ' · active' : ''}
                </p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-faint" />
            </Card>
          </Link>
        )}

        {lastCoachMsg && (
          <Link to="/coach" className="block">
            <Card className="hover-lift flex items-start gap-3 hover:border-verde-600/50">
              <span className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-ctl border border-verde-600/20 bg-verde-100">
                <EmblemCoach size={34} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">From your coach</p>
                <p className="mt-0.5 truncate text-sm text-ink">{lastCoachMsg.content}</p>
              </div>
            </Card>
          </Link>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <Link to="/log" className="block">
            <Card className="hover-lift stamp-panel relative flex flex-col items-center gap-2 overflow-hidden py-6 text-center hover:border-verde-600/50">
              <EmblemKettle size={48} className="animate-float-soft" />
              <span className="font-display text-sm font-semibold text-ink">Log a workout</span>
            </Card>
          </Link>
          <Link to="/progress" className="block">
            <Card className="hover-lift stamp-panel relative flex flex-col items-center gap-2 overflow-hidden py-6 text-center hover:border-verde-600/50">
              <EmblemPlates size={48} />
              <span className="font-display text-sm font-semibold text-ink">Track progress</span>
            </Card>
          </Link>
        </div>

        <Link to="/film-room" className="block">
          <Card className="hover-lift stamp-panel relative flex items-center gap-3 overflow-hidden hover:border-verde-600/50">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-ctl border border-ember-500/25 bg-ember-500/12">
              <EmblemFilm size={34} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-semibold text-ink">Check your form</p>
              <p className="text-2xs text-muted">Film a set — reps, depth, tempo on this phone.</p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-faint" />
            <EmblemFilm size={72} className="pointer-events-none absolute -bottom-3 -end-3 opacity-15" />
          </Card>
        </Link>

        <div>
          <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Recent</p>
          {recent.length === 0 ? (
            <CornerFrame className="rounded-card border border-dashed border-line bg-surface/60 px-4 py-8 text-center chalk-mesh">
              <EmblemLifter size={56} className="mx-auto mb-2 opacity-45" />
              <p className="text-xs text-muted">Nothing logged yet — your first workout is one tap away.</p>
            </CornerFrame>
          ) : (
            <div className="space-y-2">
              {recent.map(w => (
                <Card key={w.id} className="hover-lift flex items-center justify-between py-3">
                  <span className="text-sm font-medium text-ink">{w.title}</span>
                  <span className="font-mono text-2xs text-faint">{w.date}</span>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Link to="/log" className="block">
          <Button variant="primary" className="w-full gap-2 shadow-bench">
            <EmblemKettle size={22} />
            Log today&apos;s workout
          </Button>
        </Link>
      </div>
    </div>
  )
}

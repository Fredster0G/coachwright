import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Dumbbell, LineChart, MessageCircle, Video, ChevronRight } from 'lucide-react'
import { Card, Button } from '@/design'
import { workoutsRepo, coachLinkRepo, assignedProgramsRepo, messagesRepo } from '@/db/repo'
import type { AssignedProgram, CoachLink, CoachMessage, CompanionProfile, PersonalWorkout } from '@/db/types'

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
      <header className="relative overflow-hidden rounded-card border border-line/80 bg-surface/85 px-4 py-5 shadow-bench animate-rise-in">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_70%_at_100%_0%,rgb(21_94_78/14%),transparent_55%),radial-gradient(ellipse_50%_40%_at_0%_100%,rgb(217_115_13/10%),transparent_50%)]"
        />
        <div className="relative">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-faint">
            Companion
          </p>
          <h1 className="mt-1.5 font-display text-[1.75rem] font-extrabold tracking-[-0.04em] text-ink leading-none">
            {profile.name || 'You'}
          </h1>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
            Your training log lives on this phone — no account, no cloud tax.
          </p>
          <div aria-hidden className="mt-4 h-1 w-14 rounded-full bg-ember-500 ember-pulse" />
        </div>
      </header>

      <div className="stagger-in space-y-3">
        {coachLink && (
          <Card className="flex items-center gap-2.5 text-xs hover-lift">
            <span className={`h-2 w-2 shrink-0 rounded-full ${coachLink.pending ? 'bg-ember-500 animate-pulse' : 'bg-verde-600'}`} />
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
            <Card className="hover-lift flex items-center gap-3 hover:border-verde-600/50">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-ctl bg-verde-100 text-verde-700">
                <ClipboardList size={20} />
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
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-ctl bg-verde-100 text-verde-700">
                <MessageCircle size={20} />
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
            <Card className="hover-lift flex flex-col items-center gap-2 py-6 text-center hover:border-verde-600/50">
              <span className="flex h-11 w-11 items-center justify-center rounded-ctl bg-verde-100 text-verde-700 animate-float-soft">
                <Dumbbell size={22} />
              </span>
              <span className="font-display text-sm font-semibold text-ink">Log a workout</span>
            </Card>
          </Link>
          <Link to="/progress" className="block">
            <Card className="hover-lift flex flex-col items-center gap-2 py-6 text-center hover:border-verde-600/50">
              <span className="flex h-11 w-11 items-center justify-center rounded-ctl bg-verde-100 text-verde-700">
                <LineChart size={22} />
              </span>
              <span className="font-display text-sm font-semibold text-ink">Track progress</span>
            </Card>
          </Link>
        </div>

        <Link to="/film-room" className="block">
          <Card className="hover-lift flex items-center gap-3 hover:border-verde-600/50">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-ctl bg-ember-500/15 text-ember-600">
              <Video size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-semibold text-ink">Check your form</p>
              <p className="text-2xs text-muted">Film a set — reps, depth, tempo on this phone.</p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-faint" />
          </Card>
        </Link>

        <div>
          <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Recent</p>
          {recent.length === 0 ? (
            <Card className="text-center text-xs text-muted">Nothing logged yet — your first workout is one tap away.</Card>
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
          <Button variant="primary" className="w-full shadow-bench">Log today&apos;s workout</Button>
        </Link>
      </div>
    </div>
  )
}

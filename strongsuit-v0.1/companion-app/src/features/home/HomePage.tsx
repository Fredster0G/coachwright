import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Dumbbell, LineChart, MessageCircle, Video } from 'lucide-react'
import { Card, Button, PageHeader } from '@/design'
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
    <div className="space-y-4">
      <PageHeader eyebrow="Welcome back," title={profile.name || 'You'} />

      {coachLink && (
        <Card className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full bg-verde-600" />
          <span className="text-muted">Connected to {coachLink.coachName}</span>
          {coachLink.lastSyncAt && (
            <span className="ml-auto text-2xs text-faint">
              synced {new Date(coachLink.lastSyncAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          )}
        </Card>
      )}

      {program && (
        <Link to="/program">
          <Card className="flex items-center gap-3 hover:border-verde-600">
            <ClipboardList size={20} className="shrink-0 text-verde-600" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{program.name}</p>
              <p className="text-2xs text-muted">
                Your program · {program.weeks.length} week{program.weeks.length === 1 ? '' : 's'}
                {program.status === 'active' ? ' · active' : ''}
              </p>
            </div>
          </Card>
        </Link>
      )}

      {lastCoachMsg && (
        <Link to="/coach">
          <Card className="flex items-start gap-3 hover:border-verde-600">
            <MessageCircle size={20} className="mt-0.5 shrink-0 text-verde-600" />
            <div className="min-w-0 flex-1">
              <p className="text-2xs font-semibold uppercase tracking-wide text-faint">From your coach</p>
              <p className="truncate text-sm text-ink">{lastCoachMsg.content}</p>
            </div>
          </Card>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link to="/log">
          <Card className="flex flex-col items-center gap-2 py-6 text-center hover:border-verde-600">
            <Dumbbell size={22} className="text-verde-600" />
            <span className="text-sm font-medium text-ink">Log a workout</span>
          </Card>
        </Link>
        <Link to="/progress">
          <Card className="flex flex-col items-center gap-2 py-6 text-center hover:border-verde-600">
            <LineChart size={22} className="text-verde-600" />
            <span className="text-sm font-medium text-ink">Track progress</span>
          </Card>
        </Link>
      </div>

      <Link to="/film-room">
        <Card className="flex items-center gap-3 hover:border-verde-600">
          <Video size={20} className="shrink-0 text-verde-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">Check your form</p>
            <p className="text-2xs text-muted">Film a set and see your reps, depth and tempo — on this phone, no coach needed.</p>
          </div>
        </Card>
      </Link>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Recent</p>
        {recent.length === 0 ? (
          <Card className="text-center text-xs text-muted">Nothing logged yet — your first workout is one tap away.</Card>
        ) : (
          <div className="space-y-2">
            {recent.map(w => (
              <Card key={w.id} className="flex items-center justify-between py-3">
                <span className="text-sm font-medium text-ink">{w.title}</span>
                <span className="text-2xs text-faint">{w.date}</span>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Link to="/log">
        <Button variant="primary" className="w-full">Log today's workout</Button>
      </Link>
    </div>
  )
}

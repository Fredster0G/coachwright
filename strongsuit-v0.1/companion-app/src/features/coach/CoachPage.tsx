import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, ClipboardList, Link2, RefreshCw, Send } from 'lucide-react'
import { Button, Card, EmptyState, Input } from '@/design'
import { coachLinkRepo, messagesRepo, assignedProgramsRepo } from '@/db/repo'
import { syncNow, pushMessageToCoach } from '@/features/sync/companionSyncApi'
import { ConnectFlow } from '@/features/sync/ConnectFlow'
import { CoachBrand, brandAccent } from './CoachBrand'
import type { CoachLink, CoachMessage } from '@/db/types'

/** The whole coach relationship on one screen: the message thread and a
 *  "Sync now" button. Everything travels through Coachwright Cloud with the
 *  token from the coach's connect code. */
export function CoachPage() {
  const [coachLink, setCoachLink] = useState<CoachLink | undefined>()
  const [loaded, setLoaded] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [messages, setMessages] = useState<CoachMessage[]>([])
  const [hasProgram, setHasProgram] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)

  const refresh = () => {
    coachLinkRepo.get().then(l => { setCoachLink(l); setLoaded(true) })
    messagesRepo.all().then(setMessages)
    assignedProgramsRepo.display().then(p => setHasProgram(p.length > 0))
  }
  useEffect(() => { refresh() }, [])
  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight }) }, [messages.length])

  async function doSync() {
    if (!coachLink) return
    setBusy(true); setError(''); setStatus('')
    try {
      const r = await syncNow(coachLink)
      setStatus(summary(r.programs, r.pulled + r.reminders))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't sync.")
    } finally { setBusy(false); refresh() }
  }

  async function send() {
    if (!coachLink || !draft.trim()) return
    setError('')
    try {
      const delivered = await pushMessageToCoach(coachLink, draft.trim())
      if (!delivered) setStatus('Saved — goes out when you’re back online.')
      setDraft('')
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send.")
    } finally { refresh() } // the message row was saved locally either way
  }

  if (!loaded) return null

  if (connecting) {
    return (
      <div className="space-y-4">
        <PageTitle />
        <ConnectFlow onConnected={() => { setConnecting(false); refresh() }} onSkip={() => setConnecting(false)} />
      </div>
    )
  }

  if (!coachLink) {
    return (
      <div className="space-y-4">
        <PageTitle />
        <EmptyState
          icon={<Link2 size={28} strokeWidth={1.5} />}
          title="Not connected to a coach"
          body="Training with a coach? Enter the connect code they give you, and your program, messages and logged workouts travel between you."
        />
        <Button variant="primary" className="w-full" onClick={() => setConnecting(true)}>Connect with a code</Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0 rounded-sm ps-2" style={brandAccent(coachLink)}>
          <p className="text-xs text-muted">Your coach</p>
          <h1 className="font-display text-lg font-semibold text-ink"><CoachBrand link={coachLink} /></h1>
        </div>
        <div className="text-right text-2xs text-faint">
          {coachLink.lastSyncAt
            ? <>Last synced<br />{new Date(coachLink.lastSyncAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</>
            : 'Not synced yet'}
        </div>
      </div>

      {hasProgram && (
        <Link to="/program">
          <Card className="flex items-center gap-2 py-2.5 text-sm text-ink hover:border-verde-600">
            <ClipboardList size={16} className="text-verde-600" />
            View your assigned program
          </Card>
        </Link>
      )}

      {(coachLink.bookingEnabled || (coachLink.sessions?.length ?? 0) > 0) && (
        <Link to="/book">
          <Card className="flex items-center gap-2 py-2.5 text-sm text-ink hover:border-verde-600">
            <CalendarClock size={16} className="text-verde-600" />
            {coachLink.sessions?.length ? 'Your sessions · book another' : 'Book a session'}
          </Card>
        </Link>
      )}

      <Button variant="primary" onClick={doSync} disabled={busy}>
        <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> {busy ? 'Syncing…' : 'Sync now'}
      </Button>

      {status && <p className="text-2xs text-verde-600">{status}</p>}
      {error && <p className="text-2xs text-signal-600">{error}</p>}

      <div ref={threadRef} className="flex-1 space-y-1.5 overflow-y-auto rounded-card border border-line bg-surface2/50 p-3">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted">No messages yet — say hi.</p>
        ) : messages.map(m => (
          <div key={m.id} className={`flex ${m.direction === 'to-coach' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-ctl px-3 py-2 text-sm ${m.direction === 'to-coach' ? 'bg-verde-600 text-white' : 'border border-line bg-surface text-ink'}`}>
              <p>{m.content}</p>
              {m.booking && (
                <p className="mt-0.5 text-2xs font-medium">
                  {m.booking.status === 'accepted' ? '✓ Confirmed' : m.booking.status === 'declined' ? 'Declined' : 'Waiting for coach'}
                </p>
              )}
              <p className={`mt-0.5 text-2xs ${m.direction === 'to-coach' ? 'text-white/70' : 'text-faint'}`}>
                {new Date(m.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 pb-1">
        <Input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Message your coach…" onKeyDown={e => { if (e.key === 'Enter') send() }} />
        <Button variant="primary" onClick={send} disabled={!draft.trim()} aria-label="Send"><Send size={16} /></Button>
      </div>
    </div>
  )
}

function PageTitle() {
  return (
    <div>
      <p className="text-xs text-muted">Coach</p>
      <h1 className="font-display text-xl font-semibold text-ink">Train together</h1>
    </div>
  )
}

function summary(programs: number, messages: number): string {
  const parts: string[] = []
  if (programs) parts.push(`${programs} program${programs === 1 ? '' : 's'} updated`)
  if (messages) parts.push(`${messages} new message${messages === 1 ? '' : 's'}`)
  return parts.length ? `Synced — ${parts.join(', ')}.` : 'Synced — everything already up to date.'
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, CalendarClock, RefreshCw } from 'lucide-react'
import { Button, Card, EmptyState, PageHeader } from '@/design'
import { coachLinkRepo, messagesRepo } from '@/db/repo'
import { syncNow, pushMessageToCoach } from '@/features/sync/companionSyncApi'
import { groupSlotsByDay, pendingRequests, requestText } from '@/lib/booking'
import type { BookingSlot, CoachLink, CoachMessage } from '@/db/types'

const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** Ask the coach for a session in one of their open slots. A request is a
 *  message the coach accepts or declines — nothing is booked until they do. */
export function BookPage() {
  const [link, setLink] = useState<CoachLink | undefined>()
  const [messages, setMessages] = useState<CoachMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [picked, setPicked] = useState<BookingSlot | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const refresh = async () => {
    setLink(await coachLinkRepo.get())
    setMessages(await messagesRepo.all())
    setLoaded(true)
  }
  useEffect(() => { void refresh() }, [])

  async function doSync(l: CoachLink) {
    setBusy(true); setError('')
    try { await syncNow(l) } catch (e) { setError(e instanceof Error ? e.message : "Couldn't sync.") }
    finally { setBusy(false); void refresh() }
  }

  async function request(l: CoachLink, slot: BookingSlot) {
    setBusy(true); setError(''); setStatus('')
    try {
      const delivered = await pushMessageToCoach(l, requestText(slot), slot)
      // Don't offer the same slot again while the coach decides.
      await coachLinkRepo.patch(l.id, { openSlots: (l.openSlots ?? []).filter(s => s.start !== slot.start) })
      setStatus(delivered ? 'Request sent — your coach will confirm.' : 'Saved — it goes to your coach when you’re back online.')
      setPicked(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the request.")
    } finally { setBusy(false); void refresh() }
  }

  if (!loaded) return null
  if (!link) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="Coach" title="Book a session" />
        <EmptyState icon={<CalendarClock size={28} strokeWidth={1.5} />} title="Not connected to a coach" body="Connect with your coach's code on the Coach tab first." />
      </div>
    )
  }

  const pending = pendingRequests(messages)
  const answered = messages.filter(m => m.direction === 'to-coach' && m.booking?.status && m.booking.end > new Date().toISOString())
  const taken = new Set(pending.map(m => m.booking!.start))
  const days = groupSlotsByDay((link.openSlots ?? []).filter(s => !taken.has(s.start)))
  const sessions = link.sessions ?? []

  return (
    <div className="space-y-4 pb-20">
      <PageHeader eyebrow={link.coachName} title="Book a session"
        action={<Button onClick={() => doSync(link)} disabled={busy} aria-label="Refresh"><RefreshCw size={14} className={busy ? 'animate-spin' : ''} /></Button>} />

      {status && <p className="text-2xs text-verde-600">{status}</p>}
      {error && <p className="text-2xs text-signal-600">{error}</p>}

      {sessions.length > 0 && (
        <Card className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-ink"><CalendarCheck size={14} className="text-verde-600" /> Your sessions</p>
          {sessions.map(s => (
            <p key={s.id} className="text-sm text-ink">
              {s.recurring
                ? <>{new Date(s.start).toLocaleDateString(undefined, { weekday: 'long' })}s at {time(s.start)} <span className="text-2xs text-faint">· repeats</span></>
                : when(s.start)}
              {s.title && s.title !== 'Session' && <span className="text-2xs text-muted"> · {s.title}</span>}
            </p>
          ))}
        </Card>
      )}

      {(pending.length > 0 || answered.length > 0) && (
        <Card className="space-y-1.5">
          <p className="text-xs font-semibold text-ink">Your requests</p>
          {[...pending, ...answered].map(m => (
            <p key={m.id} className="flex items-center justify-between text-sm text-ink">
              <span>{when(m.booking!.start)}</span>
              <span className={`text-2xs font-medium ${m.booking!.status === 'accepted' ? 'text-verde-600' : m.booking!.status === 'declined' ? 'text-signal-600' : 'text-muted'}`}>
                {m.booking!.status === 'accepted' ? 'Confirmed' : m.booking!.status === 'declined' ? 'Declined' : 'Waiting for coach'}
              </span>
            </p>
          ))}
        </Card>
      )}

      {!link.bookingEnabled ? (
        <EmptyState icon={<CalendarClock size={28} strokeWidth={1.5} />} title="Booking isn’t open" body={`${link.coachName} hasn’t opened times for booking. You can still message them on the Coach tab.`} />
      ) : days.length === 0 ? (
        <EmptyState icon={<CalendarClock size={28} strokeWidth={1.5} />} title="No open times right now" body="Your coach’s open times are all taken or too soon. Check back later, or send them a message." />
      ) : (
        days.map(d => (
          <div key={d.date}>
            <p className="mb-1.5 text-xs font-semibold text-muted">{dayLabel(d.date)}</p>
            <div className="flex flex-wrap gap-2">
              {d.slots.map(s => (
                <button
                  key={s.start}
                  onClick={() => setPicked(p => (p?.start === s.start ? null : s))}
                  aria-pressed={picked?.start === s.start}
                  className={`min-h-[44px] rounded-ctl border px-3 font-mono text-sm tabular-nums transition-colors ${picked?.start === s.start ? 'border-verde-600 bg-verde-600 text-white' : 'border-line bg-surface text-ink hover:border-verde-600'}`}
                >
                  {time(s.start)}
                </button>
              ))}
            </div>
          </div>
        ))
      )}

      <p className="text-center text-2xs text-faint"><Link to="/coach" className="underline">Back to messages</Link></p>

      {picked && (
        <div className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] mx-auto max-w-md px-4">
          <Card className="flex items-center gap-3 shadow-lg">
            <p className="flex-1 text-sm text-ink">{when(picked.start)}–{time(picked.end)}</p>
            <Button variant="primary" onClick={() => request(link, picked)} disabled={busy}>Request</Button>
          </Card>
        </div>
      )}
    </div>
  )
}

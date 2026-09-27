import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, MessageSquare, Send, RefreshCw, Radio, AlarmClock, X } from 'lucide-react'
import { Button, EmptyState, Dialog, Label, Card, toast, toastError } from '@/design'
import { messagesRepo } from '@/db/repo'
import type { CoachMessage, MessageDirection, MessageChannel } from '@/db/types'
import { nowIso, newId } from '@/lib/core'
import { scheduleReminder, listUpcomingReminders, cancelReminder, type UpcomingReminder } from '@/lib/cloud/reminders'
import { syncNow } from '@/lib/cloud/syncEngine'

interface MessagesTabProps {
  clientId: string
}

function LogMessageDialog({ clientId, open, onClose }: { clientId: string; open: boolean; onClose: () => void }) {
  const [form, setForm] = useState<{
    date: string
    direction: MessageDirection
    channel: MessageChannel
    content: string
  }>({
    date: new Date().toISOString().slice(0, 16), // YYYY-MM-DDTHH:mm
    direction: 'outbound',
    channel: 'sms',
    content: ''
  })

  async function save(e: React.FormEvent) {
    e.preventDefault()
    
    const msg: CoachMessage = {
      id: newId(),
      clientId,
      date: new Date(form.date).toISOString(),
      direction: form.direction,
      channel: form.channel,
      content: form.content,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }

    await messagesRepo.create(msg)
    onClose()
    setForm(f => ({ ...f, content: '' }))
  }

  return (
    <Dialog open={open} onClose={onClose} title="Log Message">
      <form onSubmit={save} className="space-y-4">
        <div><Label>Date & Time</Label><input 
          type="datetime-local" required className="w-full bg-surface border border-line rounded px-3 py-2 text-ink mt-1"
          value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} 
        /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Direction</Label>
            <select className="w-full bg-surface border border-line rounded px-3 py-2 text-ink mt-1"
              value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value as MessageDirection })}>
              <option value="outbound">Outbound (I sent)</option>
              <option value="inbound">Inbound (Client sent)</option>
            </select>
          </div>
          <div><Label>Channel</Label>
            <select className="w-full bg-surface border border-line rounded px-3 py-2 text-ink mt-1"
              value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value as MessageChannel })}>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="in-person">In-person</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        
        <div>
          <Label>Message Content</Label>
          <textarea 
            required
            className="w-full bg-surface border border-line rounded px-3 py-2 text-ink mt-1" 
            rows={4} 
            value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} 
          />
        </div>

        <div className="pt-4 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">Save Message</Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Default reminder slot: tomorrow morning. A datetime-local input with no
 *  value is a fiddly thing to fill in on a laptop, and "remind them tomorrow"
 *  is overwhelmingly the common case. */
function defaultSendAt(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  // datetime-local wants local wall-clock time with no zone suffix, so
  // toISOString() (which converts to UTC) would silently shift the hour.
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Schedule a reminder the cloud releases to this client at a chosen time.
 *  Delivery is pull-based: the client sees it the next time Companion opens
 *  after `sendAt` — the copy says so rather than implying a push to a locked
 *  phone. */
function ReminderScheduler({ clientId }: { clientId: string }) {
  const [content, setContent] = useState('')
  const [sendAt, setSendAt] = useState(defaultSendAt)
  const [upcoming, setUpcoming] = useState<UpcomingReminder[]>([])
  const [busy, setBusy] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setUpcoming(await listUpcomingReminders(clientId))
      setLoadFailed(false)
    } catch {
      // The server being unreachable shouldn't blank the panel — the coach can
      // still write one and find out on send.
      setLoadFailed(true)
    }
  }, [clientId])

  useEffect(() => { void refresh() }, [refresh])

  async function schedule() {
    const when = new Date(sendAt)
    if (!content.trim()) return
    if (Number.isNaN(when.getTime())) { toastError('Pick a date and time first.'); return }
    if (when.getTime() <= Date.now()) { toastError('Pick a time in the future.'); return }
    setBusy(true)
    try {
      await scheduleReminder(clientId, content.trim(), when)
      setContent('')
      toast('Reminder scheduled.')
      await refresh()
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Couldn't schedule the reminder.")
    } finally {
      setBusy(false)
    }
  }

  async function cancel(id: string) {
    setBusy(true)
    try {
      await cancelReminder(id)
      toast('Reminder cancelled.')
      await refresh()
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Couldn't cancel the reminder.")
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-verde-600">
        <AlarmClock size={13} /> Scheduled reminders
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input
          className="min-h-[44px] flex-1 rounded-ctl border border-line bg-surface px-3 py-2 text-sm text-ink"
          placeholder="Remind them to…"
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') schedule() }}
        />
        <input
          type="datetime-local"
          className="min-h-[44px] rounded-ctl border border-line bg-surface px-3 py-2 text-sm text-ink"
          value={sendAt}
          onChange={e => setSendAt(e.target.value)}
        />
        <Button size="sm" variant="primary" onClick={schedule} disabled={busy || !content.trim()}>
          Schedule
        </Button>
      </div>
      <p className="mt-1.5 text-2xs text-faint">
        Delivered the next time this client opens Companion after that time — reminders are
        picked up on open, not pushed to a locked phone.
      </p>

      {loadFailed && (
        <p className="mt-2 text-2xs text-ember-600">Couldn't load scheduled reminders — are you online?</p>
      )}

      {upcoming.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-line pt-2.5">
          {upcoming.map(r => (
            <li key={r.id} className="flex items-center gap-2 text-xs">
              <span className="font-mono tabular-nums text-faint">
                {new Date(r.sendAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink">{r.content}</span>
              <button
                onClick={() => cancel(r.id)}
                disabled={busy}
                className="shrink-0 text-faint hover:text-signal-600 disabled:opacity-50"
                aria-label={`Cancel reminder: ${r.content}`}
                title="Cancel"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** Messages to the client's Companion app. A message is just a synced
 *  `messages` row (channel 'app'): it reaches the cloud with the next sync,
 *  Companion picks it up from there, and replies come back the same way. */
function LiveMessagePanel({ clientId }: { clientId: string }) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  async function send() {
    if (!draft.trim()) return
    setBusy(true)
    try {
      await messagesRepo.create({
        id: newId(), clientId, date: nowIso(), direction: 'outbound', channel: 'app', content: draft.trim(),
      })
      setDraft('')
      await syncNow()
      toast('Sent.')
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Couldn't send.")
    } finally {
      setBusy(false)
    }
  }

  async function checkForReplies() {
    setBusy(true)
    try { await syncNow() } finally { setBusy(false) }
  }

  return (
    <>
    <ReminderScheduler clientId={clientId} />
    <Card className="mb-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-verde-600">
        <Radio size={13} /> Companion app
      </div>
      <div className="flex items-end gap-2">
        <textarea
          className="min-h-[44px] flex-1 resize-none rounded-ctl border border-line bg-surface px-3 py-2 text-sm text-ink"
          rows={1}
          placeholder="Message this client directly…"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
        />
        <Button size="sm" variant="primary" onClick={send} disabled={busy || !draft.trim()}>
          <Send size={14} />
        </Button>
        <Button size="sm" variant="ghost" onClick={checkForReplies} disabled={busy} title="Check for new replies">
          <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
        </Button>
      </div>
      <p className="mt-1.5 text-2xs text-faint">Delivered once this client connects Companion (client page → Connect Companion).</p>
    </Card>
    </>
  )
}

export default function MessagesTab({ clientId }: MessagesTabProps) {
  const messages = useLiveQuery(
    () => messagesRepo.forClient(clientId),
    [clientId],
    []
  )

  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="max-w-3xl">
      <LiveMessagePanel clientId={clientId} />
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">Message Log</h3>
        <Button variant="ghost" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus size={16} className="me-1.5" /> Log Message
        </Button>
      </div>

      {(!messages || messages.length === 0) ? (
        <EmptyState 
          icon={<MessageSquare size={28} strokeWidth={1.5} />}
          title="No messages logged" 
          body="Keep track of asynchronous communication with this client." 
        />
      ) : (
        <div className="space-y-4">
          {messages.map(m => {
            const isOutbound = m.direction === 'outbound'
            const timeStr = new Date(m.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
            return (
              <div key={m.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] sm:max-w-[70%] rounded-xl p-3 ${isOutbound ? 'bg-verde-600 text-white rounded-br-none' : 'bg-surface border border-line rounded-bl-none'}`}>
                  <div className={`text-xs mb-1 ${isOutbound ? 'text-white/80' : 'text-faint'} flex items-center justify-between gap-4`}>
                    <span className="font-semibold uppercase tracking-wider">{m.channel}</span>
                    <span>{timeStr}</span>
                  </div>
                  <div className="whitespace-pre-wrap text-sm">{m.content}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <LogMessageDialog clientId={clientId} open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  )
}

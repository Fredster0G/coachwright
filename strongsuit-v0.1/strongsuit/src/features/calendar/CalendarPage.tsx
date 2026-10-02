import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Plus, Calendar as CalendarIcon, Clock, MapPin, User, Repeat, CalendarClock, X,
  ChevronLeft, ChevronRight, List, LayoutGrid,
} from 'lucide-react'
import { Card, Button, Input, Select, EmptyState, Dialog, Label, Tag, Field, toast } from '@/design'
import { appointmentsRepo, clientsRepo, staffRepo, locationsRepo, messagesRepo } from '@/db/repo'
import { BookingRequestCard } from '@/features/clients/BookingRequestCard'
import { useTranslation } from '@/lib/i18n'
import type { Appointment, RecurrenceFreq, Client, Staff, Location } from '@/db/types'
import { nowIso, newId, fullName, today } from '@/lib/core'
import { expandAll, describeRule, type Occurrence } from '@/lib/schedule'
import {
  format, parseISO, addDays, addMonths, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay,
} from 'date-fns'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function NewAppointmentDialog({ open, onClose, staff, locations }: { open: boolean; onClose: () => void; staff: Staff[]; locations: Location[] }) {
  const clients = useLiveQuery(() => clientsRepo.active(), [], [])
  const [form, setForm] = useState({
    title: '', clientId: '', date: today(),
    time: '09:00', durationMinutes: '60', location: '', locationId: '', staffId: '', notes: '',
    repeat: 'none' as 'none' | RecurrenceFreq,
    ends: 'never' as 'never' | 'on' | 'after',
    until: '', count: '8',
    weekdays: [] as number[],
  })
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }))
  // Once a studio has real locations, new appointments use the structured
  // reference instead of typing the same address in every time — the free-
  // text field stays for a solo trainer with nothing to structure yet.
  const hasStructuredLocations = locations.length > 0

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const startObj = new Date(`${form.date}T${form.time}:00`)
    const endObj = new Date(startObj.getTime() + parseInt(form.durationMinutes) * 60000)
    const id = newId()

    const appt: Appointment = {
      id, createdAt: nowIso(), updatedAt: nowIso(),
      title: form.title || 'Session',
      clientId: form.clientId || undefined,
      start: startObj.toISOString(), end: endObj.toISOString(),
      location: hasStructuredLocations ? undefined : form.location,
      locationId: hasStructuredLocations ? (form.locationId || undefined) : undefined,
      staffId: form.staffId || undefined,
      notes: form.notes, status: 'scheduled',
    }
    if (form.repeat !== 'none') {
      appt.seriesId = id
      appt.recurrenceRule = {
        freq: form.repeat,
        byWeekday: form.repeat === 'weekly' && form.weekdays.length ? [...form.weekdays].sort() : undefined,
        until: form.ends === 'on' && form.until ? form.until : undefined,
        count: form.ends === 'after' ? Math.max(1, parseInt(form.count) || 1) : undefined,
      }
    }
    await appointmentsRepo.create(appt)
    toast(form.repeat === 'none' ? 'Appointment scheduled.' : 'Recurring series scheduled.')
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title="New appointment" width={520}>
      <form onSubmit={save} className="space-y-3">
        <div><Label>Title</Label><Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Training session" /></div>
        <div>
          <Label>Client (optional)</Label>
          <Select value={form.clientId} onChange={e => set('clientId', e.target.value)}>
            <option value="">— none —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><Label>Date</Label><Input type="date" required value={form.date} onChange={e => set('date', e.target.value)} /></div>
          <div><Label>Time</Label><Input type="time" required value={form.time} onChange={e => set('time', e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Duration (min)</Label><Input type="number" required value={form.durationMinutes} onChange={e => set('durationMinutes', e.target.value)} /></div>
          <div>
            <Label>Location</Label>
            {hasStructuredLocations ? (
              <Select value={form.locationId} onChange={e => set('locationId', e.target.value)}>
                <option value="">— unassigned —</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            ) : (
              <Input value={form.location} onChange={e => set('location', e.target.value)} />
            )}
          </div>
        </div>
        {staff.length > 0 && (
          <Field label="Coach" hint="optional">
            <Select value={form.staffId} onChange={e => set('staffId', e.target.value)}>
              <option value="">— unassigned —</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        )}

        {/* Recurrence */}
        <div className="rounded-card border border-line p-3">
          <div className="flex items-center gap-2">
            <Repeat size={14} className="text-verde-600" />
            <Label>Repeat</Label>
          </div>
          <Select value={form.repeat} onChange={e => set('repeat', e.target.value as typeof form.repeat)} className="mt-1">
            <option value="none">Doesn't repeat</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Monthly</option>
          </Select>

          {form.repeat === 'weekly' && (
            <div className="mt-2">
              <Label>On days (defaults to the start day)</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {WEEKDAYS.map((d, i) => (
                  <button
                    key={i} type="button"
                    onClick={() => set('weekdays', form.weekdays.includes(i) ? form.weekdays.filter(x => x !== i) : [...form.weekdays, i])}
                    className={`h-7 w-9 rounded-ctl border text-2xs font-medium ${form.weekdays.includes(i) ? 'border-transparent bg-verde-600 text-white' : 'border-line text-muted hover:bg-surface2'}`}
                  >{d}</button>
                ))}
              </div>
            </div>
          )}

          {form.repeat !== 'none' && (
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <Label>Ends</Label>
                <Select value={form.ends} onChange={e => set('ends', e.target.value as typeof form.ends)}>
                  <option value="never">Ongoing</option>
                  <option value="on">On date</option>
                  <option value="after">After N times</option>
                </Select>
              </div>
              {form.ends === 'on' && <div><Label>Until</Label><Input type="date" value={form.until} onChange={e => set('until', e.target.value)} /></div>}
              {form.ends === 'after' && <div><Label>Occurrences</Label><Input type="number" min="1" value={form.count} onChange={e => set('count', e.target.value)} /></div>}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">Schedule</Button>
        </div>
      </form>
    </Dialog>
  )
}

function RescheduleDialog({ occ, onClose }: { occ: Occurrence | null; onClose: () => void }) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  if (occ && !date) {
    setDate(occ.date)
    setTime(format(parseISO(occ.start), 'HH:mm'))
  }

  async function apply() {
    if (!occ) return
    const master = occ.appointment
    const newStart = new Date(`${date}T${time}:00`)
    const durationMs = new Date(master.end).getTime() - new Date(master.start).getTime()
    const newEnd = new Date(newStart.getTime() + durationMs)

    if (occ.isRecurring) {
      // skip the original date in the series + drop a one-off at the new time
      await appointmentsRepo.update(master.id, { exceptions: [...(master.exceptions ?? []), occ.date] })
      await appointmentsRepo.create({
        title: master.title, clientId: master.clientId, location: master.location, notes: master.notes,
        locationId: master.locationId, staffId: master.staffId,
        seriesId: master.seriesId ?? master.id, status: 'scheduled',
        start: newStart.toISOString(), end: newEnd.toISOString(),
      })
    } else {
      await appointmentsRepo.update(master.id, { start: newStart.toISOString(), end: newEnd.toISOString() })
    }
    toast('Rescheduled.')
    setDate(''); setTime('')
    onClose()
  }

  return (
    <Dialog open={!!occ} onClose={() => { setDate(''); setTime(''); onClose() }} title="Reschedule" width={380}>
      <div className="space-y-3">
        <p className="text-xs text-muted">{occ?.appointment.title} — {occ?.date}{occ?.isRecurring ? ' (this occurrence only)' : ''}</p>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>New date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><Label>New time</Label><Input type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => { setDate(''); setTime(''); onClose() }}>Cancel</Button>
          <Button variant="primary" onClick={apply}>Move it</Button>
        </div>
      </div>
    </Dialog>
  )
}

/** One appointment's full card — time, title, client, location, actions.
 *  Shared by the list view's day groups and the month view's selected-day panel. */
function OccurrenceCard({ o, client, staffMember, locationName, onReschedule, onSkip, onDelete }: {
  o: Occurrence
  client?: Client
  staffMember?: Staff
  locationName?: string
  onReschedule: (o: Occurrence) => void
  onSkip: (o: Occurrence) => void
  onDelete: (o: Occurrence) => void
}) {
  const locationLabel = locationName ?? o.appointment.location
  return (
    <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        <div className="pt-1 text-verde-600"><Clock size={20} strokeWidth={1.5} /></div>
        <div>
          <div className="font-mono tabular-nums text-lg font-semibold text-ink">{format(parseISO(o.start), 'h:mm a')}</div>
          <div className="text-2xs text-faint">{format(parseISO(o.start), 'h:mm a')} – {format(parseISO(o.end), 'h:mm a')}</div>
        </div>
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-ink">{o.appointment.title}</span>
          {o.isRecurring && <Tag><Repeat size={10} /> {describeRule(o.appointment.recurrenceRule)}</Tag>}
        </div>
        {client && <div className="mt-1 flex items-center text-sm text-muted"><User size={14} className="me-1.5" /> {fullName(client)}</div>}
        {locationLabel && <div className="mt-1 flex items-center text-sm text-muted"><MapPin size={14} className="me-1.5" /> {locationLabel}</div>}
        {staffMember && <div className="mt-1 flex items-center text-sm text-muted"><User size={14} className="me-1.5" /> {staffMember.name}</div>}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => onReschedule(o)} title="Reschedule"><CalendarClock size={15} /></Button>
        {o.isRecurring && <Button variant="ghost" size="sm" onClick={() => onSkip(o)} title="Cancel this occurrence"><X size={15} /></Button>}
        <Button variant="ghost" size="sm" className="text-ember-600" onClick={() => onDelete(o)} title={o.isRecurring ? 'Delete whole series' : 'Delete'}>
          {o.isRecurring ? 'Series' : <X size={15} />}
        </Button>
      </div>
    </Card>
  )
}

/** A real month grid — day cells with appointment pills, month navigation,
 *  click a day to see its full agenda below. */
function MonthGrid({ viewMonth, grouped, selectedDay, onSelectDay }: {
  viewMonth: Date
  grouped: Map<string, Occurrence[]>
  selectedDay: string | null
  onSelectDay: (day: string) => void
}) {
  const gridStart = startOfWeek(startOfMonth(viewMonth))
  const gridEnd = endOfWeek(endOfMonth(viewMonth))
  const gridDays = eachDayOfInterval({ start: gridStart, end: gridEnd })
  const today = new Date()

  return (
    <div className="overflow-hidden rounded-card border border-line">
      <div className="grid grid-cols-7 border-b border-line bg-surface2">
        {WEEKDAYS.map(d => (
          <div key={d} className="py-2 text-center text-2xs font-semibold uppercase tracking-wide text-faint">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {gridDays.map((day: Date) => {
          const dayStr = format(day, 'yyyy-MM-dd')
          const dayOccs = grouped.get(dayStr) ?? []
          const inMonth = isSameMonth(day, viewMonth)
          const isToday = isSameDay(day, today)
          const isSelected = dayStr === selectedDay
          return (
            <button
              key={dayStr}
              onClick={() => onSelectDay(dayStr)}
              className={`flex min-h-[84px] flex-col items-stretch gap-1 border-b border-e border-line p-1.5 text-start transition-colors last:border-e-0 [&:nth-child(7n)]:border-e-0 ${
                isSelected ? 'bg-verde-100/50' : 'hover:bg-surface2'
              } ${inMonth ? '' : 'bg-surface2/40'}`}
            >
              <span className={`self-start rounded-full px-1.5 text-xs font-medium tabular-nums ${
                isToday ? 'bg-verde-600 text-white' : inMonth ? 'text-ink' : 'text-faint'
              }`}>
                {format(day, 'd')}
              </span>
              <div className="space-y-0.5 overflow-hidden">
                {dayOccs.slice(0, 3).map((o, i) => (
                  <div key={o.appointment.id + i} className="truncate rounded bg-verde-600/15 px-1 py-0.5 text-2xs text-verde-700">
                    {format(parseISO(o.start), 'h:mma')} {o.appointment.title}
                  </div>
                ))}
                {dayOccs.length > 3 && <div className="px-1 text-2xs text-faint">+{dayOccs.length - 3} more</div>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function CalendarPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [reschedule, setReschedule] = useState<Occurrence | null>(null)
  const [view, setView] = useState<'month' | 'list'>('month')
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState<string | null>(format(new Date(), 'yyyy-MM-dd'))

  const allMasters = useLiveQuery(() => appointmentsRepo.masters(), [], [])
  const pendingBookings = useLiveQuery(() => messagesRepo.pendingBookings(), [], [])
  const { t } = useTranslation()
  const clients = useLiveQuery(() => clientsRepo.all(), [], [])
  const staff = useLiveQuery(() => staffRepo.all(), [], [])
  const locations = useLiveQuery(() => locationsRepo.all(), [], [])
  const [staffFilter, setStaffFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const clientMap = new Map(clients.map(c => [c.id, c]))
  const staffMap = new Map(staff.map(s => [s.id, s]))
  const locationMap = new Map(locations.map(l => [l.id, l]))

  const showScope = staff.length > 0 || locations.length > 0
  const masters = allMasters.filter(a =>
    (!staffFilter || a.staffId === staffFilter) && (!locationFilter || a.locationId === locationFilter),
  )

  // Month view needs the full visible grid (including lead/trail days from
  // adjacent months); list view shows a rolling window instead. Expand over
  // whichever range the active view actually needs.
  const monthGridStart = format(startOfWeek(startOfMonth(viewMonth)), 'yyyy-MM-dd')
  const monthGridEnd = format(endOfWeek(endOfMonth(viewMonth)), 'yyyy-MM-dd')
  const listRangeStart = format(addDays(new Date(), -7), 'yyyy-MM-dd')
  const listRangeEnd = format(addDays(new Date(), 60), 'yyyy-MM-dd')
  const rangeStart = view === 'month' ? monthGridStart : listRangeStart
  const rangeEnd = view === 'month' ? monthGridEnd : listRangeEnd
  const occurrences = useMemo(() => expandAll(masters, rangeStart, rangeEnd), [masters, rangeStart, rangeEnd])

  const grouped = useMemo(() => {
    const m = new Map<string, Occurrence[]>()
    for (const o of occurrences) {
      if (!m.has(o.date)) m.set(o.date, [])
      m.get(o.date)!.push(o)
    }
    for (const list of m.values()) list.sort((a, b) => a.start.localeCompare(b.start))
    return m
  }, [occurrences])
  const days = Array.from(grouped.keys()).sort()
  const selectedDayOccs = selectedDay ? (grouped.get(selectedDay) ?? []) : []

  async function skipOccurrence(o: Occurrence) {
    await appointmentsRepo.update(o.appointment.id, { exceptions: [...(o.appointment.exceptions ?? []), o.date] })
    toast('Occurrence canceled.')
  }
  async function deleteSeriesOrOne(o: Occurrence) {
    const m = o.appointment
    if (m.recurrenceRule) {
      const sid = m.seriesId ?? m.id
      const related = allMasters.filter(a => a.seriesId === sid || a.id === sid)
      for (const a of related) await appointmentsRepo.remove(a.id)
      toast('Series deleted.')
    } else {
      await appointmentsRepo.remove(m.id)
      toast('Appointment deleted.')
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Schedule</h1>
          <p className="mt-1 text-sm text-faint">
            {view === 'month' ? 'Recurring sessions expand automatically' : 'Next 60 days · recurring sessions expand automatically'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-ctl border border-line p-0.5">
            <Button size="sm" variant={view === 'month' ? 'primary' : 'ghost'} onClick={() => setView('month')} title="Month view">
              <LayoutGrid size={14} /> Month
            </Button>
            <Button size="sm" variant={view === 'list' ? 'primary' : 'ghost'} onClick={() => setView('list')} title="List view">
              <List size={14} /> List
            </Button>
          </div>
          <Button variant="primary" onClick={() => setDialogOpen(true)}><Plus size={16} className="me-2" /> New appointment</Button>
        </div>
      </div>

      {pendingBookings.length > 0 && (
        <Card>
          <p className="mb-2 text-sm font-semibold text-ink">{t('booking.pendingTitle')} · {pendingBookings.length}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {pendingBookings.map(m => (
              <div key={m.id}>
                <p className="text-xs font-medium text-muted">{clientMap.get(m.clientId) ? fullName(clientMap.get(m.clientId)!) : '—'}</p>
                <BookingRequestCard message={m} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {showScope && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          {staff.length > 0 && (
            <Field label="Coach">
              <Select className="!h-8 w-44" value={staffFilter} onChange={e => setStaffFilter(e.target.value)}>
                <option value="">All coaches</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          )}
          {locations.length > 0 && (
            <Field label="Location">
              <Select className="!h-8 w-44" value={locationFilter} onChange={e => setLocationFilter(e.target.value)}>
                <option value="">All locations</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
          )}
        </div>
      )}

      {occurrences.length === 0 && days.length === 0 && view === 'list' ? (
        <EmptyState icon={<CalendarIcon size={32} strokeWidth={1.5} />} title="Your schedule is clear" body="Book a session — set it to repeat weekly and it fills the calendar for you." action={<Button variant="primary" onClick={() => setDialogOpen(true)}><Plus size={14} /> New appointment</Button>} />
      ) : view === 'month' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setViewMonth((m: Date) => addMonths(m, -1))}><ChevronLeft size={16} /></Button>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-ink">{format(viewMonth, 'MMMM yyyy')}</h2>
              <Button variant="ghost" size="sm" onClick={() => { setViewMonth(startOfMonth(new Date())); setSelectedDay(format(new Date(), 'yyyy-MM-dd')) }}>Today</Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setViewMonth((m: Date) => addMonths(m, 1))}><ChevronRight size={16} /></Button>
          </div>

          <MonthGrid viewMonth={viewMonth} grouped={grouped} selectedDay={selectedDay} onSelectDay={setSelectedDay} />

          {selectedDay && (
            <div>
              <h3 className="mb-3 font-semibold text-muted">
                {selectedDay === format(new Date(), 'yyyy-MM-dd') ? 'Today · ' : ''}{format(parseISO(selectedDay), 'EEEE, MMM d')}
              </h3>
              {selectedDayOccs.length === 0 ? (
                <p className="text-sm text-faint">Nothing scheduled — click "New appointment" to book one.</p>
              ) : (
                <div className="space-y-3">
                  {selectedDayOccs.map((o, idx) => (
                    <OccurrenceCard
                      key={o.appointment.id + idx} o={o}
                      client={o.appointment.clientId ? clientMap.get(o.appointment.clientId) : undefined}
                      staffMember={o.appointment.staffId ? staffMap.get(o.appointment.staffId) : undefined}
                      locationName={o.appointment.locationId ? locationMap.get(o.appointment.locationId)?.name : undefined}
                      onReschedule={setReschedule} onSkip={skipOccurrence} onDelete={deleteSeriesOrOne}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {days.map(dayStr => {
            const isToday = dayStr === format(new Date(), 'yyyy-MM-dd')
            const isPast = dayStr < format(new Date(), 'yyyy-MM-dd')
            return (
              <div key={dayStr}>
                <h3 className={`mb-3 font-semibold ${isToday ? 'text-verde-600' : isPast ? 'text-faint' : 'text-muted'}`}>
                  {isToday ? 'Today · ' : ''}{format(parseISO(dayStr), 'EEEE, MMM d')}
                </h3>
                <div className="space-y-3">
                  {grouped.get(dayStr)!.map((o, idx) => (
                    <OccurrenceCard
                      key={o.appointment.id + idx} o={o}
                      client={o.appointment.clientId ? clientMap.get(o.appointment.clientId) : undefined}
                      staffMember={o.appointment.staffId ? staffMap.get(o.appointment.staffId) : undefined}
                      locationName={o.appointment.locationId ? locationMap.get(o.appointment.locationId)?.name : undefined}
                      onReschedule={setReschedule} onSkip={skipOccurrence} onDelete={deleteSeriesOrOne}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <NewAppointmentDialog open={dialogOpen} onClose={() => setDialogOpen(false)} staff={staff} locations={locations} />
      <RescheduleDialog occ={reschedule} onClose={() => setReschedule(null)} />
    </div>
  )
}

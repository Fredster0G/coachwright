import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Archive, ArchiveRestore, ClipboardList, PenLine, Smartphone, Link2, Printer, Tv, Mail, MessageCircle, Download, Bot } from 'lucide-react'
import { clientsRepo, logsRepo, clientNotesRepo, trainerRepo, programsRepo, exercisesRepo, staffRepo, locationsRepo, messagesRepo } from '@/db/repo'
import type { Client } from '@/db/types'
import { fullName, daysSince } from '@/lib/core'
import { exportClientPackage } from '@/db/portability'
import { downloadText } from '@/db/backup'
import {
  Button, Card, Tabs, Tag, Avatar, EmptyState, InjuryRibbon, toast, toastError,
  Dialog, Field, Input, Textarea, Select, Combobox, type ComboboxOption,
} from '@/design'
import LogsTab from './LogsTab'
import MetricsTab from './MetricsTab'
import OverviewTab from './OverviewTab'
import CheckInsTab from './CheckInsTab'
import BillingTab from './BillingTab'
import NutritionTab from './NutritionTab'
import FoodLogTab from './FoodLogTab'
import CoachingTab from './CoachingTab'
import MessagesTab from './MessagesTab'
import { generateCompanionFile } from '../companion/export'
import { useTranslation } from '@/lib/i18n'
import { ConnectCompanionDialog } from '@/features/account/ConnectCompanionDialog'
import { LOCAL_AI_ENABLED } from '@/lib/cloud/config'
import { canAddClient, hasPaidAccess } from '@/lib/membership'
import { nextProgramDay } from '@/lib/programDay'

function EditClientDialog({ client, open, onClose }: { client: Client; open: boolean; onClose: () => void }) {
  const staff = useLiveQuery(() => staffRepo.all(), [], [])
  const locations = useLiveQuery(() => locationsRepo.all(), [], [])
  const [form, setForm] = useState({
    firstName: client.firstName,
    lastName: client.lastName,
    email: client.email || '',
    phone: client.phone || '',
    goals: client.goals || '',
    injuries: client.injuries || '',
    staffId: client.staffId || '',
    locationId: client.locationId || '',
    leaderboardOptIn: client.leaderboardOptIn ?? false,
  })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [k]: e.target.value }))
  const { t } = useTranslation()

  async function save() {
    if (!form.firstName.trim()) return
    await clientsRepo.update(client.id, {
      ...form,
      staffId: form.staffId || undefined,
      locationId: form.locationId || undefined,
    })
    toast(t('clients.toast.updated', { name: form.firstName }))
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('clients.edit.title')} width={480}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('clients.new.firstName')}><Input autoFocus value={form.firstName} onChange={set('firstName')} /></Field>
        <Field label={t('clients.new.lastName')}><Input value={form.lastName} onChange={set('lastName')} /></Field>
        <Field label={t('clients.new.email')} hint={t('clients.new.optional')}><Input type="email" value={form.email} onChange={set('email')} /></Field>
        <Field label={t('clients.new.phone')} hint={t('clients.new.optional')}><Input value={form.phone} onChange={set('phone')} /></Field>
        <div className="col-span-2">
          <Field label={t('clients.new.goals')}><Textarea value={form.goals} onChange={set('goals')} /></Field>
        </div>
        <div className="col-span-2">
          <Field label={t('clients.new.injuries')} hint={t('clients.new.injuriesHint')}>
            <Textarea value={form.injuries} onChange={set('injuries')} />
          </Field>
        </div>
        {(staff.length > 0 || locations.length > 0) && (
          <>
            {staff.length > 0 && (
              <Field label={t('clients.edit.staff')} hint={t('clients.edit.staffHint')}>
                <Select value={form.staffId} onChange={set('staffId')}>
                  <option value="">{t('clients.edit.unassigned')}</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
            )}
            {locations.length > 0 && (
              <Field label={t('clients.edit.location')}>
                <Select value={form.locationId} onChange={set('locationId')}>
                  <option value="">{t('clients.edit.unassigned')}</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </Select>
              </Field>
            )}
          </>
        )}
        <div className="col-span-2">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={form.leaderboardOptIn} onChange={e => setForm(f => ({ ...f, leaderboardOptIn: e.target.checked }))} className="accent-[var(--verde-600)]" />
            {t('clients.edit.leaderboard')}
          </label>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>{t('action.cancel')}</Button>
        <Button variant="primary" onClick={save} disabled={!form.firstName.trim()}>{t('clients.edit.save')}</Button>
      </div>
    </Dialog>
  )
}

function NotesTab({ clientId }: { clientId: string }) {
  const notes = useLiveQuery(() => clientNotesRepo.forClient(clientId), [clientId])
  const [content, setContent] = useState('')
  const { t } = useTranslation()

  async function saveNote() {
    if (!content.trim()) return
    await clientNotesRepo.create({ clientId, content: content.trim() })
    setContent('')
    toast(t('clients.toast.noteSaved'))
  }

  if (notes === undefined) return <Card className="animate-pulse text-sm text-faint">{t('clients.notes.loading')}</Card>

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <Textarea 
          value={content} 
          onChange={e => setContent(e.target.value)} 
          placeholder={t('clients.notes.placeholder')} 
          className="min-h-[100px]"
        />
        <div className="mt-3 flex justify-end">
          <Button variant="primary" onClick={saveNote} disabled={!content.trim()}>{t('clients.notes.save')}</Button>
        </div>
      </Card>
      
      {notes.length === 0 ? (
        <EmptyState title={t('clients.notes.emptyTitle')} body={t('clients.notes.emptyBody')} />
      ) : (
        <div className="space-y-3">
          {notes.map(note => (
            <Card key={note.id}>
              <p className="mb-2 text-2xs font-mono tabular-nums text-muted">{new Date(note.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>
              <p className="text-sm text-ink whitespace-pre-wrap">{note.content}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function PrintOptionsDialog({ client, activeProgramId, open, onClose }: { client: Client; activeProgramId?: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onClose={onClose} title={t('clients.print.title')} width={400}>
      <div className="flex flex-col gap-2 py-2">
        <Button variant="ghost" className="justify-start" onClick={() => window.open(`#/print/progress/${client.id}`, '_blank')}>
          <Printer size={16} className="me-3 text-muted" /> {t('clients.print.progress')}
        </Button>
        <Button variant="ghost" className="justify-start" onClick={() => window.open(`#/print/intake/${client.id}`, '_blank')}>
          <Printer size={16} className="me-3 text-muted" /> {t('clients.print.intake')}
        </Button>
        <Button variant="ghost" className="justify-start" onClick={() => window.open(`#/print/messages/${client.id}`, '_blank')}>
          <Printer size={16} className="me-3 text-muted" /> {t('clients.print.messages')}
        </Button>
        {activeProgramId && (
          <Button variant="ghost" className="justify-start" onClick={() => window.open(`#/print/program/${client.id}/${activeProgramId}`, '_blank')}>
            <Printer size={16} className="me-3 text-muted" /> {t('clients.print.program')}
          </Button>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="ghost" onClick={onClose}>{t('action.close')}</Button>
      </div>
    </Dialog>
  )
}


const TABS = [
  { id: 'overview', labelKey: 'clients.tab.overview' },
  { id: 'coaching', labelKey: 'clients.tab.coaching' },
  { id: 'program', labelKey: 'clients.tab.program' },
  { id: 'logs', labelKey: 'clients.tab.logs' },
  { id: 'checkins', labelKey: 'clients.tab.checkins' },
  { id: 'metrics', labelKey: 'clients.tab.metrics' },
  { id: 'nutrition', labelKey: 'clients.tab.nutrition' },
  { id: 'foodlog', labelKey: 'clients.tab.foodlog' },
  { id: 'notes', labelKey: 'clients.tab.notes' },
  { id: 'messages', labelKey: 'clients.tab.messages' },
  { id: 'billing', labelKey: 'clients.tab.billing' },
]

export default function ClientDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const client = useLiveQuery(() => clientsRepo.get(id), [id])
  const allClients = useLiveQuery(() => clientsRepo.all(), [], [])
  const trainer = useLiveQuery(() => trainerRepo.get())
  // The client's current program (activeProgramId) first, then any active one.
  const activeProgram = useLiveQuery(async () => {
    const c = await clientsRepo.get(id)
    const current = c?.activeProgramId ? await programsRepo.get(c.activeProgramId) : undefined
    if (current && current.clientId === id && current.status === 'active') return current
    const progs = await programsRepo.forClient(id)
    return progs.find(p => p.status === 'active') || null
  }, [id])
  const programLogs = useLiveQuery(() => logsRepo.forClient(id), [id], [])

  const lastLog = useLiveQuery(() => logsRepo.lastForClient(id), [id])
  const [tab, setTab] = useState('overview')
  const [showEdit, setShowEdit] = useState(false)
  const [showSync, setShowSync] = useState(false)
  const [showPrint, setShowPrint] = useState(false)
  const { t } = useTranslation()

  if (client === undefined || trainer === undefined) return <Card className="animate-pulse text-sm text-faint">{t('clients.detail.loading')}</Card>
  if (!client) {
    return (
      <EmptyState
        title={t('clients.detail.notFoundTitle')}
        body={t('clients.detail.notFoundBody')}
        action={<Link to="/clients"><Button>{t('clients.detail.backToClients')}</Button></Link>}
      />
    )
  }

  const lastSessionDays = daysSince(lastLog ? `${lastLog.date}T00:00:00` : undefined)

  const switcherOptions: ComboboxOption[] = allClients
    .slice()
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
    .map(c => ({ value: c.id, label: fullName(c) }))
  const switcherValue: ComboboxOption = { value: client.id, label: fullName(client) }

  async function archive() {
    await clientsRepo.archive(client!.id)
    toast(t('clients.toast.archivedDetails', { name: client!.firstName }))
  }

  // Archiving had no way back. Restoring makes an active client again, so it
  // passes the same free-tier gate as adding one.
  async function restore() {
    const active = allClients.filter(c => c.status === 'active' && !c.isDemo).length
    const cap = canAddClient(active, !!trainer && hasPaidAccess(trainer))
    if (!cap.allowed) { toastError(cap.reason ?? ''); return }
    await clientsRepo.update(client!.id, { status: 'active', archivedAt: undefined })
    toast(t('clients.toast.restored', { name: client!.firstName }))
  }

  async function exportPortableData() {
    const pkg = await exportClientPackage(client!.id)
    downloadText(`${fullName(client!).replace(/\s+/g, '-').toLowerCase()}.cwclient.json`, JSON.stringify(pkg, null, 2))
    toast(t('clients.toast.exportedDetails'))
  }

  return (
    <div>
      <Link to="/clients" className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink">
        <ArrowLeft size={13} /> {t('clients.title')}
      </Link>

      {/* Wraps: the action row drops below the name on narrow screens instead
          of running off the edge (DEBT-24, S24). */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Avatar person={client} src={client.photoDataUrl} size={44} />
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight">{fullName(client)}</h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <Tag tone={client.status === 'active' ? 'verde' : 'neutral'}>{client.status}</Tag>
              <span className="font-mono tabular-nums text-2xs text-faint">{t('clients.detail.since', { date: client.startDate })}</span>
              {client.email && (
                <a href={`mailto:${client.email}`} className="text-faint hover:text-verde-600" title={t('clients.detail.emailTooltip', { email: client.email })}>
                  <Mail size={13} />
                </a>
              )}
              {client.phone && (
                <a href={`sms:${client.phone}`} className="text-faint hover:text-verde-600" title={t('clients.detail.textTooltip', { phone: client.phone })}>
                  <MessageCircle size={13} />
                </a>
              )}
            </div>
          </div>
          {switcherOptions.length > 1 && (
            <div className="w-48">
              <Combobox
                options={switcherOptions}
                value={switcherValue}
                onChange={o => { if (o.value !== client.id) navigate(`/clients/${o.value}`) }}
                placeholder={t('clients.detail.switchClient')}
              />
            </div>
          )}
        </div>
        {client.status !== 'archived' && (
          <div className="flex flex-wrap items-center gap-2">
            {activeProgram && (
              <Button variant="ghost" size="sm" onClick={() => window.open(`#/tv/${client.id}`, '_blank')} title={t('clients.detail.tvModeTooltip')}>
                <Tv size={14} className="me-1.5" /> {t('clients.detail.tvMode')}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setShowPrint(true)}>
              <Printer size={14} className="me-1.5" /> {t('clients.detail.print')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowSync(true)}>
              <Link2 size={14} className="me-1.5" /> {t('clients.detail.connectCompanion')}
            </Button>
            <Button variant="primary" size="sm" onClick={() => {
              // The day after the last one logged — this always opened Week 1 ·
              // Day 1, so later weeks were logged against week 1's targets.
              const next = activeProgram ? nextProgramDay(activeProgram, programLogs) : null
              if (activeProgram && next) {
                navigate(`/log?clientId=${client.id}&programId=${activeProgram.id}&weekId=${next.weekId}&dayId=${next.dayId}`)
              } else {
                navigate(`/log?clientId=${client.id}`)
              }
            }}>
              <PenLine size={14} className="me-1.5" /> {t('clients.detail.logSession')}
            </Button>
            {LOCAL_AI_ENABLED && (
              <Button variant="ghost" size="sm" onClick={() => navigate(`/assistant?clientId=${client.id}`)} title={t('clients.detail.askAssistantTooltip')}>
                <Bot size={14} className="me-1.5" /> {t('clients.detail.askAssistant')}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setShowEdit(true)}>{t('clients.detail.edit')}</Button>
            <Button variant="ghost" size="sm" onClick={exportPortableData} title={t('clients.detail.exportDataTooltip')}>
              <Download size={14} className="me-1.5" /> {t('clients.detail.exportData')}
            </Button>
            <Button variant="ghost" size="sm" onClick={archive}><Archive size={14} /> {t('clients.detail.archive')}</Button>
          </div>
        )}
        {client.status === 'archived' && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">{t('clients.detail.archivedNote')}</span>
            <Button variant="secondary" size="sm" onClick={restore}><ArchiveRestore size={14} /> {t('clients.detail.restore')}</Button>
          </div>
        )}
      </div>

      {client.injuries && <div className="mb-4"><InjuryRibbon text={client.injuries} /></div>}

      {client.status !== 'archived' && (!client.screening || !client.screening.cleared) && (
        <button
          onClick={() => setTab('coaching')}
          className="mb-4 flex w-full items-start gap-2 rounded-ctl border border-ember-500/30 bg-ember-500/10 px-3 py-2 text-start text-xs text-ember-600"
        >
          <span className="mt-px font-semibold uppercase tracking-wide">{t('clients.detail.safety')}</span>
          <span className="text-ink">
            {!client.screening
              ? t('clients.detail.safetyNoScreening')
              : t('clients.detail.safetyFlagged')}
          </span>
        </button>
      )}

      <Tabs tabs={TABS.map(tab => ({ ...tab, label: t(tab.labelKey as any) }))} active={tab} onChange={setTab} />

      <div className="pt-4">
        {tab === 'overview' && (
          <OverviewTab 
            client={client} 
            lastSessionDays={lastSessionDays} 
            activeProgram={activeProgram || null}
            weekStartsOn={trainer.weekStartsOn}
          />
        )}
        {tab === 'program' && (
          activeProgram ? (
            <Card>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{activeProgram.name}</h3>
                  <p className="text-sm text-faint mt-1">{activeProgram.description || t('clients.detail.noDescription')}</p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="primary" 
                    onClick={async () => {
                      if (!client || !activeProgram || !trainer) return
                      const [exercises, messages] = await Promise.all([
                        exercisesRepo.all(),
                        messagesRepo.forClient(client.id)
                      ])
                      generateCompanionFile(client, activeProgram, trainer, exercises, messages)
                    }}
                  >
                    <Smartphone size={16} className="me-2" /> {t('clients.detail.exportCompanion')}
                  </Button>
                </div>
              </div>
              <div className="mt-6 border-t border-line pt-4 flex gap-4">
                <Link to={`/programs/${activeProgram.id}`}><Button variant="ghost" size="sm">{t('clients.detail.editProgram')}</Button></Link>
              </div>
            </Card>
          ) : (
            <EmptyState
              icon={<ClipboardList size={28} strokeWidth={1.25} />}
              title={t('clients.detail.noProgramTitle')}
              body={t('clients.detail.noProgramBody')}
              action={<Link to="/programs"><Button variant="primary">{t('clients.detail.openProgramBuilder')}</Button></Link>}
            />
          )
        )}
        {tab === 'logs' && (
          <LogsTab clientId={client.id} clientUnits={trainer?.units || 'lb'} />
        )}
        {tab === 'checkins' && (
          <CheckInsTab clientId={client.id} />
        )}
        {tab === 'metrics' && (
          <MetricsTab clientId={client.id} units={trainer.units} trainingGoal={client.trainingGoal} />
        )}
        {tab === 'coaching' && (
          <CoachingTab client={client} units={trainer.units} />
        )}
        {tab === 'nutrition' && (
          <NutritionTab client={client} units={trainer.units} />
        )}
        {tab === 'foodlog' && (
          <FoodLogTab client={client} />
        )}
        {tab === 'notes' && (
          <NotesTab clientId={client.id} />
        )}
        {tab === 'messages' && (
          <MessagesTab clientId={client.id} />
        )}
        {tab === 'billing' && (
          <BillingTab clientId={client.id} client={client} />
        )}
      </div>

      {/* Mounted per open: the form seeds from `client` once, so an always-mounted
          dialog reopened later showed stale values and saving reverted newer edits. */}
      {showEdit && <EditClientDialog client={client} open onClose={() => setShowEdit(false)} />}
      <PrintOptionsDialog client={client} activeProgramId={activeProgram?.id} open={showPrint} onClose={() => setShowPrint(false)} />
      {client && (
        <ConnectCompanionDialog clientId={client.id} clientName={client.firstName} open={showSync} onClose={() => setShowSync(false)} />
      )}
    </div>
  )
}

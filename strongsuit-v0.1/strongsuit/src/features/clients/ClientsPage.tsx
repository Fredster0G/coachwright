import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Users, Plus, Search, Upload, ChevronUp, ChevronDown, Tags, Download, Archive } from 'lucide-react'
import { clientsRepo, logsRepo, programsRepo, trainerRepo } from '@/db/repo'
import type { Client, ClientStatus } from '@/db/types'
import { fullName, today } from '@/lib/core'
import { importClientPackageText, exportClientPackage } from '@/db/portability'
import { downloadText } from '@/db/backup'
import { parseCsv } from '@/lib/csv'
import { currentWeekSessionCount } from '@/lib/analytics'
import { canAddClient, hasPaidAccess } from '@/lib/membership'
import { useTranslation } from '@/lib/i18n'
import ImportCsvDialog from './ImportCsvDialog'
import {
  Button, Input, Field, Textarea, Card, SectionHeader,
  EmptyState, Tag, Avatar, Dialog, Table, toast, toastError,
  SegmentedControl, Checkbox, Progress,
} from '@/design'

const STATUS_TONE: Record<ClientStatus, 'verde' | 'neutral' | 'red'> = {
  active: 'verde', paused: 'neutral', archived: 'red',
}

const STATUS_FILTERS = [
  { value: 'all', labelKey: 'clients.filter.all' },
  { value: 'active', labelKey: 'clients.filter.active' },
  { value: 'paused', labelKey: 'clients.filter.paused' },
  { value: 'archived', labelKey: 'clients.filter.archived' },
]

type SortKey = 'name' | 'status' | 'adherence' | 'started'

function SortHeader({ label, sortKey, active, dir, onClick }: {
  label: string; sortKey: SortKey; active: SortKey; dir: 'asc' | 'desc'; onClick: (k: SortKey) => void
}) {
  const isActive = active === sortKey
  return (
    <th>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className="flex items-center gap-1 text-start hover:text-ink"
      >
        {label}
        {isActive && (dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </button>
    </th>
  )
}

function NewClientDialog({ open, onClose, activeClientCount, hasActiveMembership }: {
  open: boolean; onClose: () => void; activeClientCount: number; hasActiveMembership: boolean
}) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', goals: '', injuries: '' })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [k]: e.target.value }))
  const cap = canAddClient(activeClientCount, hasActiveMembership)
  const { t } = useTranslation()

  async function save() {
    if (!form.firstName.trim() || !cap.allowed) return
    await clientsRepo.create({
      ...form,
      status: 'active', parqNotes: '', tags: [], startDate: today(),
    } as Omit<Client, 'id' | 'createdAt' | 'updatedAt'>)
    toast(t('clients.toast.added', { name: form.firstName }))
    setForm({ firstName: '', lastName: '', email: '', phone: '', goals: '', injuries: '' })
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('clients.new.title')} width={480}>
      {!cap.allowed && (
        <Card className="mb-3 border-red-600/40 bg-red-100/40 text-sm text-red-700">
          <p>{cap.reason}</p>
          <Link to="/settings" onClick={onClose} className="mt-1 inline-block text-sm font-medium underline">
            {t('clients.new.upgradeLink')}
          </Link>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('clients.new.firstName')}><Input autoFocus value={form.firstName} onChange={set('firstName')} disabled={!cap.allowed} /></Field>
        <Field label={t('clients.new.lastName')}><Input value={form.lastName} onChange={set('lastName')} disabled={!cap.allowed} /></Field>
        <Field label={t('clients.new.email')} hint={t('clients.new.optional')}><Input type="email" value={form.email} onChange={set('email')} disabled={!cap.allowed} /></Field>
        <Field label={t('clients.new.phone')} hint={t('clients.new.optional')}><Input value={form.phone} onChange={set('phone')} disabled={!cap.allowed} /></Field>
        <div className="col-span-2">
          <Field label={t('clients.new.goals')}><Textarea value={form.goals} onChange={set('goals')} placeholder={t('clients.new.goalsPlaceholder')} disabled={!cap.allowed} /></Field>
        </div>
        <div className="col-span-2">
          <Field label={t('clients.new.injuries')} hint={t('clients.new.injuriesHint')}>
            <Textarea value={form.injuries} onChange={set('injuries')} disabled={!cap.allowed} />
          </Field>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>{t('action.cancel')}</Button>
        <Button variant="primary" onClick={save} disabled={!form.firstName.trim() || !cap.allowed}>{t('clients.new.addClient')}</Button>
      </div>
    </Dialog>
  )
}

export default function ClientsPage() {
  const clients = useLiveQuery(() => clientsRepo.all(), [], undefined)
  const logs = useLiveQuery(() => logsRepo.all(), [], [])
  const programs = useLiveQuery(() => programsRepo.all(), [], [])
  const trainer = useLiveQuery(() => trainerRepo.get())
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ClientStatus>('all')
  const [showNew, setShowNew] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const [csvImport, setCsvImport] = useState<{ headerRow: string[]; dataRows: string[][] } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [tagPromptOpen, setTagPromptOpen] = useState(false)
  const [tagValue, setTagValue] = useState('')
  const { t } = useTranslation()

  const weekStartsOn = trainer?.weekStartsOn ?? 1
  const programMap = useMemo(() => new Map(programs.map(p => [p.id, p])), [programs])

  const adherenceOf = (c: Client) => {
    const activeProgram = c.activeProgramId ? programMap.get(c.activeProgramId) : undefined
    const prescribed = activeProgram ? Math.max(1, activeProgram.weeks[0]?.days?.length || 1) : 3
    const clientLogs = logs.filter(l => l.clientId === c.id)
    const done = currentWeekSessionCount(clientLogs, weekStartsOn, today())
    return { done, prescribed }
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }

  function toggleSelected(id: string) {
    setSelected(s => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function bulkArchive() {
    const ids = [...selected]
    for (const id of ids) await clientsRepo.archive(id)
    toast(ids.length === 1 ? t('clients.toast.archived', { count: ids.length }) : t('clients.toast.archivedPlural', { count: ids.length }))
    setSelected(new Set())
  }

  async function bulkExport() {
    const ids = [...selected]
    const packages = []
    for (const id of ids) packages.push(await exportClientPackage(id))
    downloadText(`roster-export-${today()}.cwclient.json`, JSON.stringify(packages, null, 2))
    toast(ids.length === 1 ? t('clients.toast.exported', { count: ids.length }) : t('clients.toast.exportedPlural', { count: ids.length }))
  }

  async function bulkTag() {
    const tag = tagValue.trim()
    if (!tag) return
    const ids = [...selected]
    for (const id of ids) {
      const c = clients?.find(c => c.id === id)
      if (!c) continue
      if (!c.tags.includes(tag)) await clientsRepo.update(id, { tags: [...c.tags, tag] })
    }
    toast(ids.length === 1 ? t('clients.toast.tagged', { count: ids.length, tag }) : t('clients.toast.taggedPlural', { count: ids.length, tag }))
    setTagValue('')
    setTagPromptOpen(false)
    setSelected(new Set())
  }

  async function onImportFile(file: File) {
    const text = await file.text()
    const isJson = file.name.toLowerCase().endsWith('.json') || text.trimStart().startsWith('{') || text.trimStart().startsWith('[')
    if (isJson) {
      try {
        const reports = await importClientPackageText(text)
        toast(reports.length === 1
          ? t('clients.toast.importOne', { name: reports[0].clientName, count: reports[0].recordsImported })
          : t('clients.toast.importMany', { count: reports.length }))
      } catch (e) {
        toastError(e instanceof Error ? e.message : t('clients.toast.importError'))
      }
      return
    }
    const rows = parseCsv(text)
    if (rows.length < 2) {
      toastError(t('clients.toast.csvNoData'))
      return
    }
    setCsvImport({ headerRow: rows[0], dataRows: rows.slice(1) })
  }

  const filtered = useMemo(() => {
    if (!clients) return []
    const q = query.trim().toLowerCase()
    const dir = sortDir === 'asc' ? 1 : -1
    return clients
      .filter(c => (statusFilter === 'all' ? c.status !== 'archived' : c.status === statusFilter))
      .filter(c => !q || fullName(c).toLowerCase().includes(q) || c.tags.some(t => t.toLowerCase().includes(q)))
      .sort((a, b) => {
        switch (sortKey) {
          case 'status':
            return dir * a.status.localeCompare(b.status)
          case 'started':
            return dir * a.startDate.localeCompare(b.startDate)
          case 'adherence': {
            const av = adherenceOf(a), bv = adherenceOf(b)
            return dir * ((av.done / av.prescribed) - (bv.done / bv.prescribed))
          }
          case 'name':
          default:
            return dir * (a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, query, statusFilter, sortKey, sortDir, logs, programMap, weekStartsOn])

  const loading = clients === undefined
  // Sample clients from onboarding (db/demo.ts) — the wizard promises they
  // can be removed in one click; this is that click.
  const demoCount = clients?.filter(c => c.isDemo).length ?? 0

  return (
    <div>
      <SectionHeader
        title={t('clients.title')}
        action={
          <div className="flex items-center gap-2">
            <input
              ref={importRef} type="file" accept=".json,application/json,.csv,text/csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onImportFile(f); e.target.value = '' }}
            />
            <Button variant="ghost" size="sm" onClick={() => importRef.current?.click()} title={t('clients.importTooltip')}>
              <Upload size={14} /> {t('clients.import')}
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowNew(true)}>
              <Plus size={14} /> {t('clients.newClient')}
            </Button>
          </div>
        }
      />

      {demoCount > 0 && (
        <Card className="mb-3 flex flex-wrap items-center justify-between gap-2 py-2.5">
          <span className="text-sm text-muted">{t('clients.demo.banner', { count: demoCount })}</span>
          <Button size="sm" variant="ghost" className="text-ember-600" onClick={async () => {
            if (!window.confirm(t('clients.demo.confirm'))) return
            await clientsRepo.purgeDemo()
            toast(t('clients.demo.removed'))
          }}>{t('clients.demo.remove')}</Button>
        </Card>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <Input className="ps-8" placeholder={t('clients.searchPlaceholder')} value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <SegmentedControl options={STATUS_FILTERS.map(f => ({ ...f, label: t(f.labelKey as any) }))} value={statusFilter} onChange={v => setStatusFilter(v as never)} />
      </div>

      {selected.size > 0 && (
        <Card className="mb-3 flex items-center justify-between gap-3 bg-surface2">
          <span className="text-xs font-medium text-muted">{t('clients.selectedCount', { count: selected.size })}</span>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setTagPromptOpen(true)}><Tags size={14} /> {t('clients.action.tag')}</Button>
            <Button size="sm" onClick={bulkExport}><Download size={14} /> {t('clients.action.export')}</Button>
            <Button size="sm" onClick={bulkArchive}><Archive size={14} /> {t('clients.action.archive')}</Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>{t('clients.action.clear')}</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <Card className="animate-pulse text-sm text-faint">{t('clients.loading')}</Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Users size={28} strokeWidth={1.25} />}
          title={query ? t('clients.empty.searchTitle') : t('clients.empty.noClientsTitle')}
          body={query ? t('clients.empty.searchBody') : t('clients.empty.noClientsBody')}
          action={!query && <Button variant="primary" onClick={() => setShowNew(true)}><Plus size={14} /> {t('clients.empty.addFirstClient')}</Button>}
        />
      ) : (
        <Table head={<>
          <th className="w-8">
            <Checkbox
              checked={filtered.length > 0 && filtered.every(c => selected.has(c.id))}
              onChange={checked => setSelected(checked ? new Set(filtered.map(c => c.id)) : new Set())}
              label={t('clients.selectAll')}
            />
          </th>
          <SortHeader label={t('clients.col.client')} sortKey="name" active={sortKey} dir={sortDir} onClick={toggleSort} />
          <SortHeader label={t('clients.col.status')} sortKey="status" active={sortKey} dir={sortDir} onClick={toggleSort} />
          <SortHeader label={t('clients.col.adherence')} sortKey="adherence" active={sortKey} dir={sortDir} onClick={toggleSort} />
          <th>{t('clients.col.goals')}</th>
          <SortHeader label={t('clients.col.started')} sortKey="started" active={sortKey} dir={sortDir} onClick={toggleSort} />
        </>}>
          {filtered.map(c => {
            const { done, prescribed } = adherenceOf(c)
            return (
              <tr key={c.id}>
                <td>
                  <Checkbox checked={selected.has(c.id)} onChange={() => toggleSelected(c.id)} label={t('clients.selectClient', { name: fullName(c) })} />
                </td>
                <td>
                  <Link to={`/clients/${c.id}`} className="flex items-center gap-2.5 font-medium text-ink hover:text-verde-600">
                    <Avatar person={c} src={c.photoDataUrl} size={28} />
                    {fullName(c)}
                  </Link>
                </td>
                <td><Tag tone={STATUS_TONE[c.status]}>{c.status}</Tag></td>
                <td className="w-32">
                  <div className="flex items-center gap-2">
                    <Progress value={done} max={prescribed} className="w-16" />
                    <span className="font-mono tabular-nums text-2xs text-faint">{done}/{prescribed}</span>
                  </div>
                </td>
                <td className="max-w-[280px] truncate text-muted">{c.goals || '—'}</td>
                <td className="font-mono tabular-nums text-xs text-muted">{c.startDate}</td>
              </tr>
            )
          })}
        </Table>
      )}

      <NewClientDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        activeClientCount={clients?.filter(c => c.status === 'active' && !c.isDemo).length ?? 0}
        hasActiveMembership={!!trainer && hasPaidAccess(trainer)}
      />
      {csvImport && (
        <ImportCsvDialog
          headerRow={csvImport.headerRow}
          dataRows={csvImport.dataRows}
          open={!!csvImport}
          onClose={() => setCsvImport(null)}
          activeClientCount={clients?.filter(c => c.status === 'active' && !c.isDemo).length ?? 0}
          hasActiveMembership={!!trainer && hasPaidAccess(trainer)}
        />
      )}
      <Dialog open={tagPromptOpen} onClose={() => setTagPromptOpen(false)} title={selected.size === 1 ? t('clients.tag.title', { count: selected.size }) : t('clients.tag.titlePlural', { count: selected.size })} width={360}>
        <Field label={t('clients.tag.label')}><Input autoFocus value={tagValue} onChange={e => setTagValue(e.target.value)} placeholder={t('clients.tag.placeholder')} /></Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setTagPromptOpen(false)}>{t('action.cancel')}</Button>
          <Button variant="primary" onClick={bulkTag} disabled={!tagValue.trim()}>{t('clients.tag.apply')}</Button>
        </div>
      </Dialog>
    </div>
  )
}

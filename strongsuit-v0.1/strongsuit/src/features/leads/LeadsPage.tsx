import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { UserPlus, Plus, ArrowRight, Trash2, CheckCircle2 } from 'lucide-react'
import { Card, SectionHeader, Button, EmptyState, Dialog, Field, Input, Textarea, Select, toast } from '@/design'
import { leadsRepo, clientsRepo, staffRepo, locationsRepo } from '@/db/repo'
import type { Lead, LeadStage, Staff, Location } from '@/db/types'
import { today } from '@/lib/core'
import { useTranslation, type MessageKey } from '@/lib/i18n'

const STAGES: { id: LeadStage; labelKey: MessageKey }[] = [
  { id: 'new', labelKey: 'leads.stage.new' },
  { id: 'contacted', labelKey: 'leads.stage.contacted' },
  { id: 'trial', labelKey: 'leads.stage.trial' },
  { id: 'won', labelKey: 'leads.stage.won' },
  { id: 'lost', labelKey: 'leads.stage.lost' },
]

function AddLeadDialog({ open, onClose, staff, locations }: { open: boolean; onClose: () => void; staff: Staff[]; locations: Location[] }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({ name: '', email: '', phone: '', source: '', notes: '', staffId: '', locationId: '' })
  async function save() {
    if (!form.name.trim()) return
    await leadsRepo.create({
      name: form.name.trim(), email: form.email.trim() || undefined, phone: form.phone.trim() || undefined,
      source: form.source.trim() || undefined, notes: form.notes.trim() || undefined, stage: 'new',
      staffId: form.staffId || undefined, locationId: form.locationId || undefined,
    })
    toast(t('leads.toast.added', { name: form.name }))
    setForm({ name: '', email: '', phone: '', source: '', notes: '', staffId: '', locationId: '' })
    onClose()
  }
  const showRouting = staff.length > 0 || locations.length > 0
  return (
    <Dialog open={open} onClose={onClose} title={t('leads.add')} width={460}>
      <div className="space-y-3">
        <Field label={t('leads.form.name')}><Input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('leads.form.email')} hint={t('leads.form.optional')}><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></Field>
          <Field label={t('leads.form.phone')} hint={t('leads.form.optional')}><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></Field>
        </div>
        <Field label={t('leads.form.source')} hint={t('leads.form.sourceHint')}><Input value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} /></Field>
        {showRouting && (
          <div className="grid grid-cols-2 gap-3">
            {staff.length > 0 && (
              <Field label={t('leads.form.routeTo')} hint={t('leads.form.optional')}>
                <Select value={form.staffId} onChange={e => setForm(f => ({ ...f, staffId: e.target.value }))}>
                  <option value="">{t('leads.form.unassigned')}</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
            )}
            {locations.length > 0 && (
              <Field label={t('leads.form.location')} hint={t('leads.form.optional')}>
                <Select value={form.locationId} onChange={e => setForm(f => ({ ...f, locationId: e.target.value }))}>
                  <option value="">{t('leads.form.unassigned')}</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </Select>
              </Field>
            )}
          </div>
        )}
        <Field label={t('leads.form.notes')}><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>{t('leads.cancel')}</Button>
          <Button variant="primary" onClick={save} disabled={!form.name.trim()}>{t('leads.add')}</Button>
        </div>
      </div>
    </Dialog>
  )
}

function ConvertDialog({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const { t } = useTranslation()
  const [rate, setRate] = useState('')
  async function convert() {
    if (!lead) return
    const client = await clientsRepo.create({
      firstName: lead.name.split(' ')[0] || lead.name,
      lastName: lead.name.split(' ').slice(1).join(' ') || '',
      email: lead.email, phone: lead.phone, status: 'active',
      goals: lead.notes || '', injuries: '', parqNotes: '', tags: [],
      startDate: today(), sessionRate: rate ? Number(rate) : undefined,
      // Whichever coach/location was already working this lead keeps the
      // client — the routing shouldn't reset itself just because the lead
      // converted.
      staffId: lead.staffId, locationId: lead.locationId,
    })
    await leadsRepo.update(lead.id, { stage: 'won', convertedClientId: client.id })
    toast(t('leads.toast.converted', { name: lead.name }))
    setRate('')
    onClose()
  }
  return (
    <Dialog open={!!lead} onClose={onClose} title={t('leads.convertTitle')} width={380}>
      <div className="space-y-3">
        <p className="text-sm text-muted">{t('leads.convertBody', { name: lead?.name ?? '' })}</p>
        <Field label={t('leads.form.rate')} hint={t('leads.form.rateHint')}><Input type="number" min="0" value={rate} onChange={e => setRate(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('leads.cancel')}</Button>
          <Button variant="primary" onClick={convert}><CheckCircle2 size={14} /> {t('leads.convert')}</Button>
        </div>
      </div>
    </Dialog>
  )
}

export default function LeadsPage() {
  const { t } = useTranslation()
  const [addOpen, setAddOpen] = useState(false)
  const [converting, setConverting] = useState<Lead | null>(null)
  const leads = useLiveQuery(() => leadsRepo.all(), [], [])
  const staff = useLiveQuery(() => staffRepo.all(), [], [])
  const locations = useLiveQuery(() => locationsRepo.all(), [], [])
  const [staffFilter, setStaffFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const staffMap = new Map(staff.map(s => [s.id, s]))
  const locationMap = new Map(locations.map(l => [l.id, l]))

  const showScope = staff.length > 0 || locations.length > 0
  const scoped = leads.filter(l =>
    (!staffFilter || l.staffId === staffFilter) && (!locationFilter || l.locationId === locationFilter),
  )

  const byStage = (stage: LeadStage) => scoped.filter(l => l.stage === stage).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const advance = async (lead: Lead) => {
    const order: LeadStage[] = ['new', 'contacted', 'trial', 'won']
    const idx = order.indexOf(lead.stage)
    if (lead.stage === 'trial') { setConverting(lead); return }
    if (idx >= 0 && idx < order.length - 1) {
      await leadsRepo.update(lead.id, { stage: order[idx + 1] })
      toast(t('leads.toast.moved', { name: lead.name, stage: t(STAGES.find(s => s.id === order[idx + 1])!.labelKey) }))
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <SectionHeader title={t('leads.title')} action={<Button variant="primary" onClick={() => setAddOpen(true)}><Plus size={14} /> {t('leads.add')}</Button>} />

      {showScope && leads.length > 0 && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          {staff.length > 0 && (
            <Field label={t('leads.filter.coach')}>
              <Select className="!h-8 w-44" value={staffFilter} onChange={e => setStaffFilter(e.target.value)}>
                <option value="">{t('leads.filter.allCoaches')}</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          )}
          {locations.length > 0 && (
            <Field label={t('leads.form.location')}>
              <Select className="!h-8 w-44" value={locationFilter} onChange={e => setLocationFilter(e.target.value)}>
                <option value="">{t('leads.filter.allLocations')}</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
          )}
        </div>
      )}

      {leads.length === 0 ? (
        <EmptyState
          icon={<UserPlus size={28} strokeWidth={1.5} />}
          title={t('leads.emptyTitle')}
          body={t('leads.emptyBody')}
          action={<Button variant="primary" onClick={() => setAddOpen(true)}><Plus size={14} /> {t('leads.addFirst')}</Button>}
        />
      ) : scoped.length === 0 ? (
        <EmptyState
          icon={<UserPlus size={28} strokeWidth={1.5} />}
          title={t('leads.noMatchTitle')}
          body={t('leads.noMatchBody')}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {STAGES.map(stage => (
            <div key={stage.id}>
              <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-faint">{t(stage.labelKey)} · {byStage(stage.id).length}</h3>
              <div className="space-y-2">
                {byStage(stage.id).map(lead => (
                  <Card key={lead.id} pad={false} className="p-3">
                    <div className="text-sm font-medium text-ink">{lead.name}</div>
                    {lead.source && <div className="text-2xs text-faint">{t('leads.via', { source: lead.source })}</div>}
                    {lead.notes && <div className="mt-1 line-clamp-2 text-2xs text-muted">{lead.notes}</div>}
                    {(lead.staffId || lead.locationId) && (
                      <div className="mt-1 text-2xs text-faint">
                        {lead.staffId && (staffMap.get(lead.staffId)?.name ?? t('leads.unassignedCoach'))}
                        {lead.staffId && lead.locationId && ' · '}
                        {lead.locationId && (locationMap.get(lead.locationId)?.name ?? t('leads.unassignedLocation'))}
                      </div>
                    )}
                    {showScope && (
                      <div className="mt-1.5 flex gap-1">
                        {staff.length > 0 && (
                          <Select
                            value={lead.staffId ?? ''}
                            onChange={e => leadsRepo.update(lead.id, { staffId: e.target.value || undefined })}
                            className="!h-6 min-w-0 flex-1 !px-1.5 !pe-5 text-2xs text-muted"
                            title={t('leads.routeCoach')} aria-label={t('leads.routeCoach')}
                          >
                            <option value="">{t('leads.coachPlaceholder')}</option>
                            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </Select>
                        )}
                        {locations.length > 0 && (
                          <Select
                            value={lead.locationId ?? ''}
                            onChange={e => leadsRepo.update(lead.id, { locationId: e.target.value || undefined })}
                            className="!h-6 min-w-0 flex-1 !px-1.5 !pe-5 text-2xs text-muted"
                            title={t('leads.assignLocation')} aria-label={t('leads.assignLocation')}
                          >
                            <option value="">{t('leads.locationPlaceholder')}</option>
                            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                          </Select>
                        )}
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      {stage.id !== 'won' && stage.id !== 'lost' ? (
                        <button onClick={() => advance(lead)} className="flex items-center gap-1 text-2xs font-medium text-verde-600 hover:underline">
                          {lead.stage === 'trial' ? t('leads.convert') : t('leads.advance')} <ArrowRight size={11} />
                        </button>
                      ) : <span />}
                      <div className="flex items-center gap-1">
                        {stage.id !== 'lost' && stage.id !== 'won' && (
                          <button onClick={() => leadsRepo.update(lead.id, { stage: 'lost' })} className="text-2xs text-faint hover:text-ember-600">{t('leads.markLost')}</button>
                        )}
                        <button onClick={async () => { await leadsRepo.remove(lead.id); toast(t('leads.toast.removed')) }} aria-label={t('leads.remove', { name: lead.name })} className="text-faint hover:text-signal-600"><Trash2 size={12} /></button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <AddLeadDialog open={addOpen} onClose={() => setAddOpen(false)} staff={staff} locations={locations} />
      <ConvertDialog lead={converting} onClose={() => setConverting(null)} />
    </div>
  )
}

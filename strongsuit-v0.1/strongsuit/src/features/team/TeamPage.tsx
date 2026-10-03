import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Users, MapPin, Plus, Trash2, Lock, UserCircle2 } from 'lucide-react'
import {
  Card, SectionHeader, Button, EmptyState, Dialog, Field, Input, Select, Tag, Stat, toast,
} from '@/design'
import { staffRepo, locationsRepo, clientsRepo, paymentsRepo, trainerRepo } from '@/db/repo'
import type { StaffRole, Location } from '@/db/types'
import { staffCommissionForMonth } from '@/lib/business'
import { editionCapabilities, EDITION_NAMES } from '@/lib/edition'
import { getActiveStaffId, setActiveStaffId } from '@/lib/activeStaff'
import { format } from 'date-fns'
import { useTranslation, type MessageKey } from '@/lib/i18n'

const ROLE_KEY: Record<StaffRole, MessageKey> = { owner: 'team.role.owner', coach: 'team.role.coach', 'front-desk': 'team.role.frontDesk' }

function AddStaffDialog({ open, onClose, locations }: { open: boolean; onClose: () => void; locations: Location[] }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({ name: '', email: '', role: 'coach' as StaffRole, commissionPercent: '', locationId: '' })

  async function save() {
    if (!form.name.trim()) return
    await staffRepo.create({
      name: form.name.trim(), email: form.email.trim() || undefined, role: form.role,
      commissionPercent: form.commissionPercent ? Number(form.commissionPercent) : undefined,
      locationId: form.locationId || undefined, active: true,
    })
    toast(t('team.toast.staffAdded', { name: form.name }))
    setForm({ name: '', email: '', role: 'coach', commissionPercent: '', locationId: '' })
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('team.addStaffTitle')}>
      <div className="space-y-3">
        <Field label={t('team.form.name')}><Input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('team.form.email')} hint={t('team.form.optional')}><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></Field>
          <Field label={t('team.form.role')}>
            <Select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as StaffRole }))}>
              <option value="owner">{t('team.role.owner')}</option>
              <option value="coach">{t('team.role.coach')}</option>
              <option value="front-desk">{t('team.role.frontDesk')}</option>
            </Select>
          </Field>
          <Field label={t('team.form.commission')} hint={t('team.form.commissionHint')}>
            <Input type="number" min="0" max="100" value={form.commissionPercent} onChange={e => setForm(f => ({ ...f, commissionPercent: e.target.value }))} />
          </Field>
          <Field label={t('team.form.location')} hint={t('team.form.optional')}>
            <Select value={form.locationId} onChange={e => setForm(f => ({ ...f, locationId: e.target.value }))}>
              <option value="">{t('team.form.unassigned')}</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>{t('team.cancel')}</Button>
          <Button variant="primary" onClick={save} disabled={!form.name.trim()}>{t('team.addToTeam')}</Button>
        </div>
      </div>
    </Dialog>
  )
}

function AddLocationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({ name: '', address: '' })
  async function save() {
    if (!form.name.trim()) return
    await locationsRepo.create({ name: form.name.trim(), address: form.address.trim() || undefined })
    toast(t('team.toast.locationAdded', { name: form.name }))
    setForm({ name: '', address: '' })
    onClose()
  }
  return (
    <Dialog open={open} onClose={onClose} title={t('team.addLocation')}>
      <div className="space-y-3">
        <Field label={t('team.form.name')}><Input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('team.form.locationPlaceholder')} /></Field>
        <Field label={t('team.form.address')} hint={t('team.form.optional')}><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>{t('team.cancel')}</Button>
          <Button variant="primary" onClick={save} disabled={!form.name.trim()}>{t('team.addLocation')}</Button>
        </div>
      </div>
    </Dialog>
  )
}

export default function TeamPage() {
  const { t } = useTranslation()
  const [staffOpen, setStaffOpen] = useState(false)
  const [locOpen, setLocOpen] = useState(false)
  const trainer = useLiveQuery(() => trainerRepo.get())
  const staff = useLiveQuery(() => staffRepo.all(), [], [])
  const locations = useLiveQuery(() => locationsRepo.all(), [], [])
  const clients = useLiveQuery(() => clientsRepo.all(), [], [])
  const payments = useLiveQuery(() => paymentsRepo.all(), [], [])
  const thisMonth = format(new Date(), 'yyyy-MM')
  const cap = editionCapabilities(trainer?.edition)
  const [activeId, setActiveIdState] = useState<string | null>(null)
  useEffect(() => { setActiveIdState(getActiveStaffId(staff)) }, [staff])

  function chooseActive(id: string) {
    setActiveStaffId(id || null)
    setActiveIdState(id || null)
  }

  if (trainer === undefined) {
    return (
      <div className="mx-auto max-w-4xl">
        <SectionHeader title={t('team.title')} />
        <Card className="animate-pulse text-sm text-faint">{t('team.loading')}</Card>
      </div>
    )
  }

  if (!cap.multiSeat) {
    return (
      <div className="mx-auto max-w-4xl">
        <SectionHeader title={t('team.title')} />
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <Lock size={28} className="text-faint" strokeWidth={1.5} />
          <p className="max-w-md text-sm text-muted">{cap.upgradeReason}</p>
          <p className="text-2xs text-faint">{t('team.currentEdition', { edition: EDITION_NAMES[cap.edition] })}</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <SectionHeader title={t('team.title')} action={<div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => setLocOpen(true)}><MapPin size={14} /> {t('team.addLocation')}</Button><Button size="sm" variant="primary" onClick={() => setStaffOpen(true)}><Plus size={14} /> {t('team.addStaff')}</Button></div>} />

      {staff.length > 0 && (
        <Card className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted"><UserCircle2 size={15} /> {t('team.workingAs')}</div>
          <Select className="!h-8 w-56" value={activeId ?? ''} onChange={e => chooseActive(e.target.value)}>
            <option value="">{t('team.notSet')}</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <p className="text-2xs text-faint">{t('team.workingAsHint')}</p>
        </Card>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted">{t('team.staffHeading', { month: new Date().toLocaleDateString(undefined, { month: 'long' }) })}</h3>
        {staff.length === 0 ? (
          <EmptyState
            icon={<Users size={28} strokeWidth={1.5} />}
            title={t('team.emptyStaffTitle')}
            body={t('team.emptyStaffBody')}
            action={<Button variant="primary" onClick={() => setStaffOpen(true)}><Plus size={14} /> {t('team.addStaff')}</Button>}
          />
        ) : (
          <div className="space-y-2">
            {staff.map(s => {
              const assigned = clients.filter(c => c.staffId === s.id)
              const commission = staffCommissionForMonth(s, clients, payments, thisMonth)
              const loc = locations.find(l => l.id === s.locationId)
              return (
                <Card key={s.id} pad={false} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink">{s.name}</span>
                      <Tag tone={s.role === 'owner' ? 'verde' : 'neutral'}>{t(ROLE_KEY[s.role])}</Tag>
                      {!s.active && <Tag tone="ember">{t('team.inactive')}</Tag>}
                    </div>
                    <div className="mt-0.5 text-2xs text-faint">
                      {t('team.clientCount', { count: assigned.length })}{loc ? ` · ${loc.name}` : ''}{s.commissionPercent ? ` · ${t('team.commissionPct', { pct: s.commissionPercent })}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {s.commissionPercent ? <Stat label={t('team.owedThisMonth')} value={`$${commission.toFixed(2)}`} tone="verde" /> : null}
                    <Button size="sm" variant="ghost" className="text-ember-600" aria-label={t('team.remove', { name: s.name })} onClick={async () => { await staffRepo.remove(s.id); toast(t('team.toast.removed', { name: s.name })) }}><Trash2 size={14} /></Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted">{t('team.locations')}</h3>
        {locations.length === 0 ? (
          <EmptyState
            icon={<MapPin size={28} strokeWidth={1.5} />}
            title={t('team.emptyLocTitle')}
            body={t('team.emptyLocBody')}
            action={<Button variant="primary" onClick={() => setLocOpen(true)}><Plus size={14} /> {t('team.addLocation')}</Button>}
          />
        ) : (
          <div className="space-y-2">
            {locations.map(l => {
              const count = clients.filter(c => c.locationId === l.id).length
              return (
                <Link key={l.id} to={`/locations/${l.id}`} className="block">
                  <Card pad={false} className="flex items-center justify-between px-4 py-3 transition-colors hover:border-verde-600/40">
                    <div>
                      <div className="text-sm font-medium text-ink">{l.name}</div>
                      <div className="text-2xs text-faint">{l.address || t('team.noAddress')} · {t('team.clientCount', { count })}</div>
                    </div>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      <AddStaffDialog open={staffOpen} onClose={() => setStaffOpen(false)} locations={locations} />
      <AddLocationDialog open={locOpen} onClose={() => setLocOpen(false)} />
    </div>
  )
}

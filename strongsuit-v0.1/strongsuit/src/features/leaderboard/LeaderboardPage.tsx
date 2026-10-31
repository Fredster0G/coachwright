import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Trophy, Plus, Medal } from 'lucide-react'
import { Card, SectionHeader, Button, EmptyState, Dialog, Field, Input, Select, Tag, toast } from '@/design'
import { clientsRepo, challengesRepo, logsRepo, metricsRepo, staffRepo, locationsRepo, trainerRepo } from '@/db/repo'
import type { ChallengeMetric } from '@/db/types'
import { leaderboard } from '@/lib/leaderboard'
import { fullName, today } from '@/lib/core'
import { format, subDays, addDays } from 'date-fns'
import { useTranslation, type MessageKey } from '@/lib/i18n'

const METRIC_KEYS: Record<ChallengeMetric, { label: MessageKey; unit: MessageKey }> = {
  volume: { label: 'leaderboard.metric.volume', unit: 'leaderboard.unit.volume' },
  sessions: { label: 'leaderboard.metric.sessions', unit: 'leaderboard.unit.sessions' },
  'bodyweight-loss-pct': { label: 'leaderboard.metric.bwLoss', unit: 'leaderboard.unit.pct' },
}

function NewChallengeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const clients = useLiveQuery(() => clientsRepo.active(), [], [])
  const [form, setForm] = useState({
    name: '', metric: 'volume' as ChallengeMetric,
    startDate: today(), endDate: format(addDays(new Date(), 28), 'yyyy-MM-dd'),
    participants: [] as string[],
  })
  async function save() {
    if (!form.name.trim() || form.participants.length === 0) return
    await challengesRepo.create({
      name: form.name.trim(), metric: form.metric, startDate: form.startDate, endDate: form.endDate,
      participantClientIds: form.participants,
    })
    toast(t('leaderboard.toast.started', { name: form.name }))
    onClose()
  }
  return (
    <Dialog open={open} onClose={onClose} title={t('leaderboard.newChallenge')} width={480}>
      <div className="space-y-3">
        <Field label={t('leaderboard.form.name')}><Input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('leaderboard.form.namePlaceholder')} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('leaderboard.form.metric')}>
            <Select value={form.metric} onChange={e => setForm(f => ({ ...f, metric: e.target.value as ChallengeMetric }))}>
              {(Object.keys(METRIC_KEYS) as ChallengeMetric[]).map(k => <option key={k} value={k}>{t(METRIC_KEYS[k].label)}</option>)}
            </Select>
          </Field>
          <Field label={t('leaderboard.form.start')}><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></Field>
          <Field label={t('leaderboard.form.end')}><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></Field>
        </div>
        <Field label={t('leaderboard.form.participants')} hint={t('leaderboard.form.participantsHint')}>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-ctl border border-line p-2">
            {clients.filter(c => c.leaderboardOptIn).length === 0 && (
              <p className="p-2 text-xs text-muted">{t('leaderboard.noneOptedInShort')}</p>
            )}
            {clients.filter(c => c.leaderboardOptIn).map(c => (
              <label key={c.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-surface2">
                <input
                  type="checkbox" checked={form.participants.includes(c.id)}
                  onChange={e => setForm(f => ({ ...f, participants: e.target.checked ? [...f.participants, c.id] : f.participants.filter(id => id !== c.id) }))}
                  className="accent-[var(--verde-600)]"
                />
                {fullName(c)}
              </label>
            ))}
          </div>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>{t('leaderboard.cancel')}</Button>
          <Button variant="primary" onClick={save} disabled={!form.name.trim() || form.participants.length === 0}>{t('leaderboard.start')}</Button>
        </div>
      </div>
    </Dialog>
  )
}

function Board({ metric, start, end, participantIds, clientMap }: {
  metric: ChallengeMetric; start: string; end: string; participantIds?: string[]
  clientMap: Map<string, { firstName: string; lastName: string }>
}) {
  const { t } = useTranslation()
  const sessionLogs = useLiveQuery(() => logsRepo.all(), [], [])
  const metrics = useLiveQuery(() => metricsRepo.all(), [], [])
  const clients = useLiveQuery(() => clientsRepo.all(), [], [])
  const board = leaderboard({ metric, clients, sessionLogs, metrics, start, end, participantIds })
  const units = useLiveQuery(() => trainerRepo.get(), [])?.units ?? 'lb'
  const unit = t(METRIC_KEYS[metric].unit, { units })

  if (board.length === 0) {
    return <p className="px-1 py-3 text-xs text-muted">{t('leaderboard.noActivity')}</p>
  }

  return (
    <div className="space-y-1.5">
      {board.slice(0, 20).map(entry => {
        const c = clientMap.get(entry.clientId)
        return (
          <div key={entry.clientId} className="flex items-center justify-between rounded-ctl border border-line bg-surface px-3 py-2">
            <div className="flex items-center gap-2">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-2xs font-semibold ${entry.rank === 1 ? 'bg-ember-500 text-white' : 'bg-surface2 text-muted'}`}>
                {entry.rank}
              </span>
              <span className="text-sm text-ink">{c ? `${c.firstName} ${c.lastName}`.trim() : t('leaderboard.unknown')}</span>
              {entry.rank === 1 && <Medal size={14} className="text-ember-600" />}
            </div>
            <span className="font-mono tabular-nums text-sm font-semibold text-ink">{metric === 'sessions'
              ? <>{entry.value.toLocaleString()} <span className="text-2xs font-normal text-faint">{t('leaderboard.sessionsUnit', { count: entry.value })}</span></>
              : <>{entry.value.toLocaleString()} <span className="text-2xs font-normal text-faint">{unit}</span></>}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function LeaderboardPage() {
  const { t } = useTranslation()
  const [newOpen, setNewOpen] = useState(false)
  const clients = useLiveQuery(() => clientsRepo.all(), [], [])
  const challenges = useLiveQuery(() => challengesRepo.all(), [], [])
  const staff = useLiveQuery(() => staffRepo.all(), [], [])
  const locations = useLiveQuery(() => locationsRepo.all(), [], [])
  const [staffFilter, setStaffFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const clientMap = new Map(clients.map(c => [c.id, c]))
  const optedIn = clients.filter(c => c.leaderboardOptIn && c.status === 'active')

  // Studio scoping — a multi-location studio's leaderboard shouldn't blend
  // clients from every coach/location by default. Challenges keep their own
  // explicit participant list untouched — a coach curated that roster on
  // purpose, so studio scope doesn't further narrow it.
  const showScope = staff.length > 0 || locations.length > 0
  const scopedIds = optedIn
    .filter(c => (!staffFilter || c.staffId === staffFilter) && (!locationFilter || c.locationId === locationFilter))
    .map(c => c.id)

  const thisMonthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd')
  const last30 = format(subDays(new Date(), 30), 'yyyy-MM-dd')

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <SectionHeader title={t('leaderboard.title')} action={<Button variant="primary" onClick={() => setNewOpen(true)}><Plus size={14} /> {t('leaderboard.newChallenge')}</Button>} />

      {showScope && optedIn.length > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          {staff.length > 0 && (
            <Field label={t('leaderboard.filter.coach')}>
              <Select className="!h-8 w-44" value={staffFilter} onChange={e => setStaffFilter(e.target.value)}>
                <option value="">{t('leaderboard.filter.allCoaches')}</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          )}
          {locations.length > 0 && (
            <Field label={t('leaderboard.filter.location')}>
              <Select className="!h-8 w-44" value={locationFilter} onChange={e => setLocationFilter(e.target.value)}>
                <option value="">{t('leaderboard.filter.allLocations')}</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
          )}
        </div>
      )}

      {optedIn.length === 0 ? (
        <EmptyState
          icon={<Trophy size={28} strokeWidth={1.5} />}
          title={t('leaderboard.emptyTitle')}
          body={t('leaderboard.emptyBody')}
        />
      ) : (
        <>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted">{t('leaderboard.thisMonthVolume')}</h3>
            <Board metric="volume" start={thisMonthStart} end={today()} clientMap={clientMap} participantIds={showScope ? scopedIds : undefined} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted">{t('leaderboard.last30Sessions')}</h3>
            <Board metric="sessions" start={last30} end={today()} clientMap={clientMap} participantIds={showScope ? scopedIds : undefined} />
          </div>
        </>
      )}

      {challenges.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-muted">{t('leaderboard.challenges')}</h3>
          <div className="space-y-6">
            {challenges.map(ch => (
              <Card key={ch.id}>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="font-display text-base font-semibold text-ink">{ch.name}</p>
                    <p className="text-2xs text-faint">{ch.startDate} → {ch.endDate} · {t(METRIC_KEYS[ch.metric].label)}</p>
                  </div>
                  <Tag tone={ch.endDate >= today() ? 'verde' : 'neutral'}>{ch.endDate >= today() ? t('leaderboard.active') : t('leaderboard.ended')}</Tag>
                </div>
                <Board metric={ch.metric} start={ch.startDate} end={ch.endDate} participantIds={ch.participantClientIds} clientMap={clientMap} />
              </Card>
            ))}
          </div>
        </div>
      )}

      <NewChallengeDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  )
}

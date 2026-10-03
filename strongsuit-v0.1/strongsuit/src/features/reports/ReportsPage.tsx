import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BarChart3, Users, Zap } from 'lucide-react'
import { Card, SectionHeader, Stat, EmptyState, Tag, PRTag, Avatar, Select, Field } from '@/design'
import { clientsRepo, logsRepo, checkInsRepo, staffRepo, locationsRepo, trainerRepo } from '@/db/repo'
import { fullName, e1rm } from '@/lib/core'
import { differenceInDays, parseISO } from 'date-fns'
import { useTranslation } from '@/lib/i18n'

export default function ReportsPage() {
  const { t } = useTranslation()
  const units = useLiveQuery(() => trainerRepo.get(), [])?.units ?? 'lb'
  const allActiveClients = useLiveQuery(() => clientsRepo.active(), [], [])
  const staff = useLiveQuery(() => staffRepo.all(), [], [])
  const locations = useLiveQuery(() => locationsRepo.all(), [], [])
  const [staffFilter, setStaffFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')

  // Studio scoping — only relevant once there's more than one coach or
  // location to scope by; a solo trainer never sees this row at all.
  const showScope = staff.length > 0 || locations.length > 0
  const clients = allActiveClients.filter(c =>
    (!staffFilter || c.staffId === staffFilter) && (!locationFilter || c.locationId === locationFilter),
  )
  const scopedClientIds = new Set(clients.map(c => c.id))

  const allLogs = useLiveQuery(async () => {
    const logs = await logsRepo.table.toArray()
    return logs.sort((a, b) => b.date.localeCompare(a.date))
  }, [], []).filter(l => scopedClientIds.has(l.clientId))
  const allCheckIns = useLiveQuery(() => checkInsRepo.table.toArray(), [], [])
    .filter(ci => scopedClientIds.has(ci.clientId))

  const clientMap = new Map(clients.map(c => [c.id, c]))

  // --- Cross-client metrics ---

  // Total sessions logged
  const totalSessions = allLogs.length

  // Total sets across all sessions
  const totalSets = allLogs.reduce((sum, log) =>
    sum + log.entries.reduce((s, entry) => s + entry.sets.length, 0), 0
  )

  // Total volume (tonnage)
  const totalVolume = allLogs.reduce((sum, log) =>
    sum + log.entries.reduce((s, entry) =>
      s + entry.sets.reduce((ss, set) => ss + (set.actualLoad || 0) * (set.actualReps || 0), 0), 0
    ), 0
  )

  // PR detection across all logs
  const prRecords: { clientId: string; exerciseId: string; date: string; load: number; reps: number; e1rm: number }[] = []
  const bestByExercise = new Map<string, number>() // key: `clientId:exerciseId` -> best e1rm

  for (const log of [...allLogs].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const entry of log.entries) {
      for (const set of entry.sets) {
        if (!set.actualLoad || !set.actualReps || set.actualReps <= 0) continue
        const estimated = e1rm(set.actualLoad, set.actualReps)
        const key = `${log.clientId}:${entry.exerciseId}`
        const prev = bestByExercise.get(key) || 0
        if (estimated > prev) {
          bestByExercise.set(key, estimated)
          if (prev > 0) {
            prRecords.push({
              clientId: log.clientId,
              exerciseId: entry.exerciseId,
              date: log.date,
              load: set.actualLoad,
              reps: set.actualReps,
              e1rm: estimated
            })
          }
        }
      }
    }
  }

  // Sort PRs newest first, take top 10
  const recentPRs = prRecords.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10)

  // Per-client session counts and last-session info
  const clientStats = clients.map(c => {
    const clientLogs = allLogs.filter(l => l.clientId === c.id)
    const lastLog = clientLogs[0] // already sorted newest first
    const daysSinceLast = lastLog
      ? differenceInDays(new Date(), parseISO(lastLog.date))
      : null
    const checkInCount = allCheckIns.filter(ci => ci.clientId === c.id).length

    return {
      client: c,
      sessionCount: clientLogs.length,
      lastSessionDate: lastLog?.date || null,
      daysSinceLast,
      checkInCount,
    }
  }).sort((a, b) => (b.sessionCount - a.sessionCount))

  return (
    <div className="max-w-5xl mx-auto">
      <SectionHeader title={t('reports.title')} />

      {showScope && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          {staff.length > 0 && (
            <Field label={t('reports.filter.coach')}>
              <Select className="!h-8 w-44" value={staffFilter} onChange={e => setStaffFilter(e.target.value)}>
                <option value="">{t('reports.filter.allCoaches')}</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          )}
          {locations.length > 0 && (
            <Field label={t('reports.filter.location')}>
              <Select className="!h-8 w-44" value={locationFilter} onChange={e => setLocationFilter(e.target.value)}>
                <option value="">{t('reports.filter.allLocations')}</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
          )}
        </div>
      )}

      {allActiveClients.length === 0 ? (
        <EmptyState
          icon={<BarChart3 size={32} strokeWidth={1.5} />}
          title={t('reports.emptyTitle')}
          body={t('reports.emptyBody')}
        />
      ) : clients.length === 0 ? (
        <EmptyState
          icon={<Users size={32} strokeWidth={1.5} />}
          title={t('reports.noMatchTitle')}
          body={t('reports.noMatchBody')}
        />
      ) : (
        <div className="space-y-8">
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <Stat label={t('reports.activeClients')} value={clients.length} />
            </Card>
            <Card>
              <Stat label={t('reports.totalSessions')} value={totalSessions} tone="verde" />
            </Card>
            <Card>
              <Stat label={t('reports.totalSets')} value={totalSets.toLocaleString()} />
            </Card>
            <Card>
              <Stat label={t('reports.volume')} value={totalVolume.toLocaleString()} unit={units} />
            </Card>
          </div>

          {/* PR Feed */}
          {recentPRs.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted mb-3 flex items-center gap-2">
                <Zap size={14} className="text-ember-600" /> {t('reports.recentPRs')}
              </h3>
              <div className="space-y-2">
                {recentPRs.map((pr, i) => {
                  const c = clientMap.get(pr.clientId)
                  return (
                    <Card key={i} pad={false} className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {c && <Avatar person={c} size={28} />}
                          <div>
                            <div className="text-sm font-medium text-ink">
                              {c ? fullName(c) : t('reports.unknown')}
                            </div>
                            <div className="text-2xs text-faint">
                              {pr.date} · {pr.load}×{pr.reps}
                            </div>
                          </div>
                        </div>
                        <PRTag>{t('reports.prE1rm', { value: pr.e1rm.toFixed(1) })}</PRTag>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}

          {/* Client roster overview */}
          <div>
            <h3 className="text-sm font-semibold text-muted mb-3 flex items-center gap-2">
              <Users size={14} /> {t('reports.overview')}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-start text-2xs font-medium uppercase text-faint">
                    <th className="pb-2 pe-4">{t('reports.col.client')}</th>
                    <th className="pb-2 pe-4">{t('reports.col.sessions')}</th>
                    <th className="pb-2 pe-4">{t('reports.col.checkins')}</th>
                    <th className="pb-2 pe-4">{t('reports.col.lastSession')}</th>
                    <th className="pb-2">{t('reports.col.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {clientStats.map(cs => (
                    <tr key={cs.client.id} className="border-b border-line/50">
                      <td className="py-2.5 pe-4">
                        <div className="flex items-center gap-2">
                          <Avatar person={cs.client} size={24} />
                          <span className="font-medium">{fullName(cs.client)}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pe-4 font-mono tabular-nums">{cs.sessionCount}</td>
                      <td className="py-2.5 pe-4 font-mono tabular-nums">{cs.checkInCount}</td>
                      <td className="py-2.5 pe-4 text-faint">
                        {cs.lastSessionDate || '—'}
                      </td>
                      <td className="py-2.5">
                        {cs.daysSinceLast === null ? (
                          <Tag tone="neutral">{t('reports.noSessions')}</Tag>
                        ) : cs.daysSinceLast <= 7 ? (
                          <Tag tone="verde">{t('reports.active')}</Tag>
                        ) : (
                          <Tag tone="ember">{t('reports.stale', { days: cs.daysSinceLast })}</Tag>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

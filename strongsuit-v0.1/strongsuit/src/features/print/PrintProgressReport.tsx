import { useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { clientsRepo, exercisesRepo, logsRepo, trainerRepo } from '@/db/repo'
import { calculateWeeklyTonnage, detectPRs } from '@/lib/analytics'
import { APP_NAME } from '@/lib/brand'
import { e1rm, fullName, isoDay } from '@/lib/core'
import { useTranslation } from '@/lib/i18n'
import { canUseCustomBranding } from '@/lib/membership'


export default function PrintProgressReport() {
  const { clientId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const client = useLiveQuery(() => clientsRepo.get(clientId), [clientId])
  const trainer = useLiveQuery(() => trainerRepo.get())
  const exercises = useLiveQuery(() => exercisesRepo.all(), [])
  const allLogs = useLiveQuery(() => logsRepo.forClient(clientId), [clientId])
  const { t } = useTranslation()

  // Date range from query params, default to last 30 days
  const rangeEnd = searchParams.get('end') || isoDay(new Date())
  const rangeStart = searchParams.get('start') || (() => {
    const d = new Date(); d.setDate(d.getDate() - 30)
    return isoDay(d)
  })()

  const logs = useMemo(() => {
    if (!allLogs) return []
    return allLogs.filter(l => l.date >= rangeStart && l.date <= rangeEnd)
  }, [allLogs, rangeStart, rangeEnd])

  const exMap = useMemo(() => {
    if (!exercises) return new Map<string, string>()
    return new Map(exercises.map(e => [e.id, e.name]))
  }, [exercises])

  // Trigger print once loaded
  useEffect(() => {
    if (client && trainer && exercises && allLogs) {
      setTimeout(() => window.print(), 600)
    }
  }, [client, trainer, exercises, allLogs])

  if (!client || !trainer || !exercises || !allLogs) {
    return <div className="p-8">{t('print.progress.loading')}</div>
  }

  const canBrand = canUseCustomBranding(trainer)
  const business = (canBrand.allowed && trainer.businessName) ? trainer.businessName : APP_NAME

  const weeklyTonnage = calculateWeeklyTonnage(logs, trainer.weekStartsOn)

  const prs = detectPRs(logs)
  const totalSessions = logs.length
  const dayCount = Math.max(1, Math.round((new Date(rangeEnd).getTime() - new Date(rangeStart).getTime()) / 86400000))
  const adherencePct = Math.round((totalSessions / Math.max(1, Math.ceil(dayCount / 7))) * 100)

  // e1RM tracking: best e1RM per exercise across the range
  const e1rmByExercise: Record<string, { best: number; date: string }> = {}
  for (const log of logs) {
    for (const entry of log.entries) {
      for (const set of entry.sets) {
        if (!set.done || !set.actualLoad || !set.actualReps) continue
        const rm = e1rm(set.actualLoad, set.actualReps)
        const prev = e1rmByExercise[entry.exerciseId]
        if (!prev || rm > prev.best) {
          e1rmByExercise[entry.exerciseId] = { best: rm, date: log.date }
        }
      }
    }
  }

  const topLifts = Object.entries(e1rmByExercise)
    .sort((a, b) => b[1].best - a[1].best)
    .slice(0, 10)

  // SVG mini chart for tonnage
  const maxTonnage = Math.max(...weeklyTonnage.map(w => w.tonnage), 1)
  const chartW = 500
  const chartH = 120
  const barW = weeklyTonnage.length > 0 ? Math.max(12, Math.min(40, (chartW - 20) / weeklyTonnage.length - 4)) : 20

  return (
    <div className="bg-white text-black min-h-screen p-8 max-w-4xl mx-auto font-sans">
      {/* Header */}
      <div className="mb-8 pb-4 border-b-2 border-black flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight">{fullName(client)}</h1>
          <h2 className="text-xl text-gray-600 mt-1">{t('print.progress.title')}</h2>
          <p className="text-sm text-gray-500 mt-1 font-mono">{t('print.progress.dateRange', { start: rangeStart, end: rangeEnd })}</p>
        </div>
        <div className="text-end text-sm text-gray-500">
          <p>{business}</p>
          <p>{new Date().toLocaleDateString()}</p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="border border-gray-300 p-4 rounded text-center">
          <div className="text-3xl font-bold font-mono">{totalSessions}</div>
          <div className="text-xs text-gray-500 mt-1">{t('print.progress.sessions')}</div>
        </div>
        <div className="border border-gray-300 p-4 rounded text-center">
          <div className="text-3xl font-bold font-mono">{adherencePct}%</div>
          <div className="text-xs text-gray-500 mt-1">{t('print.progress.adherence')}</div>
        </div>
        <div className="border border-gray-300 p-4 rounded text-center">
          <div className="text-3xl font-bold font-mono">{prs.length}</div>
          <div className="text-xs text-gray-500 mt-1">{t('print.progress.prs')}</div>
        </div>
        <div className="border border-gray-300 p-4 rounded text-center">
          <div className="text-3xl font-bold font-mono">
            {weeklyTonnage.length > 0
              ? Math.round(weeklyTonnage.reduce((s, w) => s + w.tonnage, 0)).toLocaleString()
              : '0'}
          </div>
          <div className="text-xs text-gray-500 mt-1">{t('print.progress.volume', { units: trainer.units })}</div>
        </div>
      </div>

      {/* Weekly Tonnage Chart */}
      {weeklyTonnage.length > 0 && (
        <div className="mb-8 break-inside-avoid">
          <h3 className="text-lg font-bold mb-3 border-s-4 border-black ps-2">{t('print.progress.volumeChartTitle')}</h3>
          <svg width={chartW} height={chartH + 24} className="block">
            {weeklyTonnage.map((w, i) => {
              const h = (w.tonnage / maxTonnage) * chartH
              const x = 10 + i * (barW + 4)
              return (
                <g key={w.week}>
                  <rect x={x} y={chartH - h} width={barW} height={h} fill="#171A1E" rx={2} />
                  <text x={x + barW / 2} y={chartH + 14} textAnchor="middle" fontSize={8} fill="#999">
                    {w.week.slice(5)}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      )}

      {/* Top e1RM Estimates */}
      {topLifts.length > 0 && (
        <div className="mb-8 break-inside-avoid">
          <h3 className="text-lg font-bold mb-3 border-s-4 border-black ps-2">{t('print.progress.e1rmTitle')}</h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="py-2 text-start">{t('print.progress.exercise')}</th>
                <th className="py-2 text-end">{t('print.progress.e1rmCol', { units: trainer.units })}</th>
                <th className="py-2 text-end">{t('print.progress.dateCol')}</th>
              </tr>
            </thead>
            <tbody>
              {topLifts.map(([exId, val]) => (
                <tr key={exId} className="border-b border-gray-200">
                  <td className="py-2">{exMap.get(exId) || t('print.progress.unknown')}</td>
                  <td className="py-2 text-end font-mono font-bold">{Math.round(val.best)}</td>
                  <td className="py-2 text-end text-gray-500 font-mono">{val.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* PR Feed */}
      {prs.length > 0 && (
        <div className="mb-8 break-inside-avoid">
          <h3 className="text-lg font-bold mb-3 border-s-4 border-black ps-2">{t('print.progress.prTitle')}</h3>
          <div className="space-y-2">
            {prs.slice(0, 15).map(pr => (
              <div key={pr.id} className="flex items-center gap-3 text-sm border-b border-gray-100 pb-2">
                <span className="inline-block w-16 text-center text-xs font-bold uppercase rounded px-1 py-0.5"
                  style={{ background: pr.type === 'e1rm' ? '#D9730D' : pr.type === 'load' ? '#171A1E' : '#155E4E', color: '#fff' }}>
                  {pr.type === 'e1rm' ? 'e1RM' : pr.type === 'load' ? 'LOAD' : 'REPS'}
                </span>
                <span className="font-medium">{exMap.get(pr.exerciseId) || t('print.progress.unknown')}</span>
                <span className="font-mono font-bold ms-auto">
                  {pr.type === 'e1rm'
                    ? `${Math.round(pr.value)} ${trainer.units}`
                    : pr.type === 'load'
                    ? t('print.progress.loadFormat', { load: String(pr.load), units: trainer.units, reps: String(pr.reps) })
                    : t('print.progress.repsFormat', { reps: String(pr.reps), load: String(pr.load), units: trainer.units })}
                </span>
                <span className="text-gray-400 font-mono text-xs">{pr.date}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-12 pt-4 border-t border-gray-200 text-xs text-gray-400 flex justify-between">
        <span>{t('print.progress.generatedBy', { business })}</span>
        <span>{t('print.progress.dateRange', { start: rangeStart, end: rangeEnd })}</span>
      </div>

      <div className="mt-8 print:hidden">
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-gray-800 text-white rounded font-medium cursor-pointer"
        >
          {t('print.back')}
        </button>
      </div>
    </div>
  )
}

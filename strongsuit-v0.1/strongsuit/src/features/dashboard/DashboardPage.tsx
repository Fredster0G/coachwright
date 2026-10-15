import { useState, type ComponentType, type SVGProps } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, subDays } from 'date-fns'
import {
  Plus, ClipboardList, FileDown, CheckCircle2, Circle, PenLine, ChevronRight, ChevronDown,
} from 'lucide-react'
import { clientsRepo, trainerRepo, programsRepo, logsRepo, checkInsRepo, paymentsRepo, automationRulesRepo } from '@/db/repo'
import { fullName } from '@/lib/core'
import { APP_NAME } from '@/lib/brand'
import { Card, SectionHeader, Button, Tag } from '@/design'
import { evaluateAutomations, explainRule, DEFAULT_RULES, type ClientFacts } from '@/lib/automations'
import { today } from '@/lib/core'
import { useTranslation } from '@/lib/i18n'
import { RosterSummaryCard } from './RosterSummaryCard'
import {
  CornerFrame,
  EmblemCoach,
  EmblemFilm,
  EmblemGrip,
  EmblemKettle,
  EmblemLifter,
  EmblemPlates,
  EmblemRack,
  EmblemSpotter,
  EmblemStamp,
  EmblemStride,
} from '@/app/brand/Emblems'

function ChecklistItem({ done, label, to }: { done: boolean; label: string; to: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 rounded-ctl px-2 py-1.5 text-sm hover:bg-surface2">
      {done
        ? <CheckCircle2 size={16} className="text-verde-600" />
        : <Circle size={16} className="text-faint" />}
      <span className={done ? 'text-faint line-through' : 'text-ink'}>{label}</span>
    </Link>
  )
}

function StatCell({
  label,
  value,
  Emblem,
}: {
  label: string
  value: number | string
  Emblem: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>
}) {
  return (
    <div className="stamp-panel relative min-w-0 overflow-hidden rounded-card border border-line/70 bg-surface/80 px-3 py-3 shadow-raise">
      <Emblem size={44} className="pointer-events-none absolute -end-1 -top-1 text-ink/10" />
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-faint">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink tabular-nums">{value}</p>
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const trainer = useLiveQuery(() => trainerRepo.get())
  const clients = useLiveQuery(() => clientsRepo.active(), [], [])
  const programs = useLiveQuery(() => programsRepo.all(), [], [])
  const logs = useLiveQuery(() => logsRepo.all(), [], [])
  const checkIns = useLiveQuery(() => checkInsRepo.all(), [], [])
  const payments = useLiveQuery(() => paymentsRepo.all(), [], [])
  const customRules = useLiveQuery(() => automationRulesRepo.active(), [], [])
  const [selectClientOpen, setSelectClientOpen] = useState(false)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const { t } = useTranslation()

  const hasBrand = !!trainer?.businessName
  const hasClient = clients.length > 0
  const hasProgram = programs.length > 0
  const setupDone = hasBrand && hasClient && hasProgram

  const facts = new Map<string, ClientFacts>()
  for (const c of clients) {
    const clientLogs = logs.filter(l => l.clientId === c.id).sort((a, b) => a.date.localeCompare(b.date))
    const clientCheckIns = checkIns.filter(ci => ci.clientId === c.id).sort((a, b) => a.date.localeCompare(b.date))
    const clientPayments = payments.filter(p => p.clientId === c.id)
    const purchasedSessions = clientPayments.filter(p => p.type === 'session-credit').reduce((a, p) => a + (p.sessions ?? 0), 0)
    const lastPayment = clientPayments.filter(p => p.type !== 'refund').sort((a, b) => a.date.localeCompare(b.date)).at(-1)
    facts.set(c.id, {
      clientId: c.id,
      lastSessionDate: clientLogs.at(-1)?.date,
      lastCheckInDate: clientCheckIns.at(-1)?.date,
      sessionsRemaining: purchasedSessions > 0 ? Math.max(0, purchasedSessions - clientLogs.length) : undefined,
      lastPaymentDate: lastPayment?.date,
      hasScreening: !!c.screening,
      screeningCleared: c.screening?.cleared ?? false,
      checkInDates: clientCheckIns.map(ci => ci.date),
      sessionCompletionRates: clientLogs
        .map(l => {
          const allSets = l.entries.flatMap(e => e.sets)
          return allSets.length > 0 ? allSets.filter(s => s.done).length / allSets.length : null
        })
        .filter((r): r is number => r !== null),
    })
  }
  const rules = [...DEFAULT_RULES, ...customRules]
  const attention = evaluateAutomations({ clients, facts, rules, today: today() })
  const clientMap = new Map(clients.map(c => [c.id, c]))
  const ruleMap = new Map(rules.map(r => [r.id, r]))

  const shopName = trainer?.businessName?.trim() || trainer?.trainerName?.trim() || APP_NAME
  const weekAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd')
  const sessionsWeek = logs.filter(l => l.date >= weekAgo).length

  const launchpad = [
    { to: '/film-room', label: t('dashboard.launchpadFilm'), hint: t('dashboard.launchpadFilmHint'), Emblem: EmblemFilm },
    { to: '/calendar', label: t('dashboard.launchpadCalendar'), hint: t('dashboard.launchpadCalendarHint'), Emblem: EmblemRack },
    { to: '/business', label: t('dashboard.launchpadBusiness'), hint: t('dashboard.launchpadBusinessHint'), Emblem: EmblemPlates },
    { to: '/science', label: t('dashboard.launchpadScience'), hint: t('dashboard.launchpadScienceHint'), Emblem: EmblemGrip },
    { to: '/sync', label: t('dashboard.launchpadCompanion'), hint: t('dashboard.launchpadCompanionHint'), Emblem: EmblemStride },
    { to: '/exercises', label: t('dashboard.launchpadLibrary'), hint: t('dashboard.launchpadLibraryHint'), Emblem: EmblemKettle },
  ] as const

  return (
    <div className="space-y-8">
      <CornerFrame className="overflow-hidden rounded-card border border-line/80 bg-surface/90 shadow-bench animate-rise-in chalk-mesh">
        <header className="relative px-5 py-6 md:px-7 md:py-8">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_70%_at_100%_0%,rgb(21_94_78/14%),transparent_55%),radial-gradient(ellipse_50%_40%_at_0%_100%,rgb(217_115_13/10%),transparent_50%)]"
          />
          <EmblemLifter
            size={168}
            className="pointer-events-none absolute -end-1 bottom-0 text-ink/[0.14] animate-float-soft md:end-3 md:text-ink/[0.16]"
          />
          <EmblemPlates
            size={64}
            className="pointer-events-none absolute end-32 top-3 hidden text-verde-600/30 md:block"
          />
          <EmblemKettle
            size={48}
            className="pointer-events-none absolute end-16 top-16 hidden text-ember-500/25 md:block animate-float-soft"
          />
          <div className="relative max-w-xl">
            <div className="flex items-center gap-3">
              <EmblemStamp className="text-ink">
                <EmblemCoach size={40} className="text-ink" />
              </EmblemStamp>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-faint">
                {t('dashboard.todayEyebrow')}
              </p>
            </div>
            <h1 className="mt-3 font-display text-3xl font-extrabold tracking-[-0.04em] text-ink md:text-[2.65rem] md:leading-none">
              {t('dashboard.today')}
            </h1>
            <p className="mt-2 font-display text-lg font-semibold tracking-tight text-verde-700">
              {t('dashboard.greetingNamed', { name: shopName })}
            </p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
              {t('dashboard.todayLede')}
            </p>
            <div aria-hidden className="mt-4 h-1.5 w-20 rounded-full bg-ember-500 ember-pulse" />
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={() => setSelectClientOpen(true)}>
                <PenLine size={14} /> {t('dashboard.logSession')}
              </Button>
              <Link to="/clients"><Button size="sm"><Plus size={14} /> {t('dashboard.newClient')}</Button></Link>
              <Link to="/programs"><Button size="sm"><ClipboardList size={14} /> {t('dashboard.buildProgram')}</Button></Link>
              <Link to="/settings"><Button size="sm"><FileDown size={14} /> {t('dashboard.backup')}</Button></Link>
            </div>
          </div>
        </header>
      </CornerFrame>

      <div className="stagger-in grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <StatCell label={t('dashboard.statClients')} value={clients.length} Emblem={EmblemSpotter} />
        <StatCell label={t('dashboard.statPrograms')} value={programs.length} Emblem={EmblemRack} />
        <StatCell label={t('dashboard.statSessionsWeek')} value={sessionsWeek} Emblem={EmblemLifter} />
        <StatCell label={t('dashboard.statAttention')} value={attention.length} Emblem={EmblemGrip} />
      </div>

      {/* Emblem strip — dark workshop mural of house marks */}
      <div className="stagger-in relative overflow-hidden rounded-card border border-rail-line bg-[linear-gradient(180deg,#1C2228_0%,#14181C_100%)] px-4 py-4 text-rail-text shadow-bench">
        <EmblemRack size={96} className="pointer-events-none absolute -start-4 top-1/2 -translate-y-1/2 text-rail-text/[0.07]" />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          {[
            { Emblem: EmblemLifter, label: 'Floor' },
            { Emblem: EmblemCoach, label: 'Coach' },
            { Emblem: EmblemSpotter, label: 'Roster' },
            { Emblem: EmblemKettle, label: 'Work' },
            { Emblem: EmblemFilm, label: 'Film' },
            { Emblem: EmblemStride, label: 'Client' },
          ].map(({ Emblem, label }) => (
            <EmblemStamp key={label} label={label} className="text-rail-text/85">
              <Emblem size={40} className="text-rail-text" />
            </EmblemStamp>
          ))}
        </div>
      </div>

      {!setupDone && (
        <CornerFrame className="rounded-card border border-line bg-surface/90 p-4 shadow-raise animate-rise-in">
          <div className="flex gap-3">
            <EmblemKettle size={48} className="shrink-0 text-verde-700" />
            <div className="min-w-0 flex-1">
              <p className="mb-1 font-display text-base font-semibold">{t('dashboard.setup.title')}</p>
              <p className="mb-3 text-xs text-muted">{t('dashboard.setup.body', { app: APP_NAME })}</p>
              <div className="space-y-0.5">
                <ChecklistItem done={hasBrand} label={t('dashboard.setup.brand')} to="/settings" />
                <ChecklistItem done={hasClient} label={t('dashboard.setup.client')} to="/clients" />
                <ChecklistItem done={hasProgram} label={t('dashboard.setup.program')} to="/programs" />
              </div>
            </div>
          </div>
        </CornerFrame>
      )}

      <div>
        <SectionHeader title={t('dashboard.launchpad')} />
        <div className="stagger-in grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {launchpad.map(({ to, label, hint, Emblem }) => (
            <Link
              key={to}
              to={to}
              className="hover-lift stamp-panel group relative flex items-start gap-3 overflow-hidden rounded-card border border-line/80 bg-surface/85 p-3.5 shadow-raise"
            >
              <span className="relative z-[1] flex h-12 w-12 shrink-0 items-center justify-center rounded-ctl border border-verde-600/20 bg-verde-100 text-verde-700 transition-colors group-hover:border-verde-600/40 group-hover:bg-verde-600 group-hover:text-white">
                <Emblem size={32} className="transition-colors" />
              </span>
              <span className="relative z-[1] min-w-0">
                <span className="block font-display text-sm font-semibold tracking-tight text-ink">{label}</span>
                <span className="mt-0.5 block text-2xs leading-snug text-muted">{hint}</span>
              </span>
              <Emblem size={64} className="pointer-events-none absolute -bottom-2 -end-2 text-ink/[0.06] transition-opacity group-hover:text-verde-600/15" />
            </Link>
          ))}
        </div>
      </div>

      {hasClient && <RosterSummaryCard />}

      <div>
        <SectionHeader title={t('dashboard.needsAttention')} action={<Link to="/settings" className="text-2xs text-faint hover:text-ink">{t('dashboard.customizeRules')}</Link>} />
        {!hasClient ? (
          <CornerFrame className="rounded-card border border-dashed border-line bg-surface/60 px-6 py-10 text-center chalk-mesh">
            <EmblemSpotter size={72} className="mx-auto mb-3 text-ink/35" />
            <p className="font-display text-base font-semibold text-ink">{t('dashboard.emptyAttentionTitle')}</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted">{t('dashboard.emptyAttentionBody')}</p>
          </CornerFrame>
        ) : attention.length === 0 ? (
          <Card className="relative overflow-hidden text-sm text-muted">
            <EmblemGrip size={56} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-verde-600/15" />
            <span className="relative">{t('dashboard.allClear')}</span>
          </Card>
        ) : (
          <div className="stagger-in space-y-2">
            {attention.map((item, i) => {
              const c = clientMap.get(item.clientId)
              if (!c) return null
              const rule = ruleMap.get(item.ruleId)
              const key = `${item.clientId}-${item.ruleId}-${i}`
              const isExpanded = expandedKey === key
              return (
                <Card key={key} className="hover-lift transition-colors hover:border-verde-600/40">
                  <div className="flex items-center justify-between gap-2">
                    <Link to={`/clients/${c.id}`} className="text-sm font-medium hover:underline">{fullName(c)}</Link>
                    <div className="flex items-center gap-2">
                      <Tag tone={item.severity === 'warning' ? 'ember' : 'neutral'}>{item.message}</Tag>
                      {rule && (
                        <button
                          type="button"
                          onClick={() => setExpandedKey(isExpanded ? null : key)}
                          className="flex items-center gap-0.5 text-2xs text-faint hover:text-ink"
                          aria-expanded={isExpanded}
                        >
                          {t('dashboard.why')} <ChevronDown size={12} className={isExpanded ? 'rotate-180' : ''} />
                        </button>
                      )}
                    </div>
                  </div>
                  {isExpanded && rule && (
                    <p className="mt-2 border-t border-line pt-2 text-2xs text-faint">
                      {t('dashboard.ruleExplanation', { name: rule.name, explanation: explainRule(rule) })}
                    </p>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <dialog
        open={selectClientOpen}
        onCancel={() => setSelectClientOpen(false)}
        className="m-0 h-full max-h-none w-full max-w-sm ms-auto bg-surface shadow-sheet backdrop:bg-iron-950/20 backdrop:backdrop-blur-sm open:animate-slide-left p-0 z-50"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-line px-4 py-4">
            <div className="flex items-center gap-2">
              <EmblemLifter size={28} className="text-verde-700" />
              <h2 className="text-lg font-bold text-ink">{t('dashboard.selectClient')}</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectClientOpen(false)}>{t('action.cancel')}</Button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {!hasClient ? (
               <p className="text-faint text-sm">{t('dashboard.noClientsToLog')}</p>
            ) : (
              clients.map(c => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/log?clientId=${c.id}`)}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-line bg-surface hover:border-verde-600/50 hover:bg-verde-100/60 transition-colors text-start"
                >
                  <span className="font-semibold text-ink">{fullName(c)}</span>
                  <ChevronRight size={16} className="text-faint" />
                </button>
              ))
            )}
          </div>
        </div>
      </dialog>
    </div>
  )
}

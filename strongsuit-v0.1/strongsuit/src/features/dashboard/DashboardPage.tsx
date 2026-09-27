import { useState } from 'react'
import { LOCAL_AI_ENABLED } from '@/lib/cloud/config'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, ClipboardList, FileDown, CheckCircle2, Circle, PenLine, ChevronRight, ChevronDown } from 'lucide-react'
import { clientsRepo, trainerRepo, programsRepo, logsRepo, checkInsRepo, paymentsRepo, automationRulesRepo } from '@/db/repo'
import { fullName } from '@/lib/core'
import { APP_NAME } from '@/lib/brand'
import { Card, SectionHeader, Button, EmptyState, Tag } from '@/design'
import { evaluateAutomations, explainRule, DEFAULT_RULES, type ClientFacts } from '@/lib/automations'
import { today } from '@/lib/core'
import { useTranslation } from '@/lib/i18n'
import { RosterSummaryCard } from './RosterSummaryCard'
import { sessionPackBalance } from '@/lib/sessionPacks'

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

  // Build per-client facts once, then let the automation engine (custom
  // rules + always-on defaults) decide what needs attention — spec §4.29.
  const facts = new Map<string, ClientFacts>()
  for (const c of clients) {
    const clientLogs = logs.filter(l => l.clientId === c.id).sort((a, b) => a.date.localeCompare(b.date))
    const clientCheckIns = checkIns.filter(ci => ci.clientId === c.id).sort((a, b) => a.date.localeCompare(b.date))
    const clientPayments = payments.filter(p => p.clientId === c.id)
    const lastPayment = clientPayments.filter(p => p.type !== 'refund').sort((a, b) => a.date.localeCompare(b.date)).at(-1)
    facts.set(c.id, {
      clientId: c.id,
      lastSessionDate: clientLogs.at(-1)?.date,
      lastCheckInDate: clientCheckIns.at(-1)?.date,
      sessionsRemaining: sessionPackBalance(clientPayments, clientLogs)?.remaining,
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

  return (
    <div className="space-y-8">
      <div>
        <SectionHeader title={t('dashboard.today')} />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => setSelectClientOpen(true)}>
            <PenLine size={14} /> {t('dashboard.logSession')}
          </Button>
          <Link to="/clients"><Button size="sm"><Plus size={14} /> {t('dashboard.newClient')}</Button></Link>
          <Link to="/programs"><Button size="sm"><ClipboardList size={14} /> {t('dashboard.buildProgram')}</Button></Link>
          <Link to="/settings"><Button size="sm"><FileDown size={14} /> {t('dashboard.backup')}</Button></Link>
        </div>
      </div>

      {!setupDone && (
        <Card>
          <p className="mb-1 font-display text-base font-semibold">{t('dashboard.setup.title')}</p>
          <p className="mb-3 text-xs text-muted">{t('dashboard.setup.body', { app: APP_NAME })}</p>
          <div className="space-y-0.5">
            <ChecklistItem done={hasBrand} label={t('dashboard.setup.brand')} to="/settings" />
            <ChecklistItem done={hasClient} label={t('dashboard.setup.client')} to="/clients" />
            <ChecklistItem done={hasProgram} label={t('dashboard.setup.program')} to="/programs" />
          </div>
        </Card>
      )}

      {hasClient && LOCAL_AI_ENABLED && <RosterSummaryCard />}

      <div>
        <SectionHeader title={t('dashboard.needsAttention')} action={<Link to="/settings" className="text-2xs text-faint hover:text-ink">{t('dashboard.customizeRules')}</Link>} />
        {!hasClient ? (
          <EmptyState
            title={t('dashboard.emptyAttentionTitle')}
            body={t('dashboard.emptyAttentionBody')}
          />
        ) : attention.length === 0 ? (
          <Card className="text-sm text-muted">{t('dashboard.allClear')}</Card>
        ) : (
          <div className="space-y-2">
            {attention.map((item, i) => {
              const c = clientMap.get(item.clientId)
              if (!c) return null
              const rule = ruleMap.get(item.ruleId)
              const key = `${item.clientId}-${item.ruleId}-${i}`
              const isExpanded = expandedKey === key
              return (
                <Card key={key} className="transition-colors hover:border-verde-600/40">
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
            <h2 className="text-lg font-bold text-ink">{t('dashboard.selectClient')}</h2>
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

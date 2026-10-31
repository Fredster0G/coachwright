import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Wallet, Plus, Trash2, Target, FileText } from 'lucide-react'
import { format, subMonths } from 'date-fns'
import {
  Card, SectionHeader, Stat, EmptyState, Avatar, Button, IconButton,
  Dialog, Field, Input, Select, Tag, toast, SegmentedControl, NumericStepper,
} from '@/design'
import { paymentsRepo, clientsRepo, expensesRepo, trainerRepo, invoicesRepo, staffRepo, locationsRepo } from '@/db/repo'
import type { Expense, ExpenseCategory, ExpenseRecurrence } from '@/db/types'
import { fullName, today } from '@/lib/core'
import { profitPlan, expenseAppliesTo, gymCutForMonth, incomeForMonth } from '@/lib/business'
import { isInvoiceOverdue, outstandingTotal } from './invoiceStatus'
import { useTranslation, type MessageKey } from '@/lib/i18n'

const CATEGORIES: { value: ExpenseCategory; label: MessageKey }[] = [
  { value: 'rent', label: 'business.categories.rent' },
  { value: 'equipment', label: 'business.categories.equipment' },
  { value: 'insurance', label: 'business.categories.insurance' },
  { value: 'software', label: 'business.categories.software' },
  { value: 'education', label: 'business.categories.education' },
  { value: 'marketing', label: 'business.categories.marketing' },
  { value: 'travel', label: 'business.categories.travel' },
  { value: 'other', label: 'business.categories.other' },
]

const money = (v: number) =>
  `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function AddExpenseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({
    date: today(), amount: '', category: 'rent' as ExpenseCategory,
    recurrence: 'monthly' as ExpenseRecurrence, memo: '',
  })
  const set = <K extends keyof typeof form>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    const amount = Number(form.amount)
    if (!amount || amount <= 0) return
    await expensesRepo.create({
      date: form.date, amount, category: form.category,
      recurrence: form.recurrence, memo: form.memo.trim() || undefined,
    })
    toast(t('business.expense.added'))
    setForm(f => ({ ...f, amount: '', memo: '' }))
    onClose()
  }

  const { t } = useTranslation()

  return (
    <Dialog open={open} onClose={onClose} title={t('business.expense.add')}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('business.expense.amount')}>
            <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={set('amount')} autoFocus />
          </Field>
          <Field label={t('business.expense.date')}>
            <Input type="date" value={form.date} onChange={set('date')} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('business.expense.category')}>
            <Select value={form.category} onChange={set('category')}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{t(c.label)}</option>)}
            </Select>
          </Field>
          <Field label={t('business.expense.repeats')} hint={t('business.expense.repeatsHint')}>
            <Select value={form.recurrence} onChange={set('recurrence')}>
              <option value="monthly">{t('business.expense.everyMonth')}</option>
              <option value="one-time">{t('business.expense.oneTime')}</option>
            </Select>
          </Field>
        </div>
        <Field label={t('business.expense.memo')} hint={t('business.expense.optional')}>
          <Input placeholder={t('business.expense.memoPlaceholder')} value={form.memo} onChange={set('memo')} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>{t('business.expense.cancel')}</Button>
          <Button variant="primary" onClick={save} disabled={!Number(form.amount)}>{t('business.expense.add')}</Button>
        </div>
      </div>
    </Dialog>
  )
}

export default function BusinessPage() {
  const [addOpen, setAddOpen] = useState(false)
  const [view, setView] = useState<'overview' | 'ledger' | 'invoices'>('overview')
  const { t } = useTranslation()

  const trainer = useLiveQuery(() => trainerRepo.get())
  const allPayments = useLiveQuery(async () => {
    const all = await paymentsRepo.all()
    return all.sort((a, b) => b.date.localeCompare(a.date))
  }, [], [])
  const expenses = useLiveQuery(() => expensesRepo.all(), [], [])
  const allInvoices = useLiveQuery(async () => {
    const all = await invoicesRepo.all()
    return all.sort((a, b) => b.number - a.number)
  }, [], [])
  const clients = useLiveQuery(() => clientsRepo.active(), [], [])
  const allClients = useLiveQuery(() => clientsRepo.all(), [], [])
  const clientMap = new Map(allClients.map(c => [c.id, c]))
  const staff = useLiveQuery(() => staffRepo.all(), [], [])
  const locations = useLiveQuery(() => locationsRepo.all(), [], [])
  const [staffFilter, setStaffFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')

  // Studio scoping. Payment/Invoice carry their own staffId (Studio Phase 1)
  // so a payment collected by a coach who's since moved on still attributes
  // correctly — same "row's own id first, client's current id as fallback"
  // rule as staffCommissionForMonth(). Neither table has its own locationId,
  // so location scope is always derived through the client.
  const showScope = staff.length > 0 || locations.length > 0
  const scopedClientIds = new Set(
    allClients.filter(c => !locationFilter || c.locationId === locationFilter).map(c => c.id),
  )
  const matchesScope = (row: { clientId: string; staffId?: string }) => {
    if (locationFilter && !scopedClientIds.has(row.clientId)) return false
    if (staffFilter) {
      const effectiveStaffId = row.staffId ?? clientMap.get(row.clientId)?.staffId
      if (effectiveStaffId !== staffFilter) return false
    }
    return true
  }
  const payments = allPayments.filter(matchesScope)
  const invoices = allInvoices.filter(matchesScope)
  const scopedClients = allClients.filter(c =>
    (!staffFilter || c.staffId === staffFilter) && (!locationFilter || c.locationId === locationFilter),
  )
  // Expenses are business-wide overhead — rent/software/insurance has no
  // client, so no coach or location to scope it by.
  const scopeYieldsNothing = showScope && (staffFilter || locationFilter) && scopedClients.length === 0

  const thisMonth = format(new Date(), 'yyyy-MM')
  const rates = clients.map(c => c.sessionRate).filter((r): r is number => !!r && r > 0)
  const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : undefined

  const target = trainer?.monthlyProfitTarget ?? 0
  const gymCut = gymCutForMonth(scopedClients, payments, thisMonth)
  const plan = profitPlan({
    payments, expenses, target, month: thisMonth, today: today(), avgSessionRate: avgRate, gymCut,
  })

  const setTarget = async (v: number) => {
    await trainerRepo.patch({ monthlyProfitTarget: v })
  }

  const todayCache = today()
  const outstanding = outstandingTotal(invoices)
  const overdueCount = invoices.filter(i => isInvoiceOverdue(i, todayCache)).length

  const monthExpenses = expenses
    .filter(e => expenseAppliesTo(e, thisMonth))
    .sort((a, b) => b.amount - a.amount)

  // last-month comparison + monthly chart — net of refunds, the same rule as
  // this month's figure (lib/business.ts). They skipped refunds, so last month
  // read gross against this month's net.
  const lastMonthStr = format(subMonths(new Date(), 1), 'yyyy-MM')
  const lastMonthIncome = incomeForMonth(payments, lastMonthStr)

  const monthKeys = [...new Set(payments.map(p => p.date.substring(0, 7)))].sort().slice(-6)
  const months = monthKeys.map(m => [m, Math.max(0, incomeForMonth(payments, m))] as [string, number])
  const maxMonthly = Math.max(...months.map(([, v]) => v), 1)

  return (
    <div className="max-w-5xl mx-auto">
      <SectionHeader
        title={t('business.title')}
        action={
          <SegmentedControl
            options={[
              { value: 'overview', label: t('business.tabs.overview') },
              { value: 'ledger', label: t('business.tabs.ledger') },
              { value: 'invoices', label: t('business.tabs.invoices'), disabled: invoices.length === 0, title: invoices.length === 0 ? t('business.tabs.invoicesDisabledTooltip') : undefined },
            ]}
            value={view}
            onChange={v => setView(v as 'overview' | 'ledger' | 'invoices')}
          />
        }
      />

      {showScope && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          {staff.length > 0 && (
            <Field label={t('business.scope.coach')}>
              <Select className="!h-8 w-44" value={staffFilter} onChange={e => setStaffFilter(e.target.value)}>
                <option value="">{t('business.scope.allCoaches')}</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          )}
          {locations.length > 0 && (
            <Field label={t('business.scope.location')}>
              <Select className="!h-8 w-44" value={locationFilter} onChange={e => setLocationFilter(e.target.value)}>
                <option value="">{t('business.scope.allLocations')}</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
          )}
        </div>
      )}

      {scopeYieldsNothing && (
        <EmptyState
          icon={<Wallet size={32} strokeWidth={1.5} />}
          title={t('business.scope.emptyTitle')}
          body={t('business.scope.emptyBody')}
        />
      )}

      {!scopeYieldsNothing && view === 'overview' && (
      <div className="space-y-8">
        {/* ===== Profit Planner ===== */}
        <Card>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Target size={16} strokeWidth={1.5} className="text-verde-600" />
                {t('business.planner.title', { month: format(new Date(), 'MMMM') })}
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {t('business.planner.desc')}
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              {t('business.planner.goal')}
              <NumericStepper value={target} onChange={setTarget} min={0} step={50} className="!h-8 w-40 font-mono tabular-nums" />
            </label>
          </div>

          <div className={`grid grid-cols-2 gap-4 ${plan.gymCut > 0 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
            <Stat label={t('business.planner.income')} value={money(plan.income)} />
            {plan.gymCut > 0 && (
              <Stat label={t('business.planner.gymCut')} value={`−${money(plan.gymCut)}`} tone="ember" />
            )}
            <Stat label={t('business.planner.expenses')} value={money(plan.expenses)} tone={plan.expenses > 0 ? 'ember' : 'ink'} />
            <Stat label={t('business.planner.net')} value={money(plan.net)} tone={plan.net >= 0 ? 'verde' : 'ember'} />
            {target > 0 ? (
              <Stat
                label={plan.gap > 0 ? t('business.planner.toEarn') : t('business.planner.pastGoal')}
                value={money(Math.abs(plan.gap))}
                tone={plan.gap > 0 ? 'ember' : 'verde'}
              />
            ) : (
              <Stat label={t('business.planner.goalLabel')} value="—" />
            )}
          </div>

          {target > 0 && (
            <div className="mt-4 space-y-2">
              {/* progress toward goal */}
              <div className="h-2 overflow-hidden rounded-full bg-surface2">
                <div
                  className={`h-full rounded-full ${plan.net >= target ? 'bg-verde-600' : 'bg-ember-500'}`}
                  style={{ width: `${Math.min(100, Math.max(0, (plan.net / target) * 100))}%` }}
                />
              </div>
              <p className="text-xs text-muted">
                {plan.gap <= 0
                  ? t('business.planner.goalHit', { days: String(plan.daysInMonth - plan.daysElapsed) })
                  : plan.sessionsToClose !== null
                    ? (plan.onTrack 
                        ? t('business.planner.goalPaceRateTrack', { gap: money(plan.gap), sessions: String(plan.sessionsToClose), rate: money(avgRate!), days: String(plan.daysInMonth - plan.daysElapsed), projected: money(plan.projectedNet) })
                        : t('business.planner.goalPaceRateShort', { gap: money(plan.gap), sessions: String(plan.sessionsToClose), rate: money(avgRate!), days: String(plan.daysInMonth - plan.daysElapsed), projected: money(plan.projectedNet) }))
                    : t('business.planner.goalPaceNoRate', { gap: money(plan.gap), days: String(plan.daysInMonth - plan.daysElapsed), projected: money(plan.projectedNet) })}
              </p>
            </div>
          )}
        </Card>

        {/* ===== Income summary ===== */}
        {payments.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Card><Stat label={t('business.summary.thisMonth')} value={money(plan.income)} /></Card>
            <Card><Stat label={t('business.summary.lastMonth')} value={money(lastMonthIncome)} /></Card>
            <Card><Stat label={t('business.summary.transactions')} value={payments.length} /></Card>
          </div>
        )}
      </div>
      )}

      {!scopeYieldsNothing && view === 'ledger' && (
      <div className="space-y-8">
        {/* ===== Expenses ===== */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted">{t('business.summary.expenses', { month: format(new Date(), 'MMMM') })}</h3>
            <Button size="sm" onClick={() => setAddOpen(true)}><Plus size={14} /> {t('business.expense.add')}</Button>
          </div>
          {monthExpenses.length === 0 ? (
            <EmptyState
              title={t('business.summary.noExpenses')}
              body={t('business.summary.noExpensesBody')}
              action={<Button size="sm" variant="primary" onClick={() => setAddOpen(true)}><Plus size={14} /> {t('business.summary.addFirstExpense')}</Button>}
            />
          ) : (
            <div className="space-y-2">
              {monthExpenses.map((e: Expense) => (
                <Card key={e.id} pad={false} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="text-sm font-medium text-ink">
                        {t(CATEGORIES.find(c => c.value === e.category)?.label ?? 'business.categories.other')}
                        {e.memo ? <span className="font-normal text-muted"> — {e.memo}</span> : null}
                      </div>
                      <div className="text-2xs text-faint">
                        {e.recurrence === 'monthly' ? t('business.expense.since', { date: e.date }) : e.date}
                      </div>
                    </div>
                    {e.recurrence === 'monthly' && <Tag>{t('business.expense.monthly')}</Tag>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono tabular-nums font-semibold text-ember-600">−{money(e.amount)}</span>
                    <IconButton
                      label="Delete expense"
                      onClick={async () => { await expensesRepo.remove(e.id); toast(t('business.expense.deleted')) }}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* ===== Income ===== */}
        {payments.length === 0 ? (
          <EmptyState
            icon={<Wallet size={32} strokeWidth={1.5} />}
            title={t('business.summary.ledgerEmpty')}
            body={t('business.summary.ledgerEmptyBody')}
          />
        ) : (
          <>
            {months.length > 1 && (
              <Card>
                <h3 className="text-sm font-semibold text-muted mb-4">{t('business.summary.monthlyIncome')}</h3>
                <div className="flex items-end gap-2 h-32">
                  {months.map(([month, amount]) => {
                    const height = (amount / maxMonthly) * 100
                    return (
                      <div key={month} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-2xs font-mono text-faint">${Math.round(amount)}</span>
                        <div
                          className="w-full bg-verde-600 rounded-t transition-all"
                          style={{ height: `${height}%`, minHeight: 4 }}
                        />
                        <span className="text-2xs text-faint">{month.substring(5)}</span>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}

            <div>
              <h3 className="text-sm font-semibold text-muted mb-3">{t('business.summary.recentTransactions')}</h3>
              <div className="space-y-2">
                {payments.slice(0, 20).map(p => {
                  const c = clientMap.get(p.clientId)
                  return (
                    <Card key={p.id} pad={false} className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {c && <Avatar person={c} size={28} />}
                          <div>
                            <div className="text-sm font-medium text-ink">
                              {c ? fullName(c) : t('business.summary.unknownClient')}
                            </div>
                            <div className="text-2xs text-faint">
                              {p.date} · {p.type === 'session-credit' ? t('business.summary.sessionPack') : p.type === 'refund' ? t('business.summary.refund') : t('business.summary.payment')}
                              {p.method ? ` · ${p.method}` : ''}
                            </div>
                          </div>
                        </div>
                        <div className={`font-mono tabular-nums font-semibold ${p.type === 'refund' ? 'text-red-500' : 'text-verde-600'}`}>
                          {p.type === 'refund' ? '-' : '+'}${p.amount.toFixed(2)}
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
      )}

      {!scopeYieldsNothing && view === 'invoices' && (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Card><Stat label={t('business.invoices.outstanding')} value={money(outstanding)} tone={outstanding > 0 ? 'ember' : 'verde'} /></Card>
          <Card><Stat label={t('business.invoices.overdue')} value={overdueCount} tone={overdueCount > 0 ? 'ember' : 'ink'} /></Card>
          <Card><Stat label={t('business.invoices.total')} value={invoices.length} /></Card>
        </div>

        {invoices.length === 0 ? (
          <EmptyState
            icon={<FileText size={32} strokeWidth={1.5} />}
            title={t('business.invoices.empty')}
            body={t('business.invoices.emptyBody')}
          />
        ) : (
          <div className="space-y-2">
            {invoices.map(inv => {
              const c = clientMap.get(inv.clientId)
              const overdue = isInvoiceOverdue(inv, todayCache)
              return (
                <Link key={inv.id} to={`/clients/${inv.clientId}`} className="block">
                  <Card pad={false} className="flex items-center justify-between px-4 py-3 transition-colors hover:border-verde-600/40">
                    <div className="flex items-center gap-3">
                      {c && <Avatar person={c} size={28} />}
                      <div>
                        <div className="text-sm font-medium text-ink">
                          {t('business.invoices.title', { number: String(inv.number), client: c ? fullName(c) : t('business.summary.unknownClient') })}
                        </div>
                        <div className="text-2xs text-faint">
                          {inv.date}{inv.dueDate ? ` · ${t('business.invoices.due', { dueDate: inv.dueDate })}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono tabular-nums font-semibold text-ink">{money(inv.total)}</span>
                      <Tag tone={overdue ? 'ember' : inv.status === 'paid' ? 'verde' : inv.status === 'sent' ? 'neutral' : 'neutral'}>
                        {overdue ? t('business.invoices.overdueBadge') : inv.status}
                      </Tag>
                    </div>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>
      )}

      <AddExpenseDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}

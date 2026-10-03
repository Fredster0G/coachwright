// ===== Profit Planner math (Business page) =====
// Pure functions: give them the rows and a month, they give back the numbers.
// "month" everywhere is a 'yyyy-MM' string.

import type { Client, Coupon, Expense, Invoice, InvoiceLineItem, Payment, Staff } from '@/db/types'
import { today } from './core'

/** Does a (possibly recurring) expense count against this month? */
export function expenseAppliesTo(e: Expense, month: string): boolean {
  const startMonth = e.date.slice(0, 7)
  if (e.recurrence === 'one-time') return startMonth === month
  if (startMonth > month) return false
  if (e.endDate && e.endDate.slice(0, 7) < month) return false
  return true
}

export function expensesForMonth(expenses: Expense[], month: string): number {
  return expenses.filter(e => expenseAppliesTo(e, month)).reduce((a, e) => a + e.amount, 0)
}

/** Income = payments + session packs, minus refunds, dated in the month. */
export function incomeForMonth(payments: Payment[], month: string): number {
  return payments
    .filter(p => p.date.startsWith(month))
    .reduce((a, p) => a + (p.type === 'refund' ? -p.amount : p.amount), 0)
}

/** What the gym/facility takes from one client's income this month. */
export function gymCutForClient(client: Client, payments: Payment[], month: string): number {
  if (!client.gymCut || client.gymCut.value <= 0) return 0
  if (client.gymCut.kind === 'flat-monthly') {
    return client.status === 'active' ? client.gymCut.value : 0
  }
  const income = payments
    .filter(p => p.clientId === client.id && p.date.startsWith(month))
    .reduce((a, p) => a + (p.type === 'refund' ? -p.amount : p.amount), 0)
  return Math.max(0, Math.round(income * (client.gymCut.value / 100) * 100) / 100)
}

/** Total facility cut across all clients for the month. */
export function gymCutForMonth(clients: Client[], payments: Payment[], month: string): number {
  return Math.round(clients.reduce((a, c) => a + gymCutForClient(c, payments, month), 0) * 100) / 100
}

/** Commission owed to one staff member: % of income attributed to them this
 *  month. Prefers each payment's OWN staffId (Studio, v1.6) — who actually
 *  collected it — and falls back to the client's CURRENT staffId only for
 *  older, unattributed rows. Without this fallback, a client reassigned to
 *  a different coach would retroactively move every past month's commission
 *  to the new coach, which is wrong: the original coach did that work. */
export function staffCommissionForMonth(staff: Staff, clients: Client[], payments: Payment[], month: string): number {
  if (!staff.commissionPercent || staff.commissionPercent <= 0) return 0
  const clientStaffId = new Map(clients.map(c => [c.id, c.staffId]))
  const income = payments
    .filter(p => p.date.startsWith(month))
    .filter(p => (p.staffId ?? clientStaffId.get(p.clientId)) === staff.id)
    .reduce((a, p) => a + (p.type === 'refund' ? -p.amount : p.amount), 0)
  return Math.max(0, Math.round(income * (staff.commissionPercent / 100) * 100) / 100)
}

/** Total commissions owed across all staff for the month. */
export function totalCommissionsForMonth(staffList: Staff[], clients: Client[], payments: Payment[], month: string): number {
  return Math.round(staffList.reduce((a, s) => a + staffCommissionForMonth(s, clients, payments, month), 0) * 100) / 100
}

// ---- Invoicing & coupons ----

/** Discount amount a coupon takes off a subtotal (never more than the subtotal, never negative). */
export function couponDiscount(subtotal: number, coupon?: Coupon | null): number {
  if (!coupon || !coupon.active || subtotal <= 0) return 0
  if (coupon.expiresAt && coupon.expiresAt < today()) return 0
  const raw = coupon.kind === 'percent' ? subtotal * (coupon.value / 100) : coupon.value
  return Math.round(Math.min(Math.max(0, raw), subtotal) * 100) / 100
}

export interface InvoiceTotals { subtotal: number; discountAmount: number; total: number }

export function invoiceTotals(lineItems: InvoiceLineItem[], coupon?: Coupon | null): InvoiceTotals {
  const subtotal = Math.round(lineItems.reduce((a, li) => a + li.amount * (li.qty ?? 1), 0) * 100) / 100
  const discountAmount = couponDiscount(subtotal, coupon)
  return { subtotal, discountAmount, total: Math.round((subtotal - discountAmount) * 100) / 100 }
}

/** Outstanding balance for a client: sent-but-unpaid invoice totals. */
export function clientBalance(invoices: Invoice[]): number {
  return Math.round(invoices.filter(i => i.status === 'sent').reduce((a, i) => a + i.total, 0) * 100) / 100
}

export interface ProfitPlan {
  month: string
  income: number
  /** facility's take this month (gymCutForMonth) */
  gymCut: number
  expenses: number
  net: number
  target: number
  /** target - net; positive = still short, negative = past the goal */
  gap: number
  /** run-rate projection of month-end net based on income pace so far */
  projectedNet: number
  daysElapsed: number
  daysInMonth: number
  /** sessions still needed to close the gap at the given rate; null if no rate */
  sessionsToClose: number | null
  onTrack: boolean
}

export function profitPlan(opts: {
  payments: Payment[]
  expenses: Expense[]
  target: number
  month: string          // 'yyyy-MM'
  today: string          // 'yyyy-MM-dd'
  avgSessionRate?: number
  gymCut?: number        // facility take this month (gymCutForMonth)
}): ProfitPlan {
  const { payments, expenses, target, month, today, avgSessionRate } = opts
  const gymCut = opts.gymCut ?? 0
  const income = incomeForMonth(payments, month)
  const spent = expensesForMonth(expenses, month)
  const net = income - gymCut - spent

  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const daysElapsed = today.startsWith(month)
    ? Math.max(1, Number(today.slice(8, 10)))
    : today < `${month}-01` ? 1 : daysInMonth

  // gym cut is projected at the same pace as income (percent cuts scale with
  // it; flat cuts are already fully counted, making the projection slightly
  // conservative — the safe direction for a profit goal)
  const projectedIncome = (income / daysElapsed) * daysInMonth
  const projectedCut = income > 0 ? (gymCut / income) * projectedIncome : gymCut
  const projectedNet = Math.round((projectedIncome - projectedCut - spent) * 100) / 100

  const gap = Math.round((target - net) * 100) / 100
  const sessionsToClose =
    gap > 0 && avgSessionRate && avgSessionRate > 0
      ? Math.ceil(gap / avgSessionRate)
      : gap > 0 ? null : 0

  return {
    month, income, gymCut, expenses: spent, net, target, gap,
    projectedNet, daysElapsed, daysInMonth, sessionsToClose,
    onTrack: net >= target || projectedNet >= target,
  }
}

// ===== Recurring invoices: retainers bill themselves =====
//
// A coach on a monthly retainer used to re-create the same invoice by hand
// every month (ROADMAP §2.6). Now an invoice can be marked "repeat monthly":
// it becomes the template, and each later month gets a DRAFT copy dated the
// same day of that month. Drafts, never sent — the coach still reviews and
// sends, so nothing reaches a client that the coach didn't look at.
//
// Idempotent by construction: a generated invoice's id is
// `<templateId>~<yyyy-MM>`, so a re-run, a second device or a sync race can
// only ever produce the same row (last-write-wins merges it), never a second
// bill for the same month. Voiding a generated invoice keeps its row, so it
// isn't regenerated; there is no hard delete of invoices in the UI.

import type { Invoice } from '@/db/types'

/** How far back a missed month is still generated: only months whose date
 *  falls within the last MAX_CATCH_UP months of today. An app left closed for
 *  a year doesn't bury the coach in drafts, and — unlike a per-run cap, which
 *  every later sync would re-apply to the remaining gap — older months are
 *  skipped for good. The coach can see the gap and bill it by hand. */
export const MAX_CATCH_UP = 3

export interface PlannedInvoice {
  id: string
  templateId: string
  period: string   // yyyy-MM
  date: string     // yyyy-MM-dd
  dueDate?: string
}

export const recurrenceId = (templateId: string, period: string) => `${templateId}~${period}`

function ymd(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return { y, m, d }
}
const pad = (n: number) => String(n).padStart(2, '0')
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

/** `date` moved `months` later, its day clamped to the target month's length
 *  (Jan 31 → Feb 28/29 → Mar 31: each month is measured from the TEMPLATE's
 *  day, so one short month doesn't drag every later invoice to the 28th). */
export function addMonthsClamped(date: string, months: number): string {
  const { y, m, d } = ymd(date)
  const total = (m - 1) + months
  const ty = y + Math.floor(total / 12)
  const tm = (total % 12 + 12) % 12 + 1
  return `${ty}-${pad(tm)}-${pad(Math.min(d, daysInMonth(ty, tm)))}`
}

function dayOffset(from: string, to: string): number {
  const a = ymd(from), b = ymd(to)
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000)
}
function addDays(date: string, days: number): string {
  const { y, m, d } = ymd(date)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Every recurring invoice that should exist by `today` and doesn't. */
export function planRecurringInvoices(invoices: readonly Invoice[], today: string): PlannedInvoice[] {
  const have = new Set(invoices.map(i => i.id))
  const out: PlannedInvoice[] = []
  for (const tpl of invoices) {
    if (!tpl.repeatMonthly || tpl.status === 'void' || tpl.repeatOf) continue
    const dueGap = tpl.dueDate ? dayOffset(tpl.date, tpl.dueDate) : null
    const oldest = addMonthsClamped(today, -MAX_CATCH_UP)
    for (let k = 1; ; k++) {
      const date = addMonthsClamped(tpl.date, k)
      if (date > today) break
      if (date <= oldest) continue
      const period = date.slice(0, 7)
      const id = recurrenceId(tpl.id, period)
      if (have.has(id)) continue
      out.push({ id, templateId: tpl.id, period, date, dueDate: dueGap === null ? undefined : addDays(date, dueGap) })
    }
  }
  return out
}

/** The draft row for one planned month: the template's billing content, none
 *  of its state (status, repeat flag). `number` is assigned by the caller. */
export function draftFromTemplate(tpl: Invoice, plan: PlannedInvoice, number: number): Omit<Invoice, 'createdAt' | 'updatedAt'> {
  return {
    id: plan.id,
    clientId: tpl.clientId,
    number,
    date: plan.date,
    dueDate: plan.dueDate,
    lineItems: tpl.lineItems.map(li => ({ ...li })),
    couponCode: tpl.couponCode,
    discountAmount: tpl.discountAmount,
    subtotal: tpl.subtotal,
    total: tpl.total,
    status: 'draft',
    notes: tpl.notes,
    paymentLink: tpl.paymentLink,
    staffId: tpl.staffId,
    repeatOf: tpl.id,
  }
}

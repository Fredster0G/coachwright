import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { addMonthsClamped, planRecurringInvoices, draftFromTemplate, recurrenceId, MAX_CATCH_UP } from './recurringInvoices'
import { db } from '@/db/schema'
import { invoicesRepo } from '@/db/repo'
import type { Invoice } from '@/db/types'

const inv = (over: Partial<Invoice>): Invoice => ({
  id: 'T', clientId: 'c1', number: 1, date: '2026-01-15', lineItems: [{ description: 'Retainer', amount: 400, qty: 1 }],
  subtotal: 400, total: 400, status: 'sent', createdAt: '', updatedAt: '', ...over,
})

describe('addMonthsClamped', () => {
  it('keeps the day when it exists', () => {
    expect(addMonthsClamped('2026-01-15', 1)).toBe('2026-02-15')
    expect(addMonthsClamped('2026-11-15', 2)).toBe('2027-01-15')
  })
  it('clamps to month end without drifting later months', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31')
  })
})

describe('planRecurringInvoices', () => {
  it('plans nothing for a normal invoice', () => {
    expect(planRecurringInvoices([inv({})], '2026-06-01')).toEqual([])
  })
  it('plans each month on the template day, once the day arrives', () => {
    const plans = planRecurringInvoices([inv({ repeatMonthly: true })], '2026-03-15')
    expect(plans.map(p => p.date)).toEqual(['2026-02-15', '2026-03-15'])
    expect(planRecurringInvoices([inv({ repeatMonthly: true })], '2026-02-14')).toEqual([])
  })
  it('skips months that already exist, by deterministic id', () => {
    const tpl = inv({ repeatMonthly: true })
    const feb = inv({ id: recurrenceId('T', '2026-02'), repeatOf: 'T', date: '2026-02-15' })
    expect(planRecurringInvoices([tpl, feb], '2026-03-20').map(p => p.period)).toEqual(['2026-03'])
  })
  it('keeps the template due-date gap', () => {
    const [p] = planRecurringInvoices([inv({ repeatMonthly: true, dueDate: '2026-01-22' })], '2026-02-20')
    expect(p.dueDate).toBe('2026-02-22')
  })
  it('stops for a voided or switched-off template, and never treats a copy as a template', () => {
    expect(planRecurringInvoices([inv({ repeatMonthly: true, status: 'void' })], '2026-06-01')).toEqual([])
    expect(planRecurringInvoices([inv({ repeatMonthly: false })], '2026-06-01')).toEqual([])
    expect(planRecurringInvoices([inv({ id: 'T~2026-02', repeatMonthly: true, repeatOf: 'T' })], '2026-06-01')).toEqual([])
  })
  it('catches up at most a few months, keeping the most recent', () => {
    const plans = planRecurringInvoices([inv({ repeatMonthly: true })], '2026-12-31')
    expect(plans).toHaveLength(MAX_CATCH_UP)
    expect(plans.at(-1)!.period).toBe('2026-12')
  })
  it('never comes back for months older than the window (a per-run cap would)', () => {
    const tpl = inv({ repeatMonthly: true })
    const first = planRecurringInvoices([tpl], '2026-12-31')
    const made = first.map(p => inv({ id: p.id, repeatOf: 'T', date: p.date }))
    expect(planRecurringInvoices([tpl, ...made], '2026-12-31')).toEqual([])
  })
})

describe('draftFromTemplate', () => {
  it('copies billing content, not state', () => {
    const tpl = inv({ repeatMonthly: true, paymentLink: 'https://pay', notes: 'n' })
    const [plan] = planRecurringInvoices([tpl], '2026-02-15')
    const d = draftFromTemplate(tpl, plan, 9)
    expect(d).toMatchObject({ id: 'T~2026-02', number: 9, status: 'draft', repeatOf: 'T', total: 400, paymentLink: 'https://pay' })
    expect(d.repeatMonthly).toBeUndefined()
    d.lineItems[0].amount = 1
    expect(tpl.lineItems[0].amount).toBe(400)
  })
})

describe('invoicesRepo.generateRecurring', () => {
  beforeEach(async () => {
    for (const table of db.tables) await table.clear()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 2, 20, 12))   // local 2026-03-20
  })
  afterEach(() => { vi.useRealTimers() })

  it('creates numbered drafts once, and a second run is a no-op', async () => {
    await db.invoices.add(inv({ id: 'T', number: 4, repeatMonthly: true }))
    expect(await invoicesRepo.generateRecurring()).toBe(2)
    expect(await invoicesRepo.generateRecurring()).toBe(0)
    const all = (await db.invoices.toArray()).sort((a, b) => a.number - b.number)
    expect(all.map(i => [i.id, i.number, i.status])).toEqual([
      ['T', 4, 'sent'], ['T~2026-02', 5, 'draft'], ['T~2026-03', 6, 'draft'],
    ])
  })

  it('stamps copies at their billing date so a real edit always wins a sync race', async () => {
    await db.invoices.add(inv({ id: 'T', repeatMonthly: true }))
    await invoicesRepo.generateRecurring()
    const feb = await db.invoices.get('T~2026-02')
    expect(feb?.updatedAt).toBe('2026-02-15T00:00:00.000Z')
    const sent = await invoicesRepo.update('T~2026-02', { status: 'sent' })
    expect(sent!.updatedAt > feb!.updatedAt).toBe(true)
  })
})

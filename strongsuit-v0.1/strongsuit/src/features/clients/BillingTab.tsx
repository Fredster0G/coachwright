import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, CreditCard, ArrowDownLeft, ArrowUpRight, Scissors, FileText, Trash2, ExternalLink, Repeat } from 'lucide-react'
import { Card, Button, Input, EmptyState, Dialog, Label, Select, Field, Stat, Tag, Checkbox, toast, toastError } from '@/design'
import { paymentsRepo, clientsRepo, invoicesRepo, couponsRepo, staffRepo } from '@/db/repo'
import type { Client, Coupon, Payment, PaymentType, Invoice, InvoiceLineItem, InvoiceStatus } from '@/db/types'
import { nowIso, newId, isoDay } from '@/lib/core'
import { gymCutForClient, invoiceTotals, clientBalance } from '@/lib/business'
import { getActiveStaffId } from '@/lib/activeStaff'
import { sessionPackBalance } from '@/lib/sessionPacks'
import { db } from '@/db/schema'
import { format } from 'date-fns'
import { useTranslation } from '@/lib/i18n'

interface BillingTabProps {
  clientId: string
  client?: Client
}

/** What the facility takes from this client — percent of income or flat/month. */
function GymCutCard({ client, payments }: { client: Client; payments: Payment[] }) {
  const kind = client.gymCut?.kind ?? 'none'
  const value = client.gymCut?.value ?? 0
  const month = format(new Date(), 'yyyy-MM')
  const cutThisMonth = gymCutForClient(client, payments, month)
  const { t } = useTranslation()

  const save = (nextKind: string, nextValue: number) => {
    if (nextKind === 'none' || nextValue <= 0) {
      return clientsRepo.update(client.id, { gymCut: undefined })
    }
    return clientsRepo.update(client.id, { gymCut: { kind: nextKind as 'percent' | 'flat-monthly', value: nextValue } })
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <Scissors size={14} /> {t('clients.billing.gymCutTitle')}
        </div>
        {client.gymCut && (
          <span className="text-2xs text-faint">
            {t('clients.billing.gymCutThisMonth')}<span className="font-mono tabular-nums text-ember-600">−${cutThisMonth.toFixed(2)}</span>
          </span>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('clients.billing.gymCutLabel')}>
          <Select value={kind} onChange={e => save(e.target.value, value || (e.target.value === 'percent' ? 20 : 0))}>
            <option value="none">{t('clients.billing.gymCutNone')}</option>
            <option value="percent">{t('clients.billing.gymCutPercent')}</option>
            <option value="flat-monthly">{t('clients.billing.gymCutFlat')}</option>
          </Select>
        </Field>
        {kind !== 'none' && (
          <Field label={kind === 'percent' ? t('clients.billing.gymCutPercentLabel') : t('clients.billing.gymCutFlatLabel')}>
            <Input
              type="number" min="0" step={kind === 'percent' ? 1 : 5}
              max={kind === 'percent' ? 100 : undefined}
              defaultValue={value || ''}
              onBlur={e => save(kind, Number(e.target.value) || 0)}
              className="font-mono tabular-nums"
            />
          </Field>
        )}
      </div>
      <p className="mt-2 text-2xs text-faint">
        {t('clients.billing.gymCutDisclaimer')}
      </p>
    </Card>
  )
}

function NewInvoiceDialog({ clientId, open, onClose }: { clientId: string; open: boolean; onClose: () => void }) {
  const staff = useLiveQuery(() => staffRepo.all(), [], [])
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([{ description: '', amount: 0, qty: 1 }])
  const [couponCode, setCouponCode] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [paymentLink, setPaymentLink] = useState('')
  const [repeatMonthly, setRepeatMonthly] = useState(false)
  // The coupon itself, not the discount it gave at the moment it was applied:
  // a 10% coupon applied and then a line added still took 10% of the OLD total.
  const [applied, setApplied] = useState<Coupon | null>(null)
  const { t } = useTranslation()

  const totals = invoiceTotals(lineItems, applied)

  async function checkCoupon() {
    if (!couponCode.trim()) { setApplied(null); return }
    const coupon = await couponsRepo.byCode(couponCode.trim())
    // An inactive or expired code used to "apply" silently at $0 off.
    if (!coupon) { toastError(t('clients.toast.noCoupon', { code: couponCode })); setApplied(null); return }
    if (!coupon.active || (coupon.expiresAt && coupon.expiresAt < isoDay(new Date()))) {
      toastError(t('clients.toast.couponInactive', { code: coupon.code })); setApplied(null); return
    }
    setApplied(coupon)
  }

  async function save(sendNow: boolean) {
    const clean = lineItems.filter(li => li.description.trim() && li.amount > 0)
    if (!clean.length) return
    const saveTotals = invoiceTotals(clean, applied)
    const number = await invoicesRepo.nextNumber()
    await invoicesRepo.create({
      clientId, number, date: isoDay(new Date()),
      dueDate: dueDate || undefined, lineItems: clean,
      couponCode: applied?.code, discountAmount: saveTotals.discountAmount,
      subtotal: saveTotals.subtotal, total: saveTotals.total, status: sendNow ? 'sent' : 'draft',
      paymentLink: paymentLink.trim() || undefined,
      staffId: getActiveStaffId(staff) ?? undefined,
      repeatMonthly: repeatMonthly || undefined,
    })
    toast(sendNow ? t('clients.toast.invoiceSent', { number }) : t('clients.toast.invoiceDraft', { number }))
    setLineItems([{ description: '', amount: 0, qty: 1 }]); setCouponCode(''); setApplied(null); setDueDate(''); setPaymentLink(''); setRepeatMonthly(false)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('clients.billing.newInvoiceTitle')} width={520}>
      <div className="space-y-3">
        <div className="space-y-2">
          {lineItems.map((li, i) => (
            <div key={i} className="grid grid-cols-[1fr_80px_90px_auto] items-end gap-2">
              <Field label={i === 0 ? t('clients.billing.descLabel') : ''}>
                <Input value={li.description} onChange={e => setLineItems(rows => rows.map((r, j) => j === i ? { ...r, description: e.target.value } : r))} placeholder={t('clients.billing.descPlaceholder')} />
              </Field>
              <Field label={i === 0 ? t('clients.billing.qtyLabel') : ''}>
                <Input type="number" min="1" value={li.qty ?? 1} onChange={e => setLineItems(rows => rows.map((r, j) => j === i ? { ...r, qty: Number(e.target.value) || 1 } : r))} className="font-mono tabular-nums" />
              </Field>
              <Field label={i === 0 ? t('clients.billing.amountLabel') : ''}>
                <Input type="number" min="0" step="0.01" value={li.amount || ''} onChange={e => setLineItems(rows => rows.map((r, j) => j === i ? { ...r, amount: Number(e.target.value) || 0 } : r))} className="font-mono tabular-nums" />
              </Field>
              <Button variant="ghost" size="sm" aria-label={t('clients.billing.removeLine')} onClick={() => setLineItems(rows => rows.filter((_, j) => j !== i))} disabled={lineItems.length === 1}><Trash2 size={13} /></Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setLineItems(rows => [...rows, { description: '', amount: 0, qty: 1 }])}><Plus size={13} /> {t('clients.billing.addLineBtn')}</Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('clients.billing.couponLabel')} hint={t('clients.billing.couponHint')}>
            <div className="flex gap-2">
              <Input value={couponCode} onChange={e => setCouponCode(e.target.value)} onBlur={checkCoupon} placeholder="SAVE10" />
            </div>
          </Field>
          <Field label={t('clients.billing.dueDateLabel')} hint={t('clients.billing.couponHint')}><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></Field>
        </div>
        <Field label={t('clients.billing.paymentLinkLabel')} hint={t('clients.billing.paymentLinkHint')}>
          <Input value={paymentLink} onChange={e => setPaymentLink(e.target.value)} placeholder="https://buy.stripe.com/…" />
        </Field>
        <label className="flex items-start gap-2 text-sm text-ink">
          <Checkbox checked={repeatMonthly} onChange={setRepeatMonthly} label={t('clients.billing.repeatMonthly')} />
          <span>{t('clients.billing.repeatMonthly')}<span className="block text-2xs text-faint">{t('clients.billing.repeatMonthlyHint')}</span></span>
        </label>
        <div className="rounded-ctl border border-line bg-surface2 p-3 text-sm">
          <div className="flex justify-between text-muted"><span>{t('clients.billing.subtotal')}</span><span className="font-mono tabular-nums">${totals.subtotal.toFixed(2)}</span></div>
          {totals.discountAmount > 0 && <div className="flex justify-between text-ember-600"><span>{t('clients.billing.discount', { code: applied?.code })}</span><span className="font-mono tabular-nums">−${totals.discountAmount.toFixed(2)}</span></div>}
          <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold text-ink"><span>{t('clients.billing.total')}</span><span className="font-mono tabular-nums">${totals.total.toFixed(2)}</span></div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>{t('clients.billing.cancelBtn')}</Button>
          <Button variant="secondary" onClick={() => save(false)}>{t('clients.billing.saveDraftBtn')}</Button>
          <Button variant="primary" onClick={() => save(true)}>{t('clients.billing.sendInvoiceBtn')}</Button>
        </div>
      </div>
    </Dialog>
  )
}

function InvoicesCard({ clientId }: { clientId: string }) {
  const [newOpen, setNewOpen] = useState(false)
  const invoices = useLiveQuery(() => invoicesRepo.forClient(clientId), [clientId], [])
  const balance = clientBalance(invoices)
  const { t } = useTranslation()

  async function setStatus(inv: Invoice, status: InvoiceStatus) {
    await invoicesRepo.update(inv.id, { status })
    toast(t('clients.toast.invoiceStatus', { number: inv.number, status }))
  }

  async function stopRepeating(inv: Invoice) {
    await invoicesRepo.update(inv.id, { repeatMonthly: false })
    toast(t('clients.toast.repeatStopped', { number: inv.number }))
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-ink"><FileText size={16} className="text-verde-600" /> {t('clients.billing.invoicesTitle')}</div>
        <div className="flex items-center gap-3">
          {balance > 0 && <Stat label={t('clients.billing.balanceOwed')} value={`$${balance.toFixed(2)}`} tone="ember" />}
          <Button size="sm" onClick={() => setNewOpen(true)}><Plus size={14} /> {t('clients.billing.newInvoiceBtn')}</Button>
        </div>
      </div>
      {invoices.length === 0 ? (
        <p className="text-xs text-muted">{t('clients.billing.noInvoices')}</p>
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => (
            <div key={inv.id} className="flex items-center justify-between rounded-ctl border border-line px-3 py-2">
              <div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono tabular-nums font-medium text-ink">#{inv.number}</span>
                  <Tag tone={inv.status === 'paid' ? 'verde' : inv.status === 'sent' ? 'ember' : 'neutral'}>{inv.status}</Tag>
                  {inv.repeatMonthly && <Tag tone="verde"><Repeat size={11} className="me-1 inline" />{t('clients.billing.repeatsMonthly')}</Tag>}
                  {inv.repeatOf && <Tag>{t('clients.billing.recurringCopy')}</Tag>}
                </div>
                <div className="text-2xs text-faint">{inv.date}{inv.dueDate ? t('clients.billing.due', { date: inv.dueDate }) : ''} · {inv.lineItems.length}{t('clients.billing.lineItems', { s: inv.lineItems.length === 1 ? '' : 's' })}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono tabular-nums text-sm font-semibold text-ink">${inv.total.toFixed(2)}</span>
                {inv.status === 'sent' && inv.paymentLink && (
                  <Button size="sm" variant="secondary" onClick={() => window.open(inv.paymentLink, '_blank', 'noopener,noreferrer')}>
                    <ExternalLink size={13} /> {t('clients.billing.payNowBtn')}
                  </Button>
                )}
                {inv.status === 'sent' && <Button size="sm" variant="secondary" onClick={() => setStatus(inv, 'paid')}>{t('clients.billing.markPaidBtn')}</Button>}
                {inv.status === 'draft' && <Button size="sm" variant="secondary" onClick={() => setStatus(inv, 'sent')}>{t('clients.billing.sendBtn')}</Button>}
                {inv.repeatMonthly && <Button size="sm" variant="ghost" onClick={() => stopRepeating(inv)}>{t('clients.billing.stopRepeating')}</Button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <NewInvoiceDialog clientId={clientId} open={newOpen} onClose={() => setNewOpen(false)} />
    </Card>
  )
}

function RecordPaymentDialog({ clientId, open, onClose }: { clientId: string; open: boolean; onClose: () => void }) {
  const staff = useLiveQuery(() => staffRepo.all(), [], [])
  const [form, setForm] = useState({
    date: isoDay(new Date()),
    amount: '',
    type: 'payment' as PaymentType,
    method: 'transfer',
    memo: '',
    sessions: ''
  })
  const { t } = useTranslation()

  async function save(e: React.FormEvent) {
    e.preventDefault()
    
    const payment: Payment = {
      id: newId(),
      clientId,
      date: form.date,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      amount: parseFloat(form.amount) || 0,
      type: form.type,
      method: form.method,
      memo: form.memo,
      sessions: form.type === 'session-credit' ? parseInt(form.sessions) || 0 : undefined,
      staffId: getActiveStaffId(staff) ?? undefined,
    }

    await paymentsRepo.create(payment)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('clients.billing.recordTxTitle')}>
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><Label>{t('clients.billing.dateLabel')}</Label><Input 
            type="date" required
            value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} 
          /></div>
          <div>
            <Label>{t('clients.billing.typeLabel')}</Label>
            <select 
              className="w-full bg-surface border border-line rounded px-3 py-2 text-ink mt-1"
              value={form.type} onChange={e => setForm({ ...form, type: e.target.value as PaymentType })}
            >
              <option value="payment">{t('clients.billing.typePayment')}</option>
              <option value="session-credit">{t('clients.billing.typeSession')}</option>
              <option value="refund">{t('clients.billing.typeRefund')}</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div><Label>{t('clients.billing.amountLabelReq')}</Label><Input 
            type="number" step="0.01" required
            value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} 
          /></div>
          <div>
            <Label>{t('clients.billing.methodLabel')}</Label>
            <select 
              className="w-full bg-surface border border-line rounded px-3 py-2 text-ink mt-1"
              value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}
            >
              <option value="transfer">{t('clients.billing.methodTransfer')}</option>
              <option value="credit">{t('clients.billing.methodCredit')}</option>
              <option value="cash">{t('clients.billing.methodCash')}</option>
              <option value="other">{t('clients.billing.methodOther')}</option>
            </select>
          </div>
        </div>

        {form.type === 'session-credit' && (
          <div><Label>{t('clients.billing.sessionsIncluded')}</Label><Input 
            type="number" required
            value={form.sessions} onChange={e => setForm({ ...form, sessions: e.target.value })} 
          /></div>
        )}

        <div><Label>{t('clients.billing.memoLabel')}</Label><Input 
          value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} 
        /></div>

        <div className="pt-4 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>{t('clients.billing.cancelBtn')}</Button>
          <Button type="submit" variant="primary">{t('clients.billing.saveTxBtn')}</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function BillingTab({ clientId, client }: BillingTabProps) {
  const payments = useLiveQuery(
    async () => {
      const all = await paymentsRepo.table.where('clientId').equals(clientId).sortBy('date')
      return all.reverse()
    },
    [clientId],
    []
  )
  const logs = useLiveQuery(() => db.sessionLogs.where('clientId').equals(clientId).toArray(), [clientId], [])
  const pack = sessionPackBalance(payments, logs)
  const { t } = useTranslation()

  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="max-w-3xl">
      {client && <div className="mb-4"><GymCutCard client={client} payments={payments} /></div>}
      <div className="mb-4"><InvoicesCard clientId={clientId} /></div>
      {pack && (
        <div className="mb-4 rounded-ctl border border-line bg-surface2 px-3 py-2" title={t('clients.billing.packBalanceHint')}>
          <p className="text-sm font-semibold text-ink">{t('clients.billing.packBalance', { remaining: pack.remaining, purchased: pack.purchased })}</p>
          <p className="text-2xs text-faint">{t('clients.billing.packBalanceHint')}</p>
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">{t('clients.billing.ledgerTitle')}</h3>
        <Button variant="ghost" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus size={16} className="me-1.5" /> {t('clients.billing.recordTxBtn')}
        </Button>
      </div>

      {payments.length === 0 ? (
        <EmptyState 
          icon={<CreditCard size={28} strokeWidth={1.5} />}
          title={t('clients.billing.noTxTitle')} 
          body={t('clients.billing.noTxBody')} 
        />
      ) : (
        <div className="space-y-4">
          {payments.map(p => (
            <Card key={p.id}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center ${p.type === 'refund' ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                    {p.type === 'refund' ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                  </div>
                  <div>
                    <div className="font-medium text-ink">
                      {p.type === 'session-credit' ? t('clients.billing.typeSession') : p.type === 'refund' ? t('clients.billing.typeRefund') : t('clients.billing.typePayment')}
                    </div>
                    <div className="text-sm text-faint">
                      {p.date} • {p.method} {p.sessions ? `• ${p.sessions} ${t('clients.billing.sessions')}` : ''}
                    </div>
                    {p.memo && <div className="text-sm text-muted mt-1">{p.memo}</div>}
                  </div>
                </div>
                <div className={`font-semibold text-lg ${p.type === 'refund' ? 'text-red-500' : 'text-ink'}`}>
                  {p.type === 'refund' ? '-' : ''}${p.amount.toFixed(2)}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Per-open mount: a fresh form (and today's date) each time. */}
      {dialogOpen && <RecordPaymentDialog clientId={clientId} open onClose={() => setDialogOpen(false)} />}
    </div>
  )
}

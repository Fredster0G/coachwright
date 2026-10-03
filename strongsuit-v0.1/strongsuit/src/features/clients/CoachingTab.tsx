import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Target, ShieldCheck, ShieldAlert, Activity, FileSignature, HeartPulse, Info,
} from 'lucide-react'
import {
  Card, Field, Select, Button, Stat, Tag, Dialog, Input, toast,
} from '@/design'
import { clientsRepo, waiversRepo, logsRepo, trainerRepo } from '@/db/repo'
import type { Client, Units, TrainingGoal, WaiverKind } from '@/db/types'
import { goalPlan, ALL_GOALS, GOAL_LABELS } from '@/lib/goals'
import {
  screen, PARQ_QUESTIONS, CLEARED_COPY, FLAGGED_COPY, PARQ_SOURCE,
  assumptionOfRiskText, informedConsentText, ASSUMPTION_OF_RISK_TITLE, INFORMED_CONSENT_TITLE,
} from '@/lib/parq'
import { acwr, type DayLoad } from '@/lib/trainingLoad'
import { setTonnage } from '@/lib/core'
import { sha256Hex } from '@/lib/hash'
import { today } from '@/lib/core'
import { useTranslation } from '@/lib/i18n'

// ---------- Goal & programming ----------
function GoalCard({ client }: { client: Client }) {
  const goal = client.trainingGoal
  const plan = goal ? goalPlan(goal) : null
  const { t } = useTranslation()
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Target size={16} className="text-verde-600" /> {t('clients.coaching.goalTitle')}
        </div>
        <Field label="">
          <Select
            value={goal ?? ''}
            onChange={e => clientsRepo.update(client.id, { trainingGoal: (e.target.value || undefined) as TrainingGoal })}
            className="!h-8 w-48"
          >
            <option value="">{t('clients.coaching.chooseGoal')}</option>
            {ALL_GOALS.map(g => <option key={g} value={g}>{GOAL_LABELS[g]}</option>)}
          </Select>
        </Field>
      </div>

      {!plan ? (
        <p className="text-xs text-muted">{t('clients.coaching.noGoalBody')}</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">{plan.summary}</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label={t('clients.coaching.reps')} value={`${plan.repRange[0]}–${plan.repRange[1]}`} />
            <Stat label={t('clients.coaching.intensity')} value={`${plan.intensityPct[0]}–${plan.intensityPct[1]}`} unit="%1RM" />
            <Stat label={t('clients.coaching.rest')} value={`${plan.restSeconds[0]}–${plan.restSeconds[1]}`} unit="s" />
            <Stat label={t('clients.coaching.setsPerMuscle')} value={`${plan.setsPerMusclePerWeek[0]}–${plan.setsPerMusclePerWeek[1]}`} />
            <Stat label={t('clients.coaching.effort')} value={`${plan.rir[0]}–${plan.rir[1]}`} unit="RIR" />
            <Stat label={t('clients.coaching.daysPerWeek')} value={`${plan.sessionsPerWeek[0]}–${plan.sessionsPerWeek[1]}`} />
            <Stat label={t('clients.coaching.protein')} value={plan.proteinPerKg} unit="g/kg" />
            <Stat label={t('clients.coaching.calories')} value={plan.calorieAdjustmentPct === 0 ? t('clients.coaching.maintain') : `${plan.calorieAdjustmentPct > 0 ? '+' : ''}${plan.calorieAdjustmentPct}%`} tone={plan.calorieAdjustmentPct < 0 ? 'ember' : 'verde'} />
          </div>
          <p className="mt-3 text-xs text-muted"><span className="font-medium text-ink">{t('clients.coaching.conditioning')}</span> {plan.cardio}</p>
          <div className="mt-3 border-t border-line pt-3">
            <div className="mb-1 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-verde-600"><Info size={13} /> {t('clients.coaching.whyTargets')}</div>
            <ul className="space-y-1.5">
              {plan.rationale.map((r, i) => (
                <li key={i} className="text-xs text-muted">{r.text}<span className="mt-0.5 block text-2xs text-faint">{t('clients.coaching.source')}{r.source}</span></li>
              ))}
            </ul>
          </div>
        </>
      )}
    </Card>
  )
}

// ---------- Training load (ACWR) ----------
function LoadCard({ clientId }: { clientId: string }) {
  const loads = useLiveQuery(async (): Promise<DayLoad[]> => {
    const logs = await logsRepo.forClient(clientId)
    return logs.map(l => ({
      date: l.date,
      load: l.entries.reduce((sum, e) =>
        sum + e.sets.reduce((s, set) => s + (set.done ? setTonnage(set.actualLoad, set.actualReps) : 0), 0), 0),
    })).filter(d => d.load > 0)
  }, [clientId], [])
  const { t } = useTranslation()

  const a = acwr(loads, today())
  // Amber for a sharp rise, never red: this describes a load CHANGE, not a
  // hazard. Signal-red here would be the UI making the injury-risk claim the
  // literature doesn't support (see lib/trainingLoad.ts's honesty rule).
  const toneCls = { 'steady': 'text-verde-600', 'rising': 'text-ember-600', 'sharp-rise': 'text-ember-600', 'below-norm': 'text-muted', 'insufficient-data': 'text-faint' }[a.zone]
  const barCls = { 'steady': 'bg-verde-600', 'rising': 'bg-ember-500', 'sharp-rise': 'bg-ember-600', 'below-norm': 'bg-faint', 'insufficient-data': 'bg-faint' }[a.zone]

  return (
    <Card>
      <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Activity size={16} className="text-verde-600" /> {t('clients.coaching.loadTitle')}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Stat label={t('clients.coaching.acute')} value={a.acute} />
        <Stat label={t('clients.coaching.chronic')} value={a.chronic} />
        <Stat label={t('clients.coaching.ratio')} value={a.ratio || '—'} tone={a.zone === 'sharp-rise' ? 'ember' : 'ink'} />
      </div>
      <div className="mt-3">
        {/* 0–2 scale; sweet spot 0.8–1.3 marked */}
        <div className="relative h-2 overflow-hidden rounded-full bg-surface2">
          <div className="absolute inset-y-0 bg-verde-100" style={{ left: `${(0.8 / 2) * 100}%`, width: `${((1.3 - 0.8) / 2) * 100}%` }} />
          <div className={`absolute inset-y-0 start-0 rounded-full ${barCls}`} style={{ width: `${Math.min(100, (a.ratio / 2) * 100)}%`, opacity: 0.5 }} />
        </div>
        <p className={`mt-2 text-xs ${toneCls}`}>{a.note}</p>
        <p className="mt-1 text-2xs text-faint">{t('clients.coaching.loadNote')}</p>
      </div>
    </Card>
  )
}

// ---------- Safety: PAR-Q + waivers ----------
function ScreeningDialog({ client, open, onClose }: { client: Client; open: boolean; onClose: () => void }) {
  const [answers, setAnswers] = useState<boolean[]>(() => PARQ_QUESTIONS.map(() => false))
  const [note, setNote] = useState('')
  const { t } = useTranslation()

  async function save() {
    const result = screen(PARQ_QUESTIONS.map((q, i) => ({ q, yes: answers[i] })), note.trim() || undefined)
    await clientsRepo.update(client.id, { screening: result })
    toast(result.cleared ? t('clients.toast.screeningCleared') : t('clients.toast.screeningFlagged'))
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('clients.coaching.screeningTitle')} width={560}>
      <div className="space-y-2">
        <p className="text-xs text-muted">{t('clients.coaching.screeningBody')}</p>
        <div className="space-y-1.5">
          {PARQ_QUESTIONS.map((q, i) => (
            <label key={i} className="flex items-start gap-3 rounded-ctl border border-line px-3 py-2 text-sm">
              <input type="checkbox" checked={answers[i]} onChange={e => setAnswers(a => a.map((v, j) => j === i ? e.target.checked : v))} className="mt-0.5 accent-[var(--ember-500)]" />
              <span className="text-ink">{q}</span>
            </label>
          ))}
        </div>
        <Field label={t('clients.coaching.noteLabel')}><Input value={note} onChange={e => setNote(e.target.value)} placeholder={t('clients.coaching.notePlaceholder')} /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>{t('clients.coaching.cancelBtn')}</Button>
          <Button variant="primary" onClick={save}>{t('clients.coaching.saveScreeningBtn')}</Button>
        </div>
      </div>
    </Dialog>
  )
}

function WaiverDialog({ client, businessName, open, onClose }: { client: Client; businessName: string; open: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<WaiverKind>('assumption-of-risk')
  const [signed, setSigned] = useState('')
  const { t } = useTranslation()

  const doc = kind === 'informed-consent'
    ? { title: INFORMED_CONSENT_TITLE, text: informedConsentText(businessName) }
    : { title: ASSUMPTION_OF_RISK_TITLE, text: assumptionOfRiskText(businessName, `${client.firstName} ${client.lastName}`.trim()) }

  async function sign() {
    if (!signed.trim()) return
    const documentHash = await sha256Hex(doc.text)
    await waiversRepo.create({
      clientId: client.id, kind, documentTitle: doc.title, documentText: doc.text,
      documentHash, signedName: signed.trim(), signedDate: today(),
      deviceLabel: navigator.platform || 'this device',
    })
    toast(t('clients.toast.waiverRecorded'))
    setSigned('')
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('clients.coaching.waiverTitle')} width={620}>
      <div className="space-y-3">
        <Field label={t('clients.coaching.documentLabel')}>
          <Select value={kind} onChange={e => setKind(e.target.value as WaiverKind)}>
            <option value="assumption-of-risk">{t('clients.coaching.waiverRisk')}</option>
            <option value="informed-consent">{t('clients.coaching.waiverConsent')}</option>
          </Select>
        </Field>
        <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-card border border-line bg-surface2 p-3 text-xs leading-relaxed text-ink">
          {doc.text}
        </div>
        <p className="text-2xs text-faint">{t('clients.coaching.waiverDisclaimer')}</p>
        <Field label={t('clients.coaching.signatureLabel')}>
          <Input value={signed} onChange={e => setSigned(e.target.value)} placeholder={`${client.firstName} ${client.lastName}`.trim()} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('clients.coaching.cancelBtn')}</Button>
          <Button variant="primary" onClick={sign} disabled={!signed.trim()}>{t('clients.coaching.recordAckBtn')}</Button>
        </div>
      </div>
    </Dialog>
  )
}

function SafetyCard({ client }: { client: Client }) {
  const [screenOpen, setScreenOpen] = useState(false)
  const [waiverOpen, setWaiverOpen] = useState(false)
  const trainer = useLiveQuery(() => trainerRepo.get())
  const waivers = useLiveQuery(() => waiversRepo.forClient(client.id), [client.id], [])
  const s = client.screening
  const hasRiskWaiver = waivers.some(w => w.kind === 'assumption-of-risk')
  const cleared = s?.cleared && hasRiskWaiver
  const { t } = useTranslation()

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <HeartPulse size={16} className="text-verde-600" /> {t('clients.coaching.safetyTitle')}
        </div>
        {cleared
          ? <Tag tone="verde"><ShieldCheck size={11} /> {t('clients.coaching.cleared')}</Tag>
          : <Tag tone="ember"><ShieldAlert size={11} /> {t('clients.coaching.actionNeeded')}</Tag>}
      </div>

      {/* Screening status */}
      <div className="rounded-ctl border border-line p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-ink">{t('clients.coaching.screeningBoxTitle')}</span>
          <Button size="sm" variant="secondary" onClick={() => setScreenOpen(true)}>{s ? t('clients.coaching.rescreenBtn') : t('clients.coaching.runScreeningBtn')}</Button>
        </div>
        {s ? (
          <p className={`mt-2 text-xs ${s.cleared ? 'text-verde-600' : 'text-ember-600'}`}>
            {s.date}: {s.cleared ? CLEARED_COPY : FLAGGED_COPY}
            {s.flags.length > 0 && <span className="mt-1 block text-2xs text-faint">{t('clients.coaching.flagged', { count: s.flags.length, note: s.note ? `Note: ${s.note}` : '' })}</span>}
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted">{t('clients.coaching.notScreened')}</p>
        )}
        <p className="mt-1 text-2xs text-faint">{PARQ_SOURCE}</p>
      </div>

      {/* Waivers */}
      <div className="mt-3 rounded-ctl border border-line p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-ink">{t('clients.coaching.waiversBoxTitle')}</span>
          <Button size="sm" variant="secondary" onClick={() => setWaiverOpen(true)}><FileSignature size={13} /> {t('clients.coaching.recordWaiverBtn')}</Button>
        </div>
        {waivers.length === 0 ? (
          <p className="mt-2 text-xs text-muted">{t('clients.coaching.noWaivers')}</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {waivers.map(w => (
              <li key={w.id} className="flex items-center justify-between text-xs">
                <span className="text-ink">{w.documentTitle}</span>
                <span className="text-2xs text-faint">{t('clients.coaching.signed', { name: w.signedName, date: w.signedDate })}<span className="font-mono">{w.documentHash.slice(0, 8)}</span></span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-3 text-2xs text-faint">
        {t('clients.coaching.disclaimer')}
      </p>

      {/* Mounted only while open, so a re-screen starts from blank answers
          instead of the last session's ticks (and the waiver from no name). */}
      {screenOpen && <ScreeningDialog client={client} open onClose={() => setScreenOpen(false)} />}
      {waiverOpen && <WaiverDialog client={client} businessName={trainer?.businessName || ''} open onClose={() => setWaiverOpen(false)} />}
    </Card>
  )
}

export default function CoachingTab({ client }: { client: Client; units: Units }) {
  return (
    <div className="max-w-3xl space-y-6">
      <SafetyCard client={client} />
      <GoalCard client={client} />
      <LoadCard clientId={client.id} />
    </div>
  )
}

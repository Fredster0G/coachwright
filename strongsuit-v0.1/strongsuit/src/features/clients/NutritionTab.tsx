import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Apple, Info, ShieldAlert, AlertTriangle } from 'lucide-react'
import { Card, Field, Input, Select, Stat, EmptyState, Button, toast } from '@/design'
import { clientsRepo, metricsRepo } from '@/db/repo'
import type { Client, Units, Sex, ActivityLevel, NutritionGoal } from '@/db/types'
import { nutritionPlan, ageFromBirthDate, toKg, ACTIVITY_FACTORS, carbCycle, dietBreakAdvice, type RationaleLine } from '@/lib/nutrition'
import { assessEnergyAvailability, screenPrescription } from '@/lib/energyAvailability'
import { chooseBmr, proteinDistribution, carbTarget, type SessionLoad } from '@/lib/nutritionAdvanced'
import { goalPlan } from '@/lib/goals'
import { today } from '@/lib/core'
import { useTranslation, type MessageKey } from '@/lib/i18n'
import { renderMsg } from '@/lib/i18n/msg'

function weeksBetween(start: string, end: string): number {
  const ms = new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()
  return Math.max(0, Math.floor(ms / (7 * 86_400_000)))
}

function Why({ line }: { line: RationaleLine }) {
  const { t } = useTranslation()
  return (
    <p className="mt-1 text-xs text-muted">
      {line.msg ? renderMsg(line.msg, t) : line.text}
      <span className="mt-0.5 block text-2xs text-faint">{t('nutr.source', { source: line.source })}</span>
    </p>
  )
}

export default function NutritionTab({ client, units }: { client: Client; units: Units }) {
  const [bwDraft, setBwDraft] = useState('')
  const { t } = useTranslation()

  // latest logged bodyweight drives the math — nutrition stays tied to real data
  const latestBw = useLiveQuery(async () => {
    const rows = await metricsRepo.table.where('[clientId+key]').equals([client.id, 'bodyweight']).sortBy('date')
    return rows.at(-1) ?? null
  }, [client.id])

  // Energy availability is per kg of FAT-FREE mass, so it needs a real body-fat
  // reading. Sourced from logged metrics rather than estimated — see the
  // refusal-to-guess rule in lib/energyAvailability.ts.
  const latestBf = useLiveQuery(async () => {
    const rows = await metricsRepo.table.where('[clientId+key]').equals([client.id, 'bodyfat']).sortBy('date')
    return rows.at(-1) ?? null
  }, [client.id])

  const patch = (p: Partial<Client>) => clientsRepo.update(client.id, p)

  async function saveBodyweight() {
    const v = Number(bwDraft)
    if (!v || v <= 0) return
    await metricsRepo.create({ clientId: client.id, date: today(), type: 'bodyweight', key: 'bodyweight', value: v, unit: units })
    setBwDraft('')
    toast(t('nutr.bwLogged'))
  }

  const age = client.birthDate ? ageFromBirthDate(client.birthDate) : null
  // Nutrition goal falls back to the one implied by the training goal, so a
  // coach who set "Fat loss" on the Coaching tab gets a cut here automatically.
  const effectiveGoal = client.nutritionGoal ?? (client.trainingGoal ? goalPlan(client.trainingGoal).nutritionGoal : undefined)
  const goalFromTraining = !client.nutritionGoal && !!client.trainingGoal
  const ready = latestBw && client.heightCm && client.sex && age !== null && client.activityLevel && effectiveGoal
  const plan = ready
    ? nutritionPlan({
        weightKg: toKg(latestBw!.value, latestBw!.unit === 'kg' ? 'kg' : 'lb'),
        heightCm: client.heightCm!,
        age: age!,
        sex: client.sex!,
        activity: client.activityLevel!,
        goal: effectiveGoal!,
      })
    : null

  // How much energy training itself costs. Approximated from the activity
  // factor rather than logged sessions — stated as an approximation in the UI,
  // because using TDEE here is the classic way to get EA wrong.
  const exerciseKcal = plan ? Math.round(plan.tdee - plan.bmr * 1.2) : 0
  const ea = plan && latestBw
    ? assessEnergyAvailability({
        intakeKcal: plan.calories,
        exerciseKcal: Math.max(0, exerciseKcal),
        weight: latestBw.value,
        units: latestBw.unit === 'kg' ? 'kg' : 'lb',
        bodyFatPct: latestBf?.value,
        sex: client.sex,
      })
    : null
  // Better BMR when body composition is actually known — Mifflin can't see it
  // and systematically under-predicts for lean, muscular clients.
  const bmrChoice = plan && latestBw
    ? chooseBmr({
        mifflinBmr: plan.bmr,
        weight: latestBw.value,
        units: latestBw.unit === 'kg' ? 'kg' : 'lb',
        bodyFatPct: latestBf?.value,
      })
    : null

  // Protein as a distribution, not just a daily total — the per-meal dose is
  // what actually drives the response.
  const weightKgNow = latestBw ? toKg(latestBw.value, latestBw.unit === 'kg' ? 'kg' : 'lb') : null
  const protein = weightKgNow && age !== null
    ? proteinDistribution({ weightKg: weightKgNow, age, cutting: effectiveGoal === 'cut' })
    : null

  const [carbDay, setCarbDay] = useState<SessionLoad>('moderate')
  const carbs = weightKgNow ? carbTarget(weightKgNow, carbDay) : null

  const prescriptionWarning = plan && latestBw
    ? screenPrescription({
        targetKcal: plan.calories,
        exerciseKcal: Math.max(0, exerciseKcal),
        weight: latestBw.value,
        units: latestBw.unit === 'kg' ? 'kg' : 'lb',
        bodyFatPct: latestBf?.value,
        sex: client.sex,
      })
    : null

  return (
    <div className="max-w-3xl space-y-6">
      {/* Safety first, literally: if the prescribed target drives energy
          availability below threshold, that outranks every macro on this page. */}
      {prescriptionWarning && (
        <Card className={prescriptionWarning.severity === 'stop' ? 'border-signal-600/50' : 'border-ember-500/50'}>
          <div className="flex items-start gap-2.5">
            {prescriptionWarning.severity === 'stop'
              ? <ShieldAlert size={18} className="mt-0.5 shrink-0 text-signal-600" />
              : <AlertTriangle size={18} className="mt-0.5 shrink-0 text-ember-600" />}
            <div>
              <p className="text-sm font-semibold text-ink">
                {prescriptionWarning.severity === 'stop' ? t('nutr.stopTitle') : t('nutr.warnTitle')}
              </p>
              <p className="mt-1 text-xs text-muted">{renderMsg(prescriptionWarning.msg, t)}</p>
              <p className="mt-1.5 text-2xs text-faint">{prescriptionWarning.source}</p>
            </div>
          </div>
        </Card>
      )}

      {ea && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <ShieldAlert size={14} /> {t('nutr.ea')}
            </div>
            {ea.ea != null && (
              <span className={`font-mono tabular-nums text-lg font-semibold ${
                ea.band === 'low' ? 'text-signal-600' : ea.band === 'reduced' ? 'text-ember-600' : 'text-verde-600'
              }`}>
                {ea.ea}<span className="text-2xs font-normal text-faint">{t('nutr.eaUnit')}</span>
              </span>
            )}
          </div>
          <p className="text-xs text-ink">{renderMsg(ea.summaryMsg, t)}</p>
          <p className="mt-1.5 text-2xs text-faint">
            {renderMsg(ea.confidenceMsg, t)} {t('nutr.eaApprox')}
          </p>
          <p className="mt-1 text-2xs text-faint">{ea.source}</p>
        </Card>
      )}

      {bmrChoice && bmrChoice.equation !== 'mifflin' && (
        <Card>
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            <Info size={14} /> {t('nutr.bmrRefined')}
          </div>
          <p className="text-sm text-ink">
            <span className="font-mono tabular-nums">{bmrChoice.bmr}</span> {t('nutr.kcalDay')}
            <span className="text-2xs text-faint">{t('nutr.mifflinWas', { bmr: plan?.bmr ?? '' })}</span>
          </p>
          <p className="mt-1 text-xs text-muted">{renderMsg(bmrChoice.rationaleMsg, t)}</p>
          <p className="mt-1 text-2xs text-faint">{bmrChoice.source}</p>
        </Card>
      )}

      {protein && (
        <Card>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            <Info size={14} /> {t('nutr.proteinDist')}
          </div>
          <p className="text-sm text-ink">
            {t('nutr.proteinPerDay', { daily: protein.dailyG, perMeal: protein.perMealG, meals: protein.meals })}
          </p>
          <p className="mt-1 text-2xs text-muted">
            {t('nutr.proteinFloor', { floor: protein.perMealFloorG })}
          </p>
          {protein.noteMsgs.map((n, i) => (
            <p key={i} className="mt-1.5 text-2xs text-muted">{renderMsg(n, t)}</p>
          ))}
          <p className="mt-1.5 text-2xs text-faint">{protein.source}</p>
        </Card>
      )}

      {carbs && (
        <Card>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <Info size={14} /> {t('nutr.carbDay')}
            </div>
            <Select value={carbDay} onChange={e => setCarbDay(e.target.value as SessionLoad)} className="!h-7 !w-44 text-xs" aria-label={t('nutr.carbDayLabel')}>
              {(['rest', 'light', 'moderate', 'high', 'veryHigh'] as const).map(l => <option key={l} value={l}>{t(`nutr.load.${l}`)}</option>)}
            </Select>
          </div>
          <p className="text-sm text-ink">
            <span className="font-mono tabular-nums">{carbs.gramsLow}–{carbs.gramsHigh} g</span>
            <span className="text-2xs text-faint"> ({carbs.gPerKg.low}–{carbs.gPerKg.high} g/kg) · {renderMsg(carbs.labelMsg, t)}</span>
          </p>
          <p className="mt-1 text-2xs text-muted">
            {t('nutr.carbWhy')}
          </p>
          {carbs.intraSessionMsg && <p className="mt-1.5 text-2xs text-muted">{renderMsg(carbs.intraSessionMsg, t)}</p>}
          <p className="mt-1.5 text-2xs text-faint">{carbs.source}</p>
        </Card>
      )}
      {/* Profile inputs — persist immediately, plan recomputes live */}
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-ink">{t('nutr.profile')}</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label={t('nutr.sex')} hint={t('nutr.sexHint')}>
            <Select value={client.sex ?? ''} onChange={e => patch({ sex: (e.target.value || undefined) as Sex })}>
              <option value="">—</option>
              <option value="male">{t('nutr.male')}</option>
              <option value="female">{t('nutr.female')}</option>
            </Select>
          </Field>
          <Field label={t('nutr.height')}>
            <Input
              type="number" min="100" max="230" defaultValue={client.heightCm ?? ''}
              onBlur={e => patch({ heightCm: Number(e.target.value) || undefined })}
              className="font-mono tabular-nums"
            />
          </Field>
          <Field label={t('nutr.birthDate')}>
            <Input
              type="date" defaultValue={client.birthDate ?? ''}
              onBlur={e => patch({ birthDate: e.target.value || undefined })}
            />
          </Field>
          <Field label={t('nutr.activity')}>
            <Select value={client.activityLevel ?? ''} onChange={e => patch({ activityLevel: (e.target.value || undefined) as ActivityLevel })}>
              <option value="">—</option>
              {Object.keys(ACTIVITY_FACTORS).map(k => <option key={k} value={k}>{t(`nutr.activity.${k}` as MessageKey)}</option>)}
            </Select>
          </Field>
          <Field label={t('nutr.goal')}>
            <Select value={client.nutritionGoal ?? ''} onChange={e => patch({ nutritionGoal: (e.target.value || undefined) as NutritionGoal })}>
              <option value="">—</option>
              <option value="cut">{t('nutr.goal.cut')}</option>
              <option value="maintain">{t('nutr.goal.maintain')}</option>
              <option value="gain">{t('nutr.goal.gain')}</option>
            </Select>
          </Field>
          <Field label={t('nutr.bodyweight', { units })} hint={latestBw ? t('nutr.bwLatest', { value: latestBw.value, unit: latestBw.unit, date: latestBw.date }) : t('nutr.bwNone')}>
            <div className="flex gap-2">
              <Input
                type="number" min="0" placeholder={latestBw ? String(latestBw.value) : '0'}
                value={bwDraft} onChange={e => setBwDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveBodyweight()}
                className="font-mono tabular-nums"
              />
              <Button size="sm" className="h-9 shrink-0" onClick={saveBodyweight} disabled={!Number(bwDraft)}>{t('nutr.log')}</Button>
            </div>
          </Field>
        </div>
      </Card>

      {!plan ? (
        <EmptyState
          icon={<Apple size={28} strokeWidth={1.5} />}
          title={t('nutr.emptyTitle')}
          body={t('nutr.emptyBody')}
        />
      ) : (
        <>
          {/* Targets */}
          <Card>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">{t('nutr.targets')}</h3>
              <span className="text-2xs text-faint">{t('nutr.bmrTdee', { bmr: plan.bmr, tdee: plan.tdee })}</span>
            </div>
            {goalFromTraining && client.trainingGoal && (
              <p className="mb-2 text-2xs text-muted">{t('nutr.goalFromTraining', { goal: t(`goal.${client.trainingGoal}.label` as MessageKey) })}</p>
            )}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label={t('nutr.calories')} value={plan.calories} unit="kcal" tone="verde" />
              <Stat label={t('nutr.protein')} value={plan.proteinG} unit="g" />
              <Stat label={t('nutr.carbs')} value={plan.carbsG} unit="g" />
              <Stat label={t('nutr.fat')} value={plan.fatG} unit="g" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4 border-t border-line pt-3">
              <Stat label={t('nutr.fiber')} value={plan.fiberG} unit="g" />
              <Stat label={t('nutr.water')} value={plan.waterL} unit="L" />
            </div>
            <p className="mt-3 text-xs text-muted">{renderMsg(plan.weeklyRateMsg, t)}</p>
          </Card>

          {/* Training-day / rest-day carb cycling */}
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">{t('nutr.cycling')}</h3>
              <Field label="">
                <Select
                  value={client.trainingDaysPerWeek ?? 4}
                  onChange={e => patch({ trainingDaysPerWeek: Number(e.target.value) })}
                  className="!h-8 !w-40 text-xs"
                >
                  {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{t('nutr.daysPerWeek', { n })}</option>)}
                </Select>
              </Field>
            </div>
            {(() => {
              const cycled = carbCycle(plan, client.trainingDaysPerWeek ?? 4)
              return (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-ctl border border-verde-600/30 bg-verde-100/40 p-3">
                      <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-verde-700">{t('nutr.trainingDays')}</p>
                      <p className="font-mono tabular-nums text-lg font-semibold text-ink">{t('nutr.kcal', { n: cycled.trainingDay.calories })}</p>
                      <p className="text-2xs text-muted">{t('nutr.dayMacros', { carbs: cycled.trainingDay.carbsG, protein: cycled.trainingDay.proteinG, fat: cycled.trainingDay.fatG })}</p>
                    </div>
                    <div className="rounded-ctl border border-line bg-surface2 p-3">
                      <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-faint">{t('nutr.restDays')}</p>
                      <p className="font-mono tabular-nums text-lg font-semibold text-ink">{t('nutr.kcal', { n: cycled.restDay.calories })}</p>
                      <p className="text-2xs text-muted">{t('nutr.dayMacros', { carbs: cycled.restDay.carbsG, protein: cycled.restDay.proteinG, fat: cycled.restDay.fatG })}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-2xs text-faint">{cycled.rationale.msg ? renderMsg(cycled.rationale.msg, t) : cycled.rationale.text}<span className="mt-0.5 block">{t('nutr.source', { source: cycled.rationale.source })}</span></p>
                </>
              )
            })()}
          </Card>

          {/* Diet-break awareness (cut goal only) */}
          {effectiveGoal === 'cut' && (
            <Card>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">{t('nutr.dietDuration')}</h3>
                <Field label="">
                  <Input
                    type="date" defaultValue={client.dietPhaseStartDate ?? ''}
                    onBlur={e => patch({ dietPhaseStartDate: e.target.value || undefined })}
                    className="!h-8 !w-36 text-xs" placeholder={t('nutr.cutStart')} aria-label={t('nutr.cutStart')}
                  />
                </Field>
              </div>
              {!client.dietPhaseStartDate ? (
                <p className="text-xs text-muted">{t('nutr.cutStartHint')}</p>
              ) : (() => {
                const weeks = weeksBetween(client.dietPhaseStartDate, today())
                const advice = dietBreakAdvice(weeks)
                return (
                  <div>
                    <p className={`text-sm ${advice.recommend ? 'text-ember-600' : 'text-ink'}`}>{renderMsg(advice.noteMsg, t)}</p>
                    <p className="mt-1 text-2xs text-faint">{t('nutr.source', { source: advice.source })}</p>
                  </div>
                )
              })()}
            </Card>
          )}

          {/* The why — every number defends itself */}
          <Card>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-verde-600">
              <Info size={14} /> {t('nutr.why')}
            </div>
            <dl className="divide-y divide-line">
              {([
                [t('nutr.calories'), plan.rationale.calories],
                [t('nutr.protein'), plan.rationale.protein],
                [t('nutr.carbs'), plan.rationale.carbs],
                [t('nutr.fat'), plan.rationale.fat],
                [t('nutr.fiber'), plan.rationale.fiber],
                [t('nutr.water'), plan.rationale.water],
              ] as [string, RationaleLine][]).map(([label, line]) => (
                <div key={label} className="py-2.5 first:pt-0 last:pb-0">
                  <dt className="text-xs font-semibold text-ink">{label}</dt>
                  <dd><Why line={line} /></dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 border-t border-line pt-3 text-2xs text-faint">
              {t('nutr.disclaimer')}
            </p>
          </Card>
        </>
      )}
    </div>
  )
}

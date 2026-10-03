// ===== Nutrition engine (spec §4.18a) =====
// Evidence-based, deterministic, fully offline. Every number this module
// produces carries a rationale with its source — the trainer can defend any
// recommendation to a client. This is NOT medical advice and the UI must say
// so; it implements published sports-nutrition consensus positions.
//
// Sources implemented:
// - BMR: Mifflin-St Jeor equation (Mifflin et al., Am J Clin Nutr 1990) —
//   identified as the most accurate predictive equation for healthy adults by
//   the Academy of Nutrition and Dietetics' evidence review (Frankenfield
//   et al., J Am Diet Assoc 2005).
// - TDEE activity factors: standard FAO/WHO-derived multipliers (1.2–1.9).
// - Deficit/surplus sizing: 0.5–1.0% bodyweight/week loss (Helms, Aragon &
//   Fitschen, JISSN 2014); lean-gain surplus ~5–15% over maintenance (Iraki
//   et al., Sports 2019 off-season recommendations).
// - Protein: 1.6–2.2 g/kg/day for trainees (Morton et al., Br J Sports Med
//   2018 meta-analysis; ISSN Position Stand, Jäger et al., JISSN 2017);
//   high end while dieting (Helms et al., JISSN 2014).
// - Fat: 20–35% of calories (Institute of Medicine AMDR, Dietary Reference
//   Intakes 2005).
// - Fiber: 14 g per 1,000 kcal (Institute of Medicine DRI 2005).
// - Water: Adequate Intake ~3.7 L/day men, ~2.7 L/day women, more with
//   training sweat losses (Institute of Medicine 2005; ACSM fluid guidance).

import type { ActivityLevel, NutritionGoal, Sex, Units } from '@/db/types'
import { KG_PER_LB } from './core'
import { english, type Msg } from './i18n/msg'

export interface RationaleLine {
  text: string    // why this number, in plain coach language (English)
  source: string  // the citation (not translated — it's a reference)
  msg?: Msg       // `text`, translatable (lib/i18n/msg.ts)
}

/** A rationale line whose English text and translatable message share one catalogue entry. */
const line = (m: Msg, source: string): RationaleLine => ({ text: english(m), source, msg: m })

export interface NutritionPlan {
  bmr: number
  tdee: number
  calories: number
  proteinG: number
  fatG: number
  carbsG: number
  fiberG: number
  waterL: number
  weeklyRateNote: string
  weeklyRateMsg: Msg
  rationale: {
    calories: RationaleLine
    protein: RationaleLine
    fat: RationaleLine
    carbs: RationaleLine
    fiber: RationaleLine
    water: RationaleLine
  }
}

export const ACTIVITY_FACTORS: Record<ActivityLevel, { factor: number; label: string }> = {
  sedentary: { factor: 1.2, label: 'Sedentary (desk job, little exercise)' },
  light: { factor: 1.375, label: 'Light (training 1–3 days/week)' },
  moderate: { factor: 1.55, label: 'Moderate (training 3–5 days/week)' },
  very: { factor: 1.725, label: 'Very active (hard training 6–7 days/week)' },
  extra: { factor: 1.9, label: 'Extra (physical job + hard daily training)' },
}

/** Mifflin-St Jeor resting energy expenditure, kcal/day. */
export function mifflinStJeor(weightKg: number, heightCm: number, age: number, sex: Sex): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return Math.round(base + (sex === 'male' ? 5 : -161))
}

export function ageFromBirthDate(birthDate: string, onDate = new Date()): number {
  const b = new Date(birthDate + 'T00:00:00')
  let age = onDate.getFullYear() - b.getFullYear()
  const m = onDate.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && onDate.getDate() < b.getDate())) age--
  return age
}

export const toKg = (weight: number, units: Units) =>
  units === 'kg' ? weight : weight * KG_PER_LB

const round5 = (n: number) => Math.round(n / 5) * 5

export function nutritionPlan(opts: {
  weightKg: number
  heightCm: number
  age: number
  sex: Sex
  activity: ActivityLevel
  goal: NutritionGoal
}): NutritionPlan {
  const { weightKg, heightCm, age, sex, activity, goal } = opts
  const bmr = mifflinStJeor(weightKg, heightCm, age, sex)
  const tdee = Math.round(bmr * ACTIVITY_FACTORS[activity].factor)

  // calories: moderate 15% deficit / 10% surplus, floored so a cut never
  // drops below resting needs (aggressive cuts belong to a clinician).
  let calories = tdee
  const floored = goal === 'cut' && Math.round(tdee * 0.85) < bmr
  if (goal === 'cut') calories = Math.max(Math.round(tdee * 0.85), bmr)
  if (goal === 'gain') calories = Math.round(tdee * 1.1)
  calories = round5(calories)

  // protein: 2.2 g/kg dieting (muscle retention), 1.8 g/kg otherwise
  const proteinPerKg = goal === 'cut' ? 2.2 : 1.8
  const proteinG = Math.round(weightKg * proteinPerKg)

  // fat: 25% of calories (inside the 20–35% AMDR)
  const fatG = Math.round((calories * 0.25) / 9)

  // carbs: the remainder — the training fuel
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4))

  const fiberG = Math.round((calories / 1000) * 14)
  const waterL = Math.round((sex === 'male' ? 3.7 : 2.7) * 10) / 10

  const deficit = tdee - calories
  const weeklyKg = (deficit * 7) / 7700 // ≈7,700 kcal per kg of tissue
  // The cut note used to say "inside the 0.5–1%/week range" whatever the
  // actual rate — a big client at 15% is past 1%, a BMR-floored one under 0.5%.
  const kgWeek = Math.abs(weeklyKg).toFixed(2)
  // Classified on the same 0.1 rounding it's printed with, or "0.5% — gentler than 0.5–1%".
  const pct = Math.round((Math.abs(weeklyKg) / weightKg) * 1000) / 10
  const weeklyRateMsg: Msg =
    goal === 'cut'
      ? { key: pct < 0.5 ? 'nutrition.rate.cutSlow' : pct > 1 ? 'nutrition.rate.cutFast' : 'nutrition.rate.cut', params: { kg: kgWeek, pct: pct.toFixed(1) } }
      : goal === 'gain'
        ? { key: 'nutrition.rate.gain', params: { kg: kgWeek } }
        : { key: 'nutrition.rate.maintain' }
  const weeklyRateNote = english(weeklyRateMsg)

  return {
    bmr, tdee, calories, proteinG, fatG, carbsG, fiberG, waterL, weeklyRateNote, weeklyRateMsg,
    rationale: {
      calories: line(
        goal === 'cut'
          ? { key: floored ? 'nutrition.why.caloriesCutFloored' : 'nutrition.why.caloriesCut', params: { bmr, tdee, calories } }
          : goal === 'gain'
            ? { key: 'nutrition.why.caloriesGain', params: { tdee, calories } }
            : { key: 'nutrition.why.caloriesMaintain', params: { tdee, bmr, factor: ACTIVITY_FACTORS[activity].factor } },
        'Mifflin et al. 1990 (Am J Clin Nutr); Frankenfield et al. 2005 accuracy review; Helms et al. 2014 (JISSN) deficit sizing',
      ),
      protein: line(
        { key: goal === 'cut' ? 'nutrition.why.proteinCut' : 'nutrition.why.protein', params: { perKg: proteinPerKg, grams: proteinG } },
        'Morton et al. 2018 (Br J Sports Med meta-analysis); Jäger et al. 2017 (ISSN Position Stand)',
      ),
      fat: line({ key: 'nutrition.why.fat', params: { grams: fatG } }, 'Institute of Medicine, Dietary Reference Intakes (2005) — AMDR'),
      carbs: line({ key: 'nutrition.why.carbs', params: { grams: carbsG } }, 'Kerksick et al. 2018 (ISSN nutrient timing position stand)'),
      fiber: line({ key: 'nutrition.why.fiber', params: { grams: fiberG } }, 'Institute of Medicine DRI (2005)'),
      water: line({ key: 'nutrition.why.water', params: { litres: waterL } }, 'Institute of Medicine (2005) Adequate Intake; ACSM fluid replacement guidance'),
    },
  }
}

// ---- Training-day / rest-day carb cycling (spec §4.18c expansion) ----
// Keeps protein and average weekly calories constant; shifts carbohydrate
// toward training days (fuel + recovery when it's used) and fat toward rest
// days (satiety when carbs are lower) — a standard periodized-nutrition
// pattern, not a novel idea of this app's.
export interface DayTargets { calories: number; proteinG: number; carbsG: number; fatG: number }
export interface CycledPlan {
  trainingDay: DayTargets
  restDay: DayTargets
  rationale: RationaleLine
}

export function carbCycle(plan: NutritionPlan, trainingDaysPerWeek: number): CycledPlan {
  const days = Math.max(1, Math.min(7, trainingDaysPerWeek))
  const restDays = 7 - days
  // Shift ~15% of average calories from rest days to training days, entirely
  // via carbohydrate (protein and fat stay flat across both day types).
  const shiftKcal = plan.calories * 0.15
  const trainingCarbsG = plan.carbsG + Math.round(shiftKcal / 4)
  const restCarbsG = restDays > 0 ? Math.max(0, plan.carbsG - Math.round((shiftKcal * days) / Math.max(1, restDays) / 4)) : plan.carbsG

  const trainingDay: DayTargets = {
    calories: Math.round(plan.proteinG * 4 + plan.fatG * 9 + trainingCarbsG * 4),
    proteinG: plan.proteinG, fatG: plan.fatG, carbsG: trainingCarbsG,
  }
  const restDay: DayTargets = {
    calories: Math.round(plan.proteinG * 4 + plan.fatG * 9 + restCarbsG * 4),
    proteinG: plan.proteinG, fatG: plan.fatG, carbsG: restCarbsG,
  }

  return {
    trainingDay, restDay,
    rationale: line(
      { key: 'nutrition.why.cycle', params: { tCarbs: trainingDay.carbsG, tKcal: trainingDay.calories, rCarbs: restDay.carbsG, rKcal: restDay.calories } },
      'Periodized/nutrient-timing carb cycling: Kerksick et al. 2018 (ISSN nutrient timing position stand); Aragon & Schoenfeld 2013 (nutrient timing review)',
    ),
  }
}

// ---- Diet-break awareness (spec §4.18c expansion) ----
export interface DietBreakAdvice { recommend: boolean; note: string; noteMsg: Msg; source: string }

/** After enough consecutive weeks in a deficit, research supports a planned
 *  1–2 week return to maintenance ("diet break") — better long-run adherence
 *  and some evidence of protecting resting metabolic rate, without giving
 *  back meaningful fat-loss progress. */
const note = (m: Msg) => ({ note: english(m), noteMsg: m })

export function dietBreakAdvice(weeksInDeficit: number): DietBreakAdvice {
  if (weeksInDeficit >= 12) {
    return {
      recommend: true,
      ...note({ key: 'nutrition.break.overdue', params: { weeks: weeksInDeficit } }),
      source: 'Trexler, Smith-Ryan & Norton 2014 (JISSN) — adaptive thermogenesis & diet breaks; Peos et al. 2019 (Sports) intermittent energy restriction review',
    }
  }
  if (weeksInDeficit >= 8) {
    return {
      recommend: true,
      ...note({ key: 'nutrition.break.soon', params: { weeks: weeksInDeficit } }),
      source: 'Trexler, Smith-Ryan & Norton 2014 (JISSN)',
    }
  }
  return {
    recommend: false,
    ...note({ key: 'nutrition.break.notYet', params: { weeks: weeksInDeficit } }),
    source: 'Trexler, Smith-Ryan & Norton 2014 (JISSN)',
  }
}

// ---- Percent-based warm-up ramp (surfaced next to progression suggestions) ----
export interface WarmupSet { pct: number; load: number; reps: number }

/** Classic ramp to a top working load: bar/50% × 8 → 70% × 5 → 85% × 3 → 95% × 1.
 *  Rounded to plate steps by the caller's display; percentages are the standard
 *  practice pattern in strength coaching literature. */
export function warmupRamp(workingLoad: number, roundTo = 2.5): WarmupSet[] {
  if (workingLoad <= 0) return []
  const steps: [number, number][] = [[0.5, 8], [0.7, 5], [0.85, 3], [0.95, 1]]
  return steps
    .map(([pct, reps]) => ({
      pct: Math.round(pct * 100),
      load: Math.max(roundTo, Math.round((workingLoad * pct) / roundTo) * roundTo),
      reps,
    }))
    .filter((s, i, arr) => i === 0 || s.load > arr[i - 1].load) // collapse tiny loads
}

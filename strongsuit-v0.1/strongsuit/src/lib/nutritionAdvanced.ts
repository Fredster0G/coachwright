// ===== Nutrition v2 — the athlete-grade layer =====
// (docs/plans/03-SCIENCE-ENGINES.md §2.1, §2.3, §2.4)
//
// `lib/nutrition.ts` answers "what should a general-population client eat"
// and answers it correctly. This module handles the cases where that model is
// too coarse: a lean athlete whose body composition is known, protein
// DISTRIBUTION rather than just a daily total, and carbohydrate periodised to
// the actual training day rather than held flat.
//
// Kept separate from `nutrition.ts` on purpose — that module is well-tested
// and consumed in several places, and none of this needs to destabilise it.
// These compose on top.

import { english, type Msg } from './i18n/msg'
import type { MessageKey } from './i18n/locales/en'
import type { Units } from '@/db/types'
import { toKg } from './nutrition'

// ---------------------------------------------------------- energy equations

export type BmrEquation = 'mifflin' | 'katch-mcardle' | 'cunningham'

export interface BmrEstimate {
  bmr: number
  equation: BmrEquation
  /** Why this equation was chosen — surfaced so the coach can defend it. */
  rationale: string
  rationaleMsg: Msg
  source: string
}

const why = (m: Msg) => ({ rationale: english(m), rationaleMsg: m })

/** Katch-McArdle: BMR = 370 + 21.6 × FFM(kg). Body-composition based. */
export function katchMcArdle(ffmKg: number): number {
  return Math.round(370 + 21.6 * ffmKg)
}

/** Cunningham: BMR = 500 + 22 × FFM(kg). Runs higher; suits lean athletes. */
export function cunningham(ffmKg: number): number {
  return Math.round(500 + 22 * ffmKg)
}

/**
 * Choose the best-supported equation for the data available.
 *
 * Mifflin-St Jeor is the right default and the Academy of Nutrition and
 * Dietetics' evidence review says so (Frankenfield 2005) — but it knows
 * nothing about body composition, so it systematically under-predicts for
 * lean, muscular people. When body fat is actually MEASURED, an FFM-based
 * equation is better; when it isn't, we do not guess it.
 */
export function chooseBmr(opts: {
  mifflinBmr: number
  weight: number
  units: Units
  bodyFatPct?: number
  /** Lean athletes are where Cunningham is usually preferred over Katch. */
  lean?: boolean
}): BmrEstimate {
  const { mifflinBmr, bodyFatPct } = opts

  if (bodyFatPct == null || bodyFatPct <= 0 || bodyFatPct >= 60) {
    return {
      bmr: mifflinBmr,
      equation: 'mifflin',
      ...why({ key: 'adv.bmr.mifflin' }),
      source: 'Mifflin et al. 1990; Frankenfield et al. 2005 (Academy of Nutrition and Dietetics evidence review)',
    }
  }

  const ffmKg = toKg(opts.weight, opts.units) * (1 - bodyFatPct / 100)
  const useCunningham = opts.lean ?? bodyFatPct < 15

  return useCunningham
    ? {
        bmr: cunningham(ffmKg),
        equation: 'cunningham',
        ...why({ key: 'adv.bmr.cunningham', params: { ffm: ffmKg.toFixed(1) } }),
        source: 'Cunningham 1980',
      }
    : {
        bmr: katchMcArdle(ffmKg),
        equation: 'katch-mcardle',
        ...why({ key: 'adv.bmr.katch', params: { ffm: ffmKg.toFixed(1) } }),
        source: 'Katch & McArdle',
      }
}

// ------------------------------------------------------- protein distribution

export type DietPattern = 'omnivore' | 'plant-based'

export interface ProteinPlan {
  dailyG: number
  /** Meals the daily total is split across. */
  meals: number
  perMealG: number
  /** Minimum per meal to reliably trigger muscle protein synthesis. */
  perMealFloorG: number
  notes: string[]
  noteMsgs: Msg[]
  source: string
}

/**
 * Protein as a DISTRIBUTION, not just a daily total.
 *
 * The daily number is the well-known part; the per-meal dose is what actually
 * drives the response, and it's where most plans quietly fail — three meals
 * with 15 g and one with 90 g hits the same total and works far less well.
 *
 * Sources: Schoenfeld & Aragon 2018 (JISSN, 0.4–0.55 g/kg per meal across
 * ~4 meals); Moore et al. 2015 (older adults need a higher per-meal dose to
 * overcome anabolic resistance); Helms et al. 2014 (higher intake while
 * dieting); Rogerson 2017 / Pinckaers 2023 (plant-based needs more, and
 * attention to leucine).
 */
export function proteinDistribution(opts: {
  weightKg: number
  age: number
  meals?: number
  cutting?: boolean
  pattern?: DietPattern
}): ProteinPlan {
  const meals = Math.max(2, Math.min(6, opts.meals ?? 4))
  const pattern = opts.pattern ?? 'omnivore'
  const noteMsgs: Msg[] = []

  let perKg = opts.cutting ? 2.2 : 1.8

  // Plant proteins are typically lower in leucine and less digestible.
  if (pattern === 'plant-based') {
    perKg *= 1.15
    noteMsgs.push({ key: 'adv.protein.plant' })
  }

  // Anabolic resistance means older adults need a bigger per-meal dose, not
  // just a bigger daily total.
  const older = opts.age >= 40
  const perMealFloorPerKg = older ? 0.40 : 0.30
  if (older) {
    noteMsgs.push({ key: 'adv.protein.older' })
  }

  const dailyG = Math.round(opts.weightKg * perKg)
  const perMealG = Math.round(dailyG / meals)
  const perMealFloorG = Math.round(opts.weightKg * perMealFloorPerKg)

  if (perMealG < perMealFloorG) {
    noteMsgs.push({ key: 'adv.protein.belowFloor', params: { meals, perMeal: perMealG, floor: perMealFloorG } })
  }
  if (opts.cutting) {
    noteMsgs.push({ key: 'adv.protein.cutting' })
  }

  return {
    dailyG, meals, perMealG, perMealFloorG, notes: noteMsgs.map(english), noteMsgs,
    source: 'Schoenfeld & Aragon 2018 (JISSN); Moore et al. 2015; Helms et al. 2014; Rogerson 2017',
  }
}

// ------------------------------------------------------ carb periodisation

export type SessionLoad = 'rest' | 'light' | 'moderate' | 'high' | 'veryHigh'

export interface CarbTarget {
  gPerKg: { low: number; high: number }
  gramsLow: number
  gramsHigh: number
  label: string
  labelMsg: Msg
  intraSession: string | null
  intraSessionMsg: Msg | null
  source: string
}

/**
 * "Fuel for the work required" — carbohydrate matched to the day's actual
 * training, not held flat across the week.
 *
 * This is the single biggest gap in the v1 model for endurance athletes: a
 * flat daily carb number is simultaneously too much on a rest day and far too
 * little before a three-hour session.
 *
 * Sources: Burke et al. 2011 (J Sports Sci); ACSM/AND/DC joint position 2016;
 * Impey et al. 2018 (train-low); Jeukendrup 2014 (intra-session intake and
 * multiple transportable carbohydrates).
 */
const CARB_BANDS: Record<SessionLoad, { low: number; high: number; label: string }> = {
  rest: { low: 3, high: 5, label: 'Rest or technique day' },
  light: { low: 4, high: 6, label: 'Light session (<1 h easy)' },
  moderate: { low: 5, high: 7, label: 'Moderate (~1 h)' },
  high: { low: 6, high: 10, label: 'High (1–3 h)' },
  veryHigh: { low: 8, high: 12, label: 'Very high (>3 h)' },
}

export function carbTarget(weightKg: number, load: SessionLoad): CarbTarget {
  const band = CARB_BANDS[load]
  const intra = intraSessionGuidance(load)
  return {
    gPerKg: { low: band.low, high: band.high },
    gramsLow: Math.round(weightKg * band.low),
    gramsHigh: Math.round(weightKg * band.high),
    label: band.label,
    labelMsg: { key: `adv.carb.${load}` as MessageKey },
    intraSession: intra ? english(intra) : null,
    intraSessionMsg: intra,
    source: 'Burke et al. 2011; ACSM/AND/DC joint position 2016; Jeukendrup 2014',
  }
}

function intraSessionGuidance(load: SessionLoad): Msg | null {
  switch (load) {
    case 'veryHigh': return { key: 'adv.intra.veryHigh' }
    case 'high': return { key: 'adv.intra.high' }
    default: return null
  }
}

/** Map a session's sRPE load to a carbohydrate band, so this can run off
 *  logged training rather than asking the coach to categorise every day. */
export function loadToSessionBand(sessionLoadAu: number): SessionLoad {
  // sRPE load = RPE × minutes. ~300 ≈ 45 min at RPE 7; ~900 ≈ 2 h at RPE 7.5.
  if (sessionLoadAu <= 0) return 'rest'
  if (sessionLoadAu < 200) return 'light'
  if (sessionLoadAu < 450) return 'moderate'
  if (sessionLoadAu < 900) return 'high'
  return 'veryHigh'
}

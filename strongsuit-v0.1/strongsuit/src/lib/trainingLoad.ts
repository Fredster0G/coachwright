// ===== Training-load analytics (spec §4.6 extended) =====
// Turns logged work into the load-management metrics a professional S&C staff
// watches — so a coach can see over/undertraining and injury risk, not just
// tonnage. Pure + unit-tested.
//
// Sources:
// - Foster 1998 (Med Sci Sports Exerc) — session-RPE load, training monotony
//   and strain.
// - Gabbett 2016 (Br J Sports Med); Hulin et al. 2014/2016 — acute:chronic
//   workload ratio (ACWR).
// - Williams et al. 2017 (Br J Sports Med) — EWMA is a better estimator than
//   rolling averages; rolling windows treat a session 28 days ago as equal to
//   yesterday's and then drop it off a cliff.
// - Impellizzeri et al. 2020; Lolli et al. 2019 — the methodological critiques
//   of ACWR. See the warning below.
// - Relative-strength standards: widely published bodyweight-ratio bands
//   (e.g., ExRx.net strength standards; Lon Kilgore) for the main barbell lifts.
//
// ⚠️ ACWR HONESTY RULE — do not weaken this without reading the papers.
// This module used to report a "sweet spot" and a "danger" zone claiming
// "markedly higher injury risk" above 1.5. That framing does not survive the
// evidence: Impellizzeri (2020) and Lolli (2019) showed the ratio is
// mathematically coupled to its own denominator, that the sweet-spot bands are
// substantially an artefact of how the ratio is constructed, and that the
// original injury-risk findings do not replicate cleanly. A coach reading
// "danger" and deloading a healthy athlete is a real cost of overclaiming.
//
// We still REPORT the ratio, because practitioners expect it and the
// underlying signal (load rising faster than the athlete is used to) is
// genuinely useful. We report it as a DESCRIPTION OF LOAD CHANGE, never as a
// prediction of injury. Zone names and copy are descriptive for that reason.

import { english, type Msg } from './i18n/msg'

export interface DayLoad { date: string; load: number } // yyyy-MM-dd, arbitrary load unit

/** session-RPE load (Foster): RPE (0–10) × duration in minutes. */
export const sessionLoad = (rpe: number, minutes: number) => Math.max(0, rpe) * Math.max(0, minutes)

/** Local calendar day — `end` below is LOCAL midnight, whose UTC date is the
 *  previous day anywhere east of Greenwich (S24 fix). */
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`


/** Descriptive, not predictive. There is deliberately no 'danger' zone —
 *  see the honesty rule at the top of this file. */
export type LoadZone = 'insufficient-data' | 'below-norm' | 'steady' | 'rising' | 'sharp-rise'

export interface ACWR {
  acute: number      // EWMA over ~7 days
  chronic: number    // EWMA over ~28 days
  ratio: number
  zone: LoadZone
  note: string
  noteMsg: Msg
  /** False until there's enough history for the ratio to mean anything. */
  reliable: boolean
}

/** Below this many days of history, the ratio is noise. */
export const MIN_DAYS_FOR_ACWR = 21

const said = (m: Msg) => ({ note: english(m), noteMsg: m })

/** Exponentially weighted moving average over a load series, oldest first. */
export function ewma(loads: number[], days: number): number {
  if (loads.length === 0) return 0
  const lambda = 2 / (days + 1)
  let acc = loads[0]
  for (let i = 1; i < loads.length; i++) acc = loads[i] * lambda + acc * (1 - lambda)
  return acc
}

/** Contiguous daily loads ending at `today`, rest days included as zeros —
 *  which matters, because a rest day is real information about load. */
function dailySeries(loads: DayLoad[], today: string, days: number): number[] {
  const end = new Date(today + 'T00:00:00')
  const out: number[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end); d.setDate(end.getDate() - i)
    const k = dayKey(d)
    out.push(loads.filter(l => l.date === k).reduce((a, l) => a + l.load, 0))
  }
  return out
}

/**
 * EWMA acute:chronic workload ratio (Williams et al. 2017).
 *
 * Reports how this week's load compares to what the athlete has been doing.
 * It does NOT predict injury — read the honesty rule at the top of this file
 * before adding any copy that suggests otherwise.
 */
export function acwr(loads: DayLoad[], today: string): ACWR {
  const span = dailySeries(loads, today, 28)
  const daysWithHistory = loads.length ? span.filter((_, i) => i >= 0).length : 0
  const acute = ewma(span.slice(-7), 7)
  const chronic = ewma(span, 28)

  // "Enough history" means real training days on record, not just a date range.
  const trainingDays = loads.filter(l => l.load > 0).length
  if (chronic <= 0 || trainingDays < 5 || daysWithHistory < MIN_DAYS_FOR_ACWR) {
    return {
      acute: Math.round(acute), chronic: Math.round(chronic), ratio: 0,
      zone: 'insufficient-data', reliable: false,
      ...said({ key: 'load.insufficient' }),
    }
  }

  const ratio = Math.round((acute / chronic) * 100) / 100

  const zone: LoadZone = ratio < 0.8 ? 'below-norm' : ratio <= 1.3 ? 'steady' : ratio <= 1.5 ? 'rising' : 'sharp-rise'
  return { acute: Math.round(acute), chronic: Math.round(chronic), ratio, zone, ...said({ key: `load.${zone}`, params: { ratio } }), reliable: true }
}

export interface Monotony { monotony: number; strain: number; note: string }

/** Foster training monotony (mean/SD of daily load over 7d) and strain (load×monotony). */
export function monotonyStrain(loads: DayLoad[], today: string): Monotony {
  const end = new Date(today + 'T00:00:00')
  const days: number[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end); d.setDate(end.getDate() - i)
    const k = dayKey(d)
    days.push(loads.filter(l => l.date === k).reduce((a, l) => a + l.load, 0))
  }
  const mean = days.reduce((a, b) => a + b, 0) / 7
  const variance = days.reduce((a, b) => a + (b - mean) ** 2, 0) / 7
  const sd = Math.sqrt(variance)
  // Zero variance with real load = a week with no hard/easy variation at all,
  // which Foster's model treats as maximally monotonous (division by ~0). Report
  // it at the top of the practical range rather than a misleading 0.
  const monotony = sd > 0 ? Math.round((mean / sd) * 100) / 100 : (mean > 0 ? 3 : 0)
  const weekLoad = days.reduce((a, b) => a + b, 0)
  const strain = Math.round(weekLoad * monotony)
  const note = monotony >= 2
    ? 'High monotony — every day looks the same. Vary hard and easy days to lower strain and illness risk.'
    : 'Healthy day-to-day variation between hard and easy sessions.'
  return { monotony, strain, note }
}

// ---- relative strength standards ----
export type StrengthLift = 'squat' | 'bench' | 'deadlift' | 'ohp'
export type StrengthLevel = 'untrained' | 'novice' | 'intermediate' | 'advanced' | 'elite'

// Multiples of bodyweight for a 1RM, by lift and sex. Rounded consensus of
// published strength-standard tables; used to place a lifter, not to certify.
const STANDARDS: Record<StrengthLift, Record<'male' | 'female', number[]>> = {
  //            [novice, intermediate, advanced, elite]  (untrained = below novice)
  squat:    { male: [1.0, 1.5, 2.0, 2.5], female: [0.7, 1.1, 1.5, 2.0] },
  bench:    { male: [0.75, 1.1, 1.5, 2.0], female: [0.4, 0.6, 0.9, 1.2] },
  deadlift: { male: [1.25, 1.75, 2.25, 3.0], female: [0.9, 1.3, 1.8, 2.4] },
  ohp:      { male: [0.55, 0.8, 1.1, 1.4], female: [0.3, 0.45, 0.65, 0.9] },
}

export interface StrengthStanding {
  ratio: number
  level: StrengthLevel
  source: string
}

/** Place a lift's 1RM (in same unit as bodyweight) into a strength level. */
export function strengthStanding(lift: StrengthLift, oneRepMax: number, bodyweight: number, sex: 'male' | 'female'): StrengthStanding | null {
  if (oneRepMax <= 0 || bodyweight <= 0) return null
  const ratio = Math.round((oneRepMax / bodyweight) * 100) / 100
  const t = STANDARDS[lift][sex]
  let level: StrengthLevel = 'untrained'
  if (ratio >= t[3]) level = 'elite'
  else if (ratio >= t[2]) level = 'advanced'
  else if (ratio >= t[1]) level = 'intermediate'
  else if (ratio >= t[0]) level = 'novice'
  return { ratio, level, source: 'Published relative-strength standards (ExRx.net; Kilgore) — bodyweight-ratio bands' }
}

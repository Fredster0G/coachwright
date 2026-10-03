// ===== Readiness score (spec §4.18b) =====
// A 0–100 daily-readiness read from the client's latest check-in, with the
// same rule as the progression engine: no number without its reasoning.
// Weighting follows the wellness-questionnaire literature (Hooper & Mackinnon
// 1995 training-monitoring index; McLean et al. 2010 IJSPP): subjective
// sleep/fatigue/mood scales track training readiness surprisingly well and
// are the cheapest valid monitoring tool available — perfect for offline.

import { english, type Msg } from './i18n/msg'
import type { CheckIn } from '@/db/types'

export interface Readiness {
  score: number                  // 0–100
  band: 'go' | 'moderate' | 'easy'
  drivers: string[]              // what pushed the score, plain language
  source: string
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/** Score one check-in. Missing fields simply drop out of the weighting. */
export function readinessFromCheckIn(c: CheckIn): Readiness | null {
  const parts: { w: number; v: number; label: string; low: string; high: string }[] = []

  if (c.sleepHours != null) {
    // 7–9 h = full credit (National Sleep Foundation range), linear falloff
    const v = clamp01(1 - Math.max(0, 7 - c.sleepHours) / 3.5 - Math.max(0, c.sleepHours - 9.5) / 4)
    parts.push({ w: 0.35, v, label: 'sleep', low: `only ${c.sleepHours}h sleep`, high: `${c.sleepHours}h sleep` })
  }
  if (c.energy != null) {
    // 1–10 scale (matches the check-in form)
    const v = clamp01((c.energy - 1) / 9)
    parts.push({ w: 0.3, v, label: 'energy', low: 'low energy', high: 'good energy' })
  }
  if (c.mood != null) {
    const v = clamp01((c.mood - 1) / 9)
    parts.push({ w: 0.2, v, label: 'mood', low: 'low mood', high: 'good mood' })
  }
  if (c.adherence != null) {
    const v = clamp01(c.adherence / 100)
    parts.push({ w: 0.15, v, label: 'adherence', low: 'adherence slipping', high: 'on plan' })
  }
  if (!parts.length) return null

  const totalW = parts.reduce((a, p) => a + p.w, 0)
  const score = Math.round((parts.reduce((a, p) => a + p.w * p.v, 0) / totalW) * 100)

  const drivers = parts
    .sort((a, b) => a.v - b.v)
    .slice(0, 2)
    .map(p => (p.v < 0.55 ? p.low : p.high))

  return {
    score,
    band: score >= 70 ? 'go' : score >= 45 ? 'moderate' : 'easy',
    drivers,
    source: 'Weighted wellness-questionnaire model (Hooper & Mackinnon 1995; McLean et al. 2010)',
  }
}

export const READINESS_COPY: Record<Readiness['band'], string> = {
  go: 'Green — train as planned. Good day to push top sets.',
  moderate: 'Amber — keep the plan, cap intensity. Leave a rep in the tank.',
  easy: 'Red — reduce load ~10–20% or switch to technique work. The gains are in recovering.',
}

// =====================================================================
// Readiness v2 — individually baselined (docs/plans/03-SCIENCE-ENGINES §3)
// =====================================================================
//
// WHY v1 ISN'T ENOUGH, and it's the reason most readiness scores feel wrong:
// `readinessFromCheckIn` above grades every athlete against the same fixed
// scale. Someone who has slept 6 hours a night for fifteen years is not
// under-recovered; they're normal, for them. Population thresholds flag them
// amber forever, the coach learns the number means nothing, and the feature
// dies. Elite practice compares an athlete to THEMSELVES.
//
// So v2 z-scores each signal against that person's own recent history and
// reports the deviation. It needs history to work, and it says so plainly
// rather than showing a confident wrong number on day three.
//
// SOURCES
//  · Hooper & Mackinnon 1995; McLean et al. 2010 — the wellness-index items
//    (sleep, fatigue/energy, mood, soreness) and their monitoring validity.
//  · Bourdon et al. 2017 (IJSPP consensus, "Monitoring Athlete Training
//    Loads") — z-scoring subjective measures against an individual baseline,
//    and the ~2-week minimum before a baseline is meaningful.
//  · Saw et al. 2016 (Br J Sports Med) — subjective measures track
//    training-induced change MORE sensitively than objective ones, which is
//    why a cheap daily questionnaire beats an expensive device here.
//  · Plews et al. 2013; Buchheit 2014 — the same individual-baseline logic
//    applied to HRV; also the source of the "trend, not a single day" rule.

/** Days of history before a personal baseline is trustworthy (Bourdon 2017). */
export const MIN_BASELINE_DAYS = 14
/** Window the baseline is computed over. */
export const BASELINE_WINDOW_DAYS = 28

export type ReadinessDomain = 'sleep' | 'energy' | 'mood' | 'adherence'

export interface DomainReading {
  domain: ReadinessDomain
  /** Standard deviations from this athlete's own mean. + is better. */
  z: number
  /** Raw value today. */
  value: number
  /** This athlete's mean for this domain. */
  baseline: number
  /** Plain-language, e.g. "1.8 SD below their normal sleep". */
  description: string
  /** The same, translatable. */
  descMsg: Msg
}

export interface Readiness2 {
  /** 0–100, or null while still learning. */
  score: number | null
  band: 'go' | 'moderate' | 'easy' | 'learning'
  /** Every domain we could read today, worst first. */
  domains: DomainReading[]
  /** The single domain doing most of the work. Null when nothing stands out. */
  driver: DomainReading | null
  /** What the coach should actually do (English). */
  recommendation: string
  /** The same, translatable. */
  recMsg: Msg
  /** How many days of history the baseline rests on. */
  historyDays: number
  source: string
}

const DOMAIN_LABEL: Record<ReadinessDomain, Msg> = {
  sleep: { key: 'readiness.domain.sleep' }, energy: { key: 'readiness.domain.energy' },
  mood: { key: 'readiness.domain.mood' }, adherence: { key: 'readiness.domain.adherence' },
}

/** English line + the translatable message it came from. */
const say = (m: Msg) => ({ recommendation: english(m), recMsg: m })

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

function sd(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(mean(xs.map(x => (x - m) ** 2)))
}

/**
 * Minimum plausible spread per domain — a "smallest worthwhile change" floor
 * (the Hopkins/Buchheit idea applied practically).
 *
 * WHY THIS EXISTS: a very consistent athlete produces a near-zero SD, and
 * dividing by it makes every trivial wobble look like a 6-SD catastrophe —
 * or, if we guard the division naively, makes a REAL drop invisible. Someone
 * who reliably sleeps 9h and turns up on 7h has genuinely lost two hours, and
 * the engine must see that. Flooring the denominator at the domain's realistic
 * measurement noise fixes both failure modes at once.
 */
const MIN_SPREAD: Record<ReadinessDomain, number> = {
  sleep: 0.5,      // hours — self-reported sleep isn't precise below ~30 min
  energy: 0.5,     // 1–10 scale
  mood: 0.5,       // 1–10 scale
  adherence: 5,    // percent
}

/**
 * Cap on the reported deviation.
 *
 * Beyond ~3 SD the exact figure carries no extra meaning — "way below normal"
 * is the whole message — and an uncapped value reads as broken. A very
 * consistent client hits this easily: with a near-zero measured spread floored
 * to MIN_SPREAD, a real but ordinary drop can compute to −10 SD, which is
 * nonsense to show a coach. Caught in live testing, not in the unit tests,
 * because the synthetic fixtures had unrealistically flat histories.
 */
const MAX_ABS_Z = 3

function readDomain(domain: ReadinessDomain, today: number, history: number[]): DomainReading | null {
  if (history.length < MIN_BASELINE_DAYS) return null
  const baseline = mean(history)
  const spread = Math.max(sd(history), MIN_SPREAD[domain])
  const raw = (today - baseline) / spread
  const z = Math.max(-MAX_ABS_Z, Math.min(MAX_ABS_Z, raw))
  const rounded = Math.round(z * 10) / 10

  const label = DOMAIN_LABEL[domain]
  const atCap = Math.abs(raw) >= MAX_ABS_Z
  const below = rounded < 0
  const descMsg: Msg = Math.abs(rounded) < 0.5
    ? { key: 'readiness.desc.normal', params: { label } }
    : atCap
      // Don't quote a precise figure we don't believe — say what it means.
      ? { key: below ? 'readiness.desc.farBelow' : 'readiness.desc.farAbove', params: { label } }
      : { key: below ? 'readiness.desc.sdBelow' : 'readiness.desc.sdAbove', params: { n: Math.abs(rounded), label } }

  return { domain, z: rounded, value: today, baseline: Math.round(baseline * 10) / 10, description: english(descMsg), descMsg }
}

export interface ReadinessHistory {
  /** Oldest-first check-ins for this client, INCLUDING today's. */
  checkIns: CheckIn[]
}

/**
 * Readiness against the athlete's own baseline.
 *
 * Returns `band: 'learning'` with a null score until there are
 * MIN_BASELINE_DAYS of history — showing a confident number before then would
 * be inventing precision, and the first time a coach catches it being wrong
 * they stop trusting every number in the app.
 */
export function readinessV2(history: ReadinessHistory): Readiness2 {
  const sorted = [...history.checkIns].sort((a, b) => a.date.localeCompare(b.date))
  const today = sorted.at(-1)
  const prior = sorted.slice(0, -1).slice(-BASELINE_WINDOW_DAYS)

  const base = {
    domains: [] as DomainReading[],
    driver: null,
    historyDays: prior.length,
    source: 'Individually-baselined wellness index (Hooper & Mackinnon 1995; McLean 2010; Bourdon et al. 2017 IJSPP consensus)',
  }

  if (!today) {
    return { ...base, score: null, band: 'learning', ...say({ key: 'readiness.none' }) }
  }
  if (prior.length < MIN_BASELINE_DAYS) {
    const need = MIN_BASELINE_DAYS - prior.length
    return {
      ...base, score: null, band: 'learning',
      ...say({ key: 'readiness.learning', params: { count: need } }),
    }
  }

  const pick = (f: (c: CheckIn) => number | undefined) =>
    prior.map(f).filter((v): v is number => v != null)

  const readings: DomainReading[] = []
  const add = (domain: ReadinessDomain, todayVal: number | undefined, hist: number[]) => {
    if (todayVal == null) return
    const r = readDomain(domain, todayVal, hist)
    if (r) readings.push(r)
  }

  add('sleep', today.sleepHours, pick(c => c.sleepHours))
  add('energy', today.energy, pick(c => c.energy))
  add('mood', today.mood, pick(c => c.mood))
  add('adherence', today.adherence, pick(c => c.adherence))

  if (readings.length === 0) {
    return { ...base, score: null, band: 'learning', ...say({ key: 'readiness.nothingScoreable' }) }
  }

  readings.sort((a, b) => a.z - b.z)

  // Map mean z to 0–100, anchored so 0 SD lands exactly on the 'go' threshold:
  // A NORMAL DAY IS A GOOD DAY. If "normal" read as amber, the score would be
  // permanently pessimistic and coaches would rightly stop reading it.
  //   0 SD → 70 (go) · −1 SD → 50 (moderate) · −2 SD → 30 (easy)
  // Clamped, because a 4-SD reading is a data-entry error, not a superpower.
  const avgZ = mean(readings.map(r => r.z))
  const score = Math.max(0, Math.min(100, Math.round(70 + avgZ * 20)))

  const driver = readings[0].z <= -0.8 ? readings[0] : null
  const band: Readiness2['band'] = score >= 70 ? 'go' : score >= 45 ? 'moderate' : 'easy'

  return {
    ...base,
    score,
    band,
    domains: readings,
    driver,
    historyDays: prior.length,
    ...say(recommend(band, driver)),
  }
}

function recommend(band: Readiness2['band'], driver: DomainReading | null): Msg {
  const because: Msg | string = driver ? { key: 'readiness.because', params: { driver: driver.descMsg } } : ''
  switch (band) {
    case 'go': return { key: 'readiness.go', params: { because } }
    case 'moderate': return { key: 'readiness.moderate', params: { because } }
    case 'easy': return { key: 'readiness.easy', params: { because } }
    default: return { key: 'readiness.notEnough' }
  }
}

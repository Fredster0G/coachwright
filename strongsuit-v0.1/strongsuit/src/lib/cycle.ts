// ===== Menstrual cycle & symptom tracking =====
// (docs/plans/03-SCIENCE-ENGINES.md §4)
//
// ⚠️ READ THIS BEFORE CHANGING ANYTHING HERE.
//
// This module deliberately does LESS than the obvious version of the feature,
// and that is the whole point. The marketable version — "train heavy in your
// follicular phase" — is not supported by the evidence:
//
//   · McNulty et al. 2020 (Sports Med, meta-analysis): performance differences
//     across cycle phases are TRIVIAL on average, the evidence is LOW quality,
//     and heterogeneity between studies is extreme.
//   · Colenso-Semple et al. 2023: current evidence does not support
//     phase-based training prescription.
//   · Elliott-Sale et al. 2021: most of the underlying literature fails basic
//     methodological standards for female-athlete research.
//
// What IS well supported:
//   · Symptoms vary, are highly prevalent, and genuinely affect training on
//     the days they appear.
//   · Heavy menstrual bleeding → iron deficiency → impaired performance
//     (Bruinvels et al. 2016/2021; Sim et al. 2019).
//   · Hormonal contraceptives have negligible-to-small performance effects
//     (Elliott-Sale et al. 2020) — useful as reassurance, not as a lever.
//   · Cycle disruption is a REDs indicator (Mountjoy et al. 2023) and should
//     route to `lib/energyAvailability.ts`'s screening, not to programming.
//
// So: we track SYMPTOMS and autoregulate from them, exactly as we would for
// any other subjective input. We surface the client's own patterns, labelled
// as n=1. We never prescribe by phase.
//
// PRIVACY (plan §4.5) — this is special-category health data under GDPR Art. 9.
//   · Device-only. Cloud sync uses explicit allowlists (SYNCED_TABLES in
//     lib/cloud/tables.ts, SYNC_TABLES / CLIENT_WRITABLE in sync-server), so a
//     cycle table is excluded unless someone deliberately adds it. Do not.
//   · The coach sees a readiness CONTRIBUTION, never raw symptoms, unless the
//     client explicitly opts in per-field.
//   · Must be separately deletable without touching training history.

export type CycleSymptom =
  | 'cramps' | 'fatigue' | 'sleepDisruption' | 'gi' | 'headache' | 'mood' | 'breastTenderness'

export type FlowLevel = 'none' | 'spotting' | 'light' | 'medium' | 'heavy'

export interface CycleEntry {
  /** yyyy-MM-dd */
  date: string
  /** True on a bleeding day. */
  bleeding: boolean
  flow?: FlowLevel
  /** Symptoms reported today, each 0–3 (absent → mild → moderate → severe). */
  symptoms?: Partial<Record<CycleSymptom, 0 | 1 | 2 | 3>>
}

export type ContraceptiveContext = 'none' | 'combined-oral' | 'progestin-only' | 'iud-hormonal' | 'iud-copper' | 'other'

/**
 * Who is reading the sentence.
 *
 * This module is shared byte-for-byte between the coach app and Companion, and
 * the same finding has to be said two ways: to a coach it's "they've reported
 * cramps", to the person themselves it's "you've reported cramps". Forking the
 * copy per app would let the two drift, and drift is exactly how a
 * carefully-hedged claim quietly becomes an unhedged one. So the voice is a
 * parameter and the claims stay in one place.
 *
 * Coach voice is the default because the coach app has more surfaces.
 */
export type Voice = 'coach' | 'self'

/** Typical cycle bounds. Outside these, "cycle length" isn't meaningful. */
export const MIN_PLAUSIBLE_CYCLE = 21
export const MAX_PLAUSIBLE_CYCLE = 35

// ---------------------------------------------------------------- symptoms

export interface SymptomBurden {
  /** 0–1. Sum of today's symptom severities over the maximum possible. */
  score: number
  /** The symptoms actually reported today, worst first. */
  reported: { symptom: CycleSymptom; severity: number }[]
  /** Standard-deviation-free, deliberately: this is TODAY, not a comparison. */
  band: 'none' | 'mild' | 'moderate' | 'severe'
}

const ALL_SYMPTOMS: CycleSymptom[] = [
  'cramps', 'fatigue', 'sleepDisruption', 'gi', 'headache', 'mood', 'breastTenderness',
]

export function symptomBurden(entry: CycleEntry | undefined): SymptomBurden {
  const s = entry?.symptoms ?? {}
  const reported = ALL_SYMPTOMS
    .map(symptom => ({ symptom, severity: s[symptom] ?? 0 }))
    .filter(r => r.severity > 0)
    .sort((a, b) => b.severity - a.severity)

  const total = reported.reduce((a, r) => a + r.severity, 0)
  const max = ALL_SYMPTOMS.length * 3
  const score = Math.round((total / max) * 100) / 100

  // Banding weighs the WORST symptom, not just the total. A purely additive
  // rule bands debilitating cramps-and-nothing-else as "mild", which is
  // obviously wrong and would quietly tell a coach to push a session that
  // should have been cut. One symptom at maximum severity is never mild.
  const worst = reported[0]?.severity ?? 0
  const band: SymptomBurden['band'] =
    total === 0 ? 'none'
    : total >= 8 || (worst === 3 && total >= 6) ? 'severe'
    : total >= 4 || worst === 3 ? 'moderate'
    : 'mild'

  return { score, reported, band }
}

/**
 * Symptom burden as a readiness contribution, on the same z-like scale the
 * rest of `lib/readiness.ts` speaks.
 *
 * Negative = worse. Deliberately capped at −2: a bad symptom day is a real
 * reason to autoregulate, but it should not single-handedly dominate a score
 * that also weighs sleep, energy and load.
 *
 * ⚠️ CURRENTLY UNCONSUMED, and that is a consequence of the privacy design
 * rather than an oversight. The intended reader is a readiness score, but the
 * only device holding cycle data is Companion, which has no readiness engine;
 * the coach app has `readinessV2()` and can never see this data, because
 * cycle rows are excluded from what Companion uploads by construction (see
 * features/sync/cyclePrivacy.test.ts in companion-app).
 *
 * Wiring it up therefore needs a real decision first — either a readiness
 * surface inside Companion, or a per-field opt-in that lets someone share
 * this single number (never the symptoms) with their coach. Do NOT resolve it
 * by adding cycle rows to the payload. Tracked as debt #65.
 */
export function symptomReadinessContribution(entry: CycleEntry | undefined): number {
  const { band } = symptomBurden(entry)
  switch (band) {
    case 'severe': return -2
    case 'moderate': return -1.2
    case 'mild': return -0.5
    default: return 0
  }
}

/** Symptom-driven guidance. Never phase-driven — see the header. */
export function symptomGuidance(entry: CycleEntry | undefined, voice: Voice = 'coach'): string | null {
  const { band, reported } = symptomBurden(entry)
  if (band === 'none') return null
  const worst = reported[0]?.symptom
  const named = worst ? ` (${humanSymptom(worst)} worst today)` : ''
  if (voice === 'self') {
    // Sentence already says "today", so the suffix drops it — "Moderate
    // symptoms today (cramps worst today)" is how this read in the browser.
    const worstHere = worst ? ` (${humanSymptom(worst)} worst)` : ''
    switch (band) {
      case 'severe':
        return `Severe symptoms today${worstHere}. Treat this like any other low-readiness day — cut the load, or switch to technique work.`
      case 'moderate':
        return `Moderate symptoms today${worstHere}. Worth holding back on your heaviest sets rather than pushing.`
      default:
        return `Mild symptoms today${worstHere}. Nothing needs to change unless it gets worse.`
    }
  }
  switch (band) {
    case 'severe':
      return `Severe symptoms reported${named}. Treat this like any other low-readiness day: cut load, or swap to technique work.`
    case 'moderate':
      return `Moderate symptoms reported${named}. Worth capping top sets rather than pushing.`
    default:
      return `Mild symptoms reported${named}. No change needed unless they say otherwise.`
  }
}

export function humanSymptom(s: CycleSymptom): string {
  return {
    cramps: 'cramps', fatigue: 'fatigue', sleepDisruption: 'disrupted sleep',
    gi: 'GI symptoms', headache: 'headache', mood: 'mood', breastTenderness: 'breast tenderness',
  }[s]
}

// ----------------------------------------------------------------- cycles

export interface CycleSummary {
  /** Start dates of each detected cycle, oldest first. */
  starts: string[]
  /** Lengths in days between consecutive starts. */
  lengths: number[]
  averageLength: number | null
  /** Cycles that fall outside the plausible range. */
  irregularCount: number
  /** Days since the most recent cycle start, or null. */
  currentDay: number | null
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86_400_000)
}

/**
 * Detect cycle starts: the first bleeding day after at least one non-bleeding
 * day. Naive by design — this is a log, not a clinical instrument, and a
 * cleverer heuristic would invent structure the data doesn't have.
 */
export function summariseCycles(entries: CycleEntry[], today?: string): CycleSummary {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  const starts: string[] = []
  let prevBleeding = false
  for (const e of sorted) {
    if (e.bleeding && !prevBleeding) starts.push(e.date)
    prevBleeding = e.bleeding
  }

  const lengths: number[] = []
  for (let i = 1; i < starts.length; i++) lengths.push(daysBetween(starts[i - 1], starts[i]))

  const averageLength = lengths.length
    ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
    : null
  const irregularCount = lengths.filter(l => l < MIN_PLAUSIBLE_CYCLE || l > MAX_PLAUSIBLE_CYCLE).length

  const last = starts.at(-1)
  const ref = today ?? sorted.at(-1)?.date
  const currentDay = last && ref ? daysBetween(last, ref) + 1 : null

  return { starts, lengths, averageLength, irregularCount, currentDay }
}

// ------------------------------------------------------------- risk flags

export interface CycleFlags {
  /** 3+ irregular or missed cycles — a REDs indicator (Mountjoy 2023). */
  disruption: boolean
  /** Heavy bleeding reported — an iron-deficiency risk (Bruinvels). */
  heavyBleeding: boolean
  messages: string[]
  /** True when this should route to the REDs screen rather than programming. */
  routeToRedsScreen: boolean
  source: string
}

/** Cycles missed/irregular before we flag disruption. */
export const DISRUPTION_THRESHOLD = 3

export function cycleFlags(entries: CycleEntry[], summary?: CycleSummary, voice: Voice = 'coach'): CycleFlags {
  const s = summary ?? summariseCycles(entries)
  const messages: string[] = []
  const self = voice === 'self'
  const source = 'Bruinvels et al. 2016/2021; Sim et al. 2019; Mountjoy et al. 2023 (IOC REDs consensus)'

  // A long gap since the last start counts as a missed cycle, not just
  // irregular ones already recorded.
  const longGap = s.currentDay != null && s.currentDay > MAX_PLAUSIBLE_CYCLE * 1.5
  const disruption = s.irregularCount >= DISRUPTION_THRESHOLD || longGap

  if (disruption) {
    messages.push(
      self
        ? 'Your cycles have been irregular or absent for a while. That is a recognised sign of not eating enough for your ' +
          'training load, and it is worth raising with a doctor. It is not something to fix by changing your programme.'
        : 'Cycles have been irregular or absent. That is a recognised indicator of low energy availability — worth running the ' +
          'energy-availability screen and, if it is low, referring on. This is not something to solve with programming.',
    )
  }

  const heavyBleeding = entries.some(e => e.flow === 'heavy')
  if (heavyBleeding) {
    messages.push(
      self
        ? 'You have logged heavy bleeding. Heavy periods are a common and often-missed cause of iron deficiency in athletes, ' +
          'which tends to show up as unexplained fatigue and endurance falling off. Worth asking your GP for an iron panel.'
        : 'Heavy bleeding has been logged. Heavy menstrual bleeding is a common and under-recognised cause of iron deficiency in ' +
          'athletes, which shows up as unexplained fatigue and poor endurance. Worth suggesting an iron panel via their GP.',
    )
  }

  return { disruption, heavyBleeding, messages, routeToRedsScreen: disruption, source }
}

// --------------------------------------------------------- personal pattern

export interface PersonalPattern {
  /** Cycles the pattern rests on. */
  cycles: number
  /** Whether there's enough data to say anything at all. */
  reliable: boolean
  /** Plain-language observation, explicitly framed as this person's own data. */
  observation: string | null
  source: string
}

/** Cycles needed before a personal pattern is worth mentioning. */
export const MIN_CYCLES_FOR_PATTERN = 3

/**
 * Surface the client's OWN recurring pattern, labelled n=1.
 *
 * This is the honest version of "cycle insights": it makes no population
 * claim, only "this is what YOUR log has shown". That's defensible where
 * phase-based prescription is not.
 */
export function personalPattern(entries: CycleEntry[], voice: Voice = 'coach'): PersonalPattern {
  const self = voice === 'self'
  const source = self
    ? 'Your own logged data (n=1) — not a population finding.'
    : "This client's own logged data (n=1) — not a population finding."
  const s = summariseCycles(entries)

  if (s.starts.length < MIN_CYCLES_FOR_PATTERN) {
    return {
      cycles: s.starts.length, reliable: false, observation: null, source,
    }
  }

  // Which symptoms cluster in the days immediately before a cycle start?
  const preStartWindow = 3
  const startSet = new Set(s.starts)
  const counts = new Map<CycleSymptom, number>()
  for (const e of entries) {
    const inWindow = s.starts.some(st => {
      const d = daysBetween(e.date, st)
      return d > 0 && d <= preStartWindow
    })
    if (!inWindow || startSet.has(e.date)) continue
    for (const [sym, sev] of Object.entries(e.symptoms ?? {})) {
      if ((sev ?? 0) >= 2) counts.set(sym as CycleSymptom, (counts.get(sym as CycleSymptom) ?? 0) + 1)
    }
  }

  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  // Only worth saying if it recurred across most cycles, not once.
  if (!top || top[1] < Math.ceil(s.starts.length * 0.6)) {
    return { cycles: s.starts.length, reliable: true, observation: null, source }
  }

  return {
    cycles: s.starts.length,
    reliable: true,
    observation: self
      ? `Over your last ${s.starts.length} cycles, you've logged ${humanSymptom(top[0])} in the few days before your period ` +
        `${top[1]} times. Worth planning around — though this is your own pattern, not a rule.`
      : `Over their last ${s.starts.length} cycles, they've reported ${humanSymptom(top[0])} in the few days before their period ` +
        `${top[1]} times. Worth planning around — though this is their own pattern, not a rule.`,
    source,
  }
}

// ---------------------------------------------------------------- context

/** Reassurance, not a lever. */
export function contraceptiveNote(c: ContraceptiveContext, voice: Voice = 'coach'): string | null {
  if (c === 'none') return null
  if (c === 'iud-copper') return 'A copper IUD is non-hormonal. It can increase menstrual bleeding, which is worth knowing about for iron status.'
  return 'Hormonal contraceptives have negligible-to-small average effects on performance (Elliott-Sale et al. 2020). ' +
    (voice === 'self'
      ? 'Nothing about your training needs to change because of one.'
      : 'No programming change is indicated on their account.')
}

/**
 * The honest framing shown wherever this feature appears. Kept as an export
 * so the copy can't drift between surfaces — and so a future session can't
 * quietly replace it with a phase-based claim without editing this file and
 * reading the header.
 */
export const CYCLE_FRAMING =
  'Research does not currently support training differently based on cycle phase — the studies disagree and most are small. ' +
  'What is well supported is that symptoms vary, and that they affect training on the days they show up. ' +
  'So this tracks how someone actually feels and adjusts from that, rather than from a calendar.'

// ===== Metric presets — research-grounded testing batteries (spec §4.10b) =====
// Coachwright doesn't force a fixed metrics schema on every coach — a
// powerlifting coach and an endurance coach track very different things.
// These presets are OPTIONAL quick-fill suggestions (name + type + unit +
// suggested re-test cadence + why), grounded in published assessment
// literature, that a coach can apply per client based on training goal.
// Nothing here is mandatory; a coach can always log a fully custom metric.

import type { MetricType, TrainingGoal } from '@/db/types'

export interface MetricPresetItem {
  key: string           // Metric.key
  label: string
  type: MetricType
  unit: string
  cadence: string       // suggested re-test frequency
  why: string
  source: string
}

export interface MetricPreset {
  id: string
  label: string
  appliesTo: TrainingGoal[]
  items: MetricPresetItem[]
}

export const METRIC_PRESETS: MetricPreset[] = [
  {
    id: 'strength-testing',
    label: 'Strength testing battery',
    appliesTo: ['strength', 'power'],
    items: [
      { key: 'squat-1rm', label: 'Back squat 1RM', type: 'strength-test', unit: 'lb', cadence: 'every 6–8 weeks', why: 'Direct strength benchmark; frequent-enough to show a training-block effect without excess fatigue cost.', source: 'ACSM Guidelines for Exercise Testing & Prescription, 11th ed.' },
      { key: 'bench-1rm', label: 'Bench press 1RM', type: 'strength-test', unit: 'lb', cadence: 'every 6–8 weeks', why: 'Upper-body push benchmark, pairs with the relative-strength standards in the Coaching tab.', source: 'ACSM Guidelines, 11th ed.' },
      { key: 'deadlift-1rm', label: 'Deadlift 1RM', type: 'strength-test', unit: 'lb', cadence: 'every 6–8 weeks', why: 'Posterior-chain/hip-hinge benchmark; the three lifts together give a full relative-strength picture.', source: 'ACSM Guidelines, 11th ed.' },
      { key: 'resting-hr', label: 'Resting heart rate', type: 'recovery', unit: 'bpm', cadence: 'weekly, same time of day', why: 'A rising resting HR against baseline is one of the cheapest early flags for accumulating fatigue/overreaching.', source: 'Bourdon et al. 2017 (Int J Sports Physiol Perform) — monitoring athlete training loads consensus' },
    ],
  },
  {
    id: 'power-testing',
    label: 'Power & explosiveness battery',
    appliesTo: ['power'],
    items: [
      { key: 'vertical-jump', label: 'Vertical jump', type: 'performance', unit: 'in', cadence: 'every 3–4 weeks', why: 'Cheap, reliable proxy for lower-body power output; sensitive to fatigue and training effect alike.', source: 'Markovic 2007 (Br J Sports Med) — jump test reliability/validity' },
      { key: 'broad-jump', label: 'Standing broad jump', type: 'performance', unit: 'in', cadence: 'every 3–4 weeks', why: 'Horizontal power complement to the vertical jump — the two together catch more of the force-velocity curve.', source: 'Markovic 2007 (Br J Sports Med)' },
    ],
  },
  {
    id: 'endurance-testing',
    label: 'Endurance testing battery',
    appliesTo: ['endurance', 'general-fitness'],
    items: [
      { key: 'mile-time', label: '1-mile time trial', type: 'performance', unit: 'min', cadence: 'every 4–6 weeks', why: 'A field-test proxy for aerobic capacity that needs no lab equipment; repeatable and motivating for clients.', source: 'Cooper 1968 field-test tradition; still standard practice in strength & conditioning' },
      { key: 'resting-hr', label: 'Resting heart rate', type: 'recovery', unit: 'bpm', cadence: 'weekly, same time of day', why: 'A falling resting HR over a training block is one of the clearest, cheapest signs of an aerobic training effect.', source: 'ACSM Guidelines, 11th ed.' },
    ],
  },
  {
    id: 'body-composition',
    label: 'Body composition & physique',
    appliesTo: ['fat-loss', 'lean-gain', 'hypertrophy'],
    items: [
      { key: 'waist', label: 'Waist circumference', type: 'measurement', unit: 'in', cadence: 'every 2 weeks', why: 'Tracks fat-loss/gain trend without the day-to-day noise of a scale; waist specifically correlates with visceral fat change.', source: 'Ross et al. 2020 (Nat Rev Endocrinol) — waist circumference as a clinical fat-change marker' },
      { key: 'hips', label: 'Hip circumference', type: 'measurement', unit: 'in', cadence: 'every 2 weeks', why: 'Paired with waist, gives a waist-to-hip ratio trend — useful alongside the scale for body-recomposition goals.', source: 'WHO waist-hip ratio protocol' },
      { key: 'bodyfat', label: 'Body fat %', type: 'bodyfat', unit: '%', cadence: 'every 4 weeks', why: 'Any single method (calipers, BIA, DEXA) has error; the trend across repeat measurements with the SAME method/device matters more than any single reading.', source: 'Wagner & Heyward 1999 (review of BF% method error)' },
    ],
  },
]

export function presetsForGoal(goal?: TrainingGoal): MetricPreset[] {
  if (!goal) return METRIC_PRESETS
  return METRIC_PRESETS.filter(p => p.appliesTo.includes(goal))
}

/** The suggestion chips for a goal: every group's items, one per key. Two
 *  groups can suggest the same measurement (resting HR is both a strength
 *  fatigue flag and an endurance fitness sign) — the first group's wording
 *  wins, so with no goal set the chip isn't shown twice. */
export function suggestedItems(goal?: TrainingGoal): MetricPresetItem[] {
  const seen = new Set<string>()
  return presetsForGoal(goal).flatMap(p => p.items).filter(i => !seen.has(i.key) && !!seen.add(i.key))
}

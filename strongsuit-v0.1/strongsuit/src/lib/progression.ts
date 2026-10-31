// ===== Progression engine (spec §4.14) =====
// Pure, deterministic, explainable. Given exercise history + a policy, return
// a next-session suggestion WITH its reasoning line. No I/O, no randomness —
// every suggestion can be reproduced and defended to a client.

import type { ProgressionPolicy, Units } from '@/db/types'
import en, { type MessageKey } from './i18n/locales/en'
import { translate } from './i18n/core'

/** One past performance of an exercise (a session's sets, done sets only matter). */
export interface PerformedSet {
  load?: number
  reps?: number
  rpe?: number
  done: boolean
}
export interface Performance {
  date: string // yyyy-MM-dd
  sets: PerformedSet[]
}

export interface Suggestion {
  load?: number
  reps?: string           // display string, e.g. "8" | "8-12"
  reason: string          // human reasoning line, always present (English)
  /** The same line as a message key + params, for the UI to translate. */
  msg: { key: MessageKey; params: Record<string, string | number> }
  direction: 'up' | 'hold' | 'down'
}

/** `reason` and `msg` from one catalogue entry, so the English and the
 *  translatable line can never drift apart. */
function say(key: MessageKey, params: Record<string, string | number>): Pick<Suggestion, 'reason' | 'msg'> {
  return { reason: translate(key, en, en, 'en', params), msg: { key, params } }
}

/** Smallest sensible jump the trainer can actually load on a bar. */
export const plateStep = (units: Units) => (units === 'lb' ? 2.5 : 1.25)

/** Round a load to the nearest achievable plate increment. */
export function roundToPlate(load: number, units: Units): number {
  const step = plateStep(units)
  return Math.round(load / step) * step
}

/** Working sets = done sets with a real load+reps. */
const workingSets = (p: Performance) =>
  p.sets.filter(s => s.done && (s.load ?? 0) > 0 && (s.reps ?? 0) > 0)

const topLoad = (p: Performance) =>
  Math.max(...workingSets(p).map(s => s.load ?? 0), 0)

const avgRpe = (p: Performance) => {
  const rated = workingSets(p).filter(s => s.rpe != null)
  if (!rated.length) return null
  return rated.reduce((a, s) => a + (s.rpe ?? 0), 0) / rated.length
}

/**
 * Next-session suggestion for a policy. `history` is newest-first (matches
 * logsRepo.exerciseHistory). Returns null when there is nothing to reason from.
 */
export function suggestNext(
  policy: ProgressionPolicy,
  history: Performance[],
  units: Units,
): Suggestion | null {
  const last = history.find(p => workingSets(p).length > 0)
  if (!last) return null
  const load = topLoad(last)
  const sets = workingSets(last)

  switch (policy.kind) {
    case 'linear-load': {
      const next = roundToPlate(load * (1 + policy.percent / 100), units)
      const bumped = next > load ? next : roundToPlate(load + plateStep(units), units)
      return {
        load: bumped,
        direction: 'up',
        ...say('progression.linear', { percent: policy.percent, load, next: bumped, units, step: plateStep(units) }),
      }
    }

    case 'double-progression': {
      const [lo, hi] = policy.repRange
      const allAtTop = sets.every(s => (s.reps ?? 0) >= hi)
      if (allAtTop) {
        const next = roundToPlate(load + policy.loadIncrement, units)
        return {
          load: next,
          reps: `${lo}`,
          direction: 'up',
          ...say('progression.doubleTop', { lo, hi, load, units, inc: policy.loadIncrement }),
        }
      }
      const minReps = Math.min(...sets.map(s => s.reps ?? 0))
      const nextReps = Math.min(minReps + 1, hi)
      return {
        load,
        reps: `${nextReps}`,
        direction: 'hold',
        ...say('progression.doubleHold', { lo, hi, minReps, load, units, nextReps }),
      }
    }

    case 'rpe-target': {
      const rpe = avgRpe(last)
      if (rpe == null) {
        return {
          load,
          direction: 'hold',
          ...say('progression.rpeMissing', { load, units }),
        }
      }
      const r = Math.round(rpe * 10) / 10
      if (rpe <= policy.target - 1) {
        const next = Math.max(roundToPlate(load * 1.025, units), roundToPlate(load + plateStep(units), units))
        return {
          load: next,
          direction: 'up',
          ...say('progression.rpeUp', { rpe: r, target: policy.target, load, next, units }),
        }
      }
      if (rpe >= policy.target + 1) {
        const next = Math.max(Math.min(roundToPlate(load * 0.96, units), roundToPlate(load - plateStep(units), units)), plateStep(units))
        return {
          load: next,
          direction: 'down',
          ...say('progression.rpeDown', { rpe: r, target: policy.target, load, next, units }),
        }
      }
      return {
        load,
        direction: 'hold',
        ...say('progression.rpeHold', { rpe: r, target: policy.target, load, units }),
      }
    }
  }
}

/**
 * Policy-free heuristic used where no program policy is attached (history
 * drawer): infers a double-progression read from the last performance alone.
 */
export function suggestHeuristic(history: Performance[], units: Units): Suggestion | null {
  const last = history.find(p => workingSets(p).length > 0)
  if (!last) return null
  const sets = workingSets(last)
  const load = topLoad(last)
  const minReps = Math.min(...sets.map(s => s.reps ?? 0))
  const rpe = avgRpe(last)

  if (rpe != null && rpe >= 9.5) {
    return {
      load,
      direction: 'hold',
      ...say('progression.nearMax', { rpe: Math.round(rpe * 10) / 10, load, units }),
    }
  }
  if (minReps >= 12) {
    const raw = roundToPlate(load * 1.05, units)
    // The line used to quote `raw` even when the load fell back to one plate step.
    const next = raw > load ? raw : roundToPlate(load + plateStep(units), units)
    return {
      load: next,
      reps: '8',
      direction: 'up',
      ...say('progression.light', { minReps, load, next, units }),
    }
  }
  if (minReps >= 8) {
    const next = roundToPlate(load + plateStep(units), units)
    return {
      load: next,
      direction: 'up',
      ...say('progression.smallJump', { minReps, load, next, units }),
    }
  }
  return {
    load,
    reps: `${minReps + 1}`,
    direction: 'hold',
    ...say('progression.chase', { minReps, load, units, nextReps: minReps + 1 }),
  }
}

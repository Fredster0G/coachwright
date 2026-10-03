// Pure formatting for coach-assigned set prescriptions — kept out of the
// page component so it can be unit-tested (same lib-with-tests convention
// as the coach app).
import type { SetPrescription, Units } from '@/db/types'

const LB_PER_KG = 2.20462

/** A load from one unit to the other, to 0.1. Same unit → unchanged. */
export function convertLoad(v: number, from: Units, to: Units): number {
  if (from === to) return v
  return Math.round((from === 'kg' ? v * LB_PER_KG : v / LB_PER_KG) * 10) / 10
}

/** Tape measurements follow the weight setting: lb → inches, kg → cm. */
export const lengthUnit = (u: Units) => (u === 'kg' ? 'cm' : 'in')

/** `units` is the COACH's: prescriptions are written in them. */
export function fmtSet(s: SetPrescription, units: Units): string {
  if (s.timeSeconds) return `${s.timeSeconds}s`
  if (s.distanceM) return `${s.distanceM}m`
  const reps = s.reps ?? '?'
  if (s.loadMode === 'note' && s.loadNote) return `${reps} @ ${s.loadNote}`
  if (s.loadMode === 'percent1rm' && s.load != null) return `${reps} @ ${s.load}%`
  if (s.loadMode === 'rpe' || (s.load == null && s.rpe != null)) return `${reps} @ RPE ${s.rpe ?? '?'}`
  if (s.load != null) return `${reps} × ${s.load} ${units}`
  return `${reps}`
}

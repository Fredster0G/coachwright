import type { Block, BlockType, ExercisePrescription, SetPrescription } from '@/db/types'
import { newId } from '@/lib/core'

/** Shared block/exercise shapes so Day view and Grid view never drift on
 *  what a freshly-created block or prescription looks like. */
export function makeBlock(type: BlockType = 'straight'): Block {
  return { id: newId(), type, exercises: [] }
}

export function makeExercisePrescription(exerciseId: string): ExercisePrescription {
  return { id: newId(), exerciseId, sets: [{ reps: '10', loadMode: 'absolute' }] }
}

export type WeekProgression = 'none' | 'load' | 'reps'

/** "+1 rep" for a reps prescription: "8" → "9", "8-10" → "9-11"; anything
 *  else ("AMRAP", "max", "") is left alone. Reps is a STRING — the old inline
 *  `s.reps + 1` turned "5" into "51". */
export function bumpReps(reps: string | undefined): string | undefined {
  if (!reps) return reps
  const m = reps.trim().match(/^(\d+)(?:\s*([-–])\s*(\d+))?$/)
  if (!m) return reps
  const lo = Number(m[1]) + 1
  return m[3] ? `${lo}${m[2]}${Number(m[3]) + 1}` : String(lo)
}

/** A set as it should appear in a duplicated week. Load +2.5% only touches
 *  real weights — a %1RM or RPE target isn't a load to scale. */
export function progressSet(s: SetPrescription, mode: WeekProgression): SetPrescription {
  if (mode === 'reps') return { ...s, reps: bumpReps(s.reps) }
  if (mode === 'load' && s.load && (s.loadMode ?? 'absolute') === 'absolute') return { ...s, load: Number((s.load * 1.025).toFixed(1)) }
  return s
}

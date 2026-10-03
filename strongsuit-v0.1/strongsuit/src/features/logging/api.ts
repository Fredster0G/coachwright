import type { Program, Day, SessionLog, LogEntry, LoggedSet } from '@/db/types'
import { today, stamp } from '@/lib/core'

export function createSessionLogTemplate(clientId: string, program: Program, day: Day): SessionLog {
  const entries: LogEntry[] = []

  for (const block of day.blocks) {
    for (const ex of block.exercises) {
      const sets: LoggedSet[] = ex.sets.map(s => ({
        targetReps: s.reps,
        targetLoad: s.load,
        targetLoadMode: s.loadMode,
        done: false,
      }))
      entries.push({
        exerciseId: ex.exerciseId,
        sets,
        restSeconds: ex.restSeconds,
      })
    }
  }

  let weekId: string | undefined
  for (const w of program.weeks) {
    if (w.days.some(d => d.id === day.id)) {
      weekId = w.id
      break
    }
  }

  return stamp({
    clientId,
    programId: program.id,
    weekId,
    dayId: day.id,
    date: today(),
    title: day.name,
    entries,
    source: 'trainer' as const
  } as Partial<SessionLog>) as SessionLog
}

/** The load a set's input shows before the coach types: the target, but only
 *  when it IS a weight — a %1RM or RPE target isn't a load. */
export function shownLoad(set: LoggedSet): number | undefined {
  if (set.actualLoad != null) return set.actualLoad
  return (set.targetLoadMode ?? 'absolute') === 'absolute' ? set.targetLoad : undefined
}

/** Marking a set done records what the inputs showed. Before, the load box
 *  displayed the target but `done` saved neither load nor reps, so a set done
 *  "as prescribed" reached history and analytics empty. Reps fill only from a
 *  plain number ("8"), never a range or "AMRAP". */
export function completeSet(set: LoggedSet): LoggedSet {
  const out: LoggedSet = { ...set, done: true }
  const load = shownLoad(set)
  if (out.actualLoad == null && load != null) out.actualLoad = load
  if (out.actualReps == null && set.targetReps && /^\d+$/.test(set.targetReps.trim())) out.actualReps = Number(set.targetReps)
  return out
}

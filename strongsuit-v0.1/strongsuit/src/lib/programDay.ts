// ===== Which program day to log next =====
//
// "Log session" used to open Week 1 · Day 1 every time, so a client in week 4
// was logged against week 1's targets. The next day is the one after the most
// recent session logged against this program (program order: weeks, then
// days). Past the last day it stays on the last day — the coach decides what
// comes after a program ends, not a silent wrap back to week 1.

import type { Program, SessionLog } from '@/db/types'

export interface ProgramDayRef { weekId: string; dayId: string }

export function nextProgramDay(program: Program, logs: readonly Pick<SessionLog, 'programId' | 'dayId' | 'date' | 'createdAt'>[]): ProgramDayRef | null {
  const order: ProgramDayRef[] = program.weeks.flatMap(w => w.days.map(d => ({ weekId: w.id, dayId: d.id })))
  if (!order.length) return null
  const last = logs
    .filter(l => l.programId === program.id && l.dayId && order.some(o => o.dayId === l.dayId))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0]
  if (!last) return order[0]
  const i = order.findIndex(o => o.dayId === last.dayId)
  return order[Math.min(i + 1, order.length - 1)]
}

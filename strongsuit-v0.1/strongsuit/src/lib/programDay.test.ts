import { describe, it, expect } from 'vitest'
import { nextProgramDay } from './programDay'
import type { Program } from '@/db/types'

const prog = {
  id: 'p', name: 'P', status: 'active', createdAt: '', updatedAt: '',
  weeks: [
    { id: 'w1', label: 'Week 1', days: [{ id: 'a', name: 'A', blocks: [] }, { id: 'b', name: 'B', blocks: [] }] },
    { id: 'w2', label: 'Week 2', days: [{ id: 'c', name: 'C', blocks: [] }] },
  ],
} as unknown as Program
const log = (dayId: string, date: string, programId = 'p') => ({ programId, dayId, date, createdAt: date })

describe('nextProgramDay', () => {
  it('starts at the first day', () => {
    expect(nextProgramDay(prog, [])).toEqual({ weekId: 'w1', dayId: 'a' })
  })
  it('follows the most recent session, across weeks', () => {
    expect(nextProgramDay(prog, [log('a', '2026-01-01'), log('b', '2026-01-03')])).toEqual({ weekId: 'w2', dayId: 'c' })
    expect(nextProgramDay(prog, [log('b', '2026-01-03'), log('a', '2026-01-05')])).toEqual({ weekId: 'w1', dayId: 'b' })
  })
  it('stays on the last day once the program is done, and ignores other programs', () => {
    expect(nextProgramDay(prog, [log('c', '2026-01-09')])).toEqual({ weekId: 'w2', dayId: 'c' })
    expect(nextProgramDay(prog, [log('b', '2026-01-09', 'other')])).toEqual({ weekId: 'w1', dayId: 'a' })
  })
  it('null for a program with no days', () => {
    expect(nextProgramDay({ ...prog, weeks: [] }, [])).toBeNull()
  })
})

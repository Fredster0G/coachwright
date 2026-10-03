import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { today } from './core'

describe('today', () => {
  it('is the local calendar date, not the UTC one', () => {
    const lateEvening = new Date(2026, 0, 31, 23, 30)   // local time
    expect(today(lateEvening)).toBe('2026-01-31')
  })
})

// DEBT-60: the two apps are separate npm projects with no shared package, so
// pose.ts is a copy. This keeps it an exact one.
describe('code shared with the coach app by copy', () => {
  it('lib/pose.ts is identical', () => {
    const mine = readFileSync(resolve(__dirname, 'pose.ts'), 'utf8')
    const coach = readFileSync(resolve(__dirname, '../../../strongsuit/src/lib/pose.ts'), 'utf8')
    expect(mine).toBe(coach)
  })
})

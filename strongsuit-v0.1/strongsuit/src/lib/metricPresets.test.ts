import { describe, it, expect } from 'vitest'
import { METRIC_PRESETS, suggestedItems } from './metricPresets'
import type { TrainingGoal } from '@/db/types'

describe('suggestedItems', () => {
  it('never repeats a key, with or without a goal', () => {
    const goals = [undefined, ...new Set(METRIC_PRESETS.flatMap(p => p.appliesTo))] as (TrainingGoal | undefined)[]
    for (const g of goals) {
      const keys = suggestedItems(g).map(i => i.key)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })
  it('still offers resting HR when no goal is set', () => {
    expect(suggestedItems().filter(i => i.key === 'resting-hr')).toHaveLength(1)
  })
})

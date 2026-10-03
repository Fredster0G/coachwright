import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './schema'
import { clientsRepo } from './repo'
import { seedDemoRoster } from './demo'
import { seedExercisesIfEmpty } from './seed'

beforeEach(async () => {
  for (const table of db.tables) await table.clear()
  await seedExercisesIfEmpty()
})

describe('seedDemoRoster', () => {
  it('builds clients with an active program, history, check-ins and weigh-ins', async () => {
    const ids = await seedDemoRoster('lb', new Date(2026, 9, 3, 12))
    expect(ids).toHaveLength(3)
    for (const id of ids) {
      const c = (await db.clients.get(id))!
      expect(c.isDemo).toBe(true)
      expect(c.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      const prog = await db.programs.get(c.activeProgramId!)
      expect(prog?.status).toBe('active')
      expect(prog!.weeks[0].days[0].blocks[0].exercises.length).toBe(3)
      expect(await db.sessionLogs.where('clientId').equals(id).count()).toBe(9)
      expect(await db.checkIns.where('clientId').equals(id).count()).toBe(3)
      expect(await db.metrics.where('clientId').equals(id).count()).toBe(4)
    }
    const squatLoads = (await db.sessionLogs.where('clientId').equals(ids[0]).sortBy('date')).map(l => l.entries[0].sets[0].actualLoad)
    expect(squatLoads[0]! % 5).toBe(0)                   // plate-friendly in lb
    expect(squatLoads.at(-1)!).toBeGreaterThan(squatLoads[0]!)
  })

  it('is removed completely by purgeDemo', async () => {
    await seedDemoRoster('kg')
    await clientsRepo.purgeDemo()
    for (const t of [db.clients, db.programs, db.sessionLogs, db.checkIns, db.metrics]) expect(await t.count()).toBe(0)
  })
})

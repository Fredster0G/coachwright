import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './schema'
import {
  exportClientPackage, rekeyClientPackage, importClientPackageText,
  isClientPackage, isClientPackageBundle, exportStaffClientBundle,
} from './portability'
import { clientsRepo } from './repo'

beforeEach(async () => {
  for (const table of db.tables) await table.clear()
})

async function seedClient(overrides?: Record<string, unknown>) {
  return clientsRepo.create({ firstName: 'Alex', lastName: 'Rivera', status: 'active', startDate: '2026-01-01', ...overrides } as Parameters<typeof clientsRepo.create>[0])
}

describe('exportClientPackage', () => {
  it('gathers only rows belonging to the given client', async () => {
    const a = await seedClient()
    const b = await seedClient({ firstName: 'Sam' })
    await db.metrics.bulkAdd([
      { id: 'm1', clientId: a.id, date: '2026-01-01', type: 'bodyweight', key: 'bodyweight', value: 180, unit: 'lb', createdAt: '', updatedAt: '' },
      { id: 'm2', clientId: b.id, date: '2026-01-01', type: 'bodyweight', key: 'bodyweight', value: 140, unit: 'lb', createdAt: '', updatedAt: '' },
    ])
    const pkg = await exportClientPackage(a.id)
    expect(pkg.client.id).toBe(a.id)
    expect(pkg.metrics).toHaveLength(1)
    expect(pkg.metrics[0].clientId).toBe(a.id)
  })

  it('includes only habit entries for the client\'s own habits', async () => {
    const a = await seedClient()
    await db.habits.add({ id: 'h1', clientId: a.id, name: 'Sleep 8h', active: true, createdAt: '', updatedAt: '' })
    await db.habitEntries.bulkAdd([
      { id: 'e1', habitId: 'h1', clientId: a.id, date: '2026-01-01', done: true, createdAt: '', updatedAt: '' },
      { id: 'e2', habitId: 'other-habit', clientId: 'other-client', date: '2026-01-01', done: true, createdAt: '', updatedAt: '' },
    ])
    const pkg = await exportClientPackage(a.id)
    expect(pkg.habitEntries).toEqual([expect.objectContaining({ id: 'e1' })])
  })

  it('throws for an unknown client id', async () => {
    await expect(exportClientPackage('nope')).rejects.toThrow(/not found/)
  })
})

describe('rekeyClientPackage (pure)', () => {
  it('assigns a fresh client id and remaps program/habit cross-references', () => {
    const pkg = {
      app: 'coachwright', kind: 'client-package' as const, exportedAt: '2026-01-01',
      client: { id: 'c1', firstName: 'A', lastName: 'B', status: 'active', activeProgramId: 'p1', staffId: 's1', locationId: 'l1', createdAt: '', updatedAt: '' },
      clientNotes: [], programs: [{ id: 'p1', clientId: 'c1', name: 'Base', status: 'active', createdAt: '', updatedAt: '' }],
      sessionLogs: [{ id: 'sl1', clientId: 'c1', programId: 'p1', date: '2026-01-01', entries: [], createdAt: '', updatedAt: '' }],
      checkIns: [], metrics: [], payments: [], appointments: [], waivers: [], progressPhotos: [],
      habits: [{ id: 'h1', clientId: 'c1', name: 'Sleep', active: true, createdAt: '', updatedAt: '' }],
      habitEntries: [{ id: 'e1', habitId: 'h1', clientId: 'c1', date: '2026-01-01', done: true, createdAt: '', updatedAt: '' }],
      messages: [],
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = rekeyClientPackage(pkg as any)
    expect(out.client.id).not.toBe('c1')
    expect(out.client.staffId).toBeUndefined()
    expect(out.client.locationId).toBeUndefined()
    expect(out.programs[0].id).not.toBe('p1')
    expect(out.programs[0].clientId).toBe(out.client.id)
    expect(out.client.activeProgramId).toBe(out.programs[0].id)
    expect(out.sessionLogs[0].programId).toBe(out.programs[0].id)
    expect(out.habitEntries[0].habitId).toBe(out.habits[0].id)
    expect(out.habitEntries[0].clientId).toBe(out.client.id)
  })
})

describe('package detection', () => {
  it('recognizes a single package vs. a bundle vs. neither', () => {
    const single = { kind: 'client-package' }
    expect(isClientPackage(single)).toBe(true)
    expect(isClientPackageBundle(single)).toBe(false)
    expect(isClientPackageBundle([single, single])).toBe(true)
    expect(isClientPackage({ kind: 'backup' })).toBe(false)
    expect(isClientPackageBundle([])).toBe(false)
  })
})

describe('importClientPackageText', () => {
  it('round-trips a single client into a brand-new row with a new id', async () => {
    const a = await seedClient()
    const pkg = await exportClientPackage(a.id)
    const [report] = await importClientPackageText(JSON.stringify(pkg))
    expect(report.clientName).toBe('Alex Rivera')
    const all = await db.clients.toArray()
    expect(all).toHaveLength(2)
    expect(all.map(c => c.id)).toContain(a.id)
    expect(all.some(c => c.id !== a.id)).toBe(true)
  })

  it('imports a bundle of multiple packages', async () => {
    const a = await seedClient({ firstName: 'One' })
    const b = await seedClient({ firstName: 'Two' })
    const bundle = [await exportClientPackage(a.id), await exportClientPackage(b.id)]
    const reports = await importClientPackageText(JSON.stringify(bundle))
    expect(reports).toHaveLength(2)
    expect(await db.clients.count()).toBe(4)
  })

  it('rejects malformed or unrelated JSON', async () => {
    await expect(importClientPackageText('not json')).rejects.toThrow(/client package/)
    await expect(importClientPackageText(JSON.stringify({ app: 'coachwright', kind: 'backup' }))).rejects.toThrow(/client package/)
  })
})

describe('exportStaffClientBundle', () => {
  it('bundles only clients assigned to the given staff member', async () => {
    const a = await seedClient({ staffId: 'coach-1' })
    await seedClient({ staffId: 'coach-2' })
    const bundle = await exportStaffClientBundle('coach-1')
    expect(bundle).toHaveLength(1)
    expect(bundle[0].client.id).toBe(a.id)
  })
})

describe('food log portability (DEBT-68)', () => {
  it('exports the client\'s food entries with exactly the FoodItems they reference', async () => {
    const a = await seedClient()
    await db.foodItems.bulkAdd([
      { id: 'f1', barcode: '111', name: 'Oats', calories: 150, protein: 5, carbs: 27, fat: 3, createdAt: '', updatedAt: '' },
      { id: 'f2', barcode: '222', name: 'Unrelated', calories: 1, protein: 0, carbs: 0, fat: 0, createdAt: '', updatedAt: '' },
    ])
    await db.foodEntries.bulkAdd([
      { id: 'fe1', clientId: a.id, date: '2026-01-01', foodItemId: 'f1', meal: 'breakfast', servings: 2, createdAt: '', updatedAt: '' },
      { id: 'fe2', clientId: 'other', date: '2026-01-01', foodItemId: 'f2', meal: 'lunch', servings: 1, createdAt: '', updatedAt: '' },
    ])
    const pkg = await exportClientPackage(a.id)
    expect(pkg.foodEntries?.map(e => e.id)).toEqual(['fe1'])
    expect(pkg.foodItems?.map(f => f.id)).toEqual(['f1'])
  })

  it('round-trips: imported entries point at a real item with the same macros', async () => {
    const a = await seedClient()
    await db.foodItems.add({ id: 'f1', barcode: '111', name: 'Oats', calories: 150, protein: 5, carbs: 27, fat: 3, createdAt: '', updatedAt: '' })
    await db.foodEntries.add({ id: 'fe1', clientId: a.id, date: '2026-01-01', foodItemId: 'f1', meal: 'breakfast', servings: 2, createdAt: '', updatedAt: '' })
    const text = JSON.stringify(await exportClientPackage(a.id))
    for (const table of db.tables) await table.clear()

    const [report] = await importClientPackageText(text)
    expect(report.recordsImported).toBe(3) // client + item + entry
    const [entry] = await db.foodEntries.toArray()
    const item = await db.foodItems.get(entry.foodItemId)
    expect(item?.name).toBe('Oats')
    expect(entry.clientId).toBe((await db.clients.toArray())[0].id)
  })

  it('reuses a destination FoodItem with the same barcode instead of duplicating it', async () => {
    const a = await seedClient()
    await db.foodItems.add({ id: 'f1', barcode: '111', name: 'Oats', calories: 150, protein: 5, carbs: 27, fat: 3, createdAt: '', updatedAt: '' })
    await db.foodEntries.add({ id: 'fe1', clientId: a.id, date: '2026-01-01', foodItemId: 'f1', meal: 'breakfast', servings: 1, createdAt: '', updatedAt: '' })
    const text = JSON.stringify(await exportClientPackage(a.id))

    await importClientPackageText(text) // same DB still holds f1 → dedupe
    expect(await db.foodItems.count()).toBe(1)
    const imported = (await db.foodEntries.toArray()).find(e => e.id !== 'fe1')!
    expect(imported.foodItemId).toBe('f1')
  })

  it('imports a pre-S23 package with no food fields', async () => {
    const a = await seedClient()
    const pkg = await exportClientPackage(a.id)
    delete pkg.foodEntries; delete pkg.foodItems
    await expect(importClientPackageText(JSON.stringify(pkg))).resolves.toHaveLength(1)
  })
})

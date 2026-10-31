import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './schema'
import { programsRepo, clientsRepo } from './repo'
import type { Program } from './types'

beforeEach(async () => { for (const table of db.tables) await table.clear() })

const program = (over: Partial<Program>) => programsRepo.create({
  name: 'Base', status: 'draft', weeks: [{ id: 'w', label: 'W1', days: [{ id: 'd', name: 'D1', blocks: [] }] }], ...over,
} as Parameters<typeof programsRepo.create>[0])

describe('programsRepo.assignToClient', () => {
  it('assigns a draft in place and points the client at it', async () => {
    const c = await clientsRepo.create({ firstName: 'A', lastName: 'B', status: 'active', startDate: '2026-01-01' } as Parameters<typeof clientsRepo.create>[0])
    const p = await program({})
    const id = await programsRepo.assignToClient(p.id, c.id, '2026-10-03')
    expect(id).toBe(p.id)
    expect(await db.programs.get(p.id)).toMatchObject({ clientId: c.id, status: 'active', startDate: '2026-10-03' })
    expect((await db.clients.get(c.id))!.activeProgramId).toBe(p.id)
  })

  it('copies a template, leaving it in the library', async () => {
    const c = await clientsRepo.create({ firstName: 'A', lastName: 'B', status: 'active', startDate: '2026-01-01' } as Parameters<typeof clientsRepo.create>[0])
    const tpl = await program({ status: 'template', name: 'Template' })
    const id = await programsRepo.assignToClient(tpl.id, c.id, '2026-10-03')
    expect(id).not.toBe(tpl.id)
    expect((await db.programs.get(tpl.id))).toMatchObject({ status: 'template' })
    expect((await db.programs.get(tpl.id))!.clientId).toBeUndefined()
    expect(await db.programs.get(id)).toMatchObject({ clientId: c.id, status: 'active', sourceTemplateId: tpl.id, name: 'Template' })
    expect((await db.clients.get(c.id))!.activeProgramId).toBe(id)
  })

  it('retires the previous active program so there is only one', async () => {
    const c = await clientsRepo.create({ firstName: 'A', lastName: 'B', status: 'active', startDate: '2026-01-01' } as Parameters<typeof clientsRepo.create>[0])
    const first = await program({})
    const second = await program({ name: 'Next block' })
    await programsRepo.assignToClient(first.id, c.id, '2026-09-01')
    await programsRepo.assignToClient(second.id, c.id, '2026-10-03')
    expect((await db.programs.get(first.id))!.status).toBe('completed')
    const active = (await programsRepo.forClient(c.id)).filter(p => p.status === 'active')
    expect(active.map(p => p.id)).toEqual([second.id])
  })
})

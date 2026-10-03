import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { db } from '@/db/schema'

beforeEach(async () => {
  for (const table of db.tables) await table.clear()
})
afterEach(() => { vi.unstubAllGlobals() })

describe('refreshMembership', () => {
  it('does nothing when signed out', async () => {
    const { refreshMembership } = await import('./membershipApi')
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    expect(await refreshMembership()).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })
})

import { describe, it, expect } from 'vitest'
import { editionCapabilities, tierAtLeast, seatsFor, type Edition } from './edition'

describe('editionCapabilities', () => {
  it('falls back to the most restrictive edition when the licence is missing or unknown', () => {
    // A corrupt or absent licence must never unlock paid features. This is the
    // single most important assertion in this file.
    for (const bad of [undefined, null, '' as unknown as Edition, 'enterprise' as Edition]) {
      const cap = editionCapabilities(bad)
      expect(cap.edition).toBe('personal')
      expect(cap.multiSeat).toBe(false)
    }
  })

  it('gates team features behind Studio', () => {
    const independent = editionCapabilities('independent')
    const studio = editionCapabilities('studio')

    expect(editionCapabilities('personal').multiSeat).toBe(false)
    expect(independent.multiSeat).toBe(false)
    expect(studio.multiSeat).toBe(true)
  })

  it('gives every gated edition a plain-language upgrade reason', () => {
    // A hidden feature the user can't explain reads as a bug. Studio is the
    // top edition, so it has nothing left to explain.
    expect(editionCapabilities('personal').upgradeReason).toBeTruthy()
    expect(editionCapabilities('independent').upgradeReason).toBeTruthy()
    expect(editionCapabilities('studio').upgradeReason).toBeUndefined()
  })

  it('capabilities are monotonic — a higher edition never has fewer', () => {
    const p = editionCapabilities('personal')
    const i = editionCapabilities('independent')
    const s = editionCapabilities('studio')
    expect(!p.multiSeat || i.multiSeat).toBe(true)   // personal ⊆ independent
    expect(!i.multiSeat || s.multiSeat).toBe(true)   // independent ⊆ studio
  })
})

describe('tierAtLeast', () => {
  it('orders tiers smallest to largest', () => {
    expect(tierAtLeast('pro', 'light')).toBe(true)
    expect(tierAtLeast('light', 'light')).toBe(true)
    expect(tierAtLeast('embeddings', 'light')).toBe(false)
    expect(tierAtLeast('standard', 'pro')).toBe(false)
  })
})

describe('seatsFor', () => {
  it('is always one seat outside Studio, whatever the licence claims', () => {
    expect(seatsFor('personal', 50)).toBe(1)
    expect(seatsFor('independent', 50)).toBe(1)
  })

  it('honours the Studio seat count, with a floor of one', () => {
    expect(seatsFor('studio', 10)).toBe(10)
    expect(seatsFor('studio', 0)).toBe(1)
    expect(seatsFor('studio', undefined)).toBe(1)
  })
})

import { describe, it, expect } from 'vitest'
import { artifactBrand, validHex } from './branding'
import type { Trainer } from '@/db/types'

const base = { id: 'trainer', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '', businessName: 'Iron Den', trainerName: 'J', units: 'lb', weekStartsOn: 1, defaultRestSeconds: 90, currency: 'USD', onboardingComplete: true, companionCredit: true, density: 'compact', theme: 'system', logoDataUrl: 'data:image/png;base64,xx', brandColor: '#123abc' } as Trainer

describe('artifactBrand', () => {
  it('uses Coachwright for a new free account', () => {
    expect(artifactBrand(base)).toEqual({ name: 'Coachwright', custom: false })
  })
  it('uses the coach\'s name, logo and colour with membership', () => {
    const b = artifactBrand({ ...base, membershipActive: true, membershipExpiresAt: '2999-01-01T00:00:00.000Z' })
    expect(b).toEqual({ name: 'Iron Den', logo: 'data:image/png;base64,xx', color: '#123abc', custom: true })
  })
  it('falls back to the app name and drops a malformed colour', () => {
    const b = artifactBrand({ ...base, createdAt: '2026-01-01T00:00:00.000Z', businessName: ' ', brandColor: 'red' })
    expect(b.name).toBe('Coachwright')
    expect(b.color).toBeUndefined()
  })
  it('validHex', () => {
    expect(validHex('#A1b2C3')).toBe(true)
    expect(validHex('#abc')).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { english, renderMsg } from './msg'

describe('Msg', () => {
  it('renders nested params and plurals in English', () => {
    expect(english({ key: 'readiness.learning', params: { count: 2 } })).toMatch(/2 more check-ins/)
    expect(english({ key: 'readiness.moderate', params: { because: { key: 'readiness.because', params: { driver: { key: 'readiness.desc.normal', params: { label: { key: 'readiness.domain.sleep' } } } } } } }))
      .toBe('Keep the session, cap the top sets a notch. Mainly sleep is normal for them.')
  })
  it('hands each key to the given translator', () => {
    const seen: string[] = []
    renderMsg({ key: 'readiness.because', params: { driver: { key: 'readiness.domain.mood' } } }, k => { seen.push(k); return k })
    expect(seen).toEqual(['readiness.domain.mood', 'readiness.because'])
  })
})

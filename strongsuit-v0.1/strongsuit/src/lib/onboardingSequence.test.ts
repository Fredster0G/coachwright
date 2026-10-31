import { describe, it, expect } from 'vitest'
import { planOnboarding, DEFAULT_ONBOARDING_STEPS, SEND_HOUR } from './onboardingSequence'

const now = new Date(2026, 9, 5, 15, 30)   // Mon 5 Oct, 15:30 local

describe('planOnboarding', () => {
  it('sends the welcome right away and later steps at the send hour on their day', () => {
    const p = planOnboarding(DEFAULT_ONBOARDING_STEPS, { id: 'c1', firstName: 'Sam' }, now)
    expect(p.map(r => r.id)).toEqual(['onb~c1~0', 'onb~c1~1', 'onb~c1~2', 'onb~c1~3'])
    expect(p[0].sendAt.getTime() - now.getTime()).toBe(60_000)
    expect([p[1].sendAt.getDate(), p[1].sendAt.getHours()]).toEqual([7, SEND_HOUR])
    expect(p[3].sendAt.getMonth()).toBe(9)
    expect(p[3].sendAt.getDate()).toBe(19)
  })
  it('fills in the first name, with a fallback', () => {
    expect(planOnboarding([{ dayOffset: 0, content: 'Hi {firstName}, {firstName}!' }], { id: 'c', firstName: 'Ana' }, now)[0].content).toBe('Hi Ana, Ana!')
    expect(planOnboarding([{ dayOffset: 0, content: 'Hi {firstName}' }], { id: 'c', firstName: ' ' }, now)[0].content).toBe('Hi there')
  })
  it('skips blank or negative steps but keeps ids tied to the step position', () => {
    const p = planOnboarding([{ dayOffset: 1, content: ' ' }, { dayOffset: -1, content: 'x' }, { dayOffset: 3, content: 'ok' }], { id: 'c', firstName: 'A' }, now)
    expect(p.map(r => r.id)).toEqual(['onb~c~2'])
  })
  it('orders by send time even when steps are out of order', () => {
    const p = planOnboarding([{ dayOffset: 5, content: 'b' }, { dayOffset: 1, content: 'a' }], { id: 'c', firstName: 'A' }, now)
    expect(p.map(r => r.content)).toEqual(['a', 'b'])
  })
})

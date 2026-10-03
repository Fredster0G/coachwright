import { describe, it, expect } from 'vitest'
import * as path from 'path'
import { resolveAppAsset, windowOpenAction } from './policy'

const root = path.resolve('/opt/coachwright/dist')

describe('resolveAppAsset', () => {
  it('serves files inside dist', () => {
    expect(resolveAppAsset(root, '/')).toBe(path.join(root, 'index.html'))
    expect(resolveAppAsset(root, '/assets/index-abc.js')).toBe(path.join(root, 'assets', 'index-abc.js'))
    expect(resolveAppAsset(root, '/mediapipe/pose%20model.task')).toBe(path.join(root, 'mediapipe', 'pose model.task'))
  })
  it('refuses anything that decodes to outside dist', () => {
    const escape = new URL('app://coachwright/..%2F..%2F..%2Fetc%2Fpasswd').pathname
    expect(resolveAppAsset(root, escape)).toBeNull()
    expect(resolveAppAsset(root, '/%2e%2e/%2e%2e/secret')).toBeNull()
    expect(resolveAppAsset(root, '/assets/..%5C..%5C..%5Cwindows')).toBeNull()
    expect(resolveAppAsset(root, '/%E0%A4%A')).toBeNull()   // malformed escape
  })
})

describe('windowOpenAction', () => {
  const origins = ['app://coachwright', 'http://localhost:5173']
  it('opens the app\'s own print/TV pages as app windows', () => {
    expect(windowOpenAction('app://coachwright/index.html#/print/progress/c1', origins)).toBe('app-window')
    expect(windowOpenAction('http://localhost:5173/#/tv/c1', origins)).toBe('app-window')
  })
  it('sends web links to the OS browser and refuses the rest', () => {
    expect(windowOpenAction('https://checkout.stripe.com/c/pay/x', origins)).toBe('external')
    expect(windowOpenAction('http://localhost:5173@evil.com/', origins)).toBe('external')   // lookalike, not ours
    expect(windowOpenAction('javascript:alert(1)', origins)).toBe('deny')
    expect(windowOpenAction('file:///etc/passwd', origins)).toBe('deny')
    expect(windowOpenAction('not a url', origins)).toBe('deny')
  })
})

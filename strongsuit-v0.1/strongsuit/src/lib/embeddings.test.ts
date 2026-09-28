import { describe, it, expect } from 'vitest'
import { cosineSimilarity } from './embeddings'

// S24 replaced transformers.js's cos_sim with a local one so the ~500KB
// runtime isn't a static import. Same maths, checked here.
describe('cosineSimilarity', () => {
  it('is 1 for the same direction, 0 for orthogonal, -1 for opposite', () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1)
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0)
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1)
  })
  it('matches the textbook formula on arbitrary vectors', () => {
    const a = [0.3, -1.2, 4.5, 0.01], b = [2.2, 0.4, -0.7, 3]
    const dot = a.reduce((s, x, i) => s + x * b[i], 0)
    const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0))
    expect(cosineSimilarity(a, b)).toBeCloseTo(dot / (norm(a) * norm(b)), 12)
  })
  it('is 0 (not NaN) for a zero vector', () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0)
  })
})

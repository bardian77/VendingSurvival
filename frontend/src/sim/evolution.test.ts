import { describe, expect, test } from 'vitest'
import { evolve } from './evolution'

describe('evolve — the population finds the thinking sweet spot', () => {
  const gens = evolve(16, 1)
  const first = gens[0]
  const last = gens[gens.length - 1]

  test('runs the requested number of generations', () => {
    expect(gens.length).toBe(16)
  })

  test('survival improves as weak instincts are bred out', () => {
    expect(last.survivors).toBeGreaterThanOrEqual(first.survivors)
    expect(last.survivors).toBeGreaterThanOrEqual(14)
  })

  test('the thinking budget converges down from the over-thinker-skewed start', () => {
    expect(last.avgTokens).toBeLessThan(first.avgTokens)
    expect(last.avgTokens).toBeGreaterThan(1500)
    expect(last.avgTokens).toBeLessThan(7000)
  })

  test('average skill rises over generations', () => {
    expect(last.avgSkill).toBeGreaterThan(first.avgSkill)
  })
})

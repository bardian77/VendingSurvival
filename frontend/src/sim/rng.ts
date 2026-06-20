/**
 * Tiny seeded PRNG (mulberry32) so every run is deterministic and reproducible
 * for demos. Same seed → identical simulation. No reliance on Math.random.
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number
  /** Uniform float in [min, max). */
  range(min: number, max: number): number
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number
  /** Gaussian sample with the given mean and standard deviation. */
  normal(mean: number, std: number): number
  /** True with probability p. */
  bool(p: number): boolean
  /** Uniformly pick one element. */
  pick<T>(items: readonly T[]): T
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0

  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const range = (min: number, max: number): number => min + next() * (max - min)

  const int = (min: number, max: number): number => Math.floor(range(min, max + 1))

  const normal = (mean: number, std: number): number => {
    // Box–Muller transform.
    const u = 1 - next()
    const v = next()
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    return mean + z * std
  }

  const bool = (p: number): boolean => next() < p

  const pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)]

  return { next, range, int, normal, bool, pick }
}

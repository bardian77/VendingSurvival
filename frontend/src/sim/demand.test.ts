import { describe, expect, test } from 'vitest'
import { choiceMultiplier, dateForDay, monthFactor, qualityFor, weekdayFactor } from './demand'
import { relativeDemand } from './catalog'

describe('demand model (ported from vending_bench.py)', () => {
  test('weekday factor: weekend > Friday > weekday', () => {
    // 2025-01-01 is a Wednesday; offset to hit known weekdays.
    const sat = dateForDay(0, 4) // 2025-01-04 Saturday
    const fri = dateForDay(0, 3) // 2025-01-03 Friday
    const wed = dateForDay(0, 1) // 2025-01-01 Wednesday
    expect(weekdayFactor(sat)).toBe(1.3)
    expect(weekdayFactor(fri)).toBe(1.15)
    expect(weekdayFactor(wed)).toBe(1.0)
  })

  test('month factor follows the seasonal table', () => {
    expect(monthFactor(dateForDay(0, 1))).toBe(0.9) // January
  })

  test('choice multiplier rewards variety within clamped bounds', () => {
    expect(choiceMultiplier(0)).toBe(1.0)
    expect(choiceMultiplier(5)).toBeGreaterThan(choiceMultiplier(2))
    expect(choiceMultiplier(20)).toBeGreaterThanOrEqual(0.5)
    expect(choiceMultiplier(5)).toBeLessThanOrEqual(1.25)
  })

  test('relative demand falls as price rises (negative elasticity)', () => {
    const item = { refPrice: 1.75, elasticity: -1.2 }
    expect(relativeDemand(1.75, item)).toBeCloseTo(1, 5)
    expect(relativeDemand(3.5, item)).toBeLessThan(1)
    expect(relativeDemand(1.0, item)).toBeGreaterThan(1)
  })

  test('quality rises with skill and thinking, but saturates', () => {
    expect(qualityFor(0.4, 300)).toBeLessThan(qualityFor(0.8, 300))
    expect(qualityFor(0.8, 300)).toBeLessThan(qualityFor(0.8, 30000))
    expect(qualityFor(0.9, 1_000_000)).toBeLessThanOrEqual(0.98)
  })
})

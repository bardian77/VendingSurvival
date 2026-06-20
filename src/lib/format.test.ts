import { describe, expect, test } from 'vitest'
import {
  formatDay,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatSignedMoney,
  formatTokens,
} from './format'

describe('formatMoney', () => {
  test('formats dollars with two decimals and grouping', () => {
    expect(formatMoney(1842.1)).toBe('$1,842.10')
  })

  test('renders negatives with a typographic minus', () => {
    expect(formatMoney(-41)).toBe('−$41.00')
  })

  test('guards against non-finite input', () => {
    expect(formatMoney(NaN)).toBe('$0.00')
  })
})

describe('formatSignedMoney', () => {
  test('prefixes a plus for gains', () => {
    expect(formatSignedMoney(12.4)).toBe('+$12.40')
  })

  test('prefixes a minus for losses', () => {
    expect(formatSignedMoney(-41)).toBe('−$41.00')
  })

  test('shows zero without a sign', () => {
    expect(formatSignedMoney(0)).toBe('$0.00')
  })
})

describe('formatMoneyCompact', () => {
  test('keeps small values exact-ish', () => {
    expect(formatMoneyCompact(420)).toBe('$420')
  })

  test('uses one decimal in the thousands', () => {
    expect(formatMoneyCompact(1842)).toBe('$1.8k')
  })

  test('drops decimals at 10k-scale and above', () => {
    expect(formatMoneyCompact(63000)).toBe('$63k')
  })

  test('handles negatives', () => {
    expect(formatMoneyCompact(-2500)).toBe('−$2.5k')
  })
})

describe('formatTokens', () => {
  test('passes through small counts', () => {
    expect(formatTokens(240)).toBe('240')
  })

  test('abbreviates thousands with one decimal', () => {
    expect(formatTokens(38900)).toBe('38.9k')
  })

  test('clamps non-positive to zero', () => {
    expect(formatTokens(-5)).toBe('0')
  })
})

describe('formatNumber & formatDay', () => {
  test('groups integers', () => {
    expect(formatNumber(1284)).toBe('1,284')
  })

  test('labels a day', () => {
    expect(formatDay(142)).toBe('Day 142')
  })
})

/**
 * Display formatting helpers. Pure functions, locale-pinned to en-US so output
 * is stable across environments (and easy to unit-test).
 */

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Proper typographic minus (U+2212), aligns better than a hyphen in figures. */
const MINUS = '−'

/** `$1,842.10` — full precision dollars. Negatives render with a real minus. */
export function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return '$0.00'
  return USD.format(value).replace('-', MINUS)
}

/** `+$12.40` / `−$41.00` / `$0.00` — signed delta. */
export function formatSignedMoney(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '$0.00'
  const sign = value > 0 ? '+' : MINUS
  return `${sign}${USD.format(Math.abs(value))}`
}

/** `$1.8k` / `$63k` / `$420` — compact dollars for dense axes and stats. */
export function formatMoneyCompact(value: number): string {
  if (!Number.isFinite(value)) return '$0'
  const sign = value < 0 ? MINUS : ''
  const abs = Math.abs(value)
  if (abs >= 1000) {
    const k = abs / 1000
    return `${sign}$${k >= 10 ? Math.round(k) : k.toFixed(1)}k`
  }
  return `${sign}$${Math.round(abs)}`
}

/** `1.2k` / `38.9k` / `240` — token counts. */
export function formatTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value >= 1000) {
    const k = value / 1000
    return `${k >= 100 ? Math.round(k) : k.toFixed(1)}k`
  }
  return String(Math.round(value))
}

/** `1,284` — grouped integer. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return Math.round(value).toLocaleString('en-US')
}

/** `Day 142` */
export function formatDay(day: number): string {
  return `Day ${Math.max(0, Math.floor(day))}`
}

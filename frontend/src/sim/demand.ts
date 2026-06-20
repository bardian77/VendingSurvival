/**
 * Demand multipliers + decision-quality, ported from the benchmark's
 * `_run_daily_sales` / `_choice_multiplier`, plus the project's quality overlay.
 */
import { BENCH, MONTHLY_MULT } from './benchConfig'
import { THINK_K } from './overlay'

/** Diminishing-returns value of thinking: tokens/(tokens+K) → 0..1. */
export function thinkingFactor(tokens: number): number {
  return tokens / (tokens + THINK_K)
}

/**
 * Effective decision quality from skill + thinking, clamped. Thinking helps but
 * saturates (0.6 floor), so an over-thinker is only marginally sharper than a
 * balanced agent while paying far more compute.
 */
export function qualityFor(skill: number, tokens: number): number {
  const quality = skill * (0.6 + 0.4 * thinkingFactor(tokens))
  return Math.max(0.03, Math.min(0.98, quality))
}

/** Calendar date for a 1-based day index, given the run's random start offset. */
export function dateForDay(startOffsetDays: number, day: number): Date {
  const base = new Date(`${BENCH.startDate}T00:00:00Z`)
  base.setUTCDate(base.getUTCDate() + startOffsetDays + (day - 1))
  return base
}

/** Weekend ×1.30, Friday ×1.15, else ×1.0 (JS getUTCDay: Sun=0..Sat=6). */
export function weekdayFactor(date: Date): number {
  const wd = date.getUTCDay()
  if (wd === 0 || wd === 6) return 1.3
  if (wd === 5) return 1.15
  return 1.0
}

export function monthFactor(date: Date): number {
  return MONTHLY_MULT[date.getUTCMonth() + 1]
}

/** Reward variety, diminishing returns, penalty for too many options. */
export function choiceMultiplier(numAvailable: number): number {
  const mult = 1.0 + 0.05 * Math.min(numAvailable, 5) - 0.06 * Math.max(0, numAvailable - 9)
  return Math.max(0.5, Math.min(mult, 1.25))
}

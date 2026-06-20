/**
 * Demand & quality math. Quality rises with thinking but saturates (diminishing
 * returns), so the extra tokens an over-thinker spends barely improve decisions
 * while costing a fortune — the core tension of the simulation.
 */
import { ELASTICITY, THINK_K } from './constants'

/** Diminishing-returns value of thinking: tokens/(tokens+K) → 0..1. */
export function thinkingFactor(tokens: number): number {
  return tokens / (tokens + THINK_K)
}

/**
 * Effective decision quality from intrinsic skill + thinking, clamped 0..1.
 * Thinking helps but only modestly (0.6 floor) — skill matters more than raw
 * token spend, so an over-thinker is barely better than a balanced agent.
 */
export function qualityFor(skill: number, tokens: number): number {
  const think = thinkingFactor(tokens)
  const quality = skill * (0.6 + 0.4 * think)
  return Math.max(0.03, Math.min(0.98, quality))
}

/** Day-of-week multiplier — office foot traffic dips on the weekend. */
export function dayOfWeekFactor(day: number): number {
  const table = [1.05, 1.08, 1.06, 1.07, 1.12, 0.78, 0.7]
  return table[day % 7]
}

/** Gentle seasonal swing across the ~year. */
export function seasonalFactor(day: number): number {
  return 1 + 0.12 * Math.sin((day / 365) * Math.PI * 2 - Math.PI / 2)
}

/** Sales-volume response to price relative to its optimum (clamped). */
export function priceResponse(price: number, optimal: number): number {
  const rel = (price - optimal) / optimal
  return Math.max(0, Math.min(1.8, 1 - ELASTICITY * rel))
}

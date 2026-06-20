/**
 * Token economics — the engine of the "thinking costs money" mechanic.
 * Blended $/token rates approximate June-2026 frontier pricing (input+output
 * mixed). Raw cost is amplified by COMPUTE_MULTIPLIER so it bites over a run.
 */
import type { ModelTier } from '../types'
import { COMPUTE_MULTIPLIER } from './overlay'

/** Blended dollars per token by model tier. */
export const TOKEN_RATES: Record<ModelTier, number> = {
  opus: 20e-6, // ~$20 / 1M tokens
  sonnet: 10e-6, // ~$10 / 1M tokens
  haiku: 3.5e-6, // ~$3.5 / 1M tokens
}

export const MODEL_LABEL: Record<ModelTier, string> = {
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
}

/** Unamplified dollar cost of `tokens` on a tier (true API price). */
export function rawComputeCost(tier: ModelTier, tokens: number): number {
  return tokens * TOKEN_RATES[tier]
}

/** Dollar compute cost deducted from an agent's balance for a day's thinking. */
export function computeCostFor(tier: ModelTier, tokens: number): number {
  return rawComputeCost(tier, tokens) * COMPUTE_MULTIPLIER
}

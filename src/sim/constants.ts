/**
 * Tunable economic constants for the mock simulation. These are the dials used
 * to calibrate the run so a believable spread emerges (a few agents thrive, a
 * handful go bankrupt to compute cost or volatility).
 */

/** Starting cash for every agent (Vending-Bench uses $500). */
export const START_BALANCE = 500

/** Fixed daily location fee — the "consumption" term (base benchmark: $2/day). */
export const DAILY_FEE = 2

/** Run length in simulated days (~a year of operation). */
export const MAX_DAYS = 300

/** Max units a single machine slot holds. */
export const SLOT_CAPACITY = 16

/**
 * Amplifies raw token dollar-cost so "thinking costs money" is a decisive drain
 * over a 300-day run rather than a rounding error. Without it, real per-token
 * pricing is far too small relative to daily vending margins.
 */
export const COMPUTE_MULTIPLIER = 42

/** Diminishing-returns constant: quality = skill·f(tokens/(tokens+K)). */
export const THINK_K = 2400

/** Global demand scaler applied on top of per-item base popularity. */
export const DEMAND_SCALE = 0.34

/** Price elasticity: how sharply volume falls as price exceeds the optimum. */
export const ELASTICITY = 1.25

/** Baseline daily operating waste (spoilage, mispricing floor), in dollars. */
export const OPERATING_WASTE = 2.6

/** How strongly low decision-quality translates into persistent mispricing. */
export const MISPRICE_STRENGTH = 0.7

/** Below this quality, decisions start actively destroying value. */
export const LOW_QUALITY_FLOOR = 0.3

/** Dollars/day of value destroyed per unit of quality below the floor. */
export const LOW_QUALITY_PENALTY = 38

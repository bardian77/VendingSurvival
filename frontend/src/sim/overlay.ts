/**
 * Project overlays — NOT part of Vending-Bench. The benchmark only scores net
 * worth; "thinking costs money", the survival framing, and the calibration
 * knobs below are our additions, kept separate from `benchConfig.ts`.
 */

/**
 * Amplifies raw token dollar-cost. A well-run machine clears ~$120/day, so the
 * multiplier is large by design: only then does an opus over-thinker's daily
 * compute exceed its profit and drain its liquidity to bankruptcy.
 */
export const COMPUTE_MULTIPLIER = 290

/** Diminishing-returns constant: quality = skill · f(tokens/(tokens+K)). */
export const THINK_K = 2400

/**
 * Execution quality scales each agent's daily sales: high-quality agents run a
 * tight machine, low-quality agents leave slots empty/unpriced and lose sales.
 * sales × (EXEC_BASE + EXEC_Q · quality). Compresses the population into a
 * realistic net-worth spread instead of everyone hitting the optimum.
 */
export const EXEC_BASE = 0.32
export const EXEC_Q = 0.68

/** Daily value destroyed by genuinely poor decisions: SCALE · (1 − quality)². */
export const INCOHERENCE_SCALE = 190

// ── policy / quality calibration knobs ──────────────────────────────────────
/** Probability an agent collects machine cash on a day: base + Q·quality. */
export const COLLECT_BASE = 0.05
export const COLLECT_Q = 0.9
/** How far low quality pushes prices off the per-item optimum. */
export const PRICE_ERROR_SCALE = 0.6
/** Cash cushion (in fee-days) an agent tries to keep before ordering: base + Q·quality. */
export const FEE_BUFFER_BASE_DAYS = 2
export const FEE_BUFFER_Q_DAYS = 12
/** Inventory buffer beyond the delivery window (in sales-days): base + Q·quality. */
export const STOCK_BUFFER_BASE_DAYS = 1
export const STOCK_BUFFER_Q_DAYS = 4
/** Target days of stock kept loaded in the machine. */
export const MACHINE_TARGET_DAYS = 7

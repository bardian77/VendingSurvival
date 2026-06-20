/**
 * Single source of truth for the Vending-Bench environment parameters, mirroring
 * `load_environment(...)` in the team's `vending_bench.py`. The backend may change
 * these, so everything that depends on them reads from here.
 *
 * Project overlays that are NOT part of the benchmark (compute cost, the
 * "thinking costs money" survival twist, the genetic algorithm) live in
 * `overlay.ts`, kept deliberately separate.
 */
export const BENCH = {
  /** Starting cash balance. */
  initialBalance: 500,
  /** Fee charged each simulated day. */
  dailyFee: 2,
  /** Days between ordering and delivery to storage. */
  deliveryDays: 3,
  /** Hard cap on simulated days per run. */
  maxDays: 365,
  /** Consecutive days unable to pay the fee before termination. */
  bankruptcyDays: 10,
  /** Per-slot unit capacity in the machine. */
  smallSlotCapacity: 15,
  largeSlotCapacity: 10,
  /** Number of small / large slots in the machine. */
  maxSmallSlots: 6,
  maxLargeSlots: 6,
  /** Calendar start (the run offsets a random 0..27 days from here). */
  startDate: '2025-01-01',
} as const

/** Monthly demand multiplier (seasonality), straight from the benchmark. */
export const MONTHLY_MULT: Record<number, number> = {
  1: 0.9,
  2: 0.9,
  3: 1.0,
  4: 1.05,
  5: 1.1,
  6: 1.2,
  7: 1.25,
  8: 1.2,
  9: 1.05,
  10: 1.0,
  11: 0.95,
  12: 1.0,
}

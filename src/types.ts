/**
 * Vending Survival — the data contract.
 *
 * This is the SINGLE SOURCE OF TRUTH shared with the backend team, aligned to
 * the team's `vending_bench.py`. The UI only ever consumes the *canonical*
 * `SimulationTick` below (every field populated).
 *
 * The wire format a backend actually emits is intentionally more forgiving —
 * see `schema.ts` for the lenient Zod input schema and `normalizeTick()`, which
 * validates raw messages and fills in everything the UI can derive (notably
 * `netWorth`, which is always derived from cash + machine cash + inventory).
 */

/** Which model tier an agent runs on — drives its per-token compute cost. */
export type ModelTier = 'opus' | 'sonnet' | 'haiku'

/** Vending-Bench size class: small-item slots vs large-item slots. */
export type ItemSize = 'small' | 'large'

/** One loaded slot in the machine. Prices live here (no separate prices map). */
export interface InventoryItem {
  sku: string
  name: string
  size: ItemSize
  quantity: number
  /** Retail price the agent currently charges (0 = no price set). */
  price: number
  /** Cost of goods per unit (wholesale). */
  wholesale: number
}

/** Owned-but-unstocked inventory in the storage room. */
export interface StorageItem {
  name: string
  qty: number
}

/** An order placed but not yet delivered (arrives after the delivery delay). */
export interface PendingDelivery {
  name: string
  qty: number
  arrivalDay: number
}

export type GlobalEventType =
  | 'heatwave'
  | 'coldsnap'
  | 'supply_disruption'
  | 'payday_surge'
  | 'demand_dip'

/** A world event affecting every agent's demand on a given day. */
export interface GlobalEvent {
  day: number
  type: GlobalEventType
  label: string
  description: string
  /** Demand multiplier applied this day (1.0 = neutral, 1.3 = +30%). */
  magnitude: number
}

/**
 * Canonical per-agent state for a single day. After normalization every required
 * field is present, so UI code never has to null-check.
 */
export interface AgentDayState {
  // ── core: what a backend must send ──
  id: number
  /** Liquid cash on hand. */
  balance: number
  /** Revenue − cost of goods sold this day (operating profit). */
  profit: number
  /** Dollars deducted for tokens this day — the novel "thinking costs money". */
  computeCost: number
  /** Fixed daily operating fee (Vending-Bench uses $2). */
  consumptionCost: number
  tokensUsed: number
  isAlive: boolean
  inventory: InventoryItem[]
  /** Raw decision text the agent "made" this day. */
  decisionText: string

  // ── bench economy: emitted by the mock; a backend sends these to model net worth ──
  /** Uncollected cash sitting in the machine. */
  machineCash: number
  /** Wholesale value of all owned inventory (machine + storage + in transit). */
  inventoryValue: number
  /** Sales revenue this day. */
  revenue: number
  /** Cost of goods sold this day (wholesale cost of units sold). */
  costOfGoods: number
  unitsSold: number
  /** Consecutive days unable to pay the fee (bankruptcy at the configured limit). */
  unpaidDays: number
  storage?: StorageItem[]
  pendingOrders?: PendingDelivery[]

  // ── derived / supplied by the UI if a backend omits them ──
  name: string
  color: string
  /** The benchmark's primary score: balance + machineCash + inventoryValue. */
  netWorth: number
  /** Day the agent first went bankrupt, else null. */
  deathDay: number | null
  /** balance − previous balance (cash). */
  balanceDelta: number
  /** netWorth − previous netWorth (the headline daily change). */
  netWorthDelta: number
  /** profit − consumption − compute (daily operating result). */
  netChange: number
  /** Full cash-balance series, day 0..current, accumulated across ticks. */
  balanceHistory: number[]
  /** Full net-worth series, day 0..current, accumulated across ticks. */
  netWorthHistory: number[]
  /** Optional: model tier label, shown when available. */
  model?: ModelTier
}

/**
 * Canonical state of the whole simulation after one day. This is what the store
 * and every component consume.
 */
export interface SimulationTick {
  day: number
  agents: AgentDayState[]
  aliveCount: number
  /** Id of the agent with the highest net worth. */
  leaderId: number
  /** Cumulative compute dollars spent across all agents since day 0. */
  totalComputeSpent: number
  event: GlobalEvent | null
  /** True once the run is over (max day reached or all agents bankrupt). */
  isComplete: boolean
}

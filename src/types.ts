/**
 * Vending Survival — the data contract.
 *
 * This is the SINGLE SOURCE OF TRUTH shared with the backend team. The UI only
 * ever consumes the *canonical* `SimulationTick` below (every field populated).
 *
 * The wire format a backend actually emits is intentionally more forgiving —
 * see `schema.ts` for the lenient Zod input schema and `normalizeTick()`, which
 * validates raw messages and fills in everything the UI can derive. A backend's
 * real obligation per agent per day is just the 9 "core" fields marked below.
 */

/** Which model tier an agent runs on — drives its per-token compute cost. */
export type ModelTier = 'opus' | 'sonnet' | 'haiku'

export type ItemCategory = 'drink' | 'snack' | 'candy'

/** One slot in the machine. Prices live here (no separate prices map). */
export interface InventoryItem {
  sku: string
  name: string
  category: ItemCategory
  quantity: number
  /** Retail price the agent currently charges. */
  price: number
  /** Cost of goods per unit (wholesale). */
  wholesale: number
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
  /** Short headline, e.g. "Heat wave". */
  label: string
  /** One-line description for the ticker. */
  description: string
  /** Demand multiplier applied this day (1.0 = neutral, 1.3 = +30%). */
  magnitude: number
}

/**
 * Canonical per-agent state for a single day. After normalization every field
 * is present, so UI code never has to null-check.
 */
export interface AgentDayState {
  // ── core: what a backend must send ──
  id: number
  balance: number
  /** Revenue − cost of goods sold this day. */
  profit: number
  /** Dollars deducted for tokens this day — the novel mechanic. */
  computeCost: number
  /** Fixed daily location fee (the base benchmark uses $2). */
  consumptionCost: number
  tokensUsed: number
  isAlive: boolean
  inventory: InventoryItem[]
  /** Raw decision text the agent "made" this day. */
  decisionText: string

  // ── derived / supplied by the UI if a backend omits them ──
  name: string
  color: string
  /** Day the agent first went bankrupt, else null. */
  deathDay: number | null
  /** balance − previous balance. */
  balanceDelta: number
  /** profit − consumption − compute (the survival formula's daily term). */
  netChange: number
  /** Full balance series, day 0..current, accumulated across ticks. */
  balanceHistory: number[]
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
  /** Id of the agent with the highest balance. */
  leaderId: number
  /** Cumulative compute dollars spent across all agents since day 0. */
  totalComputeSpent: number
  event: GlobalEvent | null
  /** True once the run is over (max day reached or all agents dead). */
  isComplete: boolean
}

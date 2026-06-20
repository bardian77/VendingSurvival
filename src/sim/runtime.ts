/** Per-agent mutable state during a run (internal to the engine). */
import type { AgentConfig } from './agents'
import type { MachineSlot } from './sales'

export interface PendingOrder {
  name: string
  qty: number
  arrivalDay: number
}

export interface AgentRuntime {
  config: AgentConfig
  /** Liquid cash on hand. */
  balance: number
  /** Uncollected cash sitting inside the machine. */
  machineCash: number
  /** Owned-but-unstocked inventory: product name → units. */
  storage: Map<string, number>
  /** Loaded machine slots: product name → slot. */
  machine: Map<string, MachineSlot>
  pendingOrders: PendingOrder[]
  /** Consecutive days unable to pay the fee. */
  unpaidDays: number
  alive: boolean
  deathDay: number | null
  /** The products this agent chose to sell. */
  assortment: string[]
  /** Current per-item pricing error vs the optimum. */
  priceError: Map<string, number>
  /** Per-item intrinsic misjudgment direction (low quality settles here). */
  misprice: Map<string, number>
  netWorthHistory: number[]
  balanceHistory: number[]
}

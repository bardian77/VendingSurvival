/**
 * The validated boundary. Every incoming tick — from the mock engine OR a real
 * backend — passes through `normalizeTick()`:
 *   1. validate the wire shape with Zod (precise errors on malformed input),
 *   2. fill in everything the UI can derive (names, colors, net worth, deltas,
 *      history, death day, aggregates),
 *   3. return a canonical, fully-populated `SimulationTick`.
 *
 * The Zod schema below also serves as executable documentation of the contract.
 */
import { z } from 'zod'
import type {
  AgentDayState,
  GlobalEvent,
  InventoryItem,
  PendingDelivery,
  SimulationTick,
  StorageItem,
} from './types'
import { colorForAgent } from './lib/palette'

const itemSchema = z.object({
  sku: z.string(),
  name: z.string().optional(),
  size: z.enum(['small', 'large']).catch('small'),
  quantity: z.number().default(0).catch(0),
  price: z.number().default(0).catch(0),
  wholesale: z.number().default(0).catch(0),
})

const storageSchema = z.object({
  name: z.string(),
  qty: z.number().default(0).catch(0),
})

const pendingSchema = z.object({
  name: z.string(),
  qty: z.number().default(0).catch(0),
  arrivalDay: z.number().default(0).catch(0),
})

const agentSchema = z.object({
  // core
  id: z.number().int().positive(),
  balance: z.number(),
  profit: z.number().default(0).catch(0),
  computeCost: z.number().default(0).catch(0),
  consumptionCost: z.number().default(0).catch(0),
  tokensUsed: z.number().default(0).catch(0),
  isAlive: z.boolean().optional(),
  inventory: z.array(itemSchema).default([]).catch([]),
  decisionText: z.string().default('').catch(''),
  // bench economy
  machineCash: z.number().default(0).catch(0),
  inventoryValue: z.number().optional(),
  revenue: z.number().default(0).catch(0),
  costOfGoods: z.number().default(0).catch(0),
  unitsSold: z.number().default(0).catch(0),
  unpaidDays: z.number().default(0).catch(0),
  storage: z.array(storageSchema).optional(),
  pendingOrders: z.array(pendingSchema).optional(),
  // optional / derived
  name: z.string().optional(),
  color: z.string().optional(),
  deathDay: z.number().nullable().optional(),
  balanceDelta: z.number().optional(),
  netWorthDelta: z.number().optional(),
  netChange: z.number().optional(),
  balanceHistory: z.array(z.number()).optional(),
  netWorthHistory: z.array(z.number()).optional(),
  model: z.enum(['opus', 'sonnet', 'haiku']).optional().catch(undefined),
})

const eventSchema = z
  .object({
    day: z.number().default(0).catch(0),
    type: z
      .enum(['heatwave', 'coldsnap', 'supply_disruption', 'payday_surge', 'demand_dip'])
      .catch('demand_dip'),
    label: z.string().default('').catch(''),
    description: z.string().default('').catch(''),
    magnitude: z.number().default(1).catch(1),
  })
  .nullable()
  .optional()

export const tickSchema = z.object({
  day: z.number().int().min(0),
  agents: z.array(agentSchema).min(1),
  event: eventSchema,
  isComplete: z.boolean().optional(),
  aliveCount: z.number().optional(),
  leaderId: z.number().optional(),
  totalComputeSpent: z.number().optional(),
})

/** The raw wire shape a backend may emit (before normalization). */
export type RawSimulationTick = z.input<typeof tickSchema>

type ParsedAgent = z.infer<typeof agentSchema>

function normalizeItem(raw: z.infer<typeof itemSchema>): InventoryItem {
  return {
    sku: raw.sku,
    name: raw.name ?? raw.sku,
    size: raw.size,
    quantity: raw.quantity,
    price: raw.price,
    wholesale: raw.wholesale,
  }
}

/** Append `value` to a derived series, handling re-sends / seeks idempotently. */
function deriveSeries(
  explicit: number[] | undefined,
  prev: number[] | undefined,
  value: number,
  day: number,
  prevDay: number | undefined,
): number[] {
  if (explicit && explicit.length > 0) return explicit
  if (!prev) return [value]
  if (prevDay !== undefined && day <= prevDay) return [...prev.slice(0, -1), value]
  return [...prev, value]
}

function inventoryValueOf(raw: ParsedAgent): number {
  if (raw.inventoryValue != null) return raw.inventoryValue
  return raw.inventory.reduce((sum, item) => sum + item.quantity * item.wholesale, 0)
}

function normalizeAgent(
  raw: ParsedAgent,
  prev: AgentDayState | undefined,
  day: number,
  prevDay: number | undefined,
): AgentDayState {
  const isAlive = raw.isAlive ?? raw.balance > 0
  const inventoryValue = inventoryValueOf(raw)
  const netWorth = raw.balance + raw.machineCash + inventoryValue
  const netChange = raw.netChange ?? raw.profit - raw.consumptionCost - raw.computeCost

  const prevBalance = prev ? prev.balance : raw.balance
  const prevNetWorth = prev ? prev.netWorth : netWorth
  const balanceDelta = raw.balanceDelta ?? raw.balance - prevBalance
  const netWorthDelta = raw.netWorthDelta ?? netWorth - prevNetWorth
  const deathDay = raw.deathDay ?? (isAlive ? null : (prev?.deathDay ?? day))

  const storage: StorageItem[] | undefined = raw.storage?.map((s) => ({ name: s.name, qty: s.qty }))
  const pendingOrders: PendingDelivery[] | undefined = raw.pendingOrders?.map((o) => ({
    name: o.name,
    qty: o.qty,
    arrivalDay: o.arrivalDay,
  }))

  return {
    id: raw.id,
    balance: raw.balance,
    profit: raw.profit,
    computeCost: raw.computeCost,
    consumptionCost: raw.consumptionCost,
    tokensUsed: raw.tokensUsed,
    isAlive,
    inventory: raw.inventory.map(normalizeItem),
    decisionText: raw.decisionText,
    machineCash: raw.machineCash,
    inventoryValue,
    revenue: raw.revenue,
    costOfGoods: raw.costOfGoods,
    unitsSold: raw.unitsSold,
    unpaidDays: raw.unpaidDays,
    storage,
    pendingOrders,
    name: raw.name ?? prev?.name ?? `Agent ${raw.id}`,
    color: raw.color ?? prev?.color ?? colorForAgent(raw.id),
    netWorth,
    deathDay,
    balanceDelta,
    netWorthDelta,
    netChange,
    balanceHistory: deriveSeries(raw.balanceHistory, prev?.balanceHistory, raw.balance, day, prevDay),
    netWorthHistory: deriveSeries(raw.netWorthHistory, prev?.netWorthHistory, netWorth, day, prevDay),
    model: raw.model ?? prev?.model,
  }
}

function leaderOf(agents: AgentDayState[]): number {
  let best = agents[0]
  for (const agent of agents) {
    if (agent.netWorth > best.netWorth) best = agent
  }
  return best.id
}

function accumulateCompute(
  prev: SimulationTick | undefined,
  day: number,
  dayCompute: number,
): number {
  if (!prev) return dayCompute
  if (day > prev.day) return prev.totalComputeSpent + dayCompute
  return prev.totalComputeSpent
}

/**
 * Validate and normalize one raw tick into canonical form.
 * @throws ZodError when the message violates the contract.
 */
export function normalizeTick(raw: unknown, prev?: SimulationTick): SimulationTick {
  const parsed = tickSchema.parse(raw)
  const prevById = new Map((prev?.agents ?? []).map((a) => [a.id, a]))

  const agents = parsed.agents
    .map((a) => normalizeAgent(a, prevById.get(a.id), parsed.day, prev?.day))
    .sort((a, b) => a.id - b.id)

  const aliveCount = parsed.aliveCount ?? agents.filter((a) => a.isAlive).length
  const leaderId = parsed.leaderId ?? leaderOf(agents)
  const dayCompute = agents.reduce((sum, a) => sum + a.computeCost, 0)
  const totalComputeSpent =
    parsed.totalComputeSpent ?? accumulateCompute(prev, parsed.day, dayCompute)

  const event: GlobalEvent | null = parsed.event
    ? { ...parsed.event, day: parsed.event.day || parsed.day }
    : null

  const isComplete = parsed.isComplete ?? aliveCount === 0

  return { day: parsed.day, agents, aliveCount, leaderId, totalComputeSpent, event, isComplete }
}

/** Non-throwing variant for stream boundaries that want to surface errors. */
export type NormalizeResult =
  | { ok: true; tick: SimulationTick }
  | { ok: false; error: string }

export function safeNormalizeTick(raw: unknown, prev?: SimulationTick): NormalizeResult {
  try {
    return { ok: true, tick: normalizeTick(raw, prev) }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Invalid tick payload'
    return { ok: false, error: message }
  }
}

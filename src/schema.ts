/**
 * The validated boundary. Every incoming tick — from the mock engine OR a real
 * backend — passes through `normalizeTick()`:
 *   1. validate the wire shape with Zod (precise errors on malformed input),
 *   2. fill in everything the UI can derive (names, colors, deltas, history,
 *      death day, aggregates),
 *   3. return a canonical, fully-populated `SimulationTick`.
 *
 * The Zod schema below also serves as executable documentation of the contract.
 */
import { z } from 'zod'
import type { AgentDayState, GlobalEvent, InventoryItem, SimulationTick } from './types'
import { colorForAgent } from './lib/palette'

const itemSchema = z.object({
  sku: z.string(),
  name: z.string().optional(),
  category: z.enum(['drink', 'snack', 'candy']).catch('snack'),
  quantity: z.number().default(0).catch(0),
  price: z.number().default(0).catch(0),
  wholesale: z.number().default(0).catch(0),
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
  // optional / derived
  name: z.string().optional(),
  color: z.string().optional(),
  deathDay: z.number().nullable().optional(),
  balanceDelta: z.number().optional(),
  netChange: z.number().optional(),
  balanceHistory: z.array(z.number()).optional(),
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
    category: raw.category,
    quantity: raw.quantity,
    price: raw.price,
    wholesale: raw.wholesale,
  }
}

function deriveHistory(
  explicit: number[] | undefined,
  prev: AgentDayState | undefined,
  balance: number,
  day: number,
  prevDay: number | undefined,
): number[] {
  if (explicit && explicit.length > 0) return explicit
  if (!prev) return [balance]
  // Same-or-earlier day means a re-send / seek: replace the last point.
  if (prevDay !== undefined && day <= prevDay) {
    return [...prev.balanceHistory.slice(0, -1), balance]
  }
  return [...prev.balanceHistory, balance]
}

function normalizeAgent(
  raw: ParsedAgent,
  prev: AgentDayState | undefined,
  day: number,
  prevDay: number | undefined,
): AgentDayState {
  const isAlive = raw.isAlive ?? raw.balance > 0
  const netChange = raw.netChange ?? raw.profit - raw.consumptionCost - raw.computeCost
  const prevBalance = prev ? prev.balance : raw.balance
  const balanceDelta = raw.balanceDelta ?? raw.balance - prevBalance
  const deathDay = raw.deathDay ?? (isAlive ? null : (prev?.deathDay ?? day))

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
    name: raw.name ?? prev?.name ?? `Agent ${raw.id}`,
    color: raw.color ?? prev?.color ?? colorForAgent(raw.id),
    deathDay,
    balanceDelta,
    netChange,
    balanceHistory: deriveHistory(raw.balanceHistory, prev, raw.balance, day, prevDay),
    model: raw.model ?? prev?.model,
  }
}

function leaderOf(agents: AgentDayState[]): number {
  let best = agents[0]
  for (const agent of agents) {
    if (agent.balance > best.balance) best = agent
  }
  return best.id
}

function accumulateCompute(
  prev: SimulationTick | undefined,
  day: number,
  dayCompute: number,
): number {
  if (!prev) return dayCompute
  // Only add a day's compute the first time we advance past it.
  if (day > prev.day) return prev.totalComputeSpent + dayCompute
  return prev.totalComputeSpent
}

/**
 * Validate and normalize one raw tick into canonical form.
 * @param raw  Untrusted wire message (mock or backend).
 * @param prev The previously normalized tick, used to derive deltas, history,
 *             and running totals when the source omits them.
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

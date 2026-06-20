/**
 * The mock backend. `runSimulation(seed)` plays the whole ~300-day run for all
 * 16 agents deterministically and returns canonical `SimulationTick`s. Each tick
 * is an independent immutable snapshot (fresh inventory + history arrays), safe
 * to hand straight to React. MockSource later emits these one day at a time.
 */
import type { AgentDayState, InventoryItem, SimulationTick } from '../types'
import { AGENTS, type AgentConfig } from './agents'
import { CATALOG } from './catalog'
import { createRng, type Rng } from './rng'
import {
  DAILY_FEE,
  DEMAND_SCALE,
  LOW_QUALITY_FLOOR,
  LOW_QUALITY_PENALTY,
  MAX_DAYS,
  MISPRICE_STRENGTH,
  OPERATING_WASTE,
  SLOT_CAPACITY,
  START_BALANCE,
} from './constants'
import { computeCostFor } from './pricing'
import { dayOfWeekFactor, priceResponse, qualityFor, seasonalFactor } from './demand'
import {
  activeEvent,
  eventMultiplier,
  generateEvents,
  toGlobalEvent,
  type ScheduledEvent,
} from './events'
import { makeDecision, type DecisionAction, type DecisionContext } from './decisions'

const DEFAULT_SEED = 17

interface SlotState {
  quantity: number
  /** Multiplicative price error vs the optimum (0 = optimally priced). */
  priceError: number
  /** This slot's intrinsic misjudgment direction — the error a low-quality
   *  agent settles toward and never escapes. */
  misprice: number
  price: number
}

interface AgentRuntime {
  config: AgentConfig
  balance: number
  alive: boolean
  deathDay: number | null
  slots: SlotState[]
  history: number[]
}

const round2 = (n: number): number => Math.round(n * 100) / 100
const clampError = (e: number): number => Math.max(-0.45, Math.min(0.8, e))
const priceLabel = (price: number): string => `$${price.toFixed(2)}`

function initRuntime(config: AgentConfig, rng: Rng): AgentRuntime {
  const slots: SlotState[] = CATALOG.map((item) => {
    const misprice = rng.normal(0, 1)
    const priceError = config.priceBias + misprice * 0.15
    return {
      quantity: rng.int(8, 14),
      priceError,
      misprice,
      price: round2(item.optimalPrice * (1 + clampError(priceError))),
    }
  })
  return {
    config,
    balance: START_BALANCE,
    alive: true,
    deathDay: null,
    slots,
    history: [START_BALANCE],
  }
}

function snapshotInventory(rt: AgentRuntime): InventoryItem[] {
  return CATALOG.map((item, i) => ({
    sku: item.sku,
    name: item.name,
    category: item.category,
    quantity: rt.slots[i].quantity,
    price: rt.slots[i].price,
    wholesale: item.wholesale,
  }))
}

function pickContext(
  rt: AgentRuntime,
  restocked: number,
  event: ScheduledEvent | null,
  rng: Rng,
): DecisionContext {
  const idx = rng.int(0, CATALOG.length - 1)
  const slot = rt.slots[idx]
  let action: DecisionAction
  if (restocked > 0 && rng.bool(0.5)) {
    action = 'restock'
  } else if (slot.priceError > 0.08) {
    action = rt.config.persona === 'aggressive' || rt.config.persona === 'risk' ? 'promote' : 'reprice-up'
  } else if (slot.priceError < -0.08) {
    action = 'reprice-down'
  } else {
    action = rng.bool(0.5) ? 'hold' : rng.bool(0.5) ? 'reprice-up' : 'reprice-down'
  }
  return { item: CATALOG[idx].name, price: priceLabel(slot.price), action, event: event?.label }
}

function buildOpeningState(rt: AgentRuntime): AgentDayState {
  const cfg = rt.config
  return {
    id: cfg.id,
    balance: START_BALANCE,
    profit: 0,
    computeCost: 0,
    consumptionCost: 0,
    tokensUsed: 0,
    isAlive: true,
    inventory: snapshotInventory(rt),
    decisionText: 'Opening day. Machine stocked and online.',
    name: cfg.name,
    color: cfg.color,
    deathDay: null,
    balanceDelta: 0,
    netChange: 0,
    balanceHistory: rt.history.slice(),
    model: cfg.model,
  }
}

function buildDeadState(rt: AgentRuntime): AgentDayState {
  const cfg = rt.config
  return {
    id: cfg.id,
    balance: 0,
    profit: 0,
    computeCost: 0,
    consumptionCost: 0,
    tokensUsed: 0,
    isAlive: false,
    inventory: snapshotInventory(rt),
    decisionText: 'Out of service.',
    name: cfg.name,
    color: cfg.color,
    deathDay: rt.deathDay,
    balanceDelta: 0,
    netChange: 0,
    balanceHistory: rt.history.slice(),
    model: cfg.model,
  }
}

function stepLiveAgent(
  rt: AgentRuntime,
  day: number,
  event: ScheduledEvent | null,
  rng: Rng,
): AgentDayState {
  const cfg = rt.config
  const tokens = Math.max(40, Math.round(rng.normal(cfg.tokensMean, cfg.tokensJitter)))
  const computeCost = round2(computeCostFor(cfg.model, tokens))
  const quality = qualityFor(cfg.skill, tokens)
  const dow = dayOfWeekFactor(day)
  const season = seasonalFactor(day)

  let revenue = 0
  let cogs = 0
  let restocked = 0

  CATALOG.forEach((item, i) => {
    const slot = rt.slots[i]
    // Prices drift toward a quality-gated target: high-quality agents converge
    // to optimal, low-quality agents settle into a persistent mispricing.
    const targetError = cfg.priceBias + slot.misprice * (1 - quality) * MISPRICE_STRENGTH
    slot.priceError +=
      (targetError - slot.priceError) * 0.35 + rng.normal(0, 0.03 + cfg.volatility * 0.14)
    slot.price = round2(item.optimalPrice * (1 + clampError(slot.priceError)))

    const factor =
      DEMAND_SCALE * dow * season * eventMultiplier(event, item.category) * (0.9 + 0.2 * rng.next())
    const response = priceResponse(slot.price, item.optimalPrice)
    const demandUnits = item.basePopularity * factor * response
    const units = Math.max(0, Math.min(Math.round(demandUnits), slot.quantity))

    revenue += units * slot.price
    cogs += units * item.wholesale
    slot.quantity -= units

    // Restock discipline tracks quality — careless agents stock out and lose sales.
    if (slot.quantity < 4 && rng.bool(0.2 + 0.75 * quality)) {
      slot.quantity = SLOT_CAPACITY
      restocked += 1
    }
  })

  const gross = (revenue - cogs) * (1 + rng.normal(0, cfg.volatility * 0.5))
  // Genuinely poor decisions actively destroy value (spoilage, dead stock).
  const incompetencePenalty = LOW_QUALITY_PENALTY * Math.max(0, LOW_QUALITY_FLOOR - quality)
  const profit = round2(gross - OPERATING_WASTE - incompetencePenalty)
  const netChange = round2(profit - DAILY_FEE - computeCost)
  const prevBalance = rt.balance
  rt.balance = prevBalance + netChange

  let isAlive = true
  if (rt.balance <= 0) {
    rt.balance = 0
    rt.alive = false
    rt.deathDay = day
    isAlive = false
  }
  rt.history.push(round2(rt.balance))

  const decisionText = makeDecision(cfg.persona, pickContext(rt, restocked, event, rng), rng)

  return {
    id: cfg.id,
    balance: round2(rt.balance),
    profit,
    computeCost,
    consumptionCost: DAILY_FEE,
    tokensUsed: tokens,
    isAlive,
    inventory: snapshotInventory(rt),
    decisionText,
    name: cfg.name,
    color: cfg.color,
    deathDay: rt.deathDay,
    balanceDelta: round2(rt.balance - prevBalance),
    netChange,
    balanceHistory: rt.history.slice(),
    model: cfg.model,
  }
}

function leaderOf(agents: readonly AgentDayState[]): number {
  let best = agents[0]
  for (const agent of agents) {
    if (agent.balance > best.balance) best = agent
  }
  return best.id
}

export interface SimulationResult {
  seed: number
  ticks: SimulationTick[]
}

/** Run the full deterministic simulation and return every day's tick. */
export function runSimulation(seed: number = DEFAULT_SEED): SimulationResult {
  const rng = createRng(seed)
  const events = generateEvents(rng)
  const runtimes = AGENTS.map((cfg) => initRuntime(cfg, rng))
  const ticks: SimulationTick[] = []
  let totalCompute = 0

  for (let day = 0; day <= MAX_DAYS; day += 1) {
    const event = activeEvent(events, day)
    const agents = runtimes.map((rt) => {
      if (day === 0) return buildOpeningState(rt)
      if (!rt.alive) return buildDeadState(rt)
      return stepLiveAgent(rt, day, event, rng)
    })

    totalCompute += agents.reduce((sum, a) => sum + a.computeCost, 0)
    const aliveCount = agents.filter((a) => a.isAlive).length

    ticks.push({
      day,
      agents,
      aliveCount,
      leaderId: leaderOf(agents),
      totalComputeSpent: round2(totalCompute),
      event: event ? toGlobalEvent(event, day) : null,
      isComplete: day === MAX_DAYS || aliveCount === 0,
    })

    if (aliveCount === 0) break
  }

  return { seed, ticks }
}

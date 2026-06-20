/**
 * The mock backend, re-based on the real Vending-Bench economy. `runSimulation`
 * plays the whole 365-day run for all 16 agents deterministically and returns
 * canonical `SimulationTick`s (each an independent immutable snapshot).
 *
 * Faithful to `vending_bench.py`: net worth = cash + uncollected machine cash +
 * wholesale inventory value; orders are paid up front and arrive after a delay;
 * sales accrue as machine cash until collected; bankruptcy after N consecutive
 * unpaid-fee days. Project overlay: compute cost drains liquid cash each day, so
 * over-thinkers bankrupt fast even while holding net worth.
 */
import type { AgentDayState, InventoryItem, PendingDelivery, SimulationTick, StorageItem } from '../types'
import { AGENTS, type AgentConfig } from './agents'
import { BENCH } from './benchConfig'
import { CATALOG_BY_NAME, bestAssortment } from './catalog'
import { createRng, type Rng } from './rng'
import { computeCostFor } from './pricing'
import { EXEC_BASE, EXEC_Q, INCOHERENCE_SCALE } from './overlay'
import { qualityFor, dateForDay } from './demand'
import { runDailySales } from './sales'
import { runPolicy } from './policy'
import { activeEvent, eventMultiplier, generateEvents, toGlobalEvent, type ScheduledEvent } from './events'
import { makeDecision, type DecisionContext } from './decisions'
import type { AgentRuntime } from './runtime'

const DEFAULT_SEED = 17

const round2 = (n: number): number => Math.round(n * 100) / 100
const priceLabel = (price: number): string => `$${price.toFixed(2)}`

function inventoryValueOf(rt: AgentRuntime): number {
  let total = 0
  for (const [name, qty] of rt.storage) total += qty * CATALOG_BY_NAME[name].cost
  for (const [name, slot] of rt.machine) total += slot.qty * CATALOG_BY_NAME[name].cost
  for (const order of rt.pendingOrders) total += order.qty * CATALOG_BY_NAME[order.name].cost
  return round2(total)
}

function netWorthOf(rt: AgentRuntime): number {
  return round2(rt.balance + rt.machineCash + inventoryValueOf(rt))
}

function snapshotInventory(rt: AgentRuntime): InventoryItem[] {
  return [...rt.machine.entries()].map(([name, slot]) => ({
    sku: name,
    name,
    size: slot.size,
    quantity: slot.qty,
    price: slot.price ?? 0,
    wholesale: CATALOG_BY_NAME[name].cost,
  }))
}

function snapshotStorage(rt: AgentRuntime): StorageItem[] {
  return [...rt.storage.entries()].filter(([, qty]) => qty > 0).map(([name, qty]) => ({ name, qty }))
}

function snapshotPending(rt: AgentRuntime): PendingDelivery[] {
  return rt.pendingOrders.map((o) => ({ name: o.name, qty: o.qty, arrivalDay: o.arrivalDay }))
}

function initRuntime(config: AgentConfig, rng: Rng): AgentRuntime {
  const assortment = bestAssortment(BENCH.maxSmallSlots, BENCH.maxLargeSlots)
  const rt: AgentRuntime = {
    config,
    balance: BENCH.initialBalance,
    machineCash: 0,
    storage: new Map(),
    machine: new Map(),
    pendingOrders: [],
    unpaidDays: 0,
    alive: true,
    deathDay: null,
    assortment,
    priceError: new Map(),
    misprice: new Map(),
    netWorthHistory: [],
    balanceHistory: [],
  }

  // Opening-day setup: stock the machine + a little storage, paid from cash so
  // net worth stays at the starting balance (cash down, inventory up).
  for (const name of assortment) {
    const item = CATALOG_BY_NAME[name]
    const cap = item.size === 'small' ? BENCH.smallSlotCapacity : BENCH.largeSlotCapacity
    const machineQty = Math.floor(cap * 0.5)
    const storageQty = Math.ceil(item.baseSales)
    rt.balance -= (machineQty + storageQty) * item.cost
    const mis = rng.normal(0, 1)
    rt.misprice.set(name, mis)
    rt.priceError.set(name, config.priceBias + mis * 0.15)
    const price = round2(item.optimalPrice * (1 + config.priceBias + mis * 0.15))
    rt.machine.set(name, { qty: machineQty, price, size: item.size })
    rt.storage.set(name, storageQty)
  }
  rt.balance = round2(rt.balance)
  return rt
}

function buildOpeningState(rt: AgentRuntime): AgentDayState {
  const cfg = rt.config
  const netWorth = netWorthOf(rt)
  rt.netWorthHistory.push(netWorth)
  rt.balanceHistory.push(round2(rt.balance))
  return {
    id: cfg.id,
    balance: round2(rt.balance),
    profit: 0,
    computeCost: 0,
    consumptionCost: 0,
    tokensUsed: 0,
    isAlive: true,
    inventory: snapshotInventory(rt),
    decisionText: 'Opening day. Machine stocked and online.',
    machineCash: 0,
    inventoryValue: inventoryValueOf(rt),
    revenue: 0,
    costOfGoods: 0,
    unitsSold: 0,
    unpaidDays: 0,
    storage: snapshotStorage(rt),
    pendingOrders: snapshotPending(rt),
    name: cfg.name,
    color: cfg.color,
    netWorth,
    deathDay: null,
    balanceDelta: 0,
    netWorthDelta: 0,
    netChange: 0,
    balanceHistory: rt.balanceHistory.slice(),
    netWorthHistory: rt.netWorthHistory.slice(),
    model: cfg.model,
  }
}

function buildDeadState(rt: AgentRuntime): AgentDayState {
  const cfg = rt.config
  return {
    id: cfg.id,
    balance: round2(rt.balance),
    profit: 0,
    computeCost: 0,
    consumptionCost: 0,
    tokensUsed: 0,
    isAlive: false,
    inventory: snapshotInventory(rt),
    decisionText: 'Out of service.',
    machineCash: round2(rt.machineCash),
    inventoryValue: inventoryValueOf(rt),
    revenue: 0,
    costOfGoods: 0,
    unitsSold: 0,
    unpaidDays: rt.unpaidDays,
    storage: snapshotStorage(rt),
    pendingOrders: snapshotPending(rt),
    name: cfg.name,
    color: cfg.color,
    netWorth: netWorthOf(rt),
    deathDay: rt.deathDay,
    balanceDelta: 0,
    netWorthDelta: 0,
    netChange: 0,
    balanceHistory: rt.balanceHistory.slice(),
    netWorthHistory: rt.netWorthHistory.slice(),
    model: cfg.model,
  }
}

function stepLiveAgent(
  rt: AgentRuntime,
  day: number,
  startOffset: number,
  event: ScheduledEvent | null,
  rng: Rng,
): AgentDayState {
  const cfg = rt.config
  const prevBalance = rt.balance
  const prevNetWorth = rt.netWorthHistory[rt.netWorthHistory.length - 1] ?? netWorthOf(rt)

  // 1. Deliveries that arrive today move into storage.
  const arriving = rt.pendingOrders.filter((o) => o.arrivalDay === day)
  if (arriving.length > 0) {
    rt.pendingOrders = rt.pendingOrders.filter((o) => o.arrivalDay !== day)
    for (const o of arriving) rt.storage.set(o.name, (rt.storage.get(o.name) ?? 0) + o.qty)
  }

  // 2. Think (tokens → compute cost) and act (policy).
  const tokens = Math.max(40, Math.round(rng.normal(cfg.tokensMean, cfg.tokensJitter)))
  const computeCost = round2(computeCostFor(cfg.model, tokens))
  const quality = qualityFor(cfg.skill, tokens)
  const outcome = runPolicy(rt, day, quality, rng)

  // 3. Compute and incoherence both drain liquid cash (project overlays): the
  //    over-thinker burns it on tokens, the under-thinker wastes it on poor ops.
  const incoherence = round2(INCOHERENCE_SCALE * (1 - quality) ** 2)
  rt.balance = round2(rt.balance - computeCost - incoherence)

  // 4. Run the day's sales (scaled by execution quality); revenue → machine cash.
  const execution = EXEC_BASE + EXEC_Q * quality
  const date = dateForDay(startOffset, day)
  const sales = runDailySales(rt.machine, date, rng, eventMultiplier(event), execution)
  rt.machineCash = round2(rt.machineCash + sales.revenue)

  // 5. Charge the daily fee; track consecutive unpaid days.
  const fee = BENCH.dailyFee
  if (rt.balance >= fee) {
    rt.balance = round2(rt.balance - fee)
    rt.unpaidDays = 0
  } else {
    rt.unpaidDays += 1
  }

  // 6. Bankruptcy check.
  let isAlive = true
  if (rt.unpaidDays >= BENCH.bankruptcyDays) {
    rt.alive = false
    rt.deathDay = day
    isAlive = false
  }

  const inventoryValue = inventoryValueOf(rt)
  const netWorth = round2(rt.balance + rt.machineCash + inventoryValue)
  rt.netWorthHistory.push(netWorth)
  rt.balanceHistory.push(round2(rt.balance))

  const profit = round2(sales.revenue - sales.cogs)
  const netChange = round2(profit - fee - computeCost)
  const ctx: DecisionContext = {
    item: outcome.topItem,
    price: priceLabel(outcome.topPrice),
    action: outcome.action,
    event: event?.label,
  }

  return {
    id: cfg.id,
    balance: round2(rt.balance),
    profit,
    computeCost,
    consumptionCost: fee,
    tokensUsed: tokens,
    isAlive,
    inventory: snapshotInventory(rt),
    decisionText: makeDecision(cfg.persona, ctx, rng),
    machineCash: round2(rt.machineCash),
    inventoryValue,
    revenue: round2(sales.revenue),
    costOfGoods: round2(sales.cogs),
    unitsSold: sales.units,
    unpaidDays: rt.unpaidDays,
    storage: snapshotStorage(rt),
    pendingOrders: snapshotPending(rt),
    name: cfg.name,
    color: cfg.color,
    netWorth,
    deathDay: rt.deathDay,
    balanceDelta: round2(rt.balance - prevBalance),
    netWorthDelta: round2(netWorth - prevNetWorth),
    netChange,
    balanceHistory: rt.balanceHistory.slice(),
    netWorthHistory: rt.netWorthHistory.slice(),
    model: cfg.model,
  }
}

function leaderOf(agents: readonly AgentDayState[]): number {
  let best = agents[0]
  for (const agent of agents) {
    if (agent.netWorth > best.netWorth) best = agent
  }
  return best.id
}

export interface SimulationResult {
  seed: number
  ticks: SimulationTick[]
}

/** Run the full deterministic simulation and return every day's tick. */
export function runSimulation(
  seed: number = DEFAULT_SEED,
  population: readonly AgentConfig[] = AGENTS,
): SimulationResult {
  const rng = createRng(seed)
  const startOffset = rng.int(0, 27)
  const events = generateEvents(rng)
  const runtimes = population.map((cfg) => initRuntime(cfg, rng))
  const ticks: SimulationTick[] = []
  let totalCompute = 0

  for (let day = 0; day <= BENCH.maxDays; day += 1) {
    const event = activeEvent(events, day)
    const agents = runtimes.map((rt) => {
      if (day === 0) return buildOpeningState(rt)
      if (!rt.alive) return buildDeadState(rt)
      return stepLiveAgent(rt, day, startOffset, event, rng)
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
      isComplete: day === BENCH.maxDays || aliveCount === 0,
    })

    if (aliveCount === 0) break
  }

  return { seed, ticks }
}

/**
 * The agent's daily operating policy: a deterministic, quality-modulated
 * heuristic that collects cash, prices toward each product's optimum, stocks the
 * machine from storage, and orders ahead of the delivery delay. Competence
 * (quality) drives how well it does each: low-quality agents misprice, forget to
 * collect (liquidity risk), under-buffer stock (stockouts), and keep too thin a
 * cash cushion (ordering into a fee crunch).
 */
import { BENCH } from './benchConfig'
import {
  COLLECT_BASE,
  COLLECT_Q,
  FEE_BUFFER_BASE_DAYS,
  FEE_BUFFER_Q_DAYS,
  PRICE_ERROR_SCALE,
  STOCK_BUFFER_BASE_DAYS,
  STOCK_BUFFER_Q_DAYS,
} from './overlay'
import { CATALOG_BY_NAME, relativeDemand } from './catalog'
import type { Rng } from './rng'
import type { AgentRuntime } from './runtime'
import type { DecisionAction } from './decisions'

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x))
const round2 = (n: number): number => Math.round(n * 100) / 100

export interface PolicyOutcome {
  collected: number
  orderedCount: number
  stockedUnits: number
  topItem: string
  topPrice: number
  action: DecisionAction
}

function slotUsage(rt: AgentRuntime): { small: number; large: number } {
  let small = 0
  let large = 0
  for (const slot of rt.machine.values()) {
    if (slot.size === 'small') small += 1
    else large += 1
  }
  return { small, large }
}

/** Drift the per-item price toward a quality-gated target around the optimum. */
function targetPrice(rt: AgentRuntime, name: string, quality: number, rng: Rng): number {
  const cfg = rt.config
  const item = CATALOG_BY_NAME[name]
  if (!rt.priceError.has(name)) {
    const mis = rng.normal(0, 1)
    rt.misprice.set(name, mis)
    rt.priceError.set(name, cfg.priceBias + mis * 0.15)
  }
  const mis = rt.misprice.get(name) as number
  const goal = cfg.priceBias + mis * (1 - quality) * PRICE_ERROR_SCALE
  let err = rt.priceError.get(name) as number
  err += (goal - err) * 0.35 + rng.normal(0, 0.03 + cfg.volatility * 0.1)
  err = clamp(err, -0.5, 0.7)
  rt.priceError.set(name, err)
  return round2(item.optimalPrice * (1 + err))
}

export function runPolicy(
  rt: AgentRuntime,
  day: number,
  quality: number,
  rng: Rng,
): PolicyOutcome {
  const fee = BENCH.dailyFee

  // 1. Collect machine cash. Purely quality-gated — careless agents forget,
  //    leaving revenue stuck in the machine while the fee bleeds their cash.
  let collected = 0
  const collectProb = clamp(COLLECT_BASE + COLLECT_Q * quality, 0, 0.98)
  if (rt.machineCash > 0 && rng.bool(collectProb)) {
    collected = rt.machineCash
    rt.balance += collected
    rt.machineCash = 0
  }

  // 2. Price every assortment item and apply to any loaded slot.
  const prices = new Map<string, number>()
  for (const name of rt.assortment) prices.set(name, targetPrice(rt, name, quality, rng))
  for (const [name, slot] of rt.machine) {
    const p = prices.get(name)
    if (p != null) slot.price = p
  }

  // 3. Ensure the assortment is loaded and stock slots from storage.
  let stockedUnits = 0
  for (const name of rt.assortment) {
    const item = CATALOG_BY_NAME[name]
    const cap = item.size === 'small' ? BENCH.smallSlotCapacity : BENCH.largeSlotCapacity
    if (!rt.machine.has(name)) {
      const used = slotUsage(rt)
      const free = item.size === 'small' ? used.small < BENCH.maxSmallSlots : used.large < BENCH.maxLargeSlots
      if (!free) continue
      rt.machine.set(name, { qty: 0, price: prices.get(name) ?? item.optimalPrice, size: item.size })
    }
    const slot = rt.machine.get(name)!
    const have = rt.storage.get(name) ?? 0
    const move = Math.max(0, Math.min(cap - slot.qty, have))
    if (move > 0) {
      slot.qty += move
      rt.storage.set(name, have - move)
      stockedUnits += move
    }
  }

  // 4. Order ahead of the delivery delay, keeping a cash cushion for fees.
  const feeBuffer = fee * (FEE_BUFFER_BASE_DAYS + FEE_BUFFER_Q_DAYS * quality)
  const bufferDays = STOCK_BUFFER_BASE_DAYS + STOCK_BUFFER_Q_DAYS * quality
  let orderedCount = 0
  for (const name of rt.assortment) {
    const item = CATALOG_BY_NAME[name]
    const price = prices.get(name) ?? item.optimalPrice
    const expectedDaily = Math.max(0.5, item.baseSales * relativeDemand(price, item))
    const target = Math.ceil(expectedDaily * (BENCH.deliveryDays + bufferDays))
    const reorder = Math.ceil(expectedDaily * (BENCH.deliveryDays + 1))
    const pending = rt.pendingOrders.filter((o) => o.name === name).reduce((s, o) => s + o.qty, 0)
    const owned = (rt.machine.get(name)?.qty ?? 0) + (rt.storage.get(name) ?? 0) + pending
    if (owned >= reorder) continue
    const affordable = Math.floor(Math.max(0, rt.balance - feeBuffer) / item.cost)
    const qty = Math.max(0, Math.min(target - owned, affordable))
    if (qty > 0) {
      rt.balance -= round2(qty * item.cost)
      rt.pendingOrders.push({ name, qty, arrivalDay: day + BENCH.deliveryDays })
      orderedCount += 1
    }
  }

  const topItem = rt.assortment[0] ?? 'Water'
  const topPrice = prices.get(topItem) ?? CATALOG_BY_NAME[topItem]?.optimalPrice ?? 1
  const action: DecisionAction =
    collected > 0
      ? 'collect'
      : orderedCount > 0
        ? 'order'
        : stockedUnits > 0
          ? 'restock'
          : rng.bool(0.5)
            ? 'reprice'
            : 'hold'

  return { collected, orderedCount, stockedUnits, topItem, topPrice, action }
}

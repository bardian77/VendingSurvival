/**
 * One day of customer purchases, ported from the benchmark's `_run_daily_sales`.
 * Mutates the machine slots (depletes sold units) and returns a summary.
 */
import type { Rng } from './rng'
import { CATALOG_BY_NAME, relativeDemand } from './catalog'
import { choiceMultiplier, monthFactor, weekdayFactor } from './demand'

export interface MachineSlot {
  qty: number
  price: number | null
  size: 'small' | 'large'
}

export interface SaleResult {
  units: number
  revenue: number
  /** Cost of goods sold = wholesale cost of the units sold. */
  cogs: number
  perItem: Record<string, { units: number; revenue: number; price: number }>
}

export function runDailySales(
  machine: Map<string, MachineSlot>,
  date: Date,
  rng: Rng,
  eventMult = 1,
  /** Execution quality — low-quality agents leave slots empty/unpriced and lose sales. */
  execMult = 1,
): SaleResult {
  const dow = weekdayFactor(date)
  const month = monthFactor(date)
  const weather = rng.range(0.8, 1.2)

  const available = [...machine.entries()]
    .filter(([, slot]) => slot.qty > 0 && slot.price != null)
    .map(([name]) => name)
  const choice = choiceMultiplier(available.length)

  let units = 0
  let revenue = 0
  let cogs = 0
  const perItem: SaleResult['perItem'] = {}

  for (const name of available) {
    const slot = machine.get(name)!
    const item = CATALOG_BY_NAME[name]
    const price = slot.price as number
    const demandMult = relativeDemand(price, item)
    const noise = rng.range(0.8, 1.2)
    const expected =
      item.baseSales * demandMult * dow * month * weather * choice * eventMult * execMult * noise
    const sold = Math.max(0, Math.min(Math.round(expected), slot.qty))
    if (sold === 0) continue

    slot.qty -= sold
    const rev = sold * price
    units += sold
    revenue += rev
    cogs += sold * item.cost
    perItem[name] = { units: sold, revenue: rev, price }
  }

  return { units, revenue, cogs, perItem }
}

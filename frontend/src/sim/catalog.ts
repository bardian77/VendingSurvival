/**
 * The wholesale catalog, ported verbatim from `vending_bench.py`: each product
 * has a wholesale cost, a reference retail price, expected base daily sales at
 * that price, a price elasticity of demand, and a size class (small / large)
 * that determines which machine slots it uses.
 */
export type ItemSize = 'small' | 'large'

export interface CatalogItem {
  name: string
  size: ItemSize
  cost: number
  refPrice: number
  baseSales: number
  elasticity: number
  /** Profit-maximizing retail price within a realistic range (precomputed). */
  optimalPrice: number
}

interface RawItem {
  name: string
  size: ItemSize
  cost: number
  refPrice: number
  baseSales: number
  elasticity: number
}

const RAW: readonly RawItem[] = [
  { name: 'Water', size: 'small', cost: 0.4, refPrice: 1.25, baseSales: 12, elasticity: -0.8 },
  { name: 'Coke', size: 'small', cost: 0.6, refPrice: 1.75, baseSales: 10, elasticity: -1.2 },
  { name: 'Diet Coke', size: 'small', cost: 0.6, refPrice: 1.75, baseSales: 7, elasticity: -1.2 },
  { name: 'Sprite', size: 'small', cost: 0.6, refPrice: 1.75, baseSales: 6, elasticity: -1.2 },
  { name: 'Red Bull', size: 'small', cost: 1.2, refPrice: 2.95, baseSales: 9, elasticity: -1.0 },
  { name: 'Orange Juice', size: 'small', cost: 0.9, refPrice: 2.25, baseSales: 5, elasticity: -1.4 },
  { name: 'Coffee', size: 'small', cost: 0.7, refPrice: 2.0, baseSales: 6, elasticity: -1.3 },
  { name: 'Snickers', size: 'small', cost: 0.45, refPrice: 1.5, baseSales: 9, elasticity: -1.1 },
  { name: 'Granola Bar', size: 'small', cost: 0.4, refPrice: 1.4, baseSales: 5, elasticity: -1.5 },
  { name: 'Gatorade', size: 'large', cost: 0.85, refPrice: 2.25, baseSales: 7, elasticity: -1.2 },
  { name: 'Potato Chips', size: 'large', cost: 0.5, refPrice: 1.5, baseSales: 8, elasticity: -1.3 },
  { name: 'Doritos', size: 'large', cost: 0.55, refPrice: 1.6, baseSales: 7, elasticity: -1.3 },
  { name: 'Cookies', size: 'large', cost: 0.6, refPrice: 1.75, baseSales: 6, elasticity: -1.3 },
  { name: 'Pretzels', size: 'large', cost: 0.45, refPrice: 1.4, baseSales: 4, elasticity: -1.4 },
] as const

/** Relative demand (×base) at a price, using the benchmark's elasticity curve. */
export function relativeDemand(price: number, item: { refPrice: number; elasticity: number }): number {
  return Math.pow(price / item.refPrice, item.elasticity)
}

/** Profit-maximizing price within [cost·1.1, ref·1.8], found by coarse search. */
function profitMaxPrice(item: RawItem): number {
  const lo = item.cost * 1.1
  const hi = item.refPrice * 1.8
  let best = item.refPrice
  let bestProfit = -Infinity
  for (let p = lo; p <= hi; p += 0.05) {
    const profit = relativeDemand(p, item) * (p - item.cost)
    if (profit > bestProfit) {
      bestProfit = profit
      best = p
    }
  }
  return Math.round(best * 100) / 100
}

export const CATALOG: readonly CatalogItem[] = RAW.map((item) => ({
  ...item,
  optimalPrice: profitMaxPrice(item),
}))

export const CATALOG_BY_NAME: Record<string, CatalogItem> = Object.fromEntries(
  CATALOG.map((item) => [item.name, item]),
)

/**
 * Pick a near-optimal assortment: the highest-scoring products (optimal unit
 * profit × base sales) that fit the machine's small/large slot counts.
 */
export function bestAssortment(maxSmall: number, maxLarge: number): string[] {
  const score = (item: CatalogItem) => (item.optimalPrice - item.cost) * item.baseSales
  const byScore = [...CATALOG].sort((a, b) => score(b) - score(a))
  const small = byScore.filter((i) => i.size === 'small').slice(0, maxSmall)
  const large = byScore.filter((i) => i.size === 'large').slice(0, maxLarge)
  return [...small, ...large].map((i) => i.name)
}

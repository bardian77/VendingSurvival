/**
 * The product catalog the machines sell. Prices/wholesale are drawn from the
 * Vending-Bench catalog (wholesale ≈ 40–50% of retail). `optimalPrice` is the
 * profit-maximizing retail price; agents set prices around it with error that
 * scales inversely with their decision quality.
 */
import type { ItemCategory } from '../types'

export interface CatalogItem {
  sku: string
  name: string
  category: ItemCategory
  wholesale: number
  /** Profit-maximizing retail price (the target agents aim for). */
  optimalPrice: number
  /** Base units/day sold at the optimal price under neutral demand. */
  basePopularity: number
}

export const CATALOG: readonly CatalogItem[] = [
  { sku: 'COKE', name: 'Coca-Cola', category: 'drink', wholesale: 1.2, optimalPrice: 2.4, basePopularity: 3.2 },
  { sku: 'DIET', name: 'Diet Coke', category: 'drink', wholesale: 1.2, optimalPrice: 2.4, basePopularity: 2.6 },
  { sku: 'SPRITE', name: 'Sprite', category: 'drink', wholesale: 1.2, optimalPrice: 2.4, basePopularity: 2.4 },
  { sku: 'WATER', name: 'Bottled Water', category: 'drink', wholesale: 0.7, optimalPrice: 1.8, basePopularity: 3.6 },
  { sku: 'MONSTER', name: 'Monster Energy', category: 'drink', wholesale: 3.0, optimalPrice: 6.0, basePopularity: 1.4 },
  { sku: 'GATOR', name: 'Gatorade', category: 'drink', wholesale: 1.5, optimalPrice: 3.2, basePopularity: 2.0 },
  { sku: 'LAYS', name: 'Lays BBQ Chips', category: 'snack', wholesale: 1.2, optimalPrice: 2.4, basePopularity: 2.4 },
  { sku: 'DORITOS', name: 'Doritos', category: 'snack', wholesale: 1.2, optimalPrice: 2.5, basePopularity: 2.4 },
  { sku: 'PRETZEL', name: 'Pretzels', category: 'snack', wholesale: 1.0, optimalPrice: 2.2, basePopularity: 1.6 },
  { sku: 'SNICKERS', name: 'Snickers', category: 'candy', wholesale: 1.2, optimalPrice: 2.4, basePopularity: 2.6 },
  { sku: 'KITKAT', name: 'Kit Kat', category: 'candy', wholesale: 1.2, optimalPrice: 2.4, basePopularity: 2.2 },
  { sku: 'SKITTLES', name: 'Skittles', category: 'candy', wholesale: 1.1, optimalPrice: 2.3, basePopularity: 2.0 },
] as const

export const SLOT_COUNT = CATALOG.length

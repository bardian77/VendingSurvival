import { describe, expect, test } from 'vitest'
import { causeOfDeath } from './causeOfDeath'
import type { AgentDayState } from '../types'

function deadAgent(overrides: Partial<AgentDayState>): AgentDayState {
  return {
    id: 1,
    balance: -200,
    profit: 0,
    computeCost: 0,
    consumptionCost: 0,
    tokensUsed: 0,
    isAlive: false,
    inventory: [],
    decisionText: 'Out of service.',
    machineCash: 0,
    inventoryValue: 0,
    revenue: 0,
    costOfGoods: 0,
    unitsSold: 0,
    unpaidDays: 10,
    name: 'X',
    color: '#000',
    netWorth: -200,
    deathDay: 12,
    balanceDelta: 0,
    netWorthDelta: 0,
    netChange: 0,
    balanceHistory: [],
    netWorthHistory: [],
    ...overrides,
  }
}

describe('causeOfDeath', () => {
  test('an opus agent is compute-starved', () => {
    expect(causeOfDeath(deadAgent({ model: 'opus' })).key).toBe('compute')
  })

  test('uncollected machine cash with low balance is a liquidity crunch', () => {
    expect(causeOfDeath(deadAgent({ model: 'haiku', machineCash: 300, balance: 1 })).key).toBe('liquidity')
  })

  test('otherwise it is incoherent operations', () => {
    expect(causeOfDeath(deadAgent({ model: 'haiku', machineCash: 0, balance: -50 })).key).toBe('incoherence')
  })
})

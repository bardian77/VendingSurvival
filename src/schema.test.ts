import { describe, expect, test } from 'vitest'
import { normalizeTick, safeNormalizeTick } from './schema'
import { colorForAgent } from './lib/palette'

/** A minimal backend payload: only the 9 core per-agent fields. */
function coreAgent(id: number, balance: number) {
  return {
    id,
    balance,
    profit: 5,
    computeCost: 0.5,
    consumptionCost: 2,
    tokensUsed: 1200,
    isAlive: balance > 0,
    inventory: [],
    decisionText: 'held prices',
  }
}

describe('normalizeTick — minimal backend payload', () => {
  test('round-trips the 9 core fields into a fully-populated tick', () => {
    const tick = normalizeTick({ day: 0, agents: [coreAgent(1, 500), coreAgent(2, 480)] })

    expect(tick.agents).toHaveLength(2)
    const agent = tick.agents[0]
    expect(agent.name).toBe('Agent 1')
    expect(agent.color).toBe(colorForAgent(1))
    expect(agent.deathDay).toBeNull()
    expect(agent.balanceDelta).toBe(0)
    expect(agent.netChange).toBeCloseTo(5 - 2 - 0.5)
    expect(agent.balanceHistory).toEqual([500])

    expect(tick.aliveCount).toBe(2)
    expect(tick.leaderId).toBe(1)
    expect(tick.totalComputeSpent).toBeCloseTo(1.0)
    expect(tick.isComplete).toBe(false)
  })

  test('sorts agents by id for stable rendering', () => {
    const tick = normalizeTick({ day: 0, agents: [coreAgent(3, 10), coreAgent(1, 10), coreAgent(2, 10)] })
    expect(tick.agents.map((a) => a.id)).toEqual([1, 2, 3])
  })
})

describe('normalizeTick — derivation across incremental ticks', () => {
  test('accumulates history, delta and running compute', () => {
    const t0 = normalizeTick({ day: 0, agents: [coreAgent(1, 500)] })
    const t1 = normalizeTick({ day: 1, agents: [coreAgent(1, 503)] }, t0)

    expect(t1.agents[0].balanceHistory).toEqual([500, 503])
    expect(t1.agents[0].balanceDelta).toBe(3)
    expect(t1.totalComputeSpent).toBeCloseTo(1.0)
  })

  test('re-sending the same day replaces rather than appends history', () => {
    const t0 = normalizeTick({ day: 0, agents: [coreAgent(1, 500)] })
    const t1 = normalizeTick({ day: 1, agents: [coreAgent(1, 503)] }, t0)
    const t1again = normalizeTick({ day: 1, agents: [coreAgent(1, 505)] }, t1)

    expect(t1again.agents[0].balanceHistory).toEqual([500, 505])
    expect(t1again.totalComputeSpent).toBeCloseTo(1.0)
  })

  test('stamps death day on first bankruptcy and freezes it', () => {
    const t0 = normalizeTick({ day: 5, agents: [coreAgent(1, 10)] })
    const t1 = normalizeTick(
      { day: 6, agents: [{ id: 1, balance: 0, isAlive: false }] },
      t0,
    )
    const t2 = normalizeTick(
      { day: 7, agents: [{ id: 1, balance: 0, isAlive: false }] },
      t1,
    )

    expect(t1.agents[0].deathDay).toBe(6)
    expect(t2.agents[0].deathDay).toBe(6)
  })
})

describe('normalizeTick — defaults and fallbacks', () => {
  test('defaults isAlive from balance when omitted', () => {
    const tick = normalizeTick({ day: 0, agents: [{ id: 1, balance: 0 }, { id: 2, balance: 5 }] })
    expect(tick.agents[0].isAlive).toBe(false)
    expect(tick.agents[1].isAlive).toBe(true)
  })

  test('respects explicit name and color', () => {
    const tick = normalizeTick({
      day: 0,
      agents: [{ id: 1, balance: 5, name: 'Lean Operator', color: '#123456' }],
    })
    expect(tick.agents[0].name).toBe('Lean Operator')
    expect(tick.agents[0].color).toBe('#123456')
  })

  test('derives leader as the highest balance', () => {
    const tick = normalizeTick({
      day: 0,
      agents: [coreAgent(1, 100), coreAgent(2, 900), coreAgent(3, 300)],
    })
    expect(tick.leaderId).toBe(2)
  })

  test('tolerates an unknown inventory size and derives net worth', () => {
    const tick = normalizeTick({
      day: 0,
      agents: [
        {
          id: 1,
          balance: 5,
          machineCash: 3,
          inventory: [{ sku: 'COKE', quantity: 4, price: 2.4, wholesale: 1.2, size: 'mystery' }],
        },
      ],
    })
    expect(tick.agents[0].inventory[0].size).toBe('small')
    expect(tick.agents[0].inventory[0].name).toBe('COKE')
    // net worth = balance(5) + machineCash(3) + inventoryValue(4 × 1.2 = 4.8)
    expect(tick.agents[0].netWorth).toBeCloseTo(12.8, 2)
  })
})

describe('normalizeTick — validation', () => {
  test('rejects a tick with no agents', () => {
    expect(() => normalizeTick({ day: 0, agents: [] })).toThrow()
  })

  test('rejects an agent missing a balance', () => {
    expect(() => normalizeTick({ day: 0, agents: [{ id: 1 }] })).toThrow()
  })

  test('safeNormalizeTick surfaces an error instead of throwing', () => {
    const result = safeNormalizeTick({ day: 0, agents: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(typeof result.error).toBe('string')
  })
})

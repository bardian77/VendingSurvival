import { describe, expect, test } from 'vitest'
import { runSimulation } from './engine'
import { AGENT_COUNT } from './agents'
import { BENCH } from './benchConfig'

describe('runSimulation — invariants', () => {
  test('is deterministic for a given seed', () => {
    const a = runSimulation(7)
    const b = runSimulation(7)
    expect(a.ticks.length).toBe(b.ticks.length)
    expect(a.ticks.at(-1)!.agents.map((x) => x.netWorth)).toEqual(b.ticks.at(-1)!.agents.map((x) => x.netWorth))
  })

  test('opens with every agent alive at the starting net worth', () => {
    const day0 = runSimulation(7).ticks[0]
    expect(day0.agents).toHaveLength(AGENT_COUNT)
    expect(day0.agents.every((a) => a.isAlive)).toBe(true)
    for (const a of day0.agents) expect(Math.abs(a.netWorth - BENCH.initialBalance)).toBeLessThan(1)
  })

  test('net worth equals cash + machine cash + inventory value', () => {
    const { ticks } = runSimulation(7)
    for (const day of [1, 30, 120, ticks.length - 1]) {
      for (const a of ticks[day].agents) {
        expect(a.netWorth).toBeCloseTo(a.balance + a.machineCash + a.inventoryValue, 1)
      }
    }
  })

  test('dead agents stay frozen and keep their death day', () => {
    const last = runSimulation(7).ticks.at(-1)!
    for (const a of last.agents) {
      if (a.deathDay === null) continue
      expect(a.isAlive).toBe(false)
      expect(a.unpaidDays).toBeGreaterThanOrEqual(BENCH.bankruptcyDays)
    }
  })

  test('the leader holds the highest net worth', () => {
    const last = runSimulation(7).ticks.at(-1)!
    const max = Math.max(...last.agents.map((a) => a.netWorth))
    expect(last.agents.find((a) => a.id === last.leaderId)!.netWorth).toBe(max)
  })

  test('orders flow through the 3-day delivery pipeline', () => {
    const { ticks } = runSimulation(7)
    const early = ticks[6]
    const hasInTransit = early.agents.some((a) =>
      (a.pendingOrders ?? []).some((o) => o.arrivalDay > early.day),
    )
    expect(hasInTransit).toBe(true)
    const survivor = ticks.at(-1)!.agents.find((a) => a.isAlive)!
    expect(survivor.inventoryValue).toBeGreaterThan(0)
  })
})

describe('default seed narrative — both failure modes appear', () => {
  const last = runSimulation().ticks.at(-1)!
  const byId = (id: number) => last.agents.find((a) => a.id === id)!

  test('the Opus over-thinkers bankrupt early on compute', () => {
    // Over-Thinker (3), Verbose Analyst (7), Memory Heavy (10)
    for (const id of [3, 7, 10]) {
      expect(byId(id).isAlive).toBe(false)
      expect(byId(id).deathDay!).toBeLessThan(40)
    }
  })

  test('the low-skill under-thinkers bankrupt on incoherence', () => {
    // Zero-Shot (4), Gut Instinct (8)
    for (const id of [4, 8]) expect(byId(id).isAlive).toBe(false)
  })

  test('a capable, moderate-thinking agent leads and survives', () => {
    const leader = byId(last.leaderId)
    expect(leader.isAlive).toBe(true)
    expect(leader.netWorth).toBeGreaterThan(25000)
  })

  test('the survivors hold believable net worth', () => {
    expect(last.aliveCount).toBe(10)
    for (const agent of last.agents) {
      if (!agent.isAlive) continue
      expect(agent.netWorth).toBeGreaterThan(0)
      expect(agent.netWorth).toBeLessThan(60000)
    }
  })
})

import { describe, expect, test } from 'vitest'
import { runSimulation } from './engine'
import { AGENT_COUNT } from './agents'
import { START_BALANCE } from './constants'

describe('runSimulation — invariants', () => {
  test('is deterministic for a given seed', () => {
    const a = runSimulation(7)
    const b = runSimulation(7)
    expect(a.ticks.length).toBe(b.ticks.length)
    const lastA = a.ticks[a.ticks.length - 1]
    const lastB = b.ticks[b.ticks.length - 1]
    expect(lastA.agents.map((x) => x.balance)).toEqual(lastB.agents.map((x) => x.balance))
  })

  test('opens with every agent alive at the starting balance', () => {
    const { ticks } = runSimulation(7)
    const day0 = ticks[0]
    expect(day0.day).toBe(0)
    expect(day0.agents).toHaveLength(AGENT_COUNT)
    expect(day0.agents.every((a) => a.isAlive)).toBe(true)
    expect(day0.agents.every((a) => a.balance === START_BALANCE)).toBe(true)
  })

  test('balance obeys the survival formula each day', () => {
    const { ticks } = runSimulation(7)
    for (let d = 1; d < ticks.length; d += 1) {
      const agent = ticks[d].agents.find((a) => a.id === 11)!
      const prev = ticks[d - 1].agents.find((a) => a.id === 11)!
      if (!prev.isAlive) continue
      // netChange = profit − consumption − compute
      expect(agent.netChange).toBeCloseTo(
        agent.profit - agent.consumptionCost - agent.computeCost,
        4,
      )
    }
  })

  test('dead agents stay dead and frozen at zero', () => {
    const { ticks } = runSimulation(7)
    for (const agent of ticks[ticks.length - 1].agents) {
      if (agent.deathDay === null) continue
      expect(agent.isAlive).toBe(false)
      expect(agent.balance).toBe(0)
    }
  })

  test('the leader holds the highest balance', () => {
    const last = runSimulation(7).ticks.at(-1)!
    const maxBalance = Math.max(...last.agents.map((a) => a.balance))
    const leader = last.agents.find((a) => a.id === last.leaderId)!
    expect(leader.balance).toBe(maxBalance)
  })

  test('runs to the horizon and produces a survival spread', () => {
    const last = runSimulation(7).ticks.at(-1)!
    expect(last.isComplete).toBe(true)
    expect(last.aliveCount).toBeGreaterThan(0)
    expect(last.aliveCount).toBeLessThan(AGENT_COUNT)
  })
})

describe('default seed narrative — both failure modes appear', () => {
  const last = runSimulation().ticks.at(-1)!
  const byId = (id: number) => last.agents.find((a) => a.id === id)!

  test('over-thinkers (Opus) bankrupt early on compute', () => {
    for (const id of [3, 7, 10]) {
      // Over-Thinker, Verbose Analyst, Memory Heavy
      expect(byId(id).isAlive).toBe(false)
      expect(byId(id).deathDay!).toBeLessThan(120)
    }
  })

  test('a no-thinking agent bankrupts later on bad decisions', () => {
    const gut = byId(8) // Gut Instinct
    expect(gut.isAlive).toBe(false)
    expect(gut.deathDay!).toBeGreaterThan(150)
  })

  test('the lean, cheap agent reaches the sweet spot and leads', () => {
    expect(last.leaderId).toBe(1) // Lean Operator
    expect(byId(1).isAlive).toBe(true)
    expect(byId(1).balance).toBeGreaterThan(2000)
  })

  test('the majority survive with believable balances', () => {
    expect(last.aliveCount).toBe(12)
    for (const agent of last.agents) {
      expect(agent.balance).toBeGreaterThanOrEqual(0)
      expect(agent.balance).toBeLessThan(5000)
    }
  })
})

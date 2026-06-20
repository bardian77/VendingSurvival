import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { MockSource } from './MockSource'
import type { ConnectionStatus } from './DataSource'
import type { SimulationTick } from '../types'

const DAY_MS = 650

function collector() {
  const ticks: SimulationTick[] = []
  const statuses: ConnectionStatus[] = []
  return {
    ticks,
    statuses,
    callbacks: {
      onTick: (t: SimulationTick) => ticks.push(t),
      onStatus: (s: ConnectionStatus) => statuses.push(s),
    },
  }
}

describe('MockSource', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('emits the opening day immediately on start', () => {
    const c = collector()
    const source = new MockSource(c.callbacks, { seed: 17 })
    source.start()
    expect(c.ticks).toHaveLength(1)
    expect(c.ticks[0].day).toBe(0)
    expect(c.statuses[0]).toBe('mock')
    source.dispose()
  })

  test('advances one day per timer interval', () => {
    const c = collector()
    const source = new MockSource(c.callbacks, { seed: 17 })
    source.start()
    vi.advanceTimersByTime(DAY_MS * 3 + 10)
    expect(c.ticks.map((t) => t.day)).toEqual([0, 1, 2, 3])
    source.dispose()
  })

  test('pause halts emission; play resumes', () => {
    const c = collector()
    const source = new MockSource(c.callbacks, { seed: 17 })
    source.start()
    source.pause()
    vi.advanceTimersByTime(DAY_MS * 5)
    expect(c.ticks).toHaveLength(1)
    source.play()
    vi.advanceTimersByTime(DAY_MS + 5)
    expect(c.ticks).toHaveLength(2)
    source.dispose()
  })

  test('higher speed emits faster', () => {
    const c = collector()
    const source = new MockSource(c.callbacks, { seed: 17 })
    source.start()
    source.setSpeed(4)
    vi.advanceTimersByTime(DAY_MS) // 4 days worth at 4x
    expect(c.ticks.length).toBeGreaterThanOrEqual(5)
    source.dispose()
  })

  test('seek fast-forwards synchronously to a day', () => {
    const c = collector()
    const source = new MockSource(c.callbacks, { seed: 17 })
    source.start()
    source.pause()
    source.seek(10)
    expect(c.ticks.at(-1)!.day).toBe(10)
    source.dispose()
  })

  test('reports complete when the run ends', () => {
    const c = collector()
    const source = new MockSource(c.callbacks, { seed: 17 })
    source.start()
    source.seek(10_000) // past the horizon
    expect(c.statuses).toContain('complete')
    source.dispose()
  })
})

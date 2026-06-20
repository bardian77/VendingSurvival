/**
 * In-browser mock backend. Precomputes the full deterministic run, then emits
 * ticks one day at a time on a timer — exactly as a live backend would push
 * days. The store never assumes the future is known, so swapping in a real
 * StreamSource is behaviorally identical.
 */
import type { DataSource, DataSourceCallbacks } from './DataSource'
import { runSimulation } from '../sim/engine'
import type { SimulationTick } from '../types'

const BASE_DAY_MS = 650
const MIN_SPEED = 0.25
const MAX_SPEED = 16

export interface MockSourceOptions {
  seed?: number
}

export class MockSource implements DataSource {
  private readonly callbacks: DataSourceCallbacks
  private ticks: SimulationTick[]
  private cursor = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private playing = false
  private speed = 1
  private seed?: number

  constructor(callbacks: DataSourceCallbacks, options: MockSourceOptions = {}) {
    this.callbacks = callbacks
    this.seed = options.seed
    this.ticks = runSimulation(this.seed).ticks
  }

  start(): void {
    this.callbacks.onStatus('mock', `Simulating ${this.ticks.length - 1} days in-browser`)
    this.emitNext() // reveal opening day immediately
    this.play()
  }

  play(): void {
    if (this.cursor >= this.ticks.length) return
    this.playing = true
    this.schedule()
  }

  pause(): void {
    this.playing = false
    this.clearTimer()
  }

  setSpeed(multiplier: number): void {
    this.speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, multiplier))
    if (this.playing) this.schedule()
  }

  /** Fast-forward: synchronously emit every tick up to and including `day`. */
  seek(day: number): void {
    while (this.cursor < this.ticks.length && this.ticks[this.cursor].day <= day) {
      this.emitNext()
    }
  }

  reset(): void {
    this.clearTimer()
    this.cursor = 0
    this.playing = false
    this.ticks = runSimulation(this.seed).ticks
    this.start()
  }

  dispose(): void {
    this.clearTimer()
    this.playing = false
  }

  private emitNext(): void {
    if (this.cursor >= this.ticks.length) return
    const tick = this.ticks[this.cursor]
    this.cursor += 1
    this.callbacks.onTick(tick)
    if (this.cursor >= this.ticks.length || tick.isComplete) {
      this.playing = false
      this.clearTimer()
      this.callbacks.onStatus('complete', `Run finished on day ${tick.day}`)
    }
  }

  private schedule(): void {
    this.clearTimer()
    if (!this.playing || this.cursor >= this.ticks.length) return
    this.timer = setTimeout(() => {
      this.emitNext()
      this.schedule()
    }, BASE_DAY_MS / this.speed)
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}

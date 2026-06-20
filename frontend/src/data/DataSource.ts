/**
 * The single swap point between the UI and its data. Today a MockSource feeds
 * the dashboard; tomorrow a StreamSource backed by the real Python/Vending-Bench
 * backend feeds the exact same interface. Components never know the difference.
 */
import type { SimulationTick } from '../types'

export type ConnectionStatus =
  | 'idle'
  | 'mock'
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'error'
  | 'complete'

export interface DataSourceCallbacks {
  /** Called with each normalized tick as it arrives. */
  onTick: (tick: SimulationTick) => void
  /** Called when the connection status changes. */
  onStatus: (status: ConnectionStatus, detail?: string) => void
}

export interface DataSource {
  /** Begin producing ticks (mock: simulate + emit; stream: connect). */
  start(): void
  /** Resume emission (no-op for a server-driven stream). */
  play(): void
  /** Pause emission (no-op for a server-driven stream). */
  pause(): void
  /** Set playback speed multiplier (mock only). */
  setSpeed(multiplier: number): void
  /** Ensure ticks up to `day` have been emitted (mock fast-forward). */
  seek?(day: number): void
  /** Restart from day 0. */
  reset(): void
  /** Tear down timers / sockets. */
  dispose(): void
}

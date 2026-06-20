/**
 * WebSocket source for the real backend. Teammates emit `SimulationTick` JSON
 * (see docs/CONTRACT.md) and this validates every message through the same
 * `normalizeTick` boundary the mock uses, then forwards canonical ticks to the
 * store. Auto-reconnects with backoff. SSE or polling backends can subclass /
 * swap `connect()` — the rest of the app is unchanged.
 */
import type { DataSource, DataSourceCallbacks } from './DataSource'
import { safeNormalizeTick } from '../schema'
import type { SimulationTick } from '../types'

const MAX_BACKOFF_MS = 8000

export class StreamSource implements DataSource {
  private readonly callbacks: DataSourceCallbacks
  private readonly url: string
  private socket: WebSocket | null = null
  private previous: SimulationTick | undefined
  private retries = 0
  private disposed = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(callbacks: DataSourceCallbacks, url: string) {
    this.callbacks = callbacks
    this.url = url
  }

  start(): void {
    this.connect()
  }

  // A server-driven stream owns the clock — these are intentional no-ops.
  play(): void {}
  pause(): void {}
  setSpeed(): void {}

  reset(): void {
    this.previous = undefined
  }

  dispose(): void {
    this.disposed = true
    this.clearReconnect()
    this.socket?.close()
    this.socket = null
  }

  private connect(): void {
    this.callbacks.onStatus(this.retries > 0 ? 'reconnecting' : 'connecting', this.url)
    try {
      this.socket = new WebSocket(this.url)
    } catch (error: unknown) {
      this.handleDisconnect(error instanceof Error ? error.message : 'Connection failed')
      return
    }

    this.socket.onopen = () => {
      this.retries = 0
      this.callbacks.onStatus('live', this.url)
    }
    this.socket.onmessage = (event: MessageEvent) => this.ingestMessage(event.data)
    this.socket.onerror = () => {
      /* onclose fires next and handles reconnect */
    }
    this.socket.onclose = () => {
      if (!this.disposed) this.handleDisconnect('Connection closed')
    }
  }

  private ingestMessage(data: unknown): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(typeof data === 'string' ? data : String(data))
    } catch {
      this.callbacks.onStatus('error', 'Received malformed JSON')
      return
    }

    const result = safeNormalizeTick(parsed, this.previous)
    if (!result.ok) {
      this.callbacks.onStatus('error', result.error)
      return
    }

    this.previous = result.tick
    this.callbacks.onTick(result.tick)
    if (result.tick.isComplete) {
      this.callbacks.onStatus('complete', `Run finished on day ${result.tick.day}`)
    }
  }

  private handleDisconnect(detail: string): void {
    if (this.disposed) return
    this.retries += 1
    const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.retries)
    this.callbacks.onStatus('reconnecting', `${detail}, retrying in ${Math.round(delay / 1000)}s`)
    this.clearReconnect()
    this.reconnectTimer = setTimeout(() => {
      if (!this.disposed) this.connect()
    }, delay)
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}

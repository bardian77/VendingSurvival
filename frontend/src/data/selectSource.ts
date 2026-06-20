/**
 * Runtime source selection — flip between the in-browser mock and a real
 * backend with ZERO code changes:
 *   ?source=mock            (default)
 *   ?source=ws&ws=ws://...  or set VITE_WS_URL in the environment
 */
import type { DataSource, DataSourceCallbacks } from './DataSource'
import { MockSource } from './MockSource'
import { StreamSource } from './StreamSource'

export type SourceKind = 'mock' | 'ws'

export interface SourceSelection {
  kind: SourceKind
  wsUrl?: string
}

export function selectSource(): SourceSelection {
  if (typeof window === 'undefined') return { kind: 'mock' }
  const params = new URLSearchParams(window.location.search)
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined
  const wsUrl = params.get('ws') ?? envUrl ?? undefined
  if (params.get('source') === 'ws' && wsUrl) return { kind: 'ws', wsUrl }
  return { kind: 'mock' }
}

export interface CreateSourceOptions {
  seed?: number
}

export function createSource(
  callbacks: DataSourceCallbacks,
  options: CreateSourceOptions = {},
): { source: DataSource; selection: SourceSelection } {
  const selection = selectSource()
  const source =
    selection.kind === 'ws' && selection.wsUrl
      ? new StreamSource(callbacks, selection.wsUrl)
      : new MockSource(callbacks, { seed: options.seed })
  return { source, selection }
}

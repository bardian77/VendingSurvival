/**
 * Wires the active DataSource into the store. Handles StrictMode double-mounts
 * by disposing the source on cleanup, so timers/sockets never leak or double up.
 */
import { useEffect } from 'react'
import { useSimStore } from '../store/useSimStore'
import { createSource, type SourceSelection } from '../data/selectSource'

export function useDataSource(seed?: number): void {
  useEffect(() => {
    const { ingest, setStatus, registerSource } = useSimStore.getState()
    const { source }: { source: ReturnType<typeof createSource>['source']; selection: SourceSelection } =
      createSource({ onTick: ingest, onStatus: setStatus }, { seed })

    registerSource(source)
    useSimStore.setState({ isPlaying: true })
    source.start()

    return () => {
      source.dispose()
      useSimStore.getState().registerSource(null)
    }
  }, [seed])
}

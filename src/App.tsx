import { useDataSource } from './hooks/useDataSource'
import { TopBar } from './components/TopBar'
import { PlaybackControls } from './components/PlaybackControls'
import { Timeline } from './components/Timeline'
import { StatBento } from './components/StatBento'
import { EventTicker } from './components/EventTicker'
import { RaceChart } from './components/RaceChart'
import { AgentGrid } from './components/AgentGrid'
import { Leaderboard } from './components/Leaderboard'
import { Graveyard } from './components/Graveyard'
import { EvolutionPanel } from './components/EvolutionPanel'
import { AgentDetail } from './components/AgentDetail'

export default function App() {
  useDataSource()

  return (
    <div className="mx-auto min-h-svh max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <TopBar />

      <div className="mt-6 flex flex-col gap-3">
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-3 sm:flex-row sm:items-center sm:gap-5">
          <PlaybackControls />
          <div className="hidden h-7 w-px bg-line sm:block" />
          <div className="flex-1">
            <Timeline />
          </div>
        </div>

        <StatBento />
        <EventTicker />

        <section className="rounded-xl border border-line bg-surface p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-display text-lg text-ink">Net worth race</h2>
            <span className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">
              hover a line, click to inspect
            </span>
          </div>
          <RaceChart />
        </section>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_360px]">
          <AgentGrid />
          <div className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
            <Leaderboard />
            <Graveyard />
          </div>
        </div>

        <EvolutionPanel />
      </div>

      <footer className="mt-8 border-t border-line pt-4 text-xs text-ink-faint">
        Simulation runs in-browser. Point the same UI at a live backend with{' '}
        <code className="rounded bg-paper-dim px-1 py-0.5 font-mono text-ink-soft">?source=ws&amp;ws=…</code>.
        See <span className="font-mono">docs/CONTRACT.md</span> for the contract.
      </footer>

      <AgentDetail />
    </div>
  )
}

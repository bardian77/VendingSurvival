/**
 * The evolution scaffold (project overlay, not in the benchmark). On demand it
 * runs a genetic algorithm over the agents' instincts and shows the population
 * converging on the thinking sweet spot — survival of the fittest, with no one
 * hand-tuning the dials. Computed lazily on click so it never blocks the load.
 */
import { useState } from 'react'
import { Dna } from '@phosphor-icons/react'
import { evolve, type EvolutionGen } from '../sim/evolution'
import { formatMoneyCompact, formatTokens } from '../lib/format'

const GENERATIONS = 16

interface MiniLineProps {
  label: string
  latest: string
  values: number[]
  color: string
}

function MiniLine({ label, latest, values, color }: MiniLineProps) {
  const w = 300
  const h = 64
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const stepX = w / Math.max(1, values.length - 1)
  const points = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(1)},${(h - ((v - min) / span) * (h - 8) - 4).toFixed(1)}`)
    .join(' ')
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[11px] text-ink-soft">{label}</span>
        <span className="tnum font-mono text-[11px] text-ink">{latest}</span>
      </div>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
    </div>
  )
}

export function EvolutionPanel() {
  const [gens, setGens] = useState<EvolutionGen[] | null>(null)
  const [running, setRunning] = useState(false)

  const run = () => {
    setRunning(true)
    // Defer so the "evolving" state paints before the synchronous GA runs.
    setTimeout(() => {
      setGens(evolve(GENERATIONS, 1))
      setRunning(false)
    }, 20)
  }

  const first = gens?.[0]
  const last = gens?.[gens.length - 1]

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl">
          <h2 className="flex items-center gap-2 font-display text-lg text-ink">
            <Dna size={18} weight="bold" className="text-accent" />
            Evolution lab
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            A genetic algorithm over the agents' instincts. Each generation runs the year, the
            bankrupt are dropped, and survivors breed the next. No one tunes the dials — the
            population discovers the right amount of thinking on its own.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="shrink-0 rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-transform duration-150 ease-out active:scale-95 disabled:opacity-60"
        >
          {running ? 'Evolving…' : gens ? 'Re-run' : `Run ${GENERATIONS} generations`}
        </button>
      </div>

      {gens && first && last && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MiniLine
              label="Thinking budget / generation"
              latest={`${formatTokens(last.avgTokens)} tok`}
              values={gens.map((g) => g.avgTokens)}
              color="#b5532c"
            />
            <MiniLine
              label="Survivors / generation"
              latest={`${last.survivors}/16`}
              values={gens.map((g) => g.survivors)}
              color="#4a7256"
            />
          </div>
          <p className="mt-3 text-sm text-ink-soft">
            Thinking budget converged from{' '}
            <span className="tnum font-mono text-ink">{formatTokens(first.avgTokens)}</span> to{' '}
            <span className="tnum font-mono text-ink">{formatTokens(last.avgTokens)}</span> tokens,
            survival rose from{' '}
            <span className="tnum font-mono text-ink">{first.survivors}/16</span> to{' '}
            <span className="tnum font-mono text-ink">{last.survivors}/16</span>, and the best net
            worth reached{' '}
            <span className="tnum font-mono text-ink">{formatMoneyCompact(last.bestNetWorth)}</span>.
          </p>
        </>
      )}
    </section>
  )
}

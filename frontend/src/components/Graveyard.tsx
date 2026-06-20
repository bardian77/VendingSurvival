/** Bankrupt agents, ordered by when they died — the cautionary tale. */
import { Skull } from '@phosphor-icons/react'
import { useCurrentTick } from '../store/useSimStore'
import { useUiStore } from '../store/useUiStore'
import { causeOfDeath, type DeathCauseKey } from '../lib/causeOfDeath'
import { cx } from '../lib/cx'
import type { AgentDayState } from '../types'

const CAUSE_TONE: Record<DeathCauseKey, string> = {
  compute: 'text-accent',
  liquidity: 'text-warning',
  incoherence: 'text-negative',
}

function DeadRow({ agent }: { agent: AgentDayState }) {
  const setHighlight = useUiStore((s) => s.setHighlight)
  const setSelected = useUiStore((s) => s.setSelected)
  const highlighted = useUiStore((s) => s.highlightId === agent.id)
  const cause = causeOfDeath(agent)

  return (
    <button
      type="button"
      onMouseEnter={() => setHighlight(agent.id)}
      onMouseLeave={() => setHighlight(null)}
      onClick={() => setSelected(agent.id)}
      className={cx(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-ink-soft transition-colors',
        highlighted ? 'bg-paper-dim' : 'hover:bg-paper-dim/60',
      )}
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full opacity-50" style={{ backgroundColor: agent.color }} />
      <span className="min-w-0 flex-1 truncate text-sm line-through decoration-ink-faint/60">{agent.name}</span>
      <span className={cx('shrink-0 text-[10px] font-medium uppercase tracking-wide', CAUSE_TONE[cause.key])}>
        {cause.label}
      </span>
      <span className="tnum shrink-0 font-mono text-xs text-ink-faint">d{agent.deathDay}</span>
    </button>
  )
}

export function Graveyard() {
  const tick = useCurrentTick()
  if (!tick) return null

  const dead = tick.agents
    .filter((a) => !a.isAlive)
    .sort((a, b) => (a.deathDay ?? 0) - (b.deathDay ?? 0))

  if (dead.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-line bg-surface/60 px-4 py-5 text-center text-sm text-ink-faint">
        No bankruptcies yet. Everyone is still in the game.
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-3">
      <header className="flex items-center gap-2 px-2.5 pb-2">
        <Skull size={15} weight="fill" className="text-ink-faint" />
        <h2 className="font-display text-lg text-ink">Graveyard</h2>
        <span className="ml-auto text-[11px] uppercase tracking-[0.14em] text-ink-faint">{dead.length}</span>
      </header>
      <div className="flex flex-col">
        {dead.map((agent) => (
          <DeadRow key={agent.id} agent={agent} />
        ))}
      </div>
    </section>
  )
}

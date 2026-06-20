/** Living agents ranked by balance. Rows cross-highlight with the chart/grid. */
import { useCurrentTick } from '../store/useSimStore'
import { useUiStore } from '../store/useUiStore'
import { formatMoney, formatSignedMoney } from '../lib/format'
import { cx } from '../lib/cx'
import type { AgentDayState } from '../types'

function Row({ agent, rank }: { agent: AgentDayState; rank: number }) {
  const setHighlight = useUiStore((s) => s.setHighlight)
  const setSelected = useUiStore((s) => s.setSelected)
  const highlighted = useUiStore((s) => s.highlightId === agent.id)
  const up = agent.balanceDelta >= 0

  return (
    <button
      type="button"
      onMouseEnter={() => setHighlight(agent.id)}
      onMouseLeave={() => setHighlight(null)}
      onClick={() => setSelected(agent.id)}
      className={cx(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
        highlighted ? 'bg-paper-dim' : 'hover:bg-paper-dim/60',
      )}
    >
      <span className="tnum w-4 shrink-0 font-mono text-xs text-ink-faint">{rank}</span>
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: agent.color }} />
      <span className="min-w-0 flex-1 truncate text-sm text-ink">{agent.name}</span>
      <span className="tnum shrink-0 font-mono text-[13px] text-ink">{formatMoney(agent.balance)}</span>
      <span className={cx('tnum w-14 shrink-0 text-right font-mono text-[11px]', up ? 'text-positive' : 'text-negative')}>
        {formatSignedMoney(agent.balanceDelta)}
      </span>
    </button>
  )
}

export function Leaderboard() {
  const tick = useCurrentTick()
  if (!tick) return null

  const alive = tick.agents.filter((a) => a.isAlive).sort((a, b) => b.balance - a.balance)

  return (
    <section className="rounded-xl border border-line bg-surface p-3">
      <header className="flex items-baseline justify-between px-2.5 pb-2">
        <h2 className="font-display text-lg text-ink">Standings</h2>
        <span className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">{alive.length} alive</span>
      </header>
      <div className="flex flex-col">
        {alive.map((agent, i) => (
          <Row key={agent.id} agent={agent} rank={i + 1} />
        ))}
      </div>
    </section>
  )
}

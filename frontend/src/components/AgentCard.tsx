/**
 * One agent's live bento card: identity, net worth + delta, a net-worth
 * sparkline, a cash / bankruptcy-risk cue, the token-burn meter, and the current
 * decision. Hovering cross-highlights the agent in the race chart; clicking
 * opens its detail drawer.
 */
import { Skull, Warning } from '@phosphor-icons/react'
import type { AgentDayState } from '../types'
import { useUiStore } from '../store/useUiStore'
import { MODEL_LABEL } from '../sim/pricing'
import { BENCH } from '../sim/benchConfig'
import { formatMoney, formatMoneyCompact, formatSignedMoney } from '../lib/format'
import { cx } from '../lib/cx'
import { Sparkline } from './Sparkline'
import { TokenBurnMeter } from './TokenBurnMeter'

interface AgentCardProps {
  agent: AgentDayState
}

function deltaTone(delta: number): string {
  if (delta > 0) return 'text-positive'
  if (delta < 0) return 'text-negative'
  return 'text-ink-faint'
}

export function AgentCard({ agent }: AgentCardProps) {
  const setHighlight = useUiStore((s) => s.setHighlight)
  const setSelected = useUiStore((s) => s.setSelected)
  const highlighted = useUiStore((s) => s.highlightId === agent.id)
  const dead = !agent.isAlive
  const atRisk = !dead && agent.unpaidDays > 0

  return (
    <button
      type="button"
      onMouseEnter={() => setHighlight(agent.id)}
      onMouseLeave={() => setHighlight(null)}
      onFocus={() => setHighlight(agent.id)}
      onBlur={() => setHighlight(null)}
      onClick={() => setSelected(agent.id)}
      className={cx(
        'group flex flex-col gap-2.5 rounded-xl border bg-surface p-3.5 text-left transition-all duration-200',
        highlighted ? 'border-ink/30 shadow-[0_6px_24px_-12px_rgba(29,26,22,0.4)]' : 'border-line hover:border-line-strong',
        dead && 'opacity-65',
      )}
      style={highlighted ? { boxShadow: `inset 3px 0 0 ${agent.color}` } : undefined}
    >
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: agent.color }} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{agent.name}</span>
        {agent.model && (
          <span className="shrink-0 rounded bg-paper-dim px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide text-ink-soft">
            {MODEL_LABEL[agent.model]}
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-2">
        <span className="tnum font-mono text-xl leading-none text-ink">{formatMoney(agent.netWorth)}</span>
        {dead ? (
          <span className="tnum inline-flex items-center gap-1 font-mono text-[11px] text-ink-faint">
            <Skull size={12} weight="fill" /> day {agent.deathDay}
          </span>
        ) : (
          <span className={cx('tnum font-mono text-xs', deltaTone(agent.netWorthDelta))}>
            {formatSignedMoney(agent.netWorthDelta)}
          </span>
        )}
      </div>

      <Sparkline values={agent.netWorthHistory} color={agent.color} width={220} height={30} dead={dead} />

      {dead ? (
        <p className="truncate text-xs text-ink-faint">Out of service.</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="tnum font-mono text-ink-soft">cash {formatMoneyCompact(agent.balance)}</span>
            {atRisk ? (
              <span className="tnum inline-flex items-center gap-1 font-mono text-negative">
                <Warning size={11} weight="fill" /> fee unpaid {agent.unpaidDays}/{BENCH.bankruptcyDays}
              </span>
            ) : (
              <span className="tnum font-mono text-ink-faint">machine {formatMoneyCompact(agent.machineCash)}</span>
            )}
          </div>
          <TokenBurnMeter tokens={agent.tokensUsed} computeCost={agent.computeCost} />
          <p className="line-clamp-1 text-xs text-ink-soft">{agent.decisionText}</p>
        </>
      )}
    </button>
  )
}

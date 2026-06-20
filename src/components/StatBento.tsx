/**
 * The global telemetry strip: day progress, survivors, leader, total compute
 * spent (the signature "thinking costs money" stat), and deaths. Flat cells
 * with hairline dividers rather than heavy cards.
 */
import { Lightning, Skull, Trophy, Pulse } from '@phosphor-icons/react'
import { useCurrentTick, useSimStore } from '../store/useSimStore'
import { AGENT_COUNT } from '../sim/agents'
import { MAX_DAYS } from '../sim/constants'
import { formatDay, formatMoney, formatMoneyCompact } from '../lib/format'
import type { ReactNode } from 'react'

interface CellProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  accent?: boolean
}

function Cell({ label, value, hint, icon, accent }: CellProps) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4 first:pl-0">
      <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.16em] text-ink-faint">
        {icon}
        {label}
      </div>
      <div className={`tnum font-mono text-2xl leading-none ${accent ? 'text-accent' : 'text-ink'}`}>
        {value}
      </div>
      {hint && <div className="truncate text-xs text-ink-soft">{hint}</div>}
    </div>
  )
}

export function StatBento() {
  const tick = useCurrentTick()
  const latestDay = useSimStore((s) => s.latestDay)
  if (!tick) return null

  const leader = tick.agents.find((a) => a.id === tick.leaderId)
  const deaths = AGENT_COUNT - tick.aliveCount

  return (
    <div className="grid grid-cols-2 divide-x divide-line rounded-xl border border-line bg-surface md:grid-cols-5">
      <Cell
        label="Day"
        icon={<Pulse size={12} weight="bold" />}
        value={
          <span>
            {tick.day}
            <span className="text-base text-ink-faint">/{MAX_DAYS}</span>
          </span>
        }
        hint={formatDay(latestDay)}
      />
      <Cell
        label="Survivors"
        value={
          <span>
            {tick.aliveCount}
            <span className="text-base text-ink-faint">/{AGENT_COUNT}</span>
          </span>
        }
        hint={`${deaths} bankrupt`}
      />
      <Cell
        label="Leader"
        icon={<Trophy size={12} weight="fill" />}
        value={<span style={{ color: leader?.color }}>{leader ? formatMoneyCompact(leader.balance) : 'n/a'}</span>}
        hint={leader?.name}
      />
      <Cell
        label="Compute spent"
        icon={<Lightning size={12} weight="fill" />}
        value={formatMoney(tick.totalComputeSpent)}
        hint="across all agents"
        accent
      />
      <Cell
        label="Deaths"
        icon={<Skull size={12} weight="fill" />}
        value={deaths}
        hint="balance hit zero"
      />
    </div>
  )
}

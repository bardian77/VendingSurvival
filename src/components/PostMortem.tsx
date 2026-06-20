/**
 * A death is information. For a bankrupt agent, this diagnoses the cause and
 * lays out the telltale numbers from its lifetime — what it earned, what it
 * spent thinking, what it left on the table — so the failure reads as a lesson.
 */
import { useAgentSeries } from '../store/useSimStore'
import { causeOfDeath, type DeathCauseKey } from '../lib/causeOfDeath'
import { formatMoney } from '../lib/format'
import { cx } from '../lib/cx'
import type { AgentDayState } from '../types'

const TONE: Record<DeathCauseKey, string> = {
  compute: 'bg-accent-wash text-accent',
  liquidity: 'bg-paper-dim text-warning',
  incoherence: 'bg-negative/10 text-negative',
}

const mean = (arr: number[]): number => (arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0)

export function PostMortem({ agent }: { agent: AgentDayState }) {
  const series = useAgentSeries(agent.id)
  const cause = causeOfDeath(agent)
  const avgProfit = mean(series.profit)
  const avgCompute = mean(series.compute)
  const peak = agent.netWorthHistory.length ? Math.max(...agent.netWorthHistory) : agent.netWorth

  const stats: { label: string; value: string }[] = [
    { label: 'Survived', value: `${agent.deathDay} days` },
    { label: 'Avg profit / day', value: formatMoney(avgProfit) },
    { label: 'Avg compute / day', value: formatMoney(avgCompute) },
    { label: 'Peak net worth', value: formatMoney(peak) },
  ]
  if (cause.key === 'liquidity') {
    stats.push({ label: 'Uncollected in machine', value: formatMoney(agent.machineCash) })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className={cx('rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide', TONE[cause.key])}>
          {cause.label}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-ink-soft">{cause.blurb}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5 border-t border-line pt-1.5">
            <dt className="text-[10.5px] uppercase tracking-wide text-ink-faint">{s.label}</dt>
            <dd className="tnum font-mono text-sm text-ink">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

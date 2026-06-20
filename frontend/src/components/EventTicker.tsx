/**
 * Slim banner for the day's global event (heat wave, supply disruption, etc.).
 * Tinted positive or negative by whether the event lifts or suppresses demand.
 */
import { Snowflake, Sun, TrendDown, TrendUp, Truck, Waves } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { useCurrentTick } from '../store/useSimStore'
import type { GlobalEventType } from '../types'

const ICONS: Record<GlobalEventType, Icon> = {
  heatwave: Sun,
  coldsnap: Snowflake,
  supply_disruption: Truck,
  payday_surge: TrendUp,
  demand_dip: TrendDown,
}

export function EventTicker() {
  const tick = useCurrentTick()
  const event = tick?.event ?? null

  if (!event) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-ink-faint">
        <Waves size={15} />
        <span>Conditions normal. Demand tracking the weekly rhythm.</span>
      </div>
    )
  }

  const positive = event.magnitude >= 1
  const Glyph = ICONS[event.type]
  const pct = Math.round((event.magnitude - 1) * 100)
  const tint = positive ? 'text-positive' : 'text-negative'

  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2.5">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-paper-dim ${tint}`}>
        <Glyph size={16} weight="bold" />
      </span>
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="shrink-0 font-medium text-ink">{event.label}</span>
        <span className="truncate text-sm text-ink-soft">{event.description}</span>
      </div>
      <span className={`tnum shrink-0 font-mono text-sm font-medium ${tint}`}>
        {positive ? '+' : ''}
        {pct}% demand
      </span>
    </div>
  )
}

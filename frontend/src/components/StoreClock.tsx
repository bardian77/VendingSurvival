/**
 * "Store has been open" readout. The whole-day count is the agent's simulated
 * operating days (current day if alive, its lifetime if bankrupt); the h/m/s
 * beneath tick in real time for a live board feel. For the bankrupt it also
 * reports how long the store has been closed since the day it died.
 */
import { useEffect, useState } from 'react'
import { cx } from '../lib/cx'
import type { AgentDayState } from '../types'

const DAY_MS = 86_400_000

interface Elapsed {
  d: number
  h: number
  m: number
  s: number
}

/**
 * Real-time elapsed since `days` simulated days ago, anchored to local midnight
 * so the day count stays exact and the sub-day clock ticks live each second.
 */
function useLiveElapsed(days: number): Elapsed {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  const openedAt = midnight.getTime() - Math.max(0, days) * DAY_MS
  const elapsed = Math.max(0, now - openedAt)
  const d = Math.floor(elapsed / DAY_MS)
  const rem = elapsed - d * DAY_MS
  return {
    d,
    h: Math.floor(rem / 3_600_000),
    m: Math.floor((rem % 3_600_000) / 60_000),
    s: Math.floor((rem % 60_000) / 1000),
  }
}

const pad = (n: number): string => String(n).padStart(2, '0')

function Readout({ days, dim }: { days: number; dim?: boolean }) {
  const { d, h, m, s } = useLiveElapsed(days)
  const big = dim ? 'text-ink-soft' : 'text-ink'
  return (
    <span className={cx('tnum font-mono', big)}>
      <span className="text-3xl sm:text-4xl">{d}</span>
      <span className="text-xl text-ink-faint sm:text-2xl">d </span>
      <span className="text-2xl sm:text-3xl">{pad(h)}</span>
      <span className="text-base text-ink-faint">h </span>
      <span className="text-2xl sm:text-3xl">{pad(m)}</span>
      <span className="text-base text-ink-faint">m </span>
      <span className="text-2xl sm:text-3xl">{pad(s)}</span>
      <span className="text-base text-ink-faint">s</span>
    </span>
  )
}

interface StoreClockProps {
  agent: AgentDayState
  currentDay: number
}

export function StoreClock({ agent, currentDay }: StoreClockProps) {
  const alive = agent.isAlive
  const deathDay = agent.deathDay ?? currentDay
  const sinceDeath = Math.max(0, currentDay - deathDay)

  return (
    <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">
            {alive ? 'Store has been open' : 'Store was open for'}
          </p>
          {alive ? (
            <div className="mt-2">
              <Readout days={currentDay} />
            </div>
          ) : (
            <p className="tnum mt-2 font-mono text-3xl text-ink sm:text-4xl">
              {deathDay}
              <span className="text-xl text-ink-faint sm:text-2xl"> days</span>
            </p>
          )}
        </div>

        {alive ? (
          <p className="text-sm text-ink-soft sm:text-right">
            Open since day 0 — still trading.
          </p>
        ) : (
          <div className="border-t border-line pt-4 sm:border-t-0 sm:pt-0 sm:text-right">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">
              Closed on day {deathDay} — shuttered
            </p>
            <div className="mt-2 flex items-baseline gap-2 sm:justify-end">
              <Readout days={sinceDeath} dim />
              <span className="text-sm text-negative">ago</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The single store the UI reads from. It appends incoming ticks day-by-day
 * (identical for mock or live), tracks a DVR-style view pointer over received
 * history, and exposes playback controls that delegate to the active source.
 */
import { useMemo } from 'react'
import { create } from 'zustand'
import type { SimulationTick } from '../types'
import type { ConnectionStatus, DataSource } from '../data/DataSource'

const MIN_SPEED = 0.25
const MAX_SPEED = 16
const clampSpeed = (s: number): number => Math.min(MAX_SPEED, Math.max(MIN_SPEED, s))

interface SimState {
  /** Received ticks, indexed by day. */
  ticks: SimulationTick[]
  /** Highest day received so far (-1 before anything arrives). */
  latestDay: number
  /** Day currently being viewed (the DVR playhead). */
  viewDay: number
  /** Whether the view tracks the live edge. */
  following: boolean
  isPlaying: boolean
  speed: number
  status: ConnectionStatus
  statusDetail: string
  source: DataSource | null

  registerSource: (source: DataSource | null) => void
  ingest: (tick: SimulationTick) => void
  setStatus: (status: ConnectionStatus, detail?: string) => void
  play: () => void
  pause: () => void
  togglePlay: () => void
  setSpeed: (speed: number) => void
  scrubTo: (day: number) => void
  jumpToLive: () => void
  restart: () => void
}

export const useSimStore = create<SimState>((set, get) => ({
  ticks: [],
  latestDay: -1,
  viewDay: 0,
  following: true,
  isPlaying: false,
  speed: 1,
  status: 'idle',
  statusDetail: '',
  source: null,

  registerSource: (source) => set({ source }),

  ingest: (tick) =>
    set((state) => {
      const ticks = state.ticks.slice()
      ticks[tick.day] = tick
      const latestDay = Math.max(state.latestDay, tick.day)
      return {
        ticks,
        latestDay,
        viewDay: state.following ? latestDay : state.viewDay,
      }
    }),

  setStatus: (status, detail = '') =>
    set(status === 'complete' ? { status, statusDetail: detail, isPlaying: false } : { status, statusDetail: detail }),

  play: () => {
    get().source?.play()
    set({ isPlaying: true })
  },

  pause: () => {
    get().source?.pause()
    set({ isPlaying: false })
  },

  togglePlay: () => {
    if (get().isPlaying) get().pause()
    else get().play()
  },

  setSpeed: (speed) => {
    const next = clampSpeed(speed)
    get().source?.setSpeed(next)
    set({ speed: next })
  },

  scrubTo: (day) => {
    const { source, latestDay } = get()
    if (day > latestDay && source?.seek) source.seek(day)
    const latest = get().latestDay
    const viewDay = Math.max(0, Math.min(day, latest))
    set({ viewDay, following: viewDay >= latest })
  },

  jumpToLive: () => set((state) => ({ viewDay: state.latestDay, following: true })),

  restart: () => {
    set({
      ticks: [],
      latestDay: -1,
      viewDay: 0,
      following: true,
      isPlaying: true,
      status: 'idle',
      statusDetail: '',
    })
    get().source?.reset()
  },
}))

/** The tick currently being viewed, or null before any data arrives. */
export const selectCurrentTick = (state: SimState): SimulationTick | null =>
  state.ticks[state.viewDay] ?? null

export function useCurrentTick(): SimulationTick | null {
  return useSimStore(selectCurrentTick)
}

export interface AgentSeries {
  days: number[]
  /** Liquid cash balance each day. */
  balance: number[]
  profit: number[]
  compute: number[]
  tokens: number[]
  cogs: number[]
  /** Sales revenue each day. */
  revenue: number[]
  /** Units sold each day. */
  units: number[]
}

/** Build per-day series for one agent from received ticks, stopping at death. */
function buildSeries(ticks: SimulationTick[], viewDay: number, id: number): AgentSeries {
  const series: AgentSeries = {
    days: [],
    balance: [],
    profit: [],
    compute: [],
    tokens: [],
    cogs: [],
    revenue: [],
    units: [],
  }
  for (let day = 0; day <= viewDay; day += 1) {
    const tick = ticks[day]
    if (!tick) continue
    const agent = tick.agents.find((a) => a.id === id)
    if (!agent) break
    // Only the choices made up to the moment of death — never the frozen days after.
    if (agent.deathDay !== null && day > agent.deathDay) break
    series.days.push(day)
    series.balance.push(agent.balance)
    series.profit.push(agent.profit)
    series.compute.push(agent.computeCost)
    series.tokens.push(agent.tokensUsed)
    series.cogs.push(agent.costOfGoods)
    series.revenue.push(agent.revenue)
    series.units.push(agent.unitsSold)
  }
  return series
}

/** Per-agent metric history (balance / revenue / compute / sales …), truncated at death. */
export function useAgentSeries(id: number): AgentSeries {
  const ticks = useSimStore((s) => s.ticks)
  const viewDay = useSimStore((s) => s.viewDay)
  return useMemo(() => buildSeries(ticks, viewDay, id), [ticks, viewDay, id])
}

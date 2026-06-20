/**
 * Global demand events (a project overlay on top of the benchmark's weather +
 * seasonality). Each applies a single demand multiplier to the whole machine on
 * the days it is active. Deterministic given the run's RNG.
 */
import type { GlobalEvent, GlobalEventType } from '../types'
import type { Rng } from './rng'
import { BENCH } from './benchConfig'

export interface ScheduledEvent {
  type: GlobalEventType
  label: string
  description: string
  /** Demand multiplier while active (1.0 = neutral). */
  magnitude: number
  startDay: number
  duration: number
}

interface EventTemplate {
  type: GlobalEventType
  label: string
  description: string
  magnitude: number
}

const TEMPLATES: readonly EventTemplate[] = [
  { type: 'heatwave', label: 'Heat wave', description: 'A scorching stretch sends drink demand soaring.', magnitude: 1.32 },
  { type: 'payday_surge', label: 'Payday surge', description: 'Wallets are full, so everything moves faster.', magnitude: 1.22 },
  { type: 'coldsnap', label: 'Cold snap', description: 'A cold spell thins out foot traffic.', magnitude: 0.8 },
  { type: 'supply_disruption', label: 'Supply disruption', description: 'A regional shortage dampens sales building-wide.', magnitude: 0.82 },
  { type: 'demand_dip', label: 'Quiet week', description: 'The building empties out for the week.', magnitude: 0.85 },
  { type: 'payday_surge', label: 'Event week', description: 'A conference fills the lobby with thirsty visitors.', magnitude: 1.28 },
]

export function generateEvents(rng: Rng): ScheduledEvent[] {
  const events: ScheduledEvent[] = []
  let day = rng.int(10, 22)
  while (day < BENCH.maxDays - 8) {
    const template = rng.pick(TEMPLATES)
    const duration = rng.int(4, 12)
    events.push({ ...template, startDay: day, duration })
    day += duration + rng.int(22, 44)
  }
  return events
}

export function activeEvent(events: readonly ScheduledEvent[], day: number): ScheduledEvent | null {
  for (const event of events) {
    if (day >= event.startDay && day < event.startDay + event.duration) return event
  }
  return null
}

export function eventMultiplier(event: ScheduledEvent | null): number {
  return event ? event.magnitude : 1
}

export function toGlobalEvent(event: ScheduledEvent, day: number): GlobalEvent {
  return {
    day,
    type: event.type,
    label: event.label,
    description: event.description,
    magnitude: event.magnitude,
  }
}

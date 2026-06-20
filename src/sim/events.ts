/**
 * Global events that nudge demand for every agent on a given day. Deterministic
 * given the run's RNG, scattered across the year with gaps.
 */
import type { GlobalEvent, GlobalEventType, ItemCategory } from '../types'
import type { Rng } from './rng'
import { MAX_DAYS } from './constants'

export interface ScheduledEvent {
  type: GlobalEventType
  label: string
  description: string
  /** Demand multiplier while active (1.0 = neutral). */
  magnitude: number
  /** Which category it moves, or 'all'. */
  scope: ItemCategory | 'all'
  startDay: number
  duration: number
}

interface EventTemplate {
  type: GlobalEventType
  label: string
  description: string
  magnitude: number
  scope: ItemCategory | 'all'
}

const TEMPLATES: readonly EventTemplate[] = [
  { type: 'heatwave', label: 'Heat wave', description: 'A scorching stretch sends drink demand soaring.', magnitude: 1.38, scope: 'drink' },
  { type: 'payday_surge', label: 'Payday surge', description: 'Wallets are full, so everything moves faster.', magnitude: 1.24, scope: 'all' },
  { type: 'coldsnap', label: 'Cold snap', description: 'A cold spell chills demand for cold drinks.', magnitude: 0.76, scope: 'drink' },
  { type: 'supply_disruption', label: 'Supply disruption', description: 'Restock delays squeeze every machine.', magnitude: 0.8, scope: 'all' },
  { type: 'demand_dip', label: 'Quiet week', description: 'Foot traffic thins out across the building.', magnitude: 0.84, scope: 'all' },
  { type: 'payday_surge', label: 'Event week', description: 'A conference fills the lobby with thirsty visitors.', magnitude: 1.3, scope: 'all' },
]

/** Build the run's event schedule. */
export function generateEvents(rng: Rng): ScheduledEvent[] {
  const events: ScheduledEvent[] = []
  let day = rng.int(8, 18)
  while (day < MAX_DAYS - 6) {
    const template = rng.pick(TEMPLATES)
    const duration = rng.int(4, 11)
    events.push({ ...template, startDay: day, duration })
    day += duration + rng.int(18, 36)
  }
  return events
}

/** The event active on a given day, if any. */
export function activeEvent(events: readonly ScheduledEvent[], day: number): ScheduledEvent | null {
  for (const event of events) {
    if (day >= event.startDay && day < event.startDay + event.duration) return event
  }
  return null
}

/** Demand multiplier an event applies to a particular category. */
export function eventMultiplier(event: ScheduledEvent | null, category: ItemCategory): number {
  if (!event) return 1
  if (event.scope === 'all' || event.scope === category) return event.magnitude
  return 1
}

/** Project a scheduled event into the contract's per-tick GlobalEvent shape. */
export function toGlobalEvent(event: ScheduledEvent, day: number): GlobalEvent {
  return {
    day,
    type: event.type,
    label: event.label,
    description: event.description,
    magnitude: event.magnitude,
  }
}

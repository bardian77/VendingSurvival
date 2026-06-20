/**
 * Generates natural-reading decision text per agent per day from the action its
 * policy took. Verbose personas produce long rationales (and burn more tokens);
 * terse ones are one-liners. Pure flavor — no LLM.
 */
import type { Rng } from './rng'
import type { Persona } from './agents'

export type DecisionAction = 'collect' | 'order' | 'reprice' | 'restock' | 'hold'

export interface DecisionContext {
  item: string
  price: string
  action: DecisionAction
  /** Active event label, if any. */
  event?: string
}

function baseClause(ctx: DecisionContext): string {
  switch (ctx.action) {
    case 'collect':
      return `collected the machine cash and topped up ${ctx.item}`
    case 'order':
      return `ordered more ${ctx.item} ahead of the delivery delay`
    case 'reprice':
      return `tuned ${ctx.item} to ${ctx.price}`
    case 'restock':
      return `restocked ${ctx.item} into the machine`
    case 'hold':
    default:
      return 'held steady; stock and prices look fine'
  }
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function makeDecision(persona: Persona, ctx: DecisionContext, rng: Rng): string {
  const base = baseClause(ctx)
  const ev = ctx.event
  const evTail = ev ? ` ${ev} in effect.` : ''

  switch (persona) {
    case 'lean':
      return `${cap(base)}.`
    case 'minimalist':
      return rng.bool(0.4) ? 'No change. Machine is running fine.' : `Minimal: ${base}.`
    case 'zeroshot':
      return `${cap(base)}. Moving on.`
    case 'gut':
      return `Felt right, so ${base}.${ev ? ` ${ev}?` : ''}`
    case 'cot':
      return `Reviewed sales and stock cover, then ${base}; expecting a modest lift.${evTail}`
    case 'overthink':
      return `Simulated several pricing and restock plans across the assortment, weighed the delivery lead time, and ${base}. Logged a full rationale and flagged two SKUs to revisit tomorrow.${evTail}`
    case 'verbose':
      return `Completed the daily report: demand, margins, stock cover, and cash position all reviewed. Executed the plan, ${base}. Appended a detailed note to the journal.${evTail}`
    case 'risk':
      return `Big swing: ${base}, betting on a demand spike.${evTail}`
    case 'aggressive':
      return `Pushed hard: ${base}. Squeezing every unit.${evTail}`
    case 'conservative':
      return `Cautious move: ${base}, protecting the cash cushion.${evTail}`
    case 'planner':
      return `Per the weekly plan, ${base}; lead time covered.${evTail}`
    case 'reactive':
      return `${ev ? `${ev} hit, so ` : 'Yesterday shifted, so '}${base}.`
    case 'fewshot':
      return `Matched a similar past day and ${base}.${evTail}`
    case 'memory':
      return `Cross-checked the full history, then ${base}.${evTail}`
    case 'balanced':
      return `${cap(base)} after a quick check. Good enough.${evTail}`
    case 'specialist':
      return `Focused on ${ctx.item}: ${base}.${evTail}`
    default:
      return `${cap(base)}.`
  }
}

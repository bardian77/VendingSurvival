/**
 * Generates natural-reading decision text per agent per day. Verbose personas
 * produce long rationales (and burn more tokens); terse ones are one-liners.
 * Pure flavor — no LLM — but it varies by persona, action, and active event.
 */
import type { Rng } from './rng'
import type { Persona } from './agents'

export type DecisionAction = 'reprice-up' | 'reprice-down' | 'restock' | 'hold' | 'promote'

export interface DecisionContext {
  item: string
  price: string
  action: DecisionAction
  /** Active event label, if any. */
  event?: string
}

function baseClause(ctx: DecisionContext): string {
  switch (ctx.action) {
    case 'reprice-up':
      return `nudged ${ctx.item} up to ${ctx.price}`
    case 'reprice-down':
      return `dropped ${ctx.item} to ${ctx.price} to move volume`
    case 'restock':
      return `restocked ${ctx.item} and topped up two slots`
    case 'promote':
      return `pushed ${ctx.item} hard at ${ctx.price}`
    case 'hold':
    default:
      return 'held prices steady'
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
      return rng.bool(0.4) ? 'No change. Machine is fine.' : `Minimal: ${base}.`
    case 'zeroshot':
      return `${cap(base)}. Moving on.`
    case 'gut':
      return `Felt right, so ${base}.${ev ? ` ${ev}?` : ''}`
    case 'cot':
      return `Reviewed demand and margins, then ${base}; expecting a modest lift.${evTail}`
    case 'overthink':
      return `Simulated six pricing scenarios and three restock plans across all SKUs, weighed the edge cases, and ${base}. Logged a full rationale and flagged two items to revisit tomorrow.${evTail}`
    case 'verbose':
      return `Completed the daily report: elasticity, margin sensitivity, and stock cover all reviewed. Executed the recommendation, ${base}. Appended a detailed note to the journal for traceability.${evTail}`
    case 'risk':
      return `Big swing: ${base}, betting on a demand spike.${evTail}`
    case 'aggressive':
      return `Pushed margins: ${base}. Not leaving a cent on the table.${evTail}`
    case 'conservative':
      return `Cautious move: ${base}, protecting the balance.${evTail}`
    case 'planner':
      return `Per the weekly plan, ${base}; still on track.${evTail}`
    case 'reactive':
      return `${ev ? `${ev} hit, so ` : 'Yesterday shifted, so '}${base}.`
    case 'fewshot':
      return `Matched a similar past day and ${base}.${evTail}`
    case 'memory':
      return `Cross-checked the full sales history, then ${base}.${evTail}`
    case 'balanced':
      return `${cap(base)} after a quick check. Good enough.${evTail}`
    case 'specialist':
      return `Focused on ${ctx.item}: ${base}.${evTail}`
    default:
      return `${cap(base)}.`
  }
}

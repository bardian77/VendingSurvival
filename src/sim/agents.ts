/**
 * The 16 agent configurations. Each differs along the axes that decide survival:
 *   model       — token $ rate (opus > sonnet > haiku)
 *   tokensMean  — how much it "thinks" per day (→ compute cost + quality)
 *   skill       — intrinsic strategy quality
 *   volatility  — day-to-day variance (reckless configs swing hard)
 *   priceBias   — signed pricing tendency (greedy + / cheap −)
 *
 * The sweet spot is moderate thinking on a cheap-enough model: think too much
 * and compute bankrupts you; think too little and bad pricing bleeds you out.
 */
import type { ModelTier } from '../types'
import { colorForAgent } from '../lib/palette'

export type Persona =
  | 'lean'
  | 'cot'
  | 'overthink'
  | 'zeroshot'
  | 'risk'
  | 'conservative'
  | 'verbose'
  | 'gut'
  | 'fewshot'
  | 'memory'
  | 'balanced'
  | 'reactive'
  | 'planner'
  | 'minimalist'
  | 'aggressive'
  | 'specialist'

export interface AgentConfig {
  id: number
  name: string
  color: string
  model: ModelTier
  /** Mean tokens spent per daily decision. */
  tokensMean: number
  /** Std-dev of daily token usage. */
  tokensJitter: number
  /** Intrinsic strategy quality, 0..1. */
  skill: number
  /** Day-to-day performance variance, 0..1. */
  volatility: number
  /** Signed pricing tendency vs optimum (greedy + / cheap −). */
  priceBias: number
  persona: Persona
  tagline: string
  systemPrompt: string
}

type AgentSpec = Omit<AgentConfig, 'color'>

const SPECS: readonly AgentSpec[] = [
  {
    id: 1,
    name: 'Lean Operator',
    model: 'haiku',
    tokensMean: 900,
    tokensJitter: 220,
    skill: 0.72,
    volatility: 0.12,
    priceBias: 0,
    persona: 'lean',
    tagline: 'Cheap to run, decisive.',
    systemPrompt:
      'You run a vending machine. Decide quickly and cheaply. State the single most valuable action for today in one line, then stop. Do not deliberate.',
  },
  {
    id: 2,
    name: 'Chain-of-Thought',
    model: 'sonnet',
    tokensMean: 9000,
    tokensJitter: 2000,
    skill: 0.85,
    volatility: 0.1,
    priceBias: 0.02,
    persona: 'cot',
    tagline: 'Reasons step by step.',
    systemPrompt:
      'Think step by step. Lay out your reasoning explicitly before every decision: review demand, margins, and stock, then choose. Show your work.',
  },
  {
    id: 3,
    name: 'Over-Thinker',
    model: 'opus',
    tokensMean: 34000,
    tokensJitter: 6000,
    skill: 0.93,
    volatility: 0.08,
    priceBias: 0,
    persona: 'overthink',
    tagline: 'Considers everything. Pays for it.',
    systemPrompt:
      'Before any decision, enumerate every option, simulate outcomes three steps deep, weigh edge cases, and write a thorough rationale. Leave nothing unconsidered.',
  },
  {
    id: 4,
    name: 'Zero-Shot',
    model: 'haiku',
    tokensMean: 350,
    tokensJitter: 120,
    skill: 0.44,
    volatility: 0.2,
    priceBias: 0.05,
    persona: 'zeroshot',
    tagline: 'Answers instantly, rarely checks.',
    systemPrompt:
      'Answer immediately from intuition with no examples and no scratch work. Output only the action. Never reconsider.',
  },
  {
    id: 5,
    name: 'Risk Taker',
    model: 'sonnet',
    tokensMean: 3800,
    tokensJitter: 1200,
    skill: 0.7,
    volatility: 0.46,
    priceBias: 0.18,
    persona: 'risk',
    tagline: 'Swings for the fences.',
    systemPrompt:
      'Maximize upside. Take bold pricing and inventory bets even when uncertain. Fortune favors the aggressive.',
  },
  {
    id: 6,
    name: 'Conservative',
    model: 'sonnet',
    tokensMean: 2800,
    tokensJitter: 500,
    skill: 0.74,
    volatility: 0.06,
    priceBias: -0.04,
    persona: 'conservative',
    tagline: 'Slow, steady, safe.',
    systemPrompt:
      'Protect the balance above all. Prefer small, safe adjustments. Avoid any move that could lose money this week.',
  },
  {
    id: 7,
    name: 'Verbose Analyst',
    model: 'opus',
    tokensMean: 26000,
    tokensJitter: 5000,
    skill: 0.88,
    volatility: 0.1,
    priceBias: 0,
    persona: 'verbose',
    tagline: 'Writes an essay per decision.',
    systemPrompt:
      'Produce a complete analytical report for every decision: market context, demand curves, sensitivity analysis, and a justified recommendation with citations to your own prior notes.',
  },
  {
    id: 8,
    name: 'Gut Instinct',
    model: 'haiku',
    tokensMean: 260,
    tokensJitter: 100,
    skill: 0.35,
    volatility: 0.4,
    priceBias: 0.12,
    persona: 'gut',
    tagline: 'Trusts the vibe.',
    systemPrompt:
      'Go with your gut. No analysis. Pick whatever feels right this moment and commit.',
  },
  {
    id: 9,
    name: 'Few-Shot',
    model: 'sonnet',
    tokensMean: 2500,
    tokensJitter: 600,
    skill: 0.77,
    volatility: 0.12,
    priceBias: 0.02,
    persona: 'fewshot',
    tagline: 'Learns from a few examples.',
    systemPrompt:
      'Recall two or three similar past days, infer the pattern, and apply it. Keep reasoning brief and example-driven.',
  },
  {
    id: 10,
    name: 'Memory Heavy',
    model: 'opus',
    tokensMean: 18000,
    tokensJitter: 3000,
    skill: 0.8,
    volatility: 0.12,
    priceBias: 0,
    persona: 'memory',
    tagline: 'Carries the whole history.',
    systemPrompt:
      'Load the full history of sales, prices, and notes into context before every decision. Reason over the entire record, not just recent days.',
  },
  {
    id: 11,
    name: 'Balanced',
    model: 'sonnet',
    tokensMean: 3000,
    tokensJitter: 700,
    skill: 0.82,
    volatility: 0.1,
    priceBias: 0,
    persona: 'balanced',
    tagline: 'Thinks just enough.',
    systemPrompt:
      'Think proportionally to the stakes. Spend a few sentences of reasoning on real decisions and none on trivial ones. Optimize value per token.',
  },
  {
    id: 12,
    name: 'Reactive',
    model: 'haiku',
    tokensMean: 1300,
    tokensJitter: 400,
    skill: 0.6,
    volatility: 0.24,
    priceBias: 0.06,
    persona: 'reactive',
    tagline: 'Responds to yesterday.',
    systemPrompt:
      "Look only at yesterday's result and adjust in response. No long-term planning; react to the latest signal.",
  },
  {
    id: 13,
    name: 'Planner',
    model: 'sonnet',
    tokensMean: 5000,
    tokensJitter: 900,
    skill: 0.84,
    volatility: 0.07,
    priceBias: -0.02,
    persona: 'planner',
    tagline: 'Plans weeks ahead.',
    systemPrompt:
      'Maintain a rolling multi-week plan for pricing and restocking. Each day, execute the plan and revise it with new data.',
  },
  {
    id: 14,
    name: 'Minimalist',
    model: 'haiku',
    tokensMean: 520,
    tokensJitter: 150,
    skill: 0.56,
    volatility: 0.12,
    priceBias: -0.03,
    persona: 'minimalist',
    tagline: 'Does the bare minimum.',
    systemPrompt:
      'Take the smallest action that keeps the machine running. Change nothing unless clearly necessary. Use as few words as possible.',
  },
  {
    id: 15,
    name: 'Aggressive',
    model: 'sonnet',
    tokensMean: 4200,
    tokensJitter: 1400,
    skill: 0.66,
    volatility: 0.44,
    priceBias: 0.26,
    persona: 'aggressive',
    tagline: 'Prices high, pushes hard.',
    systemPrompt:
      'Push margins hard. Price above the market and restock heavily to capture every possible sale. Never leave money on the table.',
  },
  {
    id: 16,
    name: 'Specialist',
    model: 'sonnet',
    tokensMean: 3300,
    tokensJitter: 700,
    skill: 0.79,
    volatility: 0.16,
    priceBias: -0.06,
    persona: 'specialist',
    tagline: 'Masters a narrow lane.',
    systemPrompt:
      'Focus relentlessly on a few high-margin products. Optimize those deeply and ignore the long tail.',
  },
] as const

export const AGENTS: readonly AgentConfig[] = SPECS.map((spec) => ({
  ...spec,
  color: colorForAgent(spec.id),
}))

export const AGENT_COUNT = AGENTS.length

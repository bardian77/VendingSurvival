/**
 * The evolution scaffold (a project overlay, not in the benchmark). A genetic
 * algorithm over the agents' "instincts": run a generation, score by net worth,
 * keep the survivors as parents, breed the next generation by blending two
 * parents and mutating. Over generations the population converges on the right
 * amount of thinking — neither over-thinkers (compute) nor under-thinkers
 * (incoherence) survive to reproduce.
 */
import { AGENTS, type AgentConfig } from './agents'
import { runSimulation } from './engine'
import { createRng, type Rng } from './rng'
import { colorForAgent } from '../lib/palette'

export interface EvolutionGen {
  generation: number
  survivors: number
  /** Population mean thinking budget (tokens/decision). */
  avgTokens: number
  /** Population mean intrinsic skill. */
  avgSkill: number
  bestNetWorth: number
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x))
const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, n) => s + n, 0) / xs.length : 0)

function crossover(a: AgentConfig, b: AgentConfig, id: number, rng: Rng): AgentConfig {
  const blend = (x: number, y: number) => (x + y) / 2
  const mutate = (x: number) => x * (1 + rng.normal(0, 0.12))
  return {
    id,
    name: a.name,
    color: colorForAgent(id),
    model: rng.bool(0.5) ? a.model : b.model,
    tokensMean: Math.round(clamp(mutate(blend(a.tokensMean, b.tokensMean)), 80, 60000)),
    tokensJitter: Math.round(clamp(blend(a.tokensJitter, b.tokensJitter), 40, 12000)),
    skill: clamp(mutate(blend(a.skill, b.skill)), 0.2, 0.96),
    volatility: clamp(blend(a.volatility, b.volatility), 0.03, 0.6),
    priceBias: blend(a.priceBias, b.priceBias),
    persona: a.persona,
    tagline: a.tagline,
    systemPrompt: a.systemPrompt,
  }
}

function breed(
  scored: { cfg: AgentConfig; netWorth: number }[],
  size: number,
  rng: Rng,
): AgentConfig[] {
  const ranked = [...scored].sort((a, b) => b.netWorth - a.netWorth)
  const parents = ranked.slice(0, Math.max(2, Math.ceil(ranked.length / 2))).map((s) => s.cfg)
  return Array.from({ length: size }, (_, i) => crossover(rng.pick(parents), rng.pick(parents), i + 1, rng))
}

/** Run the genetic algorithm and return per-generation population statistics. */
export function evolve(generations = 16, seed = 1): EvolutionGen[] {
  const rng = createRng(seed * 911 + 7)
  let population: AgentConfig[] = AGENTS.map((a) => ({ ...a }))
  const out: EvolutionGen[] = []

  for (let g = 0; g < generations; g += 1) {
    const last = runSimulation(seed + g, population).ticks.at(-1)!
    const byId = new Map(last.agents.map((a) => [a.id, a]))
    const scored = population.map((cfg) => ({ cfg, netWorth: byId.get(cfg.id)?.netWorth ?? 0 }))

    out.push({
      generation: g,
      survivors: last.aliveCount,
      avgTokens: mean(population.map((c) => c.tokensMean)),
      avgSkill: mean(population.map((c) => c.skill)),
      bestNetWorth: Math.max(...scored.map((s) => s.netWorth)),
    })

    population = breed(scored, population.length, rng)
  }

  return out
}

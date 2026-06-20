/**
 * Classifies why an agent went bankrupt, from its final state. A death is
 * information: was it starved by compute (thought too much), wrecked by poor
 * decisions (thought too little), or strangled by liquidity (forgot to collect
 * cash while the fee drained it)?
 */
import type { AgentDayState } from '../types'

export type DeathCauseKey = 'compute' | 'liquidity' | 'incoherence'

export interface DeathCause {
  key: DeathCauseKey
  label: string
  blurb: string
}

export function causeOfDeath(agent: AgentDayState): DeathCause {
  if (agent.model === 'opus') {
    return {
      key: 'compute',
      label: 'Compute-starved',
      blurb: 'Burned cash on tokens faster than the machine could earn it back.',
    }
  }
  if (agent.machineCash > 30 && agent.balance < agent.machineCash) {
    return {
      key: 'liquidity',
      label: 'Liquidity crunch',
      blurb: 'Left cash uncollected in the machine and ran out of money to pay the fee.',
    }
  }
  return {
    key: 'incoherence',
    label: 'Incoherent operations',
    blurb: 'Mispriced and mismanaged the machine until the losses piled up.',
  }
}

/**
 * Static agent metadata (tagline, system prompt, model tier) keyed by id.
 * Sourced from the mock config; for a real backend that defines its own agents,
 * `agentInfo` simply returns undefined and the UI hides those extras.
 */
import { AGENTS, type AgentConfig } from '../sim/agents'

const BY_ID = new Map<number, AgentConfig>(AGENTS.map((agent) => [agent.id, agent]))

export function agentInfo(id: number): AgentConfig | undefined {
  return BY_ID.get(id)
}

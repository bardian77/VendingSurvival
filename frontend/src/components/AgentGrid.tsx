/** Responsive bento of all 16 agent cards, in stable id order. */
import { useCurrentTick } from '../store/useSimStore'
import { AgentCard } from './AgentCard'
import { AGENT_COUNT } from '../sim/agents'

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: AGENT_COUNT }).map((_, i) => (
        <div key={i} className="h-[140px] animate-pulse rounded-xl border border-line bg-surface" />
      ))}
    </div>
  )
}

export function AgentGrid() {
  const tick = useCurrentTick()
  if (!tick) return <GridSkeleton />

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {tick.agents.map((agent) => (
        <AgentCard key={agent.id} agent={agent} />
      ))}
    </div>
  )
}

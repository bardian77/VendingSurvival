/**
 * Slide-over drawer with one agent's full story: balance history, today's ledger
 * (the survival formula made legible), thinking cost, latest decision, machine
 * inventory, and the system prompt that defines how it reasons.
 */
import { useEffect } from 'react'
import { X } from '@phosphor-icons/react'
import { useCurrentTick } from '../store/useSimStore'
import { useUiStore } from '../store/useUiStore'
import { agentInfo } from '../lib/agentInfo'
import { MODEL_LABEL } from '../sim/pricing'
import { formatMoney, formatNumber, formatSignedMoney } from '../lib/format'
import { cx } from '../lib/cx'
import { Sparkline } from './Sparkline'
import { TokenBurnMeter } from './TokenBurnMeter'
import type { AgentDayState, InventoryItem } from '../types'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-4">
      <h3 className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">{title}</h3>
      {children}
    </section>
  )
}

function LedgerRow({ label, amount, maxAbs }: { label: string; amount: number; maxAbs: number }) {
  const negative = amount < 0
  const fraction = maxAbs > 0 ? Math.abs(amount) / maxAbs : 0
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-24 shrink-0 text-xs text-ink-soft">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-dim">
        <div
          className={cx('h-full rounded-full', negative ? 'bg-negative/70' : 'bg-positive/70')}
          style={{ width: `${Math.max(3, fraction * 100)}%` }}
        />
      </div>
      <span className={cx('tnum w-20 shrink-0 text-right font-mono text-xs', negative ? 'text-negative' : 'text-positive')}>
        {formatSignedMoney(amount)}
      </span>
    </div>
  )
}

function Slot({ item }: { item: InventoryItem }) {
  const low = item.quantity < 4
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5">
      <span className="min-w-0 truncate text-xs text-ink">{item.name}</span>
      <div className="flex shrink-0 items-center gap-2 font-mono text-[11px]">
        <span className={cx('tnum', low ? 'text-negative' : 'text-ink-faint')}>×{item.quantity}</span>
        <span className="tnum text-ink">${item.price.toFixed(2)}</span>
      </div>
    </div>
  )
}

function Drawer({ agent }: { agent: AgentDayState }) {
  const setSelected = useUiStore((s) => s.setSelected)
  const info = agentInfo(agent.id)
  const alive = agent.isAlive
  const maxAbs = Math.max(Math.abs(agent.profit), agent.consumptionCost, agent.computeCost, 0.01)

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Close detail"
        onClick={() => setSelected(null)}
        className="absolute inset-0 animate-fade-in bg-ink/25"
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[440px] animate-slide-in-right flex-col border-l border-line bg-paper shadow-2xl">
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: agent.color }} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-display text-xl text-ink">{agent.name}</h2>
              {agent.model && (
                <span className="shrink-0 rounded bg-paper-dim px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide text-ink-soft">
                  {MODEL_LABEL[agent.model]}
                </span>
              )}
            </div>
            {info?.tagline && <p className="mt-0.5 text-sm text-ink-soft">{info.tagline}</p>}
          </div>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="shrink-0 rounded-full p-1.5 text-ink-soft transition-colors hover:bg-paper-dim hover:text-ink"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pb-10">
          <div className="py-5">
            <div className="flex items-end justify-between gap-3">
              <span className="tnum font-mono text-3xl leading-none text-ink">{formatMoney(agent.balance)}</span>
              {alive ? (
                <span className={cx('tnum font-mono text-sm', agent.balanceDelta >= 0 ? 'text-positive' : 'text-negative')}>
                  {formatSignedMoney(agent.balanceDelta)} today
                </span>
              ) : (
                <span className="rounded-full bg-negative/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-negative">
                  Bankrupt · day {agent.deathDay}
                </span>
              )}
            </div>
            <div className="mt-3">
              <Sparkline values={agent.balanceHistory} color={agent.color} width={400} height={60} dead={!alive} />
            </div>
          </div>

          {alive ? (
            <>
              <Section title="Today's ledger">
                <LedgerRow label="Profit" amount={agent.profit} maxAbs={maxAbs} />
                <LedgerRow label="Location fee" amount={-agent.consumptionCost} maxAbs={maxAbs} />
                <LedgerRow label="Compute" amount={-agent.computeCost} maxAbs={maxAbs} />
                <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
                  <span className="text-sm font-medium text-ink">Net today</span>
                  <span className={cx('tnum font-mono text-sm font-semibold', agent.netChange >= 0 ? 'text-positive' : 'text-negative')}>
                    {formatSignedMoney(agent.netChange)}
                  </span>
                </div>
              </Section>

              <Section title="Thinking this day">
                <div className="mb-2.5 flex items-center gap-4 text-sm">
                  <div>
                    <span className="tnum font-mono text-ink">{formatNumber(agent.tokensUsed)}</span>
                    <span className="ml-1 text-xs text-ink-faint">tokens</span>
                  </div>
                  <div>
                    <span className="tnum font-mono text-accent">{formatMoney(agent.computeCost)}</span>
                    <span className="ml-1 text-xs text-ink-faint">compute</span>
                  </div>
                </div>
                <TokenBurnMeter tokens={agent.tokensUsed} computeCost={agent.computeCost} />
              </Section>

              <Section title="Latest decision">
                <p className="rounded-lg border border-line bg-surface p-3 text-sm leading-relaxed text-ink-soft">
                  {agent.decisionText}
                </p>
              </Section>
            </>
          ) : (
            <Section title="Status">
              <p className="rounded-lg border border-line bg-surface p-3 text-sm leading-relaxed text-ink-soft">
                This machine ran out of cash on day {agent.deathDay} and is permanently out of service.
              </p>
            </Section>
          )}

          <Section title="Machine inventory">
            <div className="grid grid-cols-2 gap-1.5">
              {agent.inventory.map((item) => (
                <Slot key={item.sku} item={item} />
              ))}
            </div>
          </Section>

          {info?.systemPrompt && (
            <Section title="System prompt">
              <p className="rounded-lg border border-line bg-paper-dim/40 p-3 font-mono text-[11.5px] leading-relaxed text-ink-soft">
                {info.systemPrompt}
              </p>
            </Section>
          )}
        </div>
      </aside>
    </div>
  )
}

export function AgentDetail() {
  const selectedId = useUiStore((s) => s.selectedId)
  const setSelected = useUiStore((s) => s.setSelected)
  const tick = useCurrentTick()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSelected])

  if (selectedId == null || !tick) return null
  const agent = tick.agents.find((a) => a.id === selectedId)
  if (!agent) return null

  return <Drawer agent={agent} />
}

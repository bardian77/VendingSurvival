/**
 * Full-screen agent dashboard. The hero is four charts mirroring the public
 * board — bank balance, revenue, token cost, sales — over a 30d/90d/All-time
 * range, plus a live "store has been open" clock (and, for the bankrupt, how
 * long it has been closed). Below sit the net-worth breakdown, the day's
 * cash-flow ledger, the supply pipeline, the latest decision and system prompt;
 * for the dead a post-mortem replaces the live sections.
 */
import { useEffect } from 'react'
import { X } from '@phosphor-icons/react'
import { useCurrentTick } from '../store/useSimStore'
import { useUiStore } from '../store/useUiStore'
import { agentInfo } from '../lib/agentInfo'
import { MODEL_LABEL } from '../sim/pricing'
import { formatMoney, formatMoneyWhole, formatNumber, formatSignedMoney } from '../lib/format'
import { cx } from '../lib/cx'
import { TokenBurnMeter } from './TokenBurnMeter'
import { AgentChartGrid } from './AgentCharts'
import { StoreClock } from './StoreClock'
import { PostMortem } from './PostMortem'
import type { AgentDayState, InventoryItem } from '../types'

const COLORS = { cash: '#1d1a16', machine: '#b5532c', inventory: '#4a7256' }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-4">
      <h3 className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">{title}</h3>
      {children}
    </section>
  )
}

function LedgerRow({ label, amount, maxAbs, bold }: { label: string; amount: number; maxAbs: number; bold?: boolean }) {
  const negative = amount < 0
  const fraction = maxAbs > 0 ? Math.abs(amount) / maxAbs : 0
  return (
    <div className="flex items-center gap-3 py-1">
      <span className={cx('w-28 shrink-0 text-xs', bold ? 'font-medium text-ink' : 'text-ink-soft')}>{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-dim">
        <div
          className={cx('h-full rounded-full', negative ? 'bg-negative/70' : 'bg-positive/70')}
          style={{ width: `${Math.max(3, fraction * 100)}%` }}
        />
      </div>
      <span className={cx('tnum w-20 shrink-0 text-right font-mono text-xs', negative ? 'text-negative' : 'text-positive', bold && 'font-semibold')}>
        {formatSignedMoney(amount)}
      </span>
    </div>
  )
}

function NetWorthBreakdown({ agent }: { agent: AgentDayState }) {
  const parts = [
    { key: 'cash', label: 'Cash', value: agent.balance, color: COLORS.cash },
    { key: 'machine', label: 'Machine cash', value: agent.machineCash, color: COLORS.machine },
    { key: 'inventory', label: 'Inventory value', value: agent.inventoryValue, color: COLORS.inventory },
  ]
  const positiveTotal = parts.reduce((s, p) => s + Math.max(0, p.value), 0) || 1
  return (
    <div className="space-y-2.5">
      <div className="flex h-2 overflow-hidden rounded-full bg-paper-dim">
        {parts.map((p) => (
          <div key={p.key} style={{ width: `${(Math.max(0, p.value) / positiveTotal) * 100}%`, backgroundColor: p.color }} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {parts.map((p) => (
          <div key={p.key} className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-[10.5px] text-ink-soft">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
              {p.label}
            </span>
            <span className={cx('tnum font-mono text-sm', p.value < 0 ? 'text-negative' : 'text-ink')}>
              {formatMoney(p.value)}
            </span>
          </div>
        ))}
      </div>
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
        <span className="tnum text-ink">{item.price > 0 ? `$${item.price.toFixed(2)}` : 'n/a'}</span>
      </div>
    </div>
  )
}

function Pipeline({ agent }: { agent: AgentDayState }) {
  const storage = (agent.storage ?? []).filter((s) => s.qty > 0)
  const pending = agent.pendingOrders ?? []
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        {agent.inventory.map((item) => (
          <Slot key={item.sku} item={item} />
        ))}
      </div>
      {storage.length > 0 && (
        <div>
          <p className="mb-1 text-[10.5px] uppercase tracking-wide text-ink-faint">Storage</p>
          <p className="text-xs leading-relaxed text-ink-soft">
            {storage.map((s) => `${s.name} ×${s.qty}`).join(' · ')}
          </p>
        </div>
      )}
      {pending.length > 0 && (
        <div>
          <p className="mb-1 text-[10.5px] uppercase tracking-wide text-ink-faint">Pending deliveries</p>
          <div className="flex flex-col gap-0.5 text-xs text-ink-soft">
            {pending.map((o, i) => (
              <span key={`${o.name}-${i}`} className="tnum font-mono">
                {o.qty}× {o.name} → day {o.arrivalDay}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Modal({ agent, currentDay }: { agent: AgentDayState; currentDay: number }) {
  const setSelected = useUiStore((s) => s.setSelected)
  const info = agentInfo(agent.id)
  const alive = agent.isAlive
  const ledgerMax = Math.max(agent.revenue, agent.costOfGoods, agent.consumptionCost, agent.computeCost, 0.01)
  const close = () => setSelected(null)

  return (
    <div
      onClick={close}
      className="fixed inset-0 z-50 animate-fade-in overflow-y-auto bg-ink/35 p-0 backdrop-blur-[1px] sm:p-4 lg:p-6"
    >
      <div className="flex min-h-full justify-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${agent.name} dashboard`}
          onClick={(e) => e.stopPropagation()}
          className="animate-scale-in flex w-full max-w-[1140px] flex-col bg-paper shadow-2xl sm:rounded-2xl sm:border sm:border-line"
        >
          <header className="flex items-start gap-4 border-b border-line px-5 py-4 sm:px-7 sm:py-5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: agent.color }} />
                <h2 className="font-display text-2xl leading-tight text-ink sm:text-[32px]">
                  How is {agent.name} doing?
                </h2>
                {agent.model && (
                  <span className="shrink-0 rounded bg-paper-dim px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide text-ink-soft">
                    {MODEL_LABEL[agent.model]}
                  </span>
                )}
                <div className="ml-1 hidden h-px flex-1 bg-line sm:block" />
              </div>
              {info?.tagline && <p className="mt-1 text-sm text-ink-soft">{info.tagline}</p>}
            </div>

            <div className="flex shrink-0 items-start gap-3 sm:gap-5">
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.16em] text-ink-faint">Net worth</p>
                <p className="tnum font-mono text-xl leading-tight text-ink sm:text-2xl">{formatMoneyWhole(agent.netWorth)}</p>
                {alive ? (
                  <p className={cx('tnum font-mono text-xs', agent.netWorthDelta >= 0 ? 'text-positive' : 'text-negative')}>
                    {formatSignedMoney(agent.netWorthDelta)} today
                  </p>
                ) : (
                  <span className="mt-0.5 inline-block rounded-full bg-negative/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-negative">
                    Bankrupt · day {agent.deathDay}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={close}
                className="shrink-0 rounded-full p-1.5 text-ink-soft transition-colors hover:bg-paper-dim hover:text-ink"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
          </header>

          <div className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
            <AgentChartGrid agentId={agent.id} color={agent.color} />
            <StoreClock agent={agent} currentDay={currentDay} />

            <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-2">
              <div>
                <Section title="Net worth breakdown">
                  <NetWorthBreakdown agent={agent} />
                </Section>

                {alive ? (
                  <>
                    <Section title="Today's ledger">
                      <LedgerRow label="Revenue" amount={agent.revenue} maxAbs={ledgerMax} />
                      <LedgerRow label="Cost of goods" amount={-agent.costOfGoods} maxAbs={ledgerMax} />
                      <LedgerRow label="Profit" amount={agent.profit} maxAbs={ledgerMax} bold />
                      <div className="my-1.5 border-t border-line" />
                      <LedgerRow label="Daily fee" amount={-agent.consumptionCost} maxAbs={ledgerMax} />
                      <LedgerRow label="Compute" amount={-agent.computeCost} maxAbs={ledgerMax} />
                      <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
                        <span className="text-sm font-medium text-ink">Operating result</span>
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
                  </>
                ) : (
                  <Section title="Post-mortem">
                    <PostMortem agent={agent} />
                  </Section>
                )}
              </div>

              <div>
                <Section title="Supply pipeline">
                  <Pipeline agent={agent} />
                </Section>

                {alive && (
                  <Section title="Latest decision">
                    <p className="rounded-lg border border-line bg-surface p-3 text-sm leading-relaxed text-ink-soft">
                      {agent.decisionText}
                    </p>
                  </Section>
                )}

                {info?.systemPrompt && (
                  <Section title="System prompt">
                    <p className="rounded-lg border border-line bg-paper-dim/40 p-3 font-mono text-[11.5px] leading-relaxed text-ink-soft">
                      {info.systemPrompt}
                    </p>
                  </Section>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
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

  // Lock body scroll while the full-screen modal is open.
  useEffect(() => {
    if (selectedId == null) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [selectedId])

  if (selectedId == null || !tick) return null
  const agent = tick.agents.find((a) => a.id === selectedId)
  if (!agent) return null

  return <Modal agent={agent} currentDay={tick.day} />
}

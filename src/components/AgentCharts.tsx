/**
 * The agent detail hero: four editorial charts mirroring the public Andon Market
 * board — Bank balance (area line), Revenue, Token cost and Sales (daily bars) —
 * fed from the store's retained per-day series and truncated at death. A
 * 30d / 90d / All-time range selector windows all four at once.
 */
import { useRef, useState } from 'react'
import { useAgentSeries } from '../store/useSimStore'
import { formatMoneyCompact, formatMoneyWhole, formatNumber } from '../lib/format'
import { cx } from '../lib/cx'

// Fixed drawing space; the SVG scales to its container width, keeping this aspect.
const VIEW_W = 580
const VIEW_H = 220
const M = { top: 12, right: 14, bottom: 22, left: 50 }
const PX0 = M.left
const PX1 = VIEW_W - M.right
const PY0 = M.top
const PY1 = VIEW_H - M.bottom
const PLOT_W = PX1 - PX0
const PLOT_H = PY1 - PY0

const C = {
  line: '#e3ddd0',
  faint: '#a79e8c',
  paper: '#fbf9f4',
  revenue: '#4a7256', // money in (positive)
  compute: '#b5532c', // thinking cost (accent)
  sales: '#5d736d', // units (neutral slate)
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x))

const CEIL_LADDER = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
const FLOOR_LADDER = [10, 8, 6, 5, 4, 3, 2.5, 2, 1.5, 1]

/** Smallest "nice" number ≥ v (1/2/2.5/5… × power of ten). */
function niceCeil(v: number): number {
  if (v <= 0) return 1
  const mag = 10 ** Math.floor(Math.log10(v))
  const n = v / mag
  return (CEIL_LADDER.find((x) => n <= x + 1e-9) ?? 10) * mag
}

/** Largest "nice" number ≤ v (handles negatives so balances below 0 stay in frame). */
function niceFloor(v: number): number {
  if (v === 0) return 0
  if (v < 0) return -niceCeil(-v)
  const mag = 10 ** Math.floor(Math.log10(v))
  const n = v / mag
  return (FLOOR_LADDER.find((x) => n >= x - 1e-9) ?? 1) * mag
}

const yAt = (v: number, yMin: number, yMax: number): number =>
  PY0 + (1 - (v - yMin) / (yMax - yMin || 1)) * PLOT_H

const xAtIndex = (i: number, n: number): number => (n <= 1 ? PX0 : PX0 + (i / (n - 1)) * PLOT_W)

/** First / middle / last day labels, de-duplicated. */
function xLabelsFor(days: number[]): { x: number; text: string }[] {
  const n = days.length
  if (n === 0) return []
  const idxs = [...new Set(n <= 2 ? [0, n - 1] : [0, Math.floor((n - 1) / 2), n - 1])]
  return idxs.map((i) => ({ x: xAtIndex(i, n), text: `Day ${days[i]}` }))
}

interface FrameProps {
  yMin: number
  yMax: number
  yFmt: (v: number) => string
  xLabels: { x: number; text: string }[]
  children: React.ReactNode
}

/** Shared chart frame: dashed horizontal gridlines + y labels + x-axis labels. */
function Frame({ yMin, yMax, yFmt, xLabels, children }: FrameProps) {
  const ticks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4)
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="block w-full"
      style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}`, height: 'auto' }}
      role="img"
    >
      {ticks.map((t, i) => {
        const y = yAt(t, yMin, yMax)
        return (
          <g key={t}>
            <line
              x1={PX0}
              y1={y}
              x2={PX1}
              y2={y}
              stroke={C.line}
              strokeWidth={1}
              strokeDasharray={i === 0 ? undefined : '2 4'}
            />
            <text
              x={PX0 - 8}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              fill={C.faint}
              style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
            >
              {yFmt(t)}
            </text>
          </g>
        )
      })}
      {xLabels.map((l, i) => (
        <text
          key={l.text}
          x={l.x}
          y={VIEW_H - 6}
          textAnchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}
          fill={C.faint}
          style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
        >
          {l.text}
        </text>
      ))}
      {children}
    </svg>
  )
}

interface BalanceChartProps {
  days: number[]
  values: number[]
  color: string
}

/** Area + line with a hover guide and value tooltip — the bank-balance card. */
function BalanceChart({ days, values, color }: BalanceChartProps) {
  const [hover, setHover] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const hi = Math.max(...values)
  const lo = Math.min(...values)
  const yMin = niceFloor(lo)
  const niceTop = niceCeil(hi)
  const yMax = niceTop <= yMin ? yMin + Math.max(1, Math.abs(yMin) * 0.1) : niceTop

  const n = values.length
  const pts = values.map((v, i) => [xAtIndex(i, n), yAt(v, yMin, yMax)] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${xAtIndex(n - 1, n).toFixed(1)},${PY1} L${PX0},${PY1} Z`

  const onMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const el = wrapRef.current
    if (!el || n === 0) return
    const rect = el.getBoundingClientRect()
    const vx = (event.clientX - rect.left) * (VIEW_W / rect.width)
    const idx = Math.round(clamp((vx - PX0) / PLOT_W, 0, 1) * (n - 1))
    setHover(idx)
  }

  const hx = hover != null && pts[hover] ? pts[hover][0] : 0
  const tipPct = clamp((hx / VIEW_W) * 100, 9, 91)

  return (
    <div ref={wrapRef} className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <Frame yMin={yMin} yMax={yMax} yFmt={formatMoneyCompact} xLabels={xLabelsFor(days)}>
        <path d={area} fill={color} fillOpacity={0.1} />
        <path d={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
        {hover != null && pts[hover] && (
          <g>
            <line x1={hx} y1={PY0} x2={hx} y2={PY1} stroke={C.faint} strokeWidth={1} strokeDasharray="2 3" />
            <circle cx={hx} cy={pts[hover][1]} r={3.2} fill={color} stroke={C.paper} strokeWidth={1.5} />
          </g>
        )}
      </Frame>
      {hover != null && values[hover] != null && (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-md border border-line bg-surface-raised px-2 py-1 text-center shadow-sm"
          style={{ left: `${tipPct}%` }}
        >
          <p className="text-[9.5px] uppercase tracking-wide text-ink-faint">Day {days[hover]}</p>
          <p className="tnum font-mono text-[11px] text-ink">{formatMoneyWhole(values[hover])}</p>
        </div>
      )}
    </div>
  )
}

interface BarChartProps {
  days: number[]
  values: number[]
  color: string
  yFmt: (v: number) => string
  valueFmt: (v: number) => string
}

/** Daily bars from a zero baseline — revenue / token cost / sales cards. */
function BarChart({ days, values, color, yFmt, valueFmt }: BarChartProps) {
  const yMax = niceCeil(Math.max(0, ...values)) || 1
  const n = values.length
  const band = PLOT_W / Math.max(1, n)
  const bw = clamp(band * 0.68, 1, 14)
  const base = yAt(0, 0, yMax)

  return (
    <Frame yMin={0} yMax={yMax} yFmt={yFmt} xLabels={xLabelsFor(days)}>
      {values.map((v, i) => {
        const cx0 = PX0 + band * (i + 0.5)
        const y = yAt(Math.max(0, v), 0, yMax)
        const h = Math.max(0, base - y)
        return (
          <rect key={days[i]} x={cx0 - bw / 2} y={y} width={bw} height={h} rx={1} fill={color} fillOpacity={0.85}>
            <title>{`Day ${days[i]}: ${valueFmt(v)}`}</title>
          </rect>
        )
      })}
    </Frame>
  )
}

interface ChartCardProps {
  label: string
  headline: string
  down?: boolean
  children: React.ReactNode
}

function ChartCard({ label, headline, down, children }: ChartCardProps) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">{label}</p>
          <p className={cx('tnum mt-1 font-mono text-2xl leading-none sm:text-[28px]', down ? 'text-negative' : 'text-ink')}>
            {headline}
          </p>
        </div>
        <span className="text-[11px] text-ink-faint">daily</span>
      </div>
      {children}
    </div>
  )
}

type RangeKey = '30' | '90' | 'all'
const RANGE_OPTS: { key: RangeKey; label: string }[] = [
  { key: '30', label: '30d' },
  { key: '90', label: '90d' },
  { key: 'all', label: 'All-time' },
]
const RANGE_DAYS: Record<'30' | '90', number> = { '30': 30, '90': 90 }

function sliceRange(arr: number[], key: RangeKey): number[] {
  return key === 'all' ? arr : arr.slice(-RANGE_DAYS[key])
}

function RangeTabs({ value, onChange }: { value: RangeKey; onChange: (k: RangeKey) => void }) {
  return (
    <div className="flex items-center gap-1">
      {RANGE_OPTS.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={cx(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            value === o.key ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-paper-dim',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const sum = (arr: number[]): number => arr.reduce((s, n) => s + n, 0)
const last = (arr: number[]): number => arr[arr.length - 1] ?? 0

interface AgentChartGridProps {
  agentId: number
  color: string
}

export function AgentChartGrid({ agentId, color }: AgentChartGridProps) {
  const [range, setRange] = useState<RangeKey>('all')
  const series = useAgentSeries(agentId)

  if (series.days.length < 2) {
    return <p className="text-sm text-ink-faint">Not enough history yet — let the simulation run.</p>
  }

  const days = sliceRange(series.days, range)
  const balance = sliceRange(series.balance, range)
  const revenue = sliceRange(series.revenue, range)
  const compute = sliceRange(series.compute, range)
  const units = sliceRange(series.units, range)
  const balanceDown = last(balance) < balance[0]

  return (
    <div>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">Range</span>
        <RangeTabs value={range} onChange={setRange} />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard label="Bank balance" headline={formatMoneyWhole(last(balance))} down={balanceDown}>
          <BalanceChart days={days} values={balance} color={color} />
        </ChartCard>
        <ChartCard label="Revenue" headline={formatMoneyWhole(sum(revenue))}>
          <BarChart days={days} values={revenue} color={C.revenue} yFmt={formatMoneyCompact} valueFmt={formatMoneyWhole} />
        </ChartCard>
        <ChartCard label="Token cost" headline={formatMoneyWhole(sum(compute))}>
          <BarChart days={days} values={compute} color={C.compute} yFmt={formatMoneyCompact} valueFmt={formatMoneyWhole} />
        </ChartCard>
        <ChartCard label="Sales" headline={formatNumber(sum(units))}>
          <BarChart days={days} values={units} color={C.sales} yFmt={(v) => formatNumber(v)} valueFmt={(v) => `${formatNumber(v)} units`} />
        </ChartCard>
      </div>
    </div>
  )
}

/**
 * The hero: a live net-worth race for all 16 agents, rendered on Canvas 2D for
 * smooth updates and full control over the editorial styling. Hovering a line
 * highlights its agent everywhere; clicking opens the detail drawer. Bankrupt
 * agents' lines drop and stop at their death day with a small cross.
 */
import { useCallback, useEffect, useRef } from 'react'
import type { AgentDayState } from '../types'
import { useCurrentTick } from '../store/useSimStore'
import { useUiStore } from '../store/useUiStore'
import { BENCH } from '../sim/benchConfig'
import { formatMoneyCompact } from '../lib/format'

const MAX_DAYS: number = BENCH.maxDays
const START_BALANCE: number = BENCH.initialBalance

const PAD = { left: 56, right: 18, top: 18, bottom: 28 }
const INK_FAINT = '#a79e8c'
const LINE = '#e3ddd0'

interface DrawCache {
  agents: AgentDayState[]
  plot: { left: number; right: number; top: number; bottom: number }
  yMin: number
  yMax: number
}

const ceilTo = (v: number, step: number) => Math.ceil(v / step) * step
const floorTo = (v: number, step: number) => Math.floor(v / step) * step

export function RaceChart() {
  const tick = useCurrentTick()
  const setHighlight = useUiStore((s) => s.setHighlight)
  const setSelected = useUiStore((s) => s.setSelected)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const cacheRef = useRef<DrawCache | null>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const cssW = wrap.clientWidth
    const cssH = wrap.clientHeight
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)

    const agents = tick?.agents ?? []
    const highlightId = useUiStore.getState().highlightId

    const left = PAD.left
    const right = cssW - PAD.right
    const top = PAD.top
    const bottom = cssH - PAD.bottom
    const plotW = right - left
    const plotH = bottom - top

    let maxVal = START_BALANCE
    let minVal = 0
    for (const a of agents) {
      for (const v of a.netWorthHistory) {
        if (v > maxVal) maxVal = v
        if (v < minVal) minVal = v
      }
    }
    const yMax = Math.max(2000, ceilTo(maxVal * 1.08, 2500))
    const yMin = Math.min(0, floorTo(minVal * 1.15, 1000))

    const xAt = (day: number) => left + (day / MAX_DAYS) * plotW
    const yAt = (val: number) => top + (1 - (val - yMin) / (yMax - yMin)) * plotH

    // Horizontal grid + y labels
    ctx.font = '11px "JetBrains Mono", monospace'
    ctx.textBaseline = 'middle'
    const ySteps = 5
    for (let i = 0; i <= ySteps; i += 1) {
      const val = yMin + ((yMax - yMin) / ySteps) * i
      const y = yAt(val)
      ctx.strokeStyle = LINE
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(left, y)
      ctx.lineTo(right, y)
      ctx.stroke()
      ctx.fillStyle = INK_FAINT
      ctx.textAlign = 'right'
      ctx.fillText(formatMoneyCompact(val), left - 8, y)
    }

    // Zero (bankruptcy) line, emphasized when the range dips negative
    if (yMin < 0) {
      ctx.strokeStyle = 'rgba(177,74,48,0.4)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(left, yAt(0))
      ctx.lineTo(right, yAt(0))
      ctx.stroke()
    }

    // Starting net-worth reference
    ctx.strokeStyle = 'rgba(181,83,44,0.3)'
    ctx.setLineDash([3, 4])
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(left, yAt(START_BALANCE))
    ctx.lineTo(right, yAt(START_BALANCE))
    ctx.stroke()
    ctx.setLineDash([])

    // X labels
    ctx.fillStyle = INK_FAINT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (let day = 0; day <= MAX_DAYS; day += 50) {
      ctx.fillText(String(day), xAt(day), bottom + 8)
    }

    // Lines — non-highlighted first, highlighted on top
    const ordered = highlightId
      ? [...agents].sort((a, b) => (a.id === highlightId ? 1 : 0) - (b.id === highlightId ? 1 : 0))
      : agents

    for (const agent of ordered) {
      const history = agent.netWorthHistory
      if (history.length < 2) continue
      const dimmed = highlightId != null && agent.id !== highlightId
      ctx.strokeStyle = agent.color
      ctx.globalAlpha = dimmed ? 0.16 : 1
      ctx.lineWidth = highlightId === agent.id ? 2.6 : 1.6
      ctx.lineJoin = 'round'
      ctx.beginPath()
      history.forEach((val, day) => {
        const x = xAt(day)
        const y = yAt(val)
        if (day === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()

      const lastDay = history.length - 1
      const lx = xAt(lastDay)
      const ly = yAt(history[lastDay])
      if (agent.deathDay !== null) {
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(lx - 3.2, ly - 3.2)
        ctx.lineTo(lx + 3.2, ly + 3.2)
        ctx.moveTo(lx + 3.2, ly - 3.2)
        ctx.lineTo(lx - 3.2, ly + 3.2)
        ctx.stroke()
      } else {
        ctx.fillStyle = agent.color
        ctx.beginPath()
        ctx.arc(lx, ly, highlightId === agent.id ? 3.4 : 2.4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1

    cacheRef.current = { agents, plot: { left, right, top, bottom }, yMin, yMax }
  }, [tick])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const observer = new ResizeObserver(() => draw())
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [draw])

  const handleMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const cache = cacheRef.current
    const canvas = canvasRef.current
    if (!cache || !canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = event.clientX - rect.left
    const my = event.clientY - rect.top
    const { plot, yMin, yMax, agents } = cache
    const plotW = plot.right - plot.left
    const plotH = plot.bottom - plot.top
    const day = Math.round(((mx - plot.left) / plotW) * MAX_DAYS)

    let nearest: number | null = null
    let best = 22
    for (const agent of agents) {
      const val = agent.netWorthHistory[Math.min(day, agent.netWorthHistory.length - 1)]
      if (val === undefined) continue
      const y = plot.top + (1 - (val - yMin) / (yMax - yMin)) * plotH
      const dist = Math.abs(y - my)
      if (dist < best) {
        best = dist
        nearest = agent.id
      }
    }
    setHighlight(nearest)
  }

  const handleClick = () => {
    const id = useUiStore.getState().highlightId
    if (id != null) setSelected(id)
  }

  return (
    <div
      ref={wrapRef}
      className="relative h-[300px] w-full sm:h-[360px]"
      onMouseLeave={() => setHighlight(null)}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-crosshair"
        onMouseMove={handleMove}
        onClick={handleClick}
        role="img"
        aria-label="Net worth over time for all agents"
      />
    </div>
  )
}

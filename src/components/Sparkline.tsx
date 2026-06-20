/** Inline-SVG balance sparkline for an agent card. Cheap, crisp, themeable. */
import { useId } from 'react'

interface SparklineProps {
  values: number[]
  color: string
  width?: number
  height?: number
  /** When set, draws a marker at the death point and dims the tail. */
  dead?: boolean
}

export function Sparkline({ values, color, width = 104, height = 30, dead = false }: SparklineProps) {
  const gradId = useId()
  if (values.length < 2) {
    return <svg width="100%" height={height} aria-hidden="true" />
  }

  const min = Math.min(...values, 0)
  const max = Math.max(...values, 1)
  const span = max - min || 1
  const stepX = width / (values.length - 1)

  const points = values.map((value, i) => {
    const x = i * stepX
    const y = height - ((value - min) / span) * (height - 4) - 2
    return [x, y] as const
  })

  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`
  const [lastX, lastY] = points[points.length - 1]

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={dead ? 0.1 : 0.18} />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={dead ? 0.5 : 1}
      />
      {dead ? (
        <path
          d={`M${lastX - 3},${lastY - 3} L${lastX + 3},${lastY + 3} M${lastX + 3},${lastY - 3} L${lastX - 3},${lastY + 3}`}
          stroke={color}
          strokeWidth={1.3}
          opacity={0.7}
        />
      ) : (
        <circle cx={lastX} cy={lastY} r={2.1} fill={color} />
      )}
    </svg>
  )
}

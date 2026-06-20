/**
 * The "thinking costs money" cue: a compact meter of tokens spent this day and
 * the dollar compute cost it incurred. Fill width scales with token spend, so a
 * verbose over-thinker visibly burns more than a lean operator.
 */
import { formatMoney, formatTokens } from '../lib/format'
import { cx } from '../lib/cx'

/** Reference ceiling (~the heaviest over-thinker) for the meter fill. */
const TOKEN_REFERENCE = 40000

interface TokenBurnMeterProps {
  tokens: number
  computeCost: number
  className?: string
}

export function TokenBurnMeter({ tokens, computeCost, className }: TokenBurnMeterProps) {
  const fill = Math.min(1, tokens / TOKEN_REFERENCE)
  const hot = fill > 0.5

  return (
    <div className={cx('flex items-center gap-2', className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-dim">
        <div
          className={cx(
            'h-full rounded-full transition-[width] duration-500 ease-out',
            hot ? 'bg-accent' : 'bg-accent-soft',
          )}
          style={{ width: `${Math.max(4, fill * 100)}%` }}
        />
      </div>
      <span className="tnum shrink-0 font-mono text-[10.5px] text-ink-soft">
        {formatTokens(tokens)} tok · {formatMoney(computeCost)}
      </span>
    </div>
  )
}

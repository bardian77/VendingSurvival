/**
 * DVR scrubber. The fill shows how far the simulation has progressed; the thumb
 * is the day being viewed. Scrub back to inspect history (the sim keeps running)
 * and hit LIVE to snap back to the leading edge. A transparent native range sits
 * on top for keyboard + drag accessibility.
 */
import { useSimStore } from '../store/useSimStore'
import { BENCH } from '../sim/benchConfig'
import { cx } from '../lib/cx'

const MAX_DAYS = BENCH.maxDays

export function Timeline() {
  const viewDay = useSimStore((s) => s.viewDay)
  const latestDay = useSimStore((s) => s.latestDay)
  const following = useSimStore((s) => s.following)
  const scrubTo = useSimStore((s) => s.scrubTo)
  const jumpToLive = useSimStore((s) => s.jumpToLive)

  const horizon = Math.max(MAX_DAYS, latestDay)
  const progressPct = Math.max(0, (latestDay / horizon) * 100)
  const thumbPct = Math.max(0, (viewDay / horizon) * 100)

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-6 flex-1">
        {/* track */}
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-paper-dim" />
        {/* simulated-so-far fill */}
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent-soft/60"
          style={{ left: 0, width: `${progressPct}%` }}
        />
        {/* view thumb */}
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-ink shadow-sm"
          style={{ left: `${thumbPct}%` }}
        />
        <input
          type="range"
          min={0}
          max={horizon}
          value={viewDay}
          onChange={(e) => scrubTo(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Scrub timeline"
        />
      </div>

      <button
        type="button"
        onClick={jumpToLive}
        disabled={following}
        className={cx(
          'tnum shrink-0 rounded-full border px-3 py-1 font-mono text-[11px] transition-colors',
          following
            ? 'cursor-default border-line text-ink-faint'
            : 'border-accent/40 bg-accent-wash text-accent hover:bg-accent/10',
        )}
      >
        {following ? 'LIVE' : 'GO LIVE'}
      </button>
    </div>
  )
}

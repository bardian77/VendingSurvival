/**
 * Surfaces which data source is active and its health. Mock vs live vs
 * reconnecting vs error — so teammates get immediate, legible feedback the
 * moment they point the UI at a real backend.
 */
import { useSimStore } from '../store/useSimStore'
import type { ConnectionStatus } from '../data/DataSource'
import { cx } from '../lib/cx'

const META: Record<ConnectionStatus, { label: string; dot: string; pulse: boolean }> = {
  idle: { label: 'Idle', dot: 'bg-ink-faint', pulse: false },
  mock: { label: 'Mock data', dot: 'bg-ink-soft', pulse: true },
  connecting: { label: 'Connecting', dot: 'bg-warning', pulse: true },
  live: { label: 'Live', dot: 'bg-positive', pulse: true },
  reconnecting: { label: 'Reconnecting', dot: 'bg-warning', pulse: true },
  error: { label: 'Stream error', dot: 'bg-negative', pulse: false },
  complete: { label: 'Run complete', dot: 'bg-accent', pulse: false },
}

export function ConnectionBadge() {
  const status = useSimStore((s) => s.status)
  const detail = useSimStore((s) => s.statusDetail)
  const meta = META[status]

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5"
      title={detail || meta.label}
    >
      <span className="relative flex h-2 w-2">
        {meta.pulse && (
          <span className={cx('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', meta.dot)} />
        )}
        <span className={cx('relative inline-flex h-2 w-2 rounded-full', meta.dot)} />
      </span>
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">
        {meta.label}
      </span>
    </div>
  )
}

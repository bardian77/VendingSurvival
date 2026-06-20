/** Play / pause, speed, and replay controls. Delegates to the store. */
import { ArrowCounterClockwise, Pause, Play } from '@phosphor-icons/react'
import { useSimStore } from '../store/useSimStore'
import { cx } from '../lib/cx'

const SPEEDS = [0.5, 1, 2, 4, 8] as const

export function PlaybackControls() {
  const isPlaying = useSimStore((s) => s.isPlaying)
  const speed = useSimStore((s) => s.speed)
  const status = useSimStore((s) => s.status)
  const togglePlay = useSimStore((s) => s.togglePlay)
  const setSpeed = useSimStore((s) => s.setSpeed)
  const restart = useSimStore((s) => s.restart)

  const isComplete = status === 'complete'

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={isComplete ? restart : togglePlay}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink text-paper transition-transform duration-150 ease-out active:scale-95"
        aria-label={isComplete ? 'Replay' : isPlaying ? 'Pause' : 'Play'}
      >
        {isComplete ? (
          <ArrowCounterClockwise size={16} weight="bold" />
        ) : isPlaying ? (
          <Pause size={16} weight="fill" />
        ) : (
          <Play size={16} weight="fill" />
        )}
      </button>

      <button
        type="button"
        onClick={restart}
        className="hidden h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition-colors hover:text-ink sm:inline-flex"
        aria-label="Restart run"
        title="Restart run"
      >
        <ArrowCounterClockwise size={15} />
      </button>

      <div className="flex items-center overflow-hidden rounded-full border border-line bg-surface" role="group" aria-label="Playback speed">
        {SPEEDS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setSpeed(value)}
            className={cx(
              'tnum px-2.5 py-1.5 font-mono text-[11px] transition-colors',
              speed === value ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink',
            )}
          >
            {value}×
          </button>
        ))}
      </div>
    </div>
  )
}

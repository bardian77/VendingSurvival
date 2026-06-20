/** Masthead: title, the one-line thesis, and the live connection badge. */
import { ConnectionBadge } from './ConnectionBadge'

export function TopBar() {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="font-display text-3xl leading-none tracking-tight text-ink sm:text-[2.6rem]">
          Vending Survival
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Sixteen AI agents each run a vending machine. Every token spent thinking is deducted from
          its balance: think too much and compute bankrupts you, think too little and bad decisions
          do. Watch which configuration finds the sweet spot.
        </p>
      </div>
      <div className="shrink-0">
        <ConnectionBadge />
      </div>
    </header>
  )
}

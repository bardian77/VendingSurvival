# Vending Survival

A real-time dashboard where **16 AI agents each run a vending machine** — and
**thinking costs money**. Every token an agent spends making a decision is
deducted from its balance. Think too much and compute bankrupts you; think too
little and bad decisions do. The dashboard visualizes the race to find the
configuration that thinks *exactly* as much as a decision is worth.

Built on the mechanics of the open-source [Vending-Bench](https://andonlabs.com/evals/vending-bench)
benchmark: $500 starting cash, a $2/day location fee, a ~300-day run.

```
balance(today) = balance(yesterday) + profit − location fee − compute cost
```

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run test     # unit tests (Vitest)
npm run build    # type-check + production build
```

The dashboard runs a full, deterministic simulation **in the browser** — no
backend or API keys needed. It is demo-ready out of the box.

## What you see

- **Balance race** — a live chart of all 16 agents; lines fan out from $500,
  dead agents stop at their bankruptcy day. Hover to highlight, click to inspect.
- **Agent grid** — per-agent balance, delta, sparkline, a **token-burn meter**
  (the cost of thinking), and the decision it just made.
- **Standings & Graveyard** — survivors ranked by balance; the bankrupt sorted by
  when they died.
- **Detail drawer** — the survival-formula ledger, inventory, token spend, and
  the system prompt that defines each agent's reasoning.
- **DVR controls** — play / pause, 0.5×–8× speed, and a scrubber to replay any day.

In the default run, the **Lean Operator** (cheap model, decisive) wins, all three
**Opus over-thinkers** bankrupt early on compute, and **Gut Instinct** (no
thinking) bleeds out late on bad decisions — the whole thesis on one screen.

## Plugging in a real backend

The UI reads a single validated contract, fed today by the in-browser mock and
tomorrow by a real Python/Vending-Bench backend — **with zero UI changes**.

- [`docs/CONTRACT.md`](docs/CONTRACT.md) — the `SimulationTick` JSON shape and the
  survival invariant.
- [`docs/HANDOFF.md`](docs/HANDOFF.md) — step-by-step "connect your backend",
  including a runnable example server.

Point the same UI at a live stream with no rebuild:

```
http://localhost:5173/?source=ws&ws=ws://localhost:8787
```

## Architecture

```
src/
  types.ts            # the SimulationTick contract (shared with the backend team)
  schema.ts           # Zod validation + normalizeTick() — the validated boundary
  sim/                # the in-browser mock backend (deterministic engine, 16 agents)
  data/               # DataSource interface · MockSource · StreamSource (WebSocket)
  store/              # Zustand: appends ticks, DVR view state, playback
  components/         # the editorial dashboard UI (Canvas race chart, grid, drawer…)
  lib/                # palette, formatters
docs/                 # CONTRACT.md · HANDOFF.md
```

Stack: Vite · React · TypeScript · Tailwind v4 · Zustand · Zod · Vitest.

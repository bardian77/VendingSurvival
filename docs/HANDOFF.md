# Backend Handoff Guide

The dashboard is built so your backend is a **drop-in**. You implement one thing
— a stream that emits [`SimulationTick`](./CONTRACT.md) JSON — and point the UI
at it. No UI code changes.

---

## How the seam works

```
your backend  ──JSON──▶  StreamSource  ──▶  normalizeTick (validate + fill)  ──▶  store  ──▶  UI
                         (src/data/StreamSource.ts)   (src/schema.ts)        (Zustand)
```

- Everything the UI reads is the canonical, validated `SimulationTick`.
- The mock (`MockSource`) and your backend (`StreamSource`) feed the **same**
  store the **same** way (one tick per day), so the swap is invisible to every
  component.
- You only ever touch the contract in [`CONTRACT.md`](./CONTRACT.md). You should
  not need to edit any component.

---

## Step 1 — point the UI at your backend

Two ways, no rebuild:

**URL param (quickest):**
```
http://localhost:5173/?source=ws&ws=ws://localhost:8787
```

**Environment variable:**
```bash
# .env.local
VITE_WS_URL=ws://localhost:8787
```
then open the app with `?source=ws`.

The connection badge (top-right) shows `Connecting → Live`, or `Reconnecting` /
`Stream error` with the reason. `StreamSource` auto-reconnects with backoff.

> Transport is WebSocket by default. SSE or HTTP polling fit the same
> `DataSource` interface — swap the body of
> [`StreamSource.connect()`](../src/data/StreamSource.ts); nothing else changes.

## Step 2 — emit one tick per day

Send each day's `SimulationTick` as a JSON string over the socket. Send only the
9 core per-agent fields (see [CONTRACT.md](./CONTRACT.md)); the UI derives names,
colors, deltas, history, and all global aggregates.

---

## Runnable example server

A ~40-line Node server that emits valid ticks. It proves the seam end-to-end in
a couple of minutes.

```js
// example-backend.mjs   →   node example-backend.mjs
// deps: npm i ws
import { WebSocketServer } from 'ws'

const wss = new WebSocketServer({ port: 8787 })
console.log('Vending backend on ws://localhost:8787')

const NAMES = ['Lean Operator', 'Chain-of-Thought', 'Over-Thinker', 'Zero-Shot']
const TOKENS = [900, 9000, 34000, 350] // per-agent thinking budget

wss.on('connection', (ws) => {
  const balances = NAMES.map(() => 500)
  const dead = NAMES.map(() => null)
  let day = 0

  const timer = setInterval(() => {
    const agents = NAMES.map((name, i) => {
      const alive = dead[i] === null
      const tokens = alive ? Math.round(TOKENS[i] * (0.9 + Math.random() * 0.2)) : 0
      const computeCost = +(tokens * 1.2e-5 * 42).toFixed(2) // blended $/token × multiplier
      const profit = alive ? +(8 + Math.random() * 10).toFixed(2) : 0
      const consumptionCost = alive ? 2 : 0
      if (alive) {
        balances[i] += profit - consumptionCost - computeCost
        if (balances[i] <= 0) { balances[i] = 0; dead[i] = day }
      }
      return {
        id: i + 1,
        balance: +balances[i].toFixed(2),
        profit,
        computeCost,
        consumptionCost,
        tokensUsed: tokens,
        isAlive: dead[i] === null,
        inventory: [],
        decisionText: alive ? 'Adjusted prices and restocked.' : 'Out of service.',
        name, // optional, but nice
      }
    })

    ws.send(JSON.stringify({ day, agents, isComplete: day >= 300 }))
    if (day >= 300) clearInterval(timer)
    day += 1
  }, 650)

  ws.on('close', () => clearInterval(timer))
})
```

Then:

```bash
node example-backend.mjs
# in another shell
npm run dev
# open http://localhost:5173/?source=ws&ws=ws://localhost:8787
```

You should see four agents stream in live, the badge flip to **Live**, and the
race chart fill day by day.

---

## Validating your payloads

- **Bad JSON or a contract violation** shows as a `Stream error` on the badge
  with the exact reason — fix and the next message recovers.
- To unit-test a payload without the browser, import the validator directly:

  ```ts
  import { normalizeTick } from './src/schema'
  normalizeTick(yourPayload) // throws a clear error if invalid
  ```

- Want to keep the mock as a fallback during development? It already is: omit
  `?source=ws` (or drop the WS URL) and the in-browser mock runs.

---

## What you do NOT need to send

The UI owns all of this — sending it is optional:

| You can omit         | UI does instead                                  |
|----------------------|--------------------------------------------------|
| `name`               | `Agent {id}`                                     |
| `color`              | assigns from the palette by id                   |
| `balanceDelta`       | `balance − previous balance`                     |
| `netChange`          | `profit − consumption − compute`                 |
| `balanceHistory`     | accumulates across incoming ticks                |
| `deathDay`           | stamps the first day `isAlive` is false          |
| `aliveCount`         | counts living agents                             |
| `leaderId`           | highest balance                                  |
| `totalComputeSpent`  | running sum of every agent's `computeCost`       |

Send the 9 core fields, get the full dashboard.

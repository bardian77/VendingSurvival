# Data Contract — `SimulationTick`

This is the single source of truth between the backend and the dashboard, aligned
to the team's `vending_bench.py`. The backend emits one `SimulationTick` JSON
object **per simulated day**. The UI validates and normalizes every message at one
boundary (`src/schema.ts` → `normalizeTick`), so the contract below is exactly
what the UI accepts.

TypeScript definitions live in [`src/types.ts`](../src/types.ts); the Zod
validator lives in [`src/schema.ts`](../src/schema.ts).

---

## The score and the survival condition

The headline metric is **net worth** (Vending-Bench's primary score):

```
netWorth = cash balance + uncollected machine cash + wholesale value of owned inventory
```

`netWorth` is always **derived by the UI** from `balance + machineCash +
inventoryValue`, so a backend never sends it.

Survival is about cash, not net worth: an agent that cannot pay the daily fee for
too many consecutive days goes **bankrupt** (the mock uses 10). Send `unpaidDays`
and the UI shows the bankruptcy risk; send `isAlive: false` once it fails.

Project overlay (not in the benchmark): **compute cost** drains the agent's cash
each day, so an over-thinker can bankrupt itself on tokens even while holding net
worth in inventory.

---

## Tick shape

```jsonc
{
  "day": 12,                 // required, integer ≥ 0
  "agents": [ /* … */ ],     // required, one entry per agent (≥ 1)

  "event": null,             // optional — a global demand event, or null
  "isComplete": false,       // optional — true when the run is over

  // Optional aggregates — the UI derives these from agents[] if omitted:
  "aliveCount": 14,
  "leaderId": 13,            // highest net worth
  "totalComputeSpent": 9452.49
}
```

## Agent shape

The contract is **forgiving**: the UI fills in or derives everything it can.

```jsonc
{
  // ── core: what a backend must send ──
  "id": 1,                   // required, positive int, stable across days
  "balance": 512.40,         // required — liquid cash on hand
  "profit": 16.40,           // revenue − COGS this day
  "computeCost": 7.48,       // $ deducted for tokens (the novel mechanic)
  "consumptionCost": 2,      // fixed daily fee
  "tokensUsed": 2578,
  "isAlive": true,
  "inventory": [             // loaded machine slots (see below)
    { "sku": "Coke", "name": "Coke", "size": "small",
      "quantity": 10, "price": 3.12, "wholesale": 0.60 }
  ],
  "decisionText": "Collected the machine cash and topped up Red Bull.",

  // ── bench economy: send these to model net worth ──
  "machineCash": 141.48,     // uncollected cash in the machine
  "inventoryValue": 148.15,  // wholesale value of owned inventory (machine + storage + in transit)
  "revenue": 141.48,         // sales revenue this day
  "costOfGoods": 29.90,      // wholesale cost of units sold this day
  "unitsSold": 84,
  "unpaidDays": 0,           // consecutive days unable to pay the fee
  "storage": [ { "name": "Water", "qty": 12 } ],
  "pendingOrders": [ { "name": "Water", "qty": 27, "arrivalDay": 367 } ],

  // ── optional / derived by the UI ──
  "name": "Coke Co",         // else "Agent {id}"
  "color": "#c2603f",        // else assigned from the palette by id
  "model": "sonnet",         // "opus" | "sonnet" | "haiku" — shown if present
  "deathDay": null,          // else stamped the first day isAlive=false
  "netWorthHistory": [500, 512.4]  // else accumulated from incoming ticks
}
```

Strictly required: `day`, a non-empty `agents`, and each agent's `id` + `balance`.
Everything else has a sensible default. The UI derives `netWorth`,
`netWorthDelta`, `balanceDelta`, `netChange`, and accumulates the history series.

### Inventory item (a loaded machine slot)

```jsonc
{
  "sku": "Coke",             // required (the product name doubles as the sku)
  "name": "Coke",            // optional, defaults to sku
  "size": "small",           // "small" | "large" (else "small")
  "quantity": 10,            // optional, default 0
  "price": 3.12,             // optional, default 0 (0 = no price set)
  "wholesale": 0.60          // optional, default 0
}
```

### Global event (optional)

```jsonc
{
  "type": "supply_disruption",  // heatwave | coldsnap | supply_disruption | payday_surge | demand_dip
  "label": "Supply disruption",
  "description": "A regional shortage dampens sales building-wide.",
  "magnitude": 0.82             // demand multiplier this day (1.0 = neutral)
}
```

---

## Minimal valid tick

Enough to render the whole dashboard:

```json
{
  "day": 0,
  "agents": [
    { "id": 1, "balance": 500, "machineCash": 0, "inventoryValue": 0 },
    { "id": 2, "balance": 480, "machineCash": 0, "inventoryValue": 0 }
  ]
}
```

---

## Notes

- **Incremental.** Send one tick per day; the UI appends each day and grows the
  net-worth / cash history itself.
- **Idempotent on re-send.** Re-sending the same `day` replaces that day.
- **Validation errors surface.** A malformed message shows a `Stream error`
  status with the reason; it never breaks the UI.

See [`HANDOFF.md`](./HANDOFF.md) for how to point the UI at your backend and a
runnable example server.

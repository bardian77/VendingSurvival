# Data Contract — `SimulationTick`

This is the single source of truth between the backend and the dashboard. The
backend emits one `SimulationTick` JSON object **per simulated day**. The UI
validates and normalizes every message at one boundary (`src/schema.ts` →
`normalizeTick`), so the contract below is exactly what the UI accepts.

The TypeScript definitions live in [`src/types.ts`](../src/types.ts); the Zod
validator lives in [`src/schema.ts`](../src/schema.ts).

---

## The survival invariant

Every day, for every agent:

```
newBalance = oldBalance + profit − consumptionCost − computeCost
```

When `balance` reaches 0 the agent is bankrupt: send `isAlive: false`. It then
stays dead permanently (keep sending it with `isAlive: false`, or stop sending
it — the UI freezes its last state either way).

- `profit` = revenue − cost of goods sold that day (may be negative)
- `consumptionCost` = the fixed daily location fee (the base benchmark uses `2`)
- `computeCost` = dollars charged for the tokens the agent spent thinking — the
  novel mechanic. Convert your token count to dollars however you like.

---

## Tick shape

```jsonc
{
  "day": 12,                 // required, integer ≥ 0 — the simulated day
  "agents": [ /* … */ ],     // required, one entry per agent (≥ 1)

  "event": null,             // optional — a global event this day, or null
  "isComplete": false,       // optional — true when the run is over

  // Optional aggregates — the UI derives these from `agents` if omitted:
  "aliveCount": 15,
  "leaderId": 1,
  "totalComputeSpent": 184.20
}
```

## Agent shape

The contract is **forgiving**: the UI fills in or derives everything it can.
Your real obligation per agent per day is the **9 core fields**. Everything in
the second group is optional.

```jsonc
{
  // ── core (send these) ──
  "id": 1,                   // required, positive integer, stable across days
  "balance": 512.40,         // required, number (decimals ok)
  "profit": 16.40,           // revenue − COGS this day
  "computeCost": 0.18,       // $ deducted for tokens
  "consumptionCost": 2,      // fixed daily fee
  "tokensUsed": 1200,        // tokens spent thinking this day
  "isAlive": true,
  "inventory": [             // 12 machine slots (see below)
    { "sku": "COKE", "name": "Coca-Cola", "category": "drink",
      "quantity": 8, "price": 2.40, "wholesale": 1.20 }
  ],
  "decisionText": "Held prices steady.",

  // ── optional (UI supplies/derives if omitted) ──
  "name": "Lean Operator",   // else "Agent {id}"
  "color": "#c2603f",        // else assigned from the palette by id
  "model": "haiku",          // "opus" | "sonnet" | "haiku" — shown if present
  "deathDay": null,          // else stamped the first day isAlive=false
  "balanceDelta": 12.40,     // else balance − previous balance
  "netChange": 14.22,        // else profit − consumption − compute
  "balanceHistory": [500, 512.40]  // else accumulated from incoming ticks
}
```

Strictly required: `day`, a non-empty `agents`, and each agent's `id` + `balance`.
Everything else has a sensible default. Sending only the 9 core fields gives a
fully-rendered card, sparkline, leaderboard row, and chart line.

### Inventory item

```jsonc
{
  "sku": "COKE",             // required, string
  "name": "Coca-Cola",       // optional, defaults to sku
  "category": "drink",       // optional: "drink" | "snack" | "candy" (else "snack")
  "quantity": 8,             // optional, default 0
  "price": 2.40,             // optional, default 0 — the retail price the agent set
  "wholesale": 1.20          // optional, default 0
}
```

### Global event (optional)

```jsonc
{
  "type": "heatwave",        // "heatwave" | "coldsnap" | "supply_disruption"
                             //   | "payday_surge" | "demand_dip"
  "label": "Heat wave",
  "description": "A scorching stretch sends drink demand soaring.",
  "magnitude": 1.38          // demand multiplier this day (1.0 = neutral)
}
```

---

## Minimal valid tick

This is enough to render the whole dashboard:

```json
{
  "day": 0,
  "agents": [
    { "id": 1, "balance": 500, "profit": 0, "computeCost": 0, "consumptionCost": 2, "tokensUsed": 0, "isAlive": true, "inventory": [], "decisionText": "Opening day." },
    { "id": 2, "balance": 500, "profit": 0, "computeCost": 0, "consumptionCost": 2, "tokensUsed": 0, "isAlive": true, "inventory": [], "decisionText": "Opening day." }
  ]
}
```

---

## Notes

- **Incremental.** Send one tick per day as the run progresses. The UI appends
  each day and grows `balanceHistory` itself, so you never resend history.
- **Idempotent on re-send.** Re-sending the same `day` replaces that day rather
  than duplicating it.
- **Validation errors are surfaced.** A malformed message does not break the UI;
  it shows a `Stream error` status with the validation message. Check the
  connection badge while developing.

See [`HANDOFF.md`](./HANDOFF.md) for how to point the UI at your backend and a
runnable example server.

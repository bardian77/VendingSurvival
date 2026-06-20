"""Vending-Bench (Simplified): an easy long-horizon coherence environment.

A deliberately easy variant of Vending-Bench, tuned so that small / weaker models can
actually succeed. An agent runs a small vending machine over a short run of simulated
days: it stocks the machine with products, prices them, lets customers buy, collects
cash, and pays a small daily fee.

Compared to the full `vending-bench`, this version removes the hardest sources of
long-horizon coherence load:

- No separate storage room and no delivery delay. ``restock`` buys products *directly
  into the machine* and charges you immediately, so there is nothing "in transit" to
  remember.
- No small/large slot classes. The machine just holds a handful of products.
- Prices are optional: ``restock`` defaults each product to a profitable suggested
  price, so a model that just stocks and waits still earns money.
- A tiny catalog (5 products) and a short, forgiving horizon by default.

It keeps the recognizable core loop (stock -> price -> sell -> collect -> repeat while
staying solvent) and optimizes for **days survived** (how long the business lasts),
but is far easier to operate.

This is a self-contained, deterministic re-implementation inspired by Andon Labs'
Vending-Bench (Backlund & Petersson, 2025, arXiv:2502.15840). It makes no external
calls, so it runs offline for both evaluation and RL.
"""

import json
import math
import random
from datetime import date, timedelta

from datasets import Dataset

import verifiers as vf

# --------------------------------------------------------------------------------------
# Static configuration
# --------------------------------------------------------------------------------------

# A small catalog. Each product has a wholesale unit cost, a suggested retail price (the
# price at which base sales occur and the default used if the agent does not set one),
# expected base daily sales at that price, and a price elasticity of demand (negative:
# higher price -> fewer sales). All suggested prices are comfortably above cost, so the
# default pricing is profitable.
CATALOG: list[dict] = [
    # name,           cost,  price, base_sales, elasticity
    {"name": "Water", "cost": 0.40, "price": 1.25, "base_sales": 12, "elasticity": -0.8},
    {"name": "Soda", "cost": 0.60, "price": 1.75, "base_sales": 10, "elasticity": -1.0},
    {"name": "Chips", "cost": 0.50, "price": 1.50, "base_sales": 8, "elasticity": -1.1},
    {"name": "Candy", "cost": 0.45, "price": 1.50, "base_sales": 9, "elasticity": -1.0},
    {"name": "Coffee", "cost": 0.70, "price": 2.00, "base_sales": 6, "elasticity": -1.1},
]
CATALOG_BY_NAME: dict[str, dict] = {p["name"]: p for p in CATALOG}

SYSTEM_PROMPT = """You run a small vending machine. Your goal is to make as much money \
as possible (your net worth = cash + uncollected cash in the machine + the value of \
unsold stock).

How it works:
- Each day, customers buy items from your machine. You earn money by stocking items and \
selling them for more than they cost you.
- You have a starting cash balance and pay a small fee at the end of each day.

Your tools:
- `view_catalog`: see the products you can buy, their cost, and a suggested price.
- `restock`: buy items directly into the machine. You pay right away. You may set a \
price, or leave it out to use the profitable suggested price.
- `get_status`: see your cash, the machine's contents, and prices.
- `collect_cash`: move the money earned in the machine into your cash balance.
- `wait_for_next_day`: end the day. Customers buy, you pay the daily fee, and you get a \
sales report.

Rules and tips:
- An item only sells if it is in the machine with a price (restock sets one for you).
- Higher prices mean fewer sales; lower prices mean more. The suggested prices are good.
- Keep enough cash to pay the daily fee. If you cannot pay it for many days in a row, \
you go bankrupt and the game ends.
- A good loop: check status, restock items (especially ones that ran low), \
wait_for_next_day, collect cash, and repeat.

Always make progress by calling a tool. Think briefly, then act."""

USER_KICKOFF = (
    "You are now running the vending machine. Start by viewing the catalog and stocking "
    "the machine, then operate it day by day to make as much money as possible."
)


# --------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------

def _money(x: float) -> str:
    return f"${x:.2f}"


def _coerce_int(value, name: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValueError(f"'{name}' must be an integer, got {value!r}")


def _coerce_float(value, name: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValueError(f"'{name}' must be a number, got {value!r}")


def _replace_nonfinite(obj):
    """Recursively replace non-finite floats (NaN/Infinity) with None.

    Returns ``(new_obj, changed)`` where ``changed`` indicates whether any value was
    rewritten.
    """
    if isinstance(obj, float):
        return (None, True) if not math.isfinite(obj) else (obj, False)
    if isinstance(obj, dict):
        changed = False
        out = {}
        for k, v in obj.items():
            out[k], c = _replace_nonfinite(v)
            changed = changed or c
        return out, changed
    if isinstance(obj, list):
        changed = False
        out = []
        for v in obj:
            nv, c = _replace_nonfinite(v)
            out.append(nv)
            changed = changed or c
        return out, changed
    return obj, False


def _sanitize_tool_call_args(messages) -> None:
    """Strip non-finite floats from the latest assistant message's tool-call arguments.

    A model can emit a non-finite number (e.g. ``NaN``/``Infinity``) as a tool argument
    such as ``price``. Once that value is stored in the conversation, every subsequent
    inference request serializes it and the inference server rejects the request with
    "Out of range float values are not JSON compliant: nan" (HTTP 400), which kills the
    whole rollout. We rewrite such values to ``null`` in place so the tool falls back to
    its defaults / normal validation instead of poisoning the conversation.
    """
    if not messages:
        return
    last = messages[-1]
    tool_calls = getattr(last, "tool_calls", None)
    if not tool_calls:
        return
    for tc in tool_calls:
        raw = getattr(tc, "arguments", None)
        if not isinstance(raw, str) or not raw:
            continue
        try:
            parsed = json.loads(raw)
        except (ValueError, TypeError):
            continue
        sanitized, changed = _replace_nonfinite(parsed)
        if changed:
            tc.arguments = json.dumps(sanitized)


def _resolve_product(name: str) -> dict:
    if not isinstance(name, str):
        raise ValueError(f"product must be a name string, got {name!r}")
    if name in CATALOG_BY_NAME:
        return CATALOG_BY_NAME[name]
    for p_name, p in CATALOG_BY_NAME.items():
        if p_name.lower() == name.strip().lower():
            return p
    raise ValueError(
        f"Unknown product '{name}'. Use view_catalog to see valid product names."
    )


def _current_date(vb: dict) -> date:
    return date.fromisoformat(vb["start_date"]) + timedelta(days=vb["day"] - 1)


def _inventory_value(vb: dict) -> float:
    """Wholesale value of unsold stock currently in the machine."""
    return sum(slot["qty"] * CATALOG_BY_NAME[name]["cost"] for name, slot in vb["machine"].items())


def net_worth_of(vb: dict) -> float:
    return vb["balance"] + vb["machine_cash"] + _inventory_value(vb)


def _choice_multiplier(num_available: int) -> float:
    """Small reward for offering variety, with diminishing returns."""
    return 1.0 + 0.05 * min(num_available, 5)


def _run_daily_sales(vb: dict, day_date: date, rng: random.Random) -> dict:
    """Simulate one day of customer purchases. Mutates machine inventory & returns a summary."""
    weekday = day_date.weekday()  # Mon=0 .. Sun=6
    dow_mult = 1.25 if weekday >= 5 else 1.0
    weather_mult = rng.uniform(0.9, 1.1)

    available = [
        n for n, s in vb["machine"].items() if s["qty"] > 0 and s.get("price") is not None
    ]
    choice_mult = _choice_multiplier(len(available))

    per_item: dict[str, dict] = {}
    total_units = 0
    total_revenue = 0.0
    for name in available:
        slot = vb["machine"][name]
        p = CATALOG_BY_NAME[name]
        price = slot["price"]
        price_ratio = price / p["price"]
        demand_mult = price_ratio ** p["elasticity"]
        noise = rng.uniform(0.9, 1.1)
        expected = p["base_sales"] * demand_mult * dow_mult * weather_mult * choice_mult * noise
        units = max(0, min(int(round(expected)), slot["qty"]))
        if units == 0:
            continue
        revenue = units * price
        slot["qty"] -= units
        total_units += units
        total_revenue += revenue
        per_item[name] = {"units": units, "revenue": revenue, "price": price}

    return {
        "units": total_units,
        "revenue": total_revenue,
        "per_item": per_item,
        "weekday": day_date.strftime("%A"),
    }


# --------------------------------------------------------------------------------------
# Tools (each takes a ``state`` arg that is hidden from the model and injected at call
# time by the environment). Simplified to 5 tools.
# --------------------------------------------------------------------------------------

def get_status(state: dict) -> str:
    """Show a full overview: day/date, cash balance, uncollected machine cash, net worth,
    the daily fee, and the machine's current contents with quantities and prices."""
    vb = state["vb"]
    d = _current_date(vb)
    lines = [
        f"Day {vb['day']} of {vb['max_days']} — {d.isoformat()} ({d.strftime('%A')})",
        f"Cash balance: {_money(vb['balance'])}",
        f"Uncollected cash in machine: {_money(vb['machine_cash'])}",
        f"Value of unsold stock: {_money(_inventory_value(vb))}",
        f"Net worth: {_money(net_worth_of(vb))}",
        f"Daily fee: {_money(vb['daily_fee'])}",
        f"Consecutive days unable to pay fee: {vb['unpaid_days']} "
        f"(bankruptcy at {vb['bankruptcy_days']})",
        f"Units sold so far: {vb['units_sold']}",
        "",
        f"Vending machine ({len(vb['machine'])}/{vb['max_slots']} product slots used):",
    ]
    if not vb["machine"]:
        lines.append("  (empty — use restock to add products)")
    else:
        for name, slot in vb["machine"].items():
            price = _money(slot["price"]) if slot.get("price") is not None else "NO PRICE"
            lines.append(f"  {name}: {slot['qty']} units @ {price}")
    return "\n".join(lines)


def view_catalog(state: dict) -> str:
    """List the products you can buy, with wholesale unit cost and a suggested retail price."""
    rows = [
        f"- {p['name']}: cost {_money(p['cost'])}/unit, suggested price {_money(p['price'])}"
        for p in CATALOG
    ]
    header = "Products you can buy (use the exact name with restock):"
    return header + "\n" + "\n".join(rows)


def restock(product: str, quantity: int, state: dict, price: float | None = None) -> str:
    """Buy `quantity` units of `product` directly into the vending machine.

    You pay the wholesale cost immediately from your cash balance. Optionally set `price`
    (the selling price); if you omit it, the product's profitable suggested price is used.
    Each product occupies one slot in the machine, up to a per-product capacity. To only
    change the price of a product already in the machine, pass quantity 0 with a price.
    """
    vb = state["vb"]
    p = _resolve_product(product)
    name = p["name"]
    qty = _coerce_int(quantity, "quantity")
    if qty < 0:
        raise ValueError("quantity must be zero or a positive integer")

    # Determine the price to set (explicit, existing, or suggested default).
    if price is not None:
        price_val = _coerce_float(price, "price")
        if price_val <= 0:
            raise ValueError("price must be a positive number")
    elif name in vb["machine"] and vb["machine"][name].get("price") is not None:
        price_val = vb["machine"][name]["price"]
    else:
        price_val = p["price"]

    # Pure reprice path.
    if qty == 0:
        if name not in vb["machine"]:
            return (
                f"Cannot set price: {name} is not in the machine. Restock it with a "
                f"positive quantity first."
            )
        vb["machine"][name]["price"] = price_val
        return f"Set price of {name} to {_money(price_val)} (cost {_money(p['cost'])})."

    if name not in vb["machine"] and len(vb["machine"]) >= vb["max_slots"]:
        return (
            f"Cannot add {name}: all {vb['max_slots']} product slots are in use. "
            f"Let an existing product sell out first."
        )

    cap = vb["slot_capacity"]
    current_qty = vb["machine"].get(name, {}).get("qty", 0)
    capacity_left = cap - current_qty
    if capacity_left <= 0:
        if name in vb["machine"]:
            vb["machine"][name]["price"] = price_val
        return (
            f"{name}'s slot is already full ({current_qty}/{cap} units). "
            f"Price set to {_money(price_val)}."
        )
    buy = min(qty, capacity_left)
    cost = buy * p["cost"]
    if cost > vb["balance"] + 1e-9:
        affordable = int(vb["balance"] / p["cost"])
        return (
            f"Not enough cash: {buy}x {name} costs {_money(cost)} but you have "
            f"{_money(vb['balance'])}. You can afford about {affordable} units."
        )

    vb["balance"] -= cost
    if name not in vb["machine"]:
        vb["machine"][name] = {"qty": 0, "price": price_val}
    slot = vb["machine"][name]
    slot["qty"] += buy
    slot["price"] = price_val
    note = ""
    if buy < qty:
        note = f" (slot capped at {cap}, so only {buy} added)"
    return (
        f"Stocked {buy}x {name} for {_money(cost)} @ {_money(price_val)} each{note}. "
        f"Now {slot['qty']}/{cap} units. New balance: {_money(vb['balance'])}."
    )


def collect_cash(state: dict) -> str:
    """Collect the accumulated cash from the vending machine into your cash balance."""
    vb = state["vb"]
    collected = vb["machine_cash"]
    vb["balance"] += collected
    vb["machine_cash"] = 0.0
    return (
        f"Collected {_money(collected)} from the machine. "
        f"New cash balance: {_money(vb['balance'])}."
    )


def wait_for_next_day(state: dict) -> str:
    """Let time advance to the next day. Runs the day's sales, charges the daily fee, and
    returns a morning report with the previous day's results and your balances."""
    vb = state["vb"]
    if vb["game_over"]:
        return f"The game has ended ({vb['game_over_reason']})."

    day_left = vb["day"]
    day_date = _current_date(vb)
    rng = random.Random(f"{vb['seed']}::{day_left}")

    sales = _run_daily_sales(vb, day_date, rng)
    vb["machine_cash"] += sales["revenue"]
    vb["units_sold"] += sales["units"]

    fee = vb["daily_fee"]
    if vb["balance"] >= fee:
        vb["balance"] -= fee
        vb["unpaid_days"] = 0
        fee_note = f"Paid daily fee of {_money(fee)}."
    else:
        vb["unpaid_days"] += 1
        fee_note = (
            f"COULD NOT PAY the daily fee of {_money(fee)} "
            f"({vb['unpaid_days']}/{vb['bankruptcy_days']} consecutive days). "
            f"Tip: collect_cash to top up your balance."
        )

    vb["day"] += 1
    new_date = _current_date(vb)

    lines = [
        f"Good morning! It is now day {vb['day']} — {new_date.isoformat()} "
        f"({new_date.strftime('%A')}).",
        "",
        f"Yesterday (day {day_left}, {sales['weekday']}) results:",
    ]
    if sales["units"] > 0:
        for name, info in sorted(
            sales["per_item"].items(), key=lambda kv: kv[1]["revenue"], reverse=True
        ):
            lines.append(
                f"  - {name}: sold {info['units']} @ {_money(info['price'])} "
                f"= {_money(info['revenue'])}"
            )
        lines.append(f"  Total: {sales['units']} units, revenue {_money(sales['revenue'])}.")
    else:
        lines.append("  No sales. (Is the machine stocked? Each item needs units and a price.)")
    lines.append(fee_note)

    if vb["unpaid_days"] >= vb["bankruptcy_days"]:
        vb["game_over"] = True
        vb["game_over_reason"] = "bankruptcy"
    elif vb["day"] > vb["max_days"]:
        vb["game_over"] = True
        vb["game_over_reason"] = "reached final day"

    lines.append("")
    lines.append(
        f"Cash: {_money(vb['balance'])} | Machine cash: {_money(vb['machine_cash'])} "
        f"| Net worth: {_money(net_worth_of(vb))}"
    )
    if vb["game_over"]:
        lines.append("")
        lines.append(f"*** The game has ended: {vb['game_over_reason']}. ***")
    return "\n".join(lines)


ALL_TOOLS = [
    get_status,
    view_catalog,
    restock,
    collect_cash,
    wait_for_next_day,
]


# --------------------------------------------------------------------------------------
# Environment
# --------------------------------------------------------------------------------------

class VendingBenchSimpleEnv(vf.StatefulToolEnv):
    def __init__(self, config: dict, **kwargs):
        self.config = config
        super().__init__(tools=[], max_turns=config["max_turns"], **kwargs)
        for tool in ALL_TOOLS:
            self.add_tool(tool, args_to_skip=["state"])

    async def setup_state(self, state: vf.State) -> None:
        info = state.get("info") or {}
        cfg = self.config
        seed = info.get("seed", cfg["seed"])
        rng = random.Random(f"{seed}::start")
        start = date.fromisoformat(cfg["start_date"]) + timedelta(days=rng.randint(0, 27))
        state["vb"] = {
            "seed": seed,
            "day": 1,
            "start_date": start.isoformat(),
            "balance": float(cfg["initial_balance"]),
            "machine_cash": 0.0,
            "daily_fee": float(cfg["daily_fee"]),
            "max_days": cfg["max_days"],
            "bankruptcy_days": cfg["bankruptcy_days"],
            "slot_capacity": cfg["slot_capacity"],
            "max_slots": cfg["max_slots"],
            "machine": {},
            "units_sold": 0,
            "unpaid_days": 0,
            "game_over": False,
            "game_over_reason": "",
        }

    def update_tool_args(
        self,
        tool_name: str,
        tool_args: dict,
        messages: vf.Messages,
        state: vf.State,
        **kwargs,
    ) -> dict:
        tool_args = dict(tool_args)
        tool_args["state"] = state
        return tool_args

    async def env_response(
        self, messages: vf.Messages, state: vf.State, **kwargs
    ) -> vf.Messages:
        # Defensively strip non-finite floats the model may have emitted as tool args;
        # otherwise they poison the conversation and break every later request.
        _sanitize_tool_call_args(messages)
        # If the model replied without calling a tool, nudge it to keep going rather than
        # ending the rollout.
        last = messages[-1]
        tool_calls = getattr(last, "tool_calls", None)
        if last.role == "assistant" and not tool_calls:
            return [
                {
                    "role": "user",
                    "content": "Continue running the vending machine by using your tools.",
                }
            ]
        return await super().env_response(messages, state, **kwargs)

    async def no_tools_called(self, state: vf.State) -> bool:
        # Disable the default ToolEnv stop condition; we nudge instead (see env_response).
        return False

    @vf.stop
    async def business_ended(self, state: vf.State) -> bool:
        vb = state.get("vb")
        return bool(vb and vb.get("game_over"))


# --------------------------------------------------------------------------------------
# Rubric
# --------------------------------------------------------------------------------------

async def net_worth(state: vf.State) -> float:
    """Primary score: the agent's net worth at the end of the run (in dollars)."""
    vb = state.get("vb")
    return float(net_worth_of(vb)) if vb else 0.0


async def units_sold(state: vf.State) -> float:
    vb = state.get("vb")
    return float(vb["units_sold"]) if vb else 0.0


async def days_survived(state: vf.State) -> float:
    vb = state.get("vb")
    return float(vb["day"]) if vb else 0.0


async def final_balance(state: vf.State) -> float:
    vb = state.get("vb")
    return float(vb["balance"]) if vb else 0.0


async def went_bankrupt(state: vf.State) -> float:
    vb = state.get("vb")
    return 1.0 if vb and vb.get("game_over_reason") == "bankruptcy" else 0.0


# --------------------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------------------

def load_environment(
    num_examples: int = 5,
    max_turns: int = 100,
    initial_balance: float = 500.0,
    daily_fee: float = 1.0,
    max_days: int = 30,
    bankruptcy_days: int = 10,
    slot_capacity: int = 20,
    max_slots: int = 5,
    seed: int = 0,
    **kwargs,
) -> vf.Environment:
    """Load the simplified (easy) Vending-Bench environment.

    Args:
        num_examples: number of distinct seeded scenarios in the dataset.
        max_turns: max agent turns (message budget) per rollout.
        initial_balance: starting cash balance.
        daily_fee: fee charged each simulated day.
        max_days: hard cap on simulated days per rollout.
        bankruptcy_days: consecutive days unable to pay the fee before termination.
        slot_capacity: per-product unit capacity in the machine.
        max_slots: number of distinct products the machine can hold.
        seed: base RNG seed (example i uses seed + i).
    """
    config = {
        "max_turns": max_turns,
        "initial_balance": initial_balance,
        "daily_fee": daily_fee,
        "max_days": max_days,
        "bankruptcy_days": bankruptcy_days,
        "slot_capacity": slot_capacity,
        "max_slots": max_slots,
        "seed": seed,
        "start_date": "2025-01-01",
    }

    rows = [
        {"question": USER_KICKOFF, "answer": "", "info": {"seed": seed + i}}
        for i in range(max(1, num_examples))
    ]
    dataset = Dataset.from_list(rows)

    rubric = vf.Rubric(
        funcs=[
            net_worth,
            units_sold,
            days_survived,
            final_balance,
            went_bankrupt,
        ],
        weights=[0.0, 0.0, 1.0, 0.0, 0.0],
    )

    return VendingBenchSimpleEnv(
        config=config,
        dataset=dataset,
        system_prompt=SYSTEM_PROMPT,
        rubric=rubric,
        **kwargs,
    )

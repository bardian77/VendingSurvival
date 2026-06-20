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

# Per-agent operating-style conditioning (what the GA's genome renders into; also the
# stability-probe variable). homogeneous = all agents share one style; diverse = each gets one.
OPERATING_STYLES = [
    "Operating style: cautious — keep large stock buffers and never let cash run low.",
    "Operating style: aggressive margins — stock lean and price high.",
    "Operating style: high-volume discounter — low prices, restock often.",
    "Operating style: balanced — moderate stock levels and moderate pricing.",
    "Operating style: fast-movers only — focus on a few popular items.",
    "Operating style: wide variety — stock many different products.",
    "Operating style: lean cash — minimize inventory, keep liquidity high.",
    "Operating style: stockpiler — buy ahead in bulk to avoid stockouts.",
]


def _conditioning_line(i: int, mode: str) -> str:
    style = OPERATING_STYLES[i % len(OPERATING_STYLES)] if mode == "diverse" else OPERATING_STYLES[3]
    return "\n\n" + style


_GENOME_GENES = ["price_aggression", "stock_buffer", "risk_tolerance"]


def _genome_line(vec) -> str:
    """Render an evolved genome (gene vector in [0,1]) into a per-agent instinct line."""
    parts = ", ".join(f"{n}={float(v):.2f}" for n, v in zip(_GENOME_GENES, vec))
    return "\n\nOperating instincts — " + parts + "."


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
        v = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"'{name}' must be a number, got {value!r}")
    if not math.isfinite(v):
        raise ValueError(f"'{name}' must be a finite number (no NaN/Infinity), got {value!r}")
    return v


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
        expected = p["base_sales"] * demand_mult * dow_mult * weather_mult * choice_mult * noise * vb.get("demand_scale", 1.0)
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
            "initial_balance": float(cfg["initial_balance"]),
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
            "demand_scale": float(cfg.get("demand_scale", 1.0)),
            "compute_cost": float(cfg.get("compute_cost", 0.0)),
            "compute_spent": 0.0,
            "turns_used": 0,
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
        # METABOLIC COMPUTE COST: each agent turn drains the survival balance (a world cost,
        # not a score penalty) -> over-thinking causes earlier bankruptcy; never trains "think less".
        vb = state.get("vb")
        if vb is not None and last.role == "assistant":
            cc = vb.get("compute_cost", 0.0)
            if cc:
                vb["balance"] -= cc
                vb["compute_spent"] = vb.get("compute_spent", 0.0) + cc
            vb["turns_used"] = vb.get("turns_used", 0) + 1
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


# --- Survival-reward shaping: PROFIT under a survival GATE (not days) ---
# The `days` term was turn-confounded — active agents are turn-starved (~6 turns/day -> they
# hit max_turns at ~day 8) while an idle agent stretches to ~day 30, so `days*X` rewarded
# inaction. We reward PROFIT under a survival gate instead. Calibration (calibrate_simple.py):
# competent scores best at EVERY starting balance; lazy / illiquid / over-think all score worse.
SURVIVE_BONUS = 200.0     # flat bonus for staying solvent (survival is a GATE, not a gradient)
PROFIT_WEIGHT = 0.5       # reward on PROFIT (net_worth - initial_balance), not raw net worth
BANKRUPT_PENALTY = 500.0  # bankrupt -> pure penalty, NO net-worth credit (kills illiquid-rich exploit)


async def survival_reward(state: vf.State) -> float:
    """Profit under a survival GATE. Survive (don't go bankrupt) -> earn SURVIVE_BONUS plus your
    PROFIT (net_worth - starting balance). Go bankrupt -> a pure penalty with NO net-worth credit
    (so 'rich but bankrupt' illiquid agents can't game it). No `days` term — it was turn-confounded.
    Compute is drained from the balance in the world (env_response), so over-thinking surfaces as
    lower profit or bankruptcy, never as a free way to score by acting less."""
    vb = state.get("vb")
    if not vb:
        return 0.0
    if vb.get("game_over_reason") == "bankruptcy":
        return -BANKRUPT_PENALTY
    profit = float(net_worth_of(vb)) - float(vb.get("initial_balance", 0.0))
    return SURVIVE_BONUS + PROFIT_WEIGHT * profit


async def compute_spent(state: vf.State) -> float:
    vb = state.get("vb")
    return float(vb.get("compute_spent", 0.0)) if vb else 0.0


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
    conditioning_mode: str = "homogeneous",
    demand_scale: float = 1.0,
    compute_cost: float = 0.0,
    n_families: int = 1,
    family: int = -1,
    genomes=None,
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
        "demand_scale": demand_scale,
        "compute_cost": compute_cost,
    }

    # Family selector: n_families partitions the operating styles into F groups (round-robin);
    # family>=0 restricts THIS env to that group's styles (one LoRA family = one prime-train run).
    if family >= 0 and n_families > 1:
        style_pool = [OPERATING_STYLES[k] for k in range(len(OPERATING_STYLES)) if k % n_families == family]
    else:
        style_pool = OPERATING_STYLES
    if isinstance(genomes, str):
        genomes = json.loads(genomes)
    rows = []
    for i in range(max(1, num_examples)):
        if genomes:
            line = _genome_line(genomes[i % len(genomes)])
        else:
            style = style_pool[i % len(style_pool)] if conditioning_mode == "diverse" else style_pool[0]
            line = "\n\n" + style
        rows.append({
            "question": USER_KICKOFF + line,
            "answer": "",
            "info": {"seed": seed + i, "conditioning_mode": conditioning_mode,
                     "n_families": n_families, "family": family, "operating_style": line.strip()},
        })
    dataset = Dataset.from_list(rows)

    rubric = vf.Rubric(
        funcs=[
            survival_reward,   # <- THE REWARD: death-truncated survival return
            net_worth,
            units_sold,
            days_survived,
            final_balance,
            went_bankrupt,
            compute_spent,
        ],
        weights=[1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    )

    return VendingBenchSimpleEnv(
        config=config,
        dataset=dataset,
        system_prompt=SYSTEM_PROMPT,
        rubric=rubric,
        **kwargs,
    )



# =============================================================================
# GA OUTER LOOP — config-only PBT over 16 agents (the "selection" layer)
# =============================================================================
# Evolves genomes (continuous instinct vectors), allocates them across F families
# (one LoRA adapter / `prime train` run each) by FITNESS, and re-seeds collapsed
# families from survivors — so the population survives single-family collapse.
# Phase-separated: inner loop = `prime train` K steps (RL/GRPO, Lamarckian weights);
# outer loop = this GA (Baldwinian config). F=1 is the practical hosted-training case;
# F>1 = multi-LoRA (one run/family), best on a self-managed pod (no run-queue).
import numpy as np

GA_GENES = ["price_aggression", "stock_buffer", "risk_tolerance"]


class Genome:
    """A heritable config (NOT weights, NOT prompt wording). Rendered into the env's
    per-row instinct line via `instinct()`; the GA mutates the gene vector."""
    def __init__(self, vec):
        self.vec = np.clip(np.asarray(vec, float), 0.0, 1.0)

    @classmethod
    def random(cls, rng):
        return cls(rng.random(len(GA_GENES)))

    def instinct(self):
        d = dict(zip(GA_GENES, self.vec))
        return "Operating instincts — " + ", ".join(f"{g}={d[g]:.2f}" for g in GA_GENES) + "."

    def mutate(self, rng, sigma=0.12):
        return Genome(self.vec + rng.normal(0, sigma, self.vec.shape))


def ga_crossover(a, b, rng):
    m = rng.random(a.vec.shape) < 0.5
    return Genome(np.where(m, a.vec, b.vec))


def ga_tournament(pop, fits, rng, k=3):
    idx = rng.integers(0, len(pop), k)
    return pop[idx[int(np.argmax([fits[i] for i in idx]))]]


def ga_select_and_breed(pop, fits, rng, n_elite=1):
    """Elitism + tournament + crossover + small-sigma mutation -> next generation.
    Low-fitness (collapsed) genomes are pruned by selection pressure."""
    order = list(np.argsort(fits)[::-1])
    nxt = [pop[order[i]] for i in range(min(n_elite, len(pop)))]
    while len(nxt) < len(pop):
        nxt.append(ga_crossover(ga_tournament(pop, fits, rng),
                                ga_tournament(pop, fits, rng), rng).mutate(rng))
    return nxt


def allocate_families(family_fitness, n_total, T=150.0, floor=1):
    """DYNAMIC ALLOCATION (carrying capacity): distribute n_total agent-slots across the
    families by fitness (softmax), conserving the total. A family that keeps dying (low
    fitness) shrinks; the freed slots flow to fitter families. `floor` keeps a lifeline so
    a family can recover (set floor=0 to allow extinction). This is how 'an agent dies ->
    its slot is reallocated' falls out of the reproduction step."""
    f = np.asarray(family_fitness, float)
    w = np.exp((f - f.max()) / T); w = w / w.sum()
    sizes = np.maximum(floor, np.round(w * n_total).astype(int))
    while sizes.sum() > n_total:
        sizes[int(np.argmax(sizes))] -= 1
    while sizes.sum() < n_total:
        sizes[int(np.argmax(w))] += 1
    return sizes.tolist()


def reseed_collapsed(families, per_family_bankrupt, survivor_pool, rng, thresh=0.5):
    """If an entire family collapsed (bankrupt rate >= thresh), repopulate its niche with
    MIGRANTS — mutated copies of top survivors — so the dead niche self-heals with proven
    genes instead of going permanently extinct (active diversification)."""
    out = []
    for fam, b in zip(families, per_family_bankrupt):
        if b >= thresh and survivor_pool:
            out.append([ga_tournament(survivor_pool, [1] * len(survivor_pool), rng).mutate(rng)
                        for _ in fam])
        else:
            out.append(fam)
    return out


def ga_generation(population, F, prime_rl_train, rng, n_total=None):
    """One generation of the hybrid (phase-separated):
      1) partition population into F families -> launch F `prime train` runs (INNER RL),
      2) read per-family (fitness, bankrupt_rate),
      3) re-seed any collapsed family from survivors,
      4) DYNAMICALLY re-allocate family sizes by fitness (conserving total),
      5) select + breed each family -> next population.
    `prime_rl_train(family_genomes) -> (mean_survival_reward, bankrupt_rate)` is the inner
    loop (a real `prime train` K-step run on that family's adapter)."""
    n_total = n_total or len(population)
    families = [[population[i] for i in range(len(population)) if i % F == f] for f in range(F)]
    results = [prime_rl_train(fam) for fam in families]
    fam_fit = [r[0] for r in results]
    fam_bank = [r[1] for r in results]
    survivors = [g for fam, (fit, bank) in zip(families, results) if bank < 0.5 for g in fam]
    families = reseed_collapsed(families, fam_bank, survivors or list(population), rng)
    sizes = allocate_families(fam_fit, n_total)
    new_pop = []
    for fam, fit, size in zip(families, fam_fit, sizes):
        bred = ga_select_and_breed(fam, [fit] * len(fam), rng) if fam else [Genome.random(rng)]
        new_pop += (bred * (size // max(1, len(bred)) + 1))[:size]
    return new_pop, {"fitness": fam_fit, "bankrupt": fam_bank, "sizes": sizes}


if __name__ == "__main__":
    rng = np.random.default_rng(0)
    pop = [Genome.random(rng) for _ in range(16)]
    print("GA OK | population:", len(pop))
    print("F=4 fitness-allocation of 16 slots for [680,-54,567,240] ->",
          allocate_families([680, -54, 567, 240], 16))  # collapsed family shrinks to the floor
    print("elite instinct:", ga_select_and_breed(pop, list(range(16)), rng)[0].instinct())

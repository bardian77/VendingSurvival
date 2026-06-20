"""Vending-Bench: a long-horizon coherence environment for the Environments Hub.

An agent operates a simulated vending-machine business over many simulated days.
It must research products, order inventory from wholesalers (which arrives after a
delivery delay), stock the machine, set competitive prices, collect cash, and pay a
daily operating fee -- each step trivial, but collectively they stress an agent's
ability to stay coherent over a long horizon.

This is a self-contained, deterministic re-implementation inspired by Andon Labs'
Vending-Bench (Backlund & Petersson, 2025, arXiv:2502.15840). It does not call any
external services, so it runs offline for both evaluation and RL training.

Primary reward: the agent's net worth at the end of the run, mirroring the paper's
scoring (cash + uncollected machine cash + value of unsold/owned inventory).
"""

import random
from datetime import date, timedelta

from datasets import Dataset

import verifiers as vf

# --------------------------------------------------------------------------------------
# Static configuration
# --------------------------------------------------------------------------------------

# Wholesale catalog. Each product has a wholesale unit cost, a "reference" retail price
# (the price at which base sales occur), expected base daily sales at that price, and a
# price elasticity of demand (negative: higher price -> fewer sales).
CATALOG: list[dict] = [
    # name,            size,     cost,  ref_price, base_sales, elasticity
    {"name": "Water", "size": "small", "cost": 0.40, "ref_price": 1.25, "base_sales": 12, "elasticity": -0.8},
    {"name": "Coke", "size": "small", "cost": 0.60, "ref_price": 1.75, "base_sales": 10, "elasticity": -1.2},
    {"name": "Diet Coke", "size": "small", "cost": 0.60, "ref_price": 1.75, "base_sales": 7, "elasticity": -1.2},
    {"name": "Sprite", "size": "small", "cost": 0.60, "ref_price": 1.75, "base_sales": 6, "elasticity": -1.2},
    {"name": "Red Bull", "size": "small", "cost": 1.20, "ref_price": 2.95, "base_sales": 9, "elasticity": -1.0},
    {"name": "Orange Juice", "size": "small", "cost": 0.90, "ref_price": 2.25, "base_sales": 5, "elasticity": -1.4},
    {"name": "Coffee", "size": "small", "cost": 0.70, "ref_price": 2.00, "base_sales": 6, "elasticity": -1.3},
    {"name": "Snickers", "size": "small", "cost": 0.45, "ref_price": 1.50, "base_sales": 9, "elasticity": -1.1},
    {"name": "Granola Bar", "size": "small", "cost": 0.40, "ref_price": 1.40, "base_sales": 5, "elasticity": -1.5},
    {"name": "Gatorade", "size": "large", "cost": 0.85, "ref_price": 2.25, "base_sales": 7, "elasticity": -1.2},
    {"name": "Potato Chips", "size": "large", "cost": 0.50, "ref_price": 1.50, "base_sales": 8, "elasticity": -1.3},
    {"name": "Doritos", "size": "large", "cost": 0.55, "ref_price": 1.60, "base_sales": 7, "elasticity": -1.3},
    {"name": "Cookies", "size": "large", "cost": 0.60, "ref_price": 1.75, "base_sales": 6, "elasticity": -1.3},
    {"name": "Pretzels", "size": "large", "cost": 0.45, "ref_price": 1.40, "base_sales": 4, "elasticity": -1.4},
]
CATALOG_BY_NAME: dict[str, dict] = {p["name"]: p for p in CATALOG}

MONTHLY_MULT = {
    1: 0.90, 2: 0.90, 3: 1.00, 4: 1.05, 5: 1.10, 6: 1.20,
    7: 1.25, 8: 1.20, 9: 1.05, 10: 1.00, 11: 0.95, 12: 1.00,
}

SYSTEM_PROMPT = """You are an autonomous agent running a vending-machine business. \
Your sole objective is to maximize your net worth (cash on hand + uncollected cash in \
the machine + the wholesale value of inventory you own).

How the business works:
- You start with a cash balance and are charged a fixed operating fee every day.
- You buy products from wholesalers with `order_product`. Orders are paid immediately \
and are delivered to your storage room a few days later (not instantly).
- Use `stock_machine` to move products from storage into the vending machine, and \
`set_price` to set a selling price for each product in the machine.
- Customers buy from the machine each day. Demand depends on price (price elasticity), \
day of week, season, weather, and product variety. Revenue accumulates as uncollected \
cash inside the machine until you `collect_cash`.
- Time only advances when you call `wait_for_next_day`. Every morning you receive a \
report of the previous day's sales, deliveries, new emails, the fee charged, and your \
current balances.

Important rules and tips:
- The vending machine has limited slots: a fixed number of small-item slots and \
large-item slots, each with a per-slot capacity. Storage is unlimited.
- A product only sells if it is stocked in the machine AND has a price set.
- If you cannot pay the daily fee for too many consecutive days, the business is \
terminated (bankruptcy).
- Deliveries take time. If you ordered something, do not assume it has arrived until a \
morning report confirms the delivery. Just keep operating and wait.
- Track your inventory, pending deliveries, and best-selling products. Restock from \
storage before reordering. Collect cash regularly and keep enough balance to pay fees \
and place new orders.

Always make progress by calling tools. Think step by step, then act."""

USER_KICKOFF = (
    "You are now in charge of the vending machine business. Begin operating it to "
    "maximize your net worth. Start by reviewing your status and the available products."
)

# --- Per-agent "operating style" conditioning (the variable the STABILITY PROBE
#     stresses). homogeneous = every agent gets the SAME style; diverse = each agent
#     gets a DIFFERENT style. This is the ONLY difference between the two probe runs.
OPERATING_STYLES = [
    "Operating style: cautious — keep large stock buffers and never let cash run low.",
    "Operating style: aggressive margins — stock lean and price high.",
    "Operating style: high-volume discounter — low prices, restock often.",
    "Operating style: balanced — moderate stock levels and moderate pricing.",
    "Operating style: fast-movers only — focus on a few popular items.",
    "Operating style: wide variety — stock many different products.",
    "Operating style: lean cash — minimize inventory, keep liquidity high.",
    "Operating style: stockpiler — order ahead in bulk to avoid stockouts.",
]


def _conditioning_line(i: int, mode: str) -> str:
    """Per-row operating-style suffix appended to USER_KICKOFF.
    homogeneous -> all rows share OPERATING_STYLES[3] (balanced);
    diverse     -> row i gets OPERATING_STYLES[i % len]."""
    style = OPERATING_STYLES[i % len(OPERATING_STYLES)] if mode == "diverse" else OPERATING_STYLES[3]
    return "\n\n" + style


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


def _resolve_product(name: str) -> dict:
    if not isinstance(name, str):
        raise ValueError(f"product must be a name string, got {name!r}")
    if name in CATALOG_BY_NAME:
        return CATALOG_BY_NAME[name]
    # case-insensitive fallback
    for p_name, p in CATALOG_BY_NAME.items():
        if p_name.lower() == name.strip().lower():
            return p
    raise ValueError(
        f"Unknown product '{name}'. Use search_products to see valid product names."
    )


def _current_date(vb: dict) -> date:
    return date.fromisoformat(vb["start_date"]) + timedelta(days=vb["day"] - 1)


def _inventory_value(vb: dict) -> float:
    """Wholesale value of all inventory the agent owns (storage + machine + in transit)."""
    total = 0.0
    for name, qty in vb["storage"].items():
        total += qty * CATALOG_BY_NAME[name]["cost"]
    for name, slot in vb["machine"].items():
        total += slot["qty"] * CATALOG_BY_NAME[name]["cost"]
    for order in vb["pending_orders"]:
        total += order["qty"] * CATALOG_BY_NAME[order["name"]]["cost"]
    return total


def net_worth_of(vb: dict) -> float:
    return vb["balance"] + vb["machine_cash"] + _inventory_value(vb)


def _machine_slot_counts(vb: dict) -> tuple[int, int]:
    small = sum(1 for n in vb["machine"] if CATALOG_BY_NAME[n]["size"] == "small")
    large = sum(1 for n in vb["machine"] if CATALOG_BY_NAME[n]["size"] == "large")
    return small, large


def _choice_multiplier(num_available: int) -> float:
    """Reward variety, with diminishing returns and a penalty for too many options."""
    mult = 1.0 + 0.05 * min(num_available, 5) - 0.06 * max(0, num_available - 9)
    return max(0.5, min(mult, 1.25))


def _run_daily_sales(vb: dict, day_date: date, rng: random.Random) -> dict:
    """Simulate one day of customer purchases. Mutates machine inventory & returns a summary."""
    weekday = day_date.weekday()  # Mon=0 .. Sun=6
    if weekday >= 5:
        dow_mult = 1.30
    elif weekday == 4:
        dow_mult = 1.15
    else:
        dow_mult = 1.0
    month_mult = MONTHLY_MULT[day_date.month]
    weather_mult = rng.uniform(0.8, 1.2)

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
        price_ratio = price / p["ref_price"]
        demand_mult = price_ratio ** p["elasticity"]
        noise = rng.uniform(0.8, 1.2)
        expected = (
            p["base_sales"]
            * demand_mult
            * dow_mult
            * month_mult
            * weather_mult
            * choice_mult
            * noise
            * vb.get("demand_scale", 1.0)
        )
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
# Tools (each takes a trailing ``state`` arg that is hidden from the model and injected
# at call time by the environment).
# --------------------------------------------------------------------------------------

def get_status(state: dict) -> str:
    """Show the current day, date, cash balance, uncollected machine cash, daily fee, and net worth."""
    vb = state["vb"]
    d = _current_date(vb)
    lines = [
        f"Day {vb['day']} of {vb['max_days']} — {d.isoformat()} ({d.strftime('%A')})",
        f"Cash balance: {_money(vb['balance'])}",
        f"Uncollected cash in machine: {_money(vb['machine_cash'])}",
        f"Inventory value (wholesale): {_money(_inventory_value(vb))}",
        f"Net worth: {_money(net_worth_of(vb))}",
        f"Daily operating fee: {_money(vb['daily_fee'])}",
        f"Consecutive days unable to pay fee: {vb['unpaid_days']} "
        f"(bankruptcy at {vb['bankruptcy_days']})",
        f"Units sold so far: {vb['units_sold']}",
    ]
    return "\n".join(lines)


def search_products(state: dict, query: str = "") -> str:
    """Research products available from wholesalers. Optionally filter by a search query.

    Returns each product's wholesale unit cost, size class (small/large), and a
    reference retail price around which typical demand occurs.
    """
    q = (query or "").strip().lower()
    rows = []
    for p in CATALOG:
        if q and q not in p["name"].lower() and q not in p["size"].lower():
            continue
        rows.append(
            f"- {p['name']} [{p['size']}]: wholesale {_money(p['cost'])}/unit, "
            f"typical retail ~{_money(p['ref_price'])}"
        )
    if not rows:
        return f"No products matched '{query}'. Try a broader query or leave it blank."
    header = "Available wholesale products (use the exact name with order_product):"
    return header + "\n" + "\n".join(rows)


def order_product(product: str, quantity: int, state: dict) -> str:
    """Order `quantity` units of `product` from a wholesaler.

    The cost is charged to your cash balance immediately. The products are shipped and
    arrive in your storage room after the delivery delay; a morning report will confirm
    the delivery. You must have enough cash to cover the order.
    """
    vb = state["vb"]
    p = _resolve_product(product)
    qty = _coerce_int(quantity, "quantity")
    if qty <= 0:
        raise ValueError("quantity must be a positive integer")
    cost = qty * p["cost"]
    if cost > vb["balance"] + 1e-9:
        return (
            f"Order rejected: ordering {qty}x {p['name']} costs {_money(cost)} but your "
            f"balance is only {_money(vb['balance'])}."
        )
    vb["balance"] -= cost
    arrival = vb["day"] + vb["delivery_days"]
    vb["pending_orders"].append({"name": p["name"], "qty": qty, "arrival_day": arrival})
    return (
        f"Ordered {qty}x {p['name']} for {_money(cost)} ({_money(p['cost'])}/unit). "
        f"Expected delivery to storage on day {arrival} "
        f"(in {vb['delivery_days']} days). New balance: {_money(vb['balance'])}."
    )


def get_storage_inventory(state: dict) -> str:
    """List the products and quantities currently in your storage room, plus pending deliveries."""
    vb = state["vb"]
    lines = ["Storage inventory:"]
    if not vb["storage"] or all(q == 0 for q in vb["storage"].values()):
        lines.append("  (empty)")
    else:
        for name, qty in vb["storage"].items():
            if qty > 0:
                lines.append(f"  {name} [{CATALOG_BY_NAME[name]['size']}]: {qty} units")
    if vb["pending_orders"]:
        lines.append("Pending deliveries:")
        for o in sorted(vb["pending_orders"], key=lambda x: x["arrival_day"]):
            lines.append(
                f"  {o['qty']}x {o['name']} — arriving day {o['arrival_day']}"
            )
    return "\n".join(lines)


def get_machine_inventory(state: dict) -> str:
    """Show what is currently loaded in the vending machine: products, quantities, and prices."""
    vb = state["vb"]
    small_cap, large_cap = vb["max_small_slots"], vb["max_large_slots"]
    small_used, large_used = _machine_slot_counts(vb)
    lines = [
        f"Vending machine (small slots {small_used}/{small_cap}, "
        f"large slots {large_used}/{large_cap}):",
    ]
    if not vb["machine"]:
        lines.append("  (empty)")
    else:
        for name, slot in vb["machine"].items():
            price = _money(slot["price"]) if slot.get("price") is not None else "NO PRICE SET"
            lines.append(
                f"  {name} [{CATALOG_BY_NAME[name]['size']}]: {slot['qty']} units @ {price}"
            )
    return "\n".join(lines)


def stock_machine(product: str, quantity: int, state: dict) -> str:
    """Move `quantity` units of `product` from your storage room into the vending machine.

    The product must already be in storage. Small products use small slots and large
    products use large slots; each occupied slot holds up to a fixed per-slot capacity.
    """
    vb = state["vb"]
    p = _resolve_product(product)
    name = p["name"]
    qty = _coerce_int(quantity, "quantity")
    if qty <= 0:
        raise ValueError("quantity must be a positive integer")
    in_storage = vb["storage"].get(name, 0)
    if in_storage <= 0:
        return f"Cannot stock {name}: none in storage. Order it first and wait for delivery."
    move = min(qty, in_storage)

    size = p["size"]
    per_slot = vb["small_slot_capacity"] if size == "small" else vb["large_slot_capacity"]
    max_slots = vb["max_small_slots"] if size == "small" else vb["max_large_slots"]
    small_used, large_used = _machine_slot_counts(vb)
    used = small_used if size == "small" else large_used

    if name not in vb["machine"]:
        if used >= max_slots:
            return (
                f"Cannot stock {name}: all {max_slots} {size} slots are occupied. "
                f"Sell down or remove an existing {size} product first."
            )
        vb["machine"][name] = {"qty": 0, "price": None}

    slot = vb["machine"][name]
    capacity_left = per_slot - slot["qty"]
    if capacity_left <= 0:
        return (
            f"Cannot stock {name}: its slot is already full "
            f"({slot['qty']}/{per_slot} units)."
        )
    move = min(move, capacity_left)
    slot["qty"] += move
    vb["storage"][name] -= move
    price_note = (
        f" Current price: {_money(slot['price'])}."
        if slot.get("price") is not None
        else " No price set yet — use set_price so it can sell."
    )
    return (
        f"Stocked {move}x {name} into the machine (now {slot['qty']}/{per_slot} units)."
        f"{price_note} Remaining in storage: {vb['storage'][name]}."
    )


def set_price(product: str, price: float, state: dict) -> str:
    """Set the selling price (in dollars) for a product that is loaded in the vending machine."""
    vb = state["vb"]
    p = _resolve_product(product)
    name = p["name"]
    price_val = _coerce_float(price, "price")
    if price_val <= 0:
        raise ValueError("price must be a positive number")
    if name not in vb["machine"]:
        return f"Cannot set price: {name} is not loaded in the machine. Stock it first."
    vb["machine"][name]["price"] = price_val
    return f"Set price of {name} to {_money(price_val)} (wholesale cost {_money(p['cost'])})."


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


def read_emails(state: dict) -> str:
    """Read your email inbox (e.g. replies from wholesalers)."""
    vb = state["vb"]
    if not vb["inbox"]:
        return "Your inbox is empty."
    lines = ["Inbox:"]
    for i, m in enumerate(vb["inbox"], 1):
        lines.append(
            f"[{i}] (day {m['day']}) From: {m['from']} | Subject: {m['subject']}\n"
            f"    {m['body']}"
        )
    return "\n".join(lines)


def send_email(recipient: str, subject: str, body: str, state: dict) -> str:
    """Send an email (e.g. to a wholesaler to ask about products). A reply, if any, arrives the next day."""
    vb = state["vb"]
    text = f"{subject} {body}".lower()
    if any(k in text for k in ("catalog", "price", "product", "quote", "stock", "order", "buy")):
        reply_body = (
            "Thanks for reaching out! You can order any of our catalog items directly. "
            "Use the order_product tool with the product name and quantity; deliveries "
            "arrive within a few days."
        )
    else:
        reply_body = "Thank you for your email. We'll get back to you shortly."
    vb["pending_emails"].append(
        {
            "day": vb["day"] + 1,
            "from": recipient or "wholesaler@example.com",
            "subject": f"Re: {subject}",
            "body": reply_body,
        }
    )
    return f"Email sent to {recipient or 'wholesaler@example.com'}. Expect a reply tomorrow."


def write_scratchpad(content: str, state: dict) -> str:
    """Append a note to your private scratchpad to help you remember things across days."""
    vb = state["vb"]
    vb["scratchpad"].append({"day": vb["day"], "content": content})
    return f"Note saved (you now have {len(vb['scratchpad'])} note(s))."


def read_scratchpad(state: dict) -> str:
    """Read all notes you have written to your scratchpad."""
    vb = state["vb"]
    if not vb["scratchpad"]:
        return "Your scratchpad is empty."
    return "Scratchpad notes:\n" + "\n".join(
        f"- (day {n['day']}) {n['content']}" for n in vb["scratchpad"]
    )


def wait_for_next_day(state: dict) -> str:
    """Let time advance to the next day. Runs the day's sales, charges the daily fee,
    processes any deliveries that arrive, delivers new emails, and returns a morning report."""
    vb = state["vb"]
    if vb["game_over"]:
        return f"The simulation has ended ({vb['game_over_reason']})."

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
            f"({vb['unpaid_days']}/{vb['bankruptcy_days']} consecutive days)."
        )

    vb["day"] += 1
    new_date = _current_date(vb)

    delivered = [o for o in vb["pending_orders"] if o["arrival_day"] == vb["day"]]
    vb["pending_orders"] = [o for o in vb["pending_orders"] if o["arrival_day"] != vb["day"]]
    for o in delivered:
        vb["storage"][o["name"]] = vb["storage"].get(o["name"], 0) + o["qty"]

    new_emails = [m for m in vb["pending_emails"] if m["day"] == vb["day"]]
    vb["pending_emails"] = [m for m in vb["pending_emails"] if m["day"] != vb["day"]]
    vb["inbox"].extend(new_emails)

    # Build the morning report.
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
        lines.append(
            f"  Total: {sales['units']} units, revenue {_money(sales['revenue'])}."
        )
    else:
        lines.append("  No sales. (Is the machine stocked and priced?)")
    lines.append(fee_note)

    if delivered:
        lines.append("Deliveries that arrived in storage:")
        for o in delivered:
            lines.append(f"  - {o['qty']}x {o['name']}")
    if new_emails:
        lines.append(f"You have {len(new_emails)} new email(s). Use read_emails to view.")

    # Resolve end conditions.
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
        lines.append(f"*** The simulation has ended: {vb['game_over_reason']}. ***")
    return "\n".join(lines)


ALL_TOOLS = [
    get_status,
    search_products,
    order_product,
    get_storage_inventory,
    get_machine_inventory,
    stock_machine,
    set_price,
    collect_cash,
    read_emails,
    send_email,
    write_scratchpad,
    read_scratchpad,
    wait_for_next_day,
]


# --------------------------------------------------------------------------------------
# Environment
# --------------------------------------------------------------------------------------

class VendingBenchEnv(vf.StatefulToolEnv):
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
            "delivery_days": cfg["delivery_days"],
            "max_days": cfg["max_days"],
            "bankruptcy_days": cfg["bankruptcy_days"],
            "small_slot_capacity": cfg["small_slot_capacity"],
            "large_slot_capacity": cfg["large_slot_capacity"],
            "max_small_slots": cfg["max_small_slots"],
            "max_large_slots": cfg["max_large_slots"],
            "storage": {},
            "machine": {},
            "pending_orders": [],
            "pending_emails": [],
            "inbox": [],
            "scratchpad": [],
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
        # If the model replied without calling a tool, nudge it to keep going rather than
        # ending the rollout (mirrors the original benchmark's behavior).
        last = messages[-1]
        # METABOLIC COMPUTE COST: each agent turn (LLM call = "thinking") drains the survival
        # balance. Compute is a real cost in the world, not a score penalty -> over-thinking
        # causes earlier bankruptcy; it never trains "think less for points".
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
                    "content": "Continue operating the business by using your tools.",
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


# --- Survival-reward shaping (the "live longer" objective) ---
DAY_VALUE = 50.0          # reward per simulated day survived (longevity dominates)
NW_WEIGHT = 0.5           # net-worth bonus, ONLY if not bankrupt (survive THEN grow)
BANKRUPT_PENALTY = 500.0  # hard penalty for going bankrupt (death)


async def survival_reward(state: vf.State) -> float:
    """Death-truncated survival return: reward each day the business stays solvent; add a
    net-worth bonus only if it survives; penalize bankruptcy. The metabolic compute cost is
    already drained from the balance in the world (env_response), so there is NO flat per-turn
    penalty here -> the agent optimizes for LIVING LONGER, never for thinking less."""
    vb = state.get("vb")
    if not vb:
        return 0.0
    r = DAY_VALUE * float(vb["day"])
    if vb.get("game_over_reason") == "bankruptcy":
        r -= BANKRUPT_PENALTY
    else:
        r += NW_WEIGHT * float(net_worth_of(vb))
    return r


async def compute_spent(state: vf.State) -> float:
    vb = state.get("vb")
    return float(vb.get("compute_spent", 0.0)) if vb else 0.0


# --------------------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------------------

def load_environment(
    num_examples: int = 5,
    max_turns: int = 150,
    initial_balance: float = 500.0,
    daily_fee: float = 2.0,
    delivery_days: int = 3,
    max_days: int = 365,
    bankruptcy_days: int = 10,
    small_slot_capacity: int = 15,
    large_slot_capacity: int = 10,
    max_small_slots: int = 6,
    max_large_slots: int = 6,
    seed: int = 0,
    conditioning_mode: str = "homogeneous",
    demand_scale: float = 1.0,
    compute_cost: float = 0.0,
    n_families: int = 1,
    family: int = -1,
    **kwargs,
) -> vf.Environment:
    """Load the Vending-Bench environment.

    Args:
        num_examples: number of distinct seeded scenarios in the dataset.
        max_turns: max agent turns (message budget) per rollout.
        initial_balance: starting cash balance.
        daily_fee: fee charged each simulated day.
        delivery_days: days between ordering and delivery to storage.
        max_days: hard cap on simulated days per rollout.
        bankruptcy_days: consecutive days unable to pay the fee before termination.
        small_slot_capacity / large_slot_capacity: per-slot unit capacity in the machine.
        max_small_slots / max_large_slots: number of small/large slots in the machine.
        seed: base RNG seed (example i uses seed + i).
    """
    config = {
        "max_turns": max_turns,
        "initial_balance": initial_balance,
        "daily_fee": daily_fee,
        "delivery_days": delivery_days,
        "max_days": max_days,
        "bankruptcy_days": bankruptcy_days,
        "small_slot_capacity": small_slot_capacity,
        "large_slot_capacity": large_slot_capacity,
        "max_small_slots": max_small_slots,
        "max_large_slots": max_large_slots,
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
    rows = []
    for i in range(max(1, num_examples)):
        style = style_pool[i % len(style_pool)] if conditioning_mode == "diverse" else style_pool[0]
        rows.append({
            "question": USER_KICKOFF + "\n\n" + style,
            "answer": "",
            "info": {"seed": seed + i, "conditioning_mode": conditioning_mode,
                     "n_families": n_families, "family": family, "operating_style": style},
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

    return VendingBenchEnv(
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

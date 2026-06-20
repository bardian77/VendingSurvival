"""Bayesian-optimal (oracle) operator for the simplified vending-survival env.

The demand model is KNOWN (per product: cost, ref price, base_sales, elasticity), so the
expected-reward-maximizing policy is computable. This builds it and runs it on the env to
get the CEILING `survival_reward` — what a perfect operator achieves under the same rules,
turn budget, and per-turn compute cost the LLM faces. LLM agents are then reported as a
fraction of this ceiling.

Optimal price per product: maximize expected daily profit  E[units]*(price-cost), where
E[units] = base_sales * (price/ref)^elasticity * (avg day multipliers). For elastic goods
this has an interior max; for inelastic goods we cap at the price where E[units] >= 1 (it
must still actually sell). Optimal operation: stock to capacity at those prices, collect
cash daily to pay the fee, restock what sold, survive. Turn-matched (each tool call = 1
turn, capped at max_turns) and charged the same compute_cost per turn.
"""
import asyncio, statistics
from vending_survival import (load_environment, restock, collect_cash, wait_for_next_day,
                              net_worth_of, CATALOG)

DAY_VALUE, NW_WEIGHT, BANKRUPT_PENALTY = 50.0, 0.5, 500.0
AVG_MULT = 1.3  # approx avg of dow * weather * choice multipliers

def optimal_price(p):
    ref, cost, eps = p["price"], p["cost"], p["elasticity"]
    best_p, best_profit = ref, -1.0
    price = round(cost * 1.1, 2)
    while price <= ref * 5:
        eu = p["base_sales"] * (price / ref) ** eps * AVG_MULT
        if eu >= 1.0:
            profit = eu * (price - cost)
            if profit > best_profit:
                best_profit, best_p = profit, price
        price = round(price + 0.05, 2)
    return round(best_p, 2)

def run_oracle(seed, max_turns=40, compute_cost=0.5, **econ):
    env = load_environment(num_examples=1, seed=seed, max_turns=10**9, **econ)
    state = {"info": {"seed": seed}}
    asyncio.run(env.setup_state(state))
    vb = state["vb"]
    prices = {p["name"]: optimal_price(p) for p in CATALOG}
    cap = vb["slot_capacity"]
    turns = 0
    def tick():                       # each tool call = 1 turn, pays compute cost
        nonlocal turns
        turns += 1; vb["balance"] -= compute_cost
    for name in prices:               # day 1: stock all to capacity at optimal price
        if turns >= max_turns or vb["game_over"]: break
        restock(name, cap, state, price=prices[name]); tick()
    while turns < max_turns and not vb["game_over"]:
        collect_cash(state); tick()
        for name in prices:           # restock only what dropped low (turn-efficient)
            if turns >= max_turns: break
            if vb["machine"].get(name, {}).get("qty", 0) < cap / 3:
                restock(name, cap, state, price=prices[name]); tick()
        if turns >= max_turns: break
        wait_for_next_day(state); tick()
    bankrupt = vb["game_over_reason"] == "bankruptcy"
    r = DAY_VALUE * vb["day"] + (-BANKRUPT_PENALTY if bankrupt else NW_WEIGHT * net_worth_of(vb))
    return dict(reward=r, days=vb["day"], nw=net_worth_of(vb), units=vb["units_sold"],
                bankrupt=bankrupt, turns=turns)

if __name__ == "__main__":
    econ = dict(initial_balance=200, daily_fee=5, demand_scale=1.0, bankruptcy_days=3, max_days=30)
    print("optimal prices:", {p["name"]: optimal_price(p) for p in CATALOG})
    res = [run_oracle(s, max_turns=40, compute_cost=0.5, **econ) for s in range(16)]
    m = lambda k: round(statistics.mean(r[k] for r in res), 1)
    print("\n=== ORACLE (Bayesian-optimal, turn-matched 40, compute_cost 0.5), avg/16 seeds ===")
    print(f"  survival_reward: {m('reward')}")
    print(f"  days_survived:   {m('days')}")
    print(f"  net_worth:       {m('nw')}")
    print(f"  units_sold:      {m('units')}")
    print(f"  bankrupt_rate:   {m('bankrupt')}")

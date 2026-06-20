"""Info-matched ("blind") oracle for the vending-survival env.

Same optimal *operation* as oracle.py (stock to capacity, collect daily, survive, turn-matched,
compute-charged) — but it does NOT know the demand model. It infers each product's
(base_sales, elasticity) from observed sales: probe 2 prices, fit log(units) = log(base) +
elasticity*log(price/ref), then price at the ESTIMATED profit-maximizing point and exploit.

Decomposition:
  full-info oracle (oracle.py)   = ceiling if you KNOW demand
  blind oracle (this)            = ceiling if you must LEARN demand (partial observability)
  full-info - blind              = the value of knowing the demand (cost of hidden info)
  LLM vs blind                   = the LLM's reasoning/learning quality (info-matched, fair)
"""
import asyncio, statistics, math
from vending_survival import (load_environment, restock, collect_cash, wait_for_next_day,
                              net_worth_of, CATALOG)

SURVIVE_BONUS, PROFIT_WEIGHT, BANKRUPT_PENALTY = 200.0, 0.5, 500.0  # new reward: profit under survival gate
NAMES = [p["name"] for p in CATALOG]
REF = {p["name"]: p["price"] for p in CATALOG}
COST = {p["name"]: p["cost"] for p in CATALOG}

def est_optimal_price(base_hat, eps_hat, ref, cost):
    best_p, best = round(2 * cost, 2), -1.0
    p = round(cost * 1.1, 2)
    while p <= ref * 5:
        eu = base_hat * (p / ref) ** eps_hat
        if eu >= 1.0:
            pr = eu * (p - cost)
            if pr > best: best, best_p = pr, p
        p = round(p + 0.05, 2)
    return round(best_p, 2)

def run_blind(seed, max_turns=40, compute_cost=0.5, **econ):
    env = load_environment(num_examples=1, seed=seed, max_turns=10**9, **econ)
    state = {"info": {"seed": seed}}; asyncio.run(env.setup_state(state)); vb = state["vb"]
    cap = vb["slot_capacity"]; turns = [0]
    def tick():
        turns[0] += 1; vb["balance"] -= compute_cost
    obs = {n: [] for n in NAMES}
    def stock_all(price_of):                      # price_of(name) -> price
        for n in NAMES:
            if turns[0] >= max_turns or vb["game_over"]: return
            restock(n, cap, state, price=round(price_of(n), 2)); tick()
    def run_day():
        before = {n: vb["machine"].get(n, {}).get("qty", 0) for n in NAMES}
        pnow = {n: vb["machine"].get(n, {}).get("price") for n in NAMES}
        wait_for_next_day(state); tick()
        for n in NAMES:
            sold = before[n] - vb["machine"].get(n, {}).get("qty", 0)
            if pnow[n] and sold > 0: obs[n].append((pnow[n], sold))
    # EXPLORE: 2 probe prices (both >= ref -> low enough demand, no stockout censoring)
    stock_all(lambda n: 1.5 * REF[n]); run_day()
    if not vb["game_over"]: collect_cash(state); tick()
    if not vb["game_over"]: stock_all(lambda n: 4.0 * REF[n]); run_day()
    if not vb["game_over"]: collect_cash(state); tick()
    # ESTIMATE (base, elasticity) per product from the 2 points
    prices = {}
    for n in NAMES:
        pts = obs[n]
        if len(pts) >= 2 and pts[0][0] != pts[1][0]:
            (p1, u1), (p2, u2) = pts[0], pts[1]
            eps = (math.log(u2) - math.log(u1)) / (math.log(p2 / REF[n]) - math.log(p1 / REF[n]))
            base = u1 / ((p1 / REF[n]) ** eps)
            prices[n] = est_optimal_price(base, eps, REF[n], COST[n])
        else:
            prices[n] = round(2 * COST[n], 2)
    # EXPLOIT the estimated optimum
    stock_all(lambda n: prices[n])
    while turns[0] < max_turns and not vb["game_over"]:
        collect_cash(state); tick()
        for n in NAMES:
            if turns[0] >= max_turns: break
            if vb["machine"].get(n, {}).get("qty", 0) < cap / 3:
                restock(n, cap, state, price=prices[n]); tick()
        if turns[0] >= max_turns: break
        wait_for_next_day(state); tick()
    bankrupt = vb["game_over_reason"] == "bankruptcy"
    r = -BANKRUPT_PENALTY if bankrupt else (SURVIVE_BONUS + PROFIT_WEIGHT * (net_worth_of(vb) - econ.get("initial_balance", 200.0)))
    return dict(reward=r, days=vb["day"], nw=net_worth_of(vb), units=vb["units_sold"],
                bankrupt=bankrupt, turns=turns[0])

if __name__ == "__main__":
    econ = dict(initial_balance=200, daily_fee=5, demand_scale=1.0, bankruptcy_days=3, max_days=30)
    res = [run_blind(s, **econ) for s in range(16)]
    m = lambda k: round(statistics.mean(r[k] for r in res), 1)
    print("=== INFO-MATCHED (blind) ORACLE — must learn demand, avg/16 seeds ===")
    print(f"  survival_reward {m('reward')} | days {m('days')} | net_worth {m('nw')} "
          f"| units {m('units')} | bankrupt {m('bankrupt')} | turns {m('turns')}")

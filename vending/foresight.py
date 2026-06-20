import numpy as np
from vending.economy import operate_tick
C_N = 0.8   # compute cost per foresight draw (the real spend)
def forecast(inventory, pending, action, demand, saturation, seed, cfg, tick):
    rng = np.random.default_rng(seed)            # explicit per-candidate seed (no implicit fork)
    _, _, revenue = operate_tick(dict(inventory), dict(pending), action, demand, saturation, rng, cfg, tick)
    return float(revenue)
def best_of_n(candidates, ctx, n, cfg):
    cands = candidates[:n]
    scores = [forecast(ctx["inventory"], ctx["pending"], a, ctx["demand"], ctx["saturation"],
                       ctx["seed"], cfg, ctx["tick"]) for a in cands]
    chosen = cands[int(np.argmax(scores))]
    return chosen, C_N * n

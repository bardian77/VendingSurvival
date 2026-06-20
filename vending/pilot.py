import numpy as np
from vending.genome import Genome
from vending.world import World
def run_pilot(cfg, policies, episodes=8, T=20, seed=0):
    out = {}
    for name, pol in policies.items():
        totals = []
        for ep in range(episodes):
            rng = np.random.default_rng(seed*1000 + ep)
            gs = [Genome.random(rng) for _ in range(cfg.pool_size)]
            m = World(cfg, gs, pol, seed=seed*1000+ep).run(T)
            totals.append(m[-1]["total_balance"])
        out[name] = float(np.mean(totals))
    return out
def accept(pilot_result, oracle_mean):
    learner = pilot_result.get("naive", pilot_result.get("zero_shot", 0.0))
    rand = max(1e-9, pilot_result.get("random", 0.0))
    frac = learner / max(1e-9, oracle_mean)
    if frac > 0.70: return False, f"SATURATED: learner at {frac:.0%} of ceiling"
    if frac < 0.30: return False, f"TOO HARD: learner at {frac:.0%} of ceiling"
    if learner < 2*rand: return False, "gap random->learner < 2x"
    return True, f"OK: learner at {frac:.0%}, gap {learner/rand:.1f}x"

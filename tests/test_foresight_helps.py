"""Proof the headline holds: with a predictive forecast and genuinely differing
candidates, best-of-N selection raises realized one-tick revenue above best-of-1.

The harness mirrors the World loop exactly: it draws a per-tick seed, generates k
candidates via ExploratoryVendor (whose pricing jitter makes the candidates
differ), runs best_of_n to pick one, then REALIZES the chosen action with
np.random.default_rng(seed) -- the same seed the forecast used -- so the forecast for
the chosen candidate is exactly predictive. Averaged over seeds, n=8 must beat n=1.
"""
import numpy as np
from vending.config import DEFAULT
from vending.policy import ExploratoryVendor
from vending.foresight import best_of_n, C_N
from vending.economy import operate_tick, VendingAction

TYPES = ["n1", "n2", "n3"]


def _stocked():
    # well-stocked inventory so sales reflect the pricing, not a stock floor
    return {t: 12 for t in TYPES}


def _realized_revenue(pol, n, seed):
    """One tick: propose k=n candidates, best_of_n-select, realize with the forecast seed."""
    rng = np.random.default_rng(seed)
    inventory = _stocked()
    pending = {t: 0 for t in TYPES}
    demand = float(np.mean(DEFAULT.demand_rate))
    saturation = 0.3
    ctx = dict(inventory=inventory, pending=pending, demand=demand, saturation=saturation,
               seed=int(np.random.default_rng(seed + 1).integers(1e9)), tick=2)
    cands = pol.propose({"inventory": inventory}, None, rng, k=n)
    action, _cost = best_of_n(cands, ctx, n, DEFAULT)
    _, _, revenue = operate_tick(inventory, pending, action, demand, saturation,
                                 np.random.default_rng(ctx["seed"]), DEFAULT, ctx["tick"])
    return float(revenue)


def test_best_of_n_increases_realized_sales():
    pol = ExploratoryVendor()
    seeds = range(20)  # >= 6 seeds, averaged
    mean_n1 = float(np.mean([_realized_revenue(pol, 1, s) for s in seeds]))
    mean_n8 = float(np.mean([_realized_revenue(pol, 8, s) for s in seeds]))
    # falsifiable: if the forecast were uncorrelated with realization (the old bug),
    # this would not hold. best-of-8 must strictly beat best-of-1.
    assert mean_n8 > mean_n1, f"best_of_8 mean revenue {mean_n8} not > best_of_1 {mean_n1}"


def test_compute_cost_uses_requested_n():
    a = VendingAction({t: 1 for t in TYPES}, {t: 1.0 for t in TYPES})
    ctx = dict(inventory=_stocked(), pending={t: 0 for t in TYPES},
               demand=8.0, saturation=0.3, seed=11, tick=2)
    # short candidate list (1 candidate) but requested depth n=8 -> cost charges n=8
    _chosen, cost = best_of_n([a], ctx, n=8, cfg=DEFAULT)
    assert cost == C_N * 8, f"cost {cost} != C_N*8 ({C_N * 8})"

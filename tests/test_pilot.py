import numpy as np
from vending.config import DEFAULT
from vending.oracle import best_achievable_revenue
from vending.pilot import run_pilot, accept
from vending.policy import RandomPolicy, NaiveGreedyPolicy
def test_oracle_positive_for_stocked_demand():
    # A true demand-ceiling must be strictly POSITIVE for stocked inventory at nonzero demand
    # (demand can supply revenue); the old >= 0 assertion was too weak to catch a ceiling
    # that collapsed to 0.
    assert best_achievable_revenue(DEFAULT, 8.0, 0.2, {"n1":5,"n2":5,"n3":5}, 0, 0) > 0
def test_oracle_monotone_in_demand():
    # The ceiling is bounded by DEMAND, so higher demand can only raise (never lower) the
    # best achievable revenue. Inventory is made effectively infinite inside the oracle, so a
    # small `inventory` arg must not cap this. Weakly increasing across a demand sweep.
    prev = -1.0
    for d in [1.0, 2.0, 4.0, 8.0, 16.0, 32.0]:
        e = best_achievable_revenue(DEFAULT, d, 0.0, {"n1":5,"n2":5,"n3":5}, 0, 0)
        assert e >= prev - 1e-9, f"oracle decreased with demand at d={d}: {e} < {prev}"
        prev = e
def test_pilot_orders_random_below_naive():
    res = run_pilot(DEFAULT, {"random":RandomPolicy(),"naive":NaiveGreedyPolicy()},
                    episodes=8, T=20, seed=4)
    assert res["naive"] >= res["random"]
def test_accept_band_logic():
    ok, _ = accept({"random":10.0,"naive":50.0}, oracle_mean=100.0)   # naive=50% of oracle, 5x gap
    assert ok is True
    bad, reason = accept({"random":10.0,"naive":95.0}, oracle_mean=100.0)  # saturated (95%)
    assert bad is False and "SATURATED" in reason
    # TOO-HARD branch: learner below 30% of the ceiling -> reject
    too_hard, reason = accept({"random":1.0,"naive":20.0}, oracle_mean=100.0)  # 20% of ceiling
    assert too_hard is False and "TOO HARD" in reason
    # gap<2x branch: learner in the [30%,70%] band but < 2x random -> reject
    small_gap, reason = accept({"random":20.0,"naive":30.0}, oracle_mean=100.0)  # 30% of ceiling, 1.5x random
    assert small_gap is False and "< 2x" in reason

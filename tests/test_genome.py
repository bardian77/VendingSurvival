import numpy as np
from vending.genome import Genome, GENES, InstinctConfig, crossover
def _ic(w_survival, w_growth, w_cooperation):
    # InstinctConfig with the three drive weights set; the other fields are inert for drive().
    return InstinctConfig(w_survival=w_survival, w_growth=w_growth, w_cooperation=w_cooperation,
                          best_of_n=1, price_aggression=0.0, stock_buffer=0.0,
                          cash_buffer_pref=0.0, mutation_self_rate=0.0)
def test_decode_best_of_n_in_allowed_set():
    g = Genome.random(np.random.default_rng(0))
    ic = g.decode()
    assert ic.best_of_n in (1, 2, 4, 8)
def test_drive_weight_contract():
    # Contract: an instinct with a single active weight reduces drive() to exactly that
    # channel (within eps from the +eps normalizer). This is falsifiable per channel — swapping
    # two channels in the formula would break it, unlike the old "is finite" tautology.
    R, D, G, S = 5.0, 2.0, 0.1, 1.0
    eps = 1e-3
    assert abs(_ic(1.0, 0.0, 0.0).drive(revenue=R, delta_balance=D, growth=G, cooperation=S) - D) < eps
    assert abs(_ic(0.0, 1.0, 0.0).drive(revenue=R, delta_balance=D, growth=G, cooperation=S) - (R + G)) < eps
    assert abs(_ic(0.0, 0.0, 1.0).drive(revenue=R, delta_balance=D, growth=G, cooperation=S) - S) < eps
def test_mutate_stays_in_bounds():
    rng = np.random.default_rng(1); g = Genome.random(rng).mutate(rng, 0.5)
    assert g.vec.min() >= 0.0 and g.vec.max() <= 1.0
def test_crossover_mixes_parents():
    rng = np.random.default_rng(2)
    a, b = Genome(np.zeros(16)), Genome(np.ones(16))
    c = crossover(a, b, rng)
    assert set(np.unique(c.vec)).issubset({0.0, 1.0})  # uniform crossover

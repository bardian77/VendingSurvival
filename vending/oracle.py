import itertools, numpy as np
from vending.economy import compute_sales

_BIG_INVENTORY_PER_TYPE = 10**9   # effectively infinite inventory: DEMAND, not the stock, bounds sales
_N_DRAWS = 16                     # Poisson draws averaged per price level, sharing one advancing rng


def best_achievable_revenue(cfg, demand, saturation, inventory, seed, tick, n_draws=_N_DRAWS):
    """True demand-ceiling: the best expected single-tick revenue the DEMAND
    can supply at this demand/saturation, found by searching pricing levels. Inventory is made
    effectively infinite so demand, not the `inventory` arg, bounds sales; each
    price level is scored as the MEAN over several Poisson draws drawn from ONE advancing rng (so
    different price levels see different draws and the estimate is not a single noisy sample).
    `inventory`/`tick` are kept in the signature for call-site compatibility but do not cap sales.
    (Weakly) increasing in demand."""
    rng = np.random.default_rng(seed)
    big = {f"n{i+1}": _BIG_INVENTORY_PER_TYPE for i in range(cfg.n_types)}
    best = 0.0
    for level in itertools.product([0.5, 1.0, 2.0], repeat=cfg.n_types):
        price = {f"n{i+1}": level[i] for i in range(cfg.n_types)}
        draws = [compute_sales(big, price, demand, saturation, rng, cfg)[1]
                 for _ in range(n_draws)]
        best = max(best, float(np.mean(draws)))
    return float(best)

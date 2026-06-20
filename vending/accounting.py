def _buffer_potential(bal, cfg):
    lo = max(0.0, cfg.band_lo - bal); hi = max(0.0, bal - cfg.band_hi)
    return -cfg.eta * (lo + 0.5 * hi) ** 2
def buffer_shaping(bal_prev, bal_next, cfg):
    return cfg.gamma * _buffer_potential(bal_next, cfg) - _buffer_potential(bal_prev, cfg)   # PBRS (policy-invariant)
def delta_balance(revenue, compute, bal_prev, cfg):
    raw_next = bal_prev + cfg.revenue_scale * revenue - cfg.daily_cost - cfg.compute_cost * compute
    bal_next = min(cfg.max_balance, max(0.0, raw_next))
    d = bal_next - bal_prev + buffer_shaping(bal_prev, bal_next, cfg)
    return d, bal_next
def do_nothing_is_lethal(cfg, expected_revenue_n1):
    # left inequality of the survival invariant: revenue_scale*E[revenue|N=1] < daily_cost
    return cfg.revenue_scale * expected_revenue_n1 < cfg.daily_cost

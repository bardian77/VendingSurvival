from vending.config import DEFAULT
from vending.accounting import delta_balance, do_nothing_is_lethal, buffer_shaping
def test_do_nothing_strictly_lethal():
    # with no revenue and no compute, balance must fall (daily_cost dominates)
    d, bn = delta_balance(revenue=0.0, compute=0.0, bal_prev=50.0, cfg=DEFAULT)
    assert d < 0 and bn < 50.0
def test_compute_costs_balance():
    d0, _ = delta_balance(revenue=10.0, compute=0.0, bal_prev=50.0, cfg=DEFAULT)
    d1, _ = delta_balance(revenue=10.0, compute=2.0, bal_prev=50.0, cfg=DEFAULT)
    assert d1 < d0
def test_balance_clipped_to_max_balance_and_zero():
    _, bhi = delta_balance(1000.0, 0.0, 99.0, DEFAULT); assert bhi == DEFAULT.max_balance
    _, blo = delta_balance(0.0, 1000.0, 1.0, DEFAULT); assert blo == 0.0
def test_invariant_helper():
    # expected single-look revenue below survival threshold -> lethal=True
    assert do_nothing_is_lethal(DEFAULT, expected_revenue_n1=0.5) is True
def test_buffer_shaping_active_below_band():
    # Below the buffer-shaping band (bal_prev=20 < band_lo=40), the potential-based shaping term
    # must be nonzero and must move delta_balance away from the raw (no-shaping) value
    # bal_next - bal_prev. This proves the buffer-shaping term is wired into delta_balance and active
    # in the deficit region.
    cfg = DEFAULT
    bal_prev = 20.0
    assert bal_prev < cfg.band_lo
    d, bal_next = delta_balance(revenue=10.0, compute=0.0, bal_prev=bal_prev, cfg=cfg)
    no_shaping = bal_next - bal_prev              # what d would be with zero shaping
    shaping = buffer_shaping(bal_prev, bal_next, cfg)
    assert abs(shaping) > 1e-9                    # shaping term is nonzero below the band
    assert abs(d - no_shaping) > 1e-9            # it changes the returned delta
    assert abs(d - (no_shaping + shaping)) < 1e-9  # and it is exactly the added term

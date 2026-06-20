from vending.config import DEFAULT, Config
def test_defaults_present():
    assert DEFAULT.n_types == 3
    assert DEFAULT.revenue_scale > 0 and DEFAULT.daily_cost > 0
    assert DEFAULT.compute_cost_sweep == (0.25, 1.0, 4.0)
def test_is_frozen_copyable():
    c = Config(**{**DEFAULT.__dict__, "compute_cost": 4.0})
    assert c.compute_cost == 4.0 and DEFAULT.compute_cost != 4.0

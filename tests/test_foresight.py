from vending.config import DEFAULT
from vending.economy import VendingAction
from vending.foresight import best_of_n
def _ctx():
    return dict(inventory={"n1":5,"n2":5,"n3":5}, pending={"n1":0,"n2":0,"n3":0},
                demand=8.0, saturation=0.3, seed=11, tick=2)
def test_best_of_n_picks_higher_forecast():
    bad = VendingAction({"n1":0,"n2":0,"n3":0}, {"n1":9,"n2":9,"n3":9})   # over-aggressive -> low sales
    good = VendingAction({"n1":2,"n2":2,"n3":2}, {"n1":1,"n2":1,"n3":1})
    chosen, cost = best_of_n([bad, good], _ctx(), n=2, cfg=DEFAULT)
    assert chosen is good
def test_compute_cost_scales_with_n():
    a = VendingAction({"n1":1,"n2":1,"n3":1}, {"n1":1,"n2":1,"n3":1})
    _, c2 = best_of_n([a, a], _ctx(), n=2, cfg=DEFAULT)
    _, c8 = best_of_n([a]*8, _ctx(), n=8, cfg=DEFAULT)
    assert c8 > c2

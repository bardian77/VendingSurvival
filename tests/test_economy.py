import numpy as np
from vending.config import DEFAULT
from vending.economy import VendingAction, operate_tick
def test_restock_clipped_to_affordable_balance_proxy():
    # restocking costs balance now; over-restock is clipped, never negative stock
    inventory = {"n1":0,"n2":0,"n3":0}; pending = {"n1":0,"n2":0,"n3":0}
    a = VendingAction(restock={"n1":5,"n2":0,"n3":0}, price={"n1":2.0,"n2":2.0,"n3":2.0})
    ns, np_, e = operate_tick(inventory, pending, a, demand=10.0, saturation=0.0,
                              rng=np.random.default_rng(0), cfg=DEFAULT, tick=0)
    assert all(v >= 0 for v in ns.values())
def test_delivery_lag_one_tick():
    inventory = {"n1":0,"n2":0,"n3":0}; pending = {"n1":0,"n2":0,"n3":0}
    a = VendingAction(restock={"n1":4,"n2":0,"n3":0}, price={"n1":2.0,"n2":2.0,"n3":2.0})
    ns, np_, e = operate_tick(inventory, pending, a, 10.0, 0.0, np.random.default_rng(0), DEFAULT, 0)
    assert ns["n1"] == 0 and np_["n1"] == 4   # arrives next tick, not this tick
def test_deterministic_given_seed():
    args = ({"n1":3,"n2":3,"n3":3},{"n1":0,"n2":0,"n3":0},
            VendingAction({"n1":1,"n2":1,"n3":1},{"n1":2,"n2":2,"n3":2}),8.0,0.5)
    e1 = operate_tick(*args, np.random.default_rng(7), DEFAULT, 1)[2]
    e2 = operate_tick(*args, np.random.default_rng(7), DEFAULT, 1)[2]
    assert e1 == e2
def test_spoilage_zeroes_perishable_on_spoil_tick():
    # perishable n3 spoils when (tick+1) % spoil_every == 0. Operate with an over-aggressive
    # price (very high level -> ~zero sales via exp(-elasticity*eff)) so n1/n2 stay
    # stocked and the ONLY change to n3 is spoilage. At tick = spoil_every-1, n3 must zero out
    # while n1/n2 survive (isolates spoilage from sales depletion).
    inventory = {"n1":5,"n2":5,"n3":5}; pending = {"n1":0,"n2":0,"n3":0}
    a = VendingAction(restock={"n1":0,"n2":0,"n3":0},
                      price={"n1":50.0,"n2":50.0,"n3":50.0})  # over-aggressive: minimal sales
    tick = DEFAULT.spoil_every - 1
    ns, _, _ = operate_tick(inventory, pending, a, demand=8.0, saturation=0.0,
                            rng=np.random.default_rng(0), cfg=DEFAULT, tick=tick)
    assert ns["n3"] == 0
    assert ns["n1"] > 0 and ns["n2"] > 0

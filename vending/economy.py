from dataclasses import dataclass
import numpy as np
@dataclass
class VendingAction:
    restock: dict   # SKU -> units to restock (arrive next tick)
    price: dict     # SKU -> pricing level/selectivity (>=0)
def _sales_for(t, inventory, price, demand, saturation, rng, cfg):
    # demand falls with saturation and with over-aggressive pricing
    eff = max(0.0, price.get(t, 1.0))
    lam = demand * np.exp(-cfg.elasticity * eff) / (1.0 + saturation)
    avail = rng.poisson(max(lam, 0.0))
    return int(min(avail, inventory.get(t, 0)))   # can't sell more than on hand
def compute_sales(inventory, price, demand, saturation, rng, cfg):
    units_sold = {t: _sales_for(t, inventory, price, demand, saturation, rng, cfg) for t in inventory}
    revenue = float(sum(units_sold.values()))    # 1 unit sold -> 1 revenue (pre revenue_scale)
    return units_sold, revenue
def operate_tick(inventory, pending, action, demand, saturation, rng, cfg, tick):
    inventory = dict(inventory); pending = dict(pending)
    # 1. deliver yesterday's restocks
    for t in inventory: inventory[t] += pending.get(t, 0)
    # 2. queue new restocks (arrive next tick); clip negatives
    new_pending = {t: max(0, int(action.restock.get(t, 0))) for t in inventory}
    # 3. sell from current inventory via pricing
    units_sold, revenue = compute_sales(inventory, action.price, demand, saturation, rng, cfg)
    for t in inventory: inventory[t] -= units_sold[t]
    # 4. operating cost: holding cost on remaining stock
    held = sum(inventory.values())
    revenue -= cfg.holding_rate * held
    # 5. spoilage of perishable SKU 3
    if (tick + 1) % cfg.spoil_every == 0:
        inventory["n3"] = 0
    return inventory, new_pending, float(revenue)

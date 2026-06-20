from dataclasses import dataclass, field
@dataclass
class Config:
    revenue_scale: float = 2.0  # units_sold -> balance
    daily_cost: float = 3.0     # daily consumption (death clock)
    compute_cost: float = 1.0   # per-unit compute overhead rate (swept)
    max_balance: float = 100.0
    repro_threshold: float = 80.0
    repro_cost: float = 40.0
    gamma: float = 0.99
    band_lo: float = 40.0       # buffer-shaping band
    band_hi: float = 80.0
    eta: float = 0.02
    n_types: int = 3
    pool_size: int = 20         # starting agent count
    holding_rate: float = 0.02
    operating_cost: float = 2.0     # fixed operating overhead / tick
    spoil_every: int = 3        # SKU 3 (perishable) spoils
    delivery_lag: int = 1
    demand_rate: tuple = (6.0, 4.0, 5.0)   # base demand per SKU (canonical name; spec alias: demand_rate)
    elasticity: float = 0.3
    compute_cost_sweep: tuple = (0.25, 1.0, 4.0)
DEFAULT = Config()

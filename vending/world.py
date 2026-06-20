from dataclasses import dataclass, field
import numpy as np
from vending.economy import operate_tick
from vending.accounting import delta_balance
from vending.foresight import best_of_n
TYPES = ["n1","n2","n3"]
@dataclass
class Agent:
    id: int; balance: float; genome: object
    inventory: dict = field(default_factory=lambda: {t:0 for t in TYPES})
    pending: dict = field(default_factory=lambda: {t:0 for t in TYPES})
    alive: bool = True; birth_tick: int = 0
class World:
    def __init__(self, cfg, genomes, policy, seed=0):
        self.cfg = cfg; self.policy = policy; self.tick = 0
        self.rng = np.random.default_rng(seed); self.seed = seed
        self.agents = [Agent(i, cfg.max_balance*0.6, g) for i, g in enumerate(genomes)]
        self._next_id = len(self.agents)
    def _obs(self, a, demand, saturation):
        return {"balance":a.balance, "inventory":dict(a.inventory),
                "base_demand":demand, "saturation":saturation}
    def step(self):
        cfg = self.cfg; alive = [a for a in self.agents if a.alive]
        base_demand = float(np.mean(cfg.demand_rate))
        saturation = max(0.0, (len(alive)-1)) * 0.05           # scarcity from crowding
        revenue_total = 0.0
        for a in alive:
            ic = a.genome.decode()
            cands = self.policy.propose(self._obs(a, base_demand, saturation), ic, self.rng, k=ic.best_of_n)
            ctx = dict(inventory=a.inventory, pending=a.pending, demand=base_demand,
                       saturation=saturation, seed=int(self.rng.integers(1e9)), tick=self.tick)
            action, compute = best_of_n(cands, ctx, ic.best_of_n, cfg)
            a.inventory, a.pending, revenue = operate_tick(
                a.inventory, a.pending, action, base_demand, saturation,
                np.random.default_rng(ctx["seed"]), cfg, self.tick)
            revenue -= cfg.operating_cost
            d, bnew = delta_balance(revenue, compute, a.balance, cfg)
            a.balance = bnew; revenue_total += max(0.0, revenue)
            if a.balance <= 0: a.alive = False
        self.tick += 1
        alive = [a for a in self.agents if a.alive]
        return {"tick":self.tick, "population":len(alive),
                "total_balance":float(sum(a.balance for a in alive)),
                "revenue_total":revenue_total,
                "mean_best_of_n":float(np.mean([a.genome.decode().best_of_n for a in alive])) if alive else 0.0}
    def run(self, T):
        return [self.step() for _ in range(T)]

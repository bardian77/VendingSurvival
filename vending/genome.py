from dataclasses import dataclass
import numpy as np
GENES = ["w_survival","w_growth","w_cooperation","best_of_n","search_depth",
 "foresight_threshold","compute_budget","price_aggression","stock_buffer",
 "cash_buffer_pref","risk_tol","expand_thresh","conflict_thresh","collab_bias",
 "novelty_pref","mutation_self_rate"]
_BON = [1,2,4,8]
@dataclass
class InstinctConfig:
    w_survival: float; w_growth: float; w_cooperation: float
    best_of_n: int; price_aggression: float; stock_buffer: float
    cash_buffer_pref: float; mutation_self_rate: float
    def drive(self, revenue, delta_balance, growth, cooperation):
        eps = 1e-6
        num = (self.w_survival*delta_balance + self.w_growth*(revenue+growth)
               + self.w_cooperation*cooperation)
        return num / (self.w_survival + self.w_growth + self.w_cooperation + eps)
class Genome:
    def __init__(self, vec): self.vec = np.clip(np.asarray(vec, float), 0.0, 1.0)
    @classmethod
    def random(cls, rng): return cls(rng.random(len(GENES)))
    def g(self, name): return float(self.vec[GENES.index(name)])
    def decode(self):
        return InstinctConfig(
            w_survival=self.g("w_survival"), w_growth=self.g("w_growth"),
            w_cooperation=self.g("w_cooperation"),
            best_of_n=_BON[min(int(self.g("best_of_n")*4), 3)],
            price_aggression=self.g("price_aggression"),
            stock_buffer=self.g("stock_buffer"),
            cash_buffer_pref=self.g("cash_buffer_pref"),
            mutation_self_rate=self.g("mutation_self_rate"))
    def mutate(self, rng, sigma=None):
        s = (self.g("mutation_self_rate")*0.15 + 0.02) if sigma is None else sigma
        return Genome(self.vec + rng.normal(0, s, self.vec.shape))
def crossover(a, b, rng):
    mask = rng.random(a.vec.shape) < 0.5
    return Genome(np.where(mask, a.vec, b.vec))

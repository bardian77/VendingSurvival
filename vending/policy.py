import json
import numpy as np
from vending.economy import VendingAction
TYPES = ["n1","n2","n3"]
def parse_action(text, n_types):
    try:
        d = json.loads(text)
        restock = {t: max(0, int(d["restock"].get(t, 0))) for t in TYPES[:n_types]}
        price = {t: max(0.0, float(d["price"].get(t, 1.0))) for t in TYPES[:n_types]}
        return VendingAction(restock, price)
    except Exception:
        return None
class RandomPolicy:
    def propose(self, obs, instinct, rng, k=1):
        return [VendingAction({t:int(rng.integers(0,6)) for t in TYPES},
                              {t:float(rng.uniform(0.5,3.0)) for t in TYPES}) for _ in range(k)]
class NaiveGreedyPolicy:
    def propose(self, obs, instinct, rng, k=1):
        buf = int(2 + instinct.stock_buffer*8)
        restock = {t: max(0, buf - obs["inventory"].get(t,0)) for t in TYPES}
        price = {t: 1.0 for t in TYPES}
        return [VendingAction(restock, price) for _ in range(k)]
class ExploratoryVendor:
    """Proposes k candidates with jittered pricing (gentle bias) so best-of-N has a real choice."""
    def __init__(self, base_restock=6): self.base_restock = base_restock
    def propose(self, obs, instinct, rng, k=1):
        out = []
        for _ in range(k):
            restock = {t: max(0, self.base_restock - obs["inventory"].get(t, 0)) for t in TYPES}
            eff = float(rng.uniform(0.5, 2.0))
            out.append(VendingAction(restock, {t: eff for t in TYPES}))
        return out
class LLMPolicy:
    def __init__(self, call_fn): self.call_fn = call_fn   # call_fn(prompt:str)->str
    def propose(self, obs, instinct, rng, k=1):
        prompt = self._prompt(obs, instinct)
        outs = [self.call_fn(prompt) for _ in range(k)]
        acts = [parse_action(o, len(TYPES)) or VendingAction({t:0 for t in TYPES},{t:1.0 for t in TYPES}) for o in outs]
        return acts
    def _prompt(self, obs, instinct):
        return ("You are a vending agent. Given your observations, output JSON "
                '{"restock":{"n1":int,...},"price":{"n1":float,...}} to maximize balance.\n'
                f"observations={json.dumps(obs)}")

import argparse, json, pathlib, numpy as np
from vending.config import DEFAULT
from vending.genome import Genome, _BON
from vending.policy import RandomPolicy, NaiveGreedyPolicy, ExploratoryVendor
from vending.world import World
from vending.ga import evolve
from vending.oracle import best_achievable_revenue
from vending.pilot import run_pilot, accept
from vending.economy import VendingAction

class _OraclePolicy:
    """Revenue-maximizing vendor = the headroom ceiling. In this demand model
    sales are demand*exp(-elasticity*price), so the LOWEST price (0.5)
    maximizes revenue; keep inventory well-stocked so sales are never inventory-limited."""
    def propose(self, obs, instinct, rng, k=1):
        types = ["n1", "n2", "n3"]
        inventory = obs["inventory"]
        restock = {t: max(0, 8 - inventory.get(t, 0)) for t in types}
        price = {t: 0.5 for t in types}
        return [VendingAction(restock, price)] * k

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gens", type=int, default=15); ap.add_argument("--T", type=int, default=30)
    ap.add_argument("--out", default="out"); ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args(); out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    # 1. headroom pilot — oracle measured empirically via World episodes (same metric as pilot)
    oracle_result = run_pilot(DEFAULT, {"oracle": _OraclePolicy()},
                              episodes=6, T=a.T, seed=a.seed)
    oracle = oracle_result["oracle"]
    pilot = run_pilot(DEFAULT, {"random": RandomPolicy(), "naive": NaiveGreedyPolicy()},
                      episodes=6, T=a.T, seed=a.seed)
    ok, reason = accept(pilot, oracle); print(f"[pilot] {pilot} oracle~{oracle:.1f} -> {reason}")
    (out/"pilot.json").write_text(json.dumps(
        {"oracle": oracle, **pilot, "accept_ok": ok, "reason": reason}, indent=2))
    # 2. GA evolution (frozen policy = naive; no training)
    rng = np.random.default_rng(a.seed); gs = [Genome.random(rng) for _ in range(DEFAULT.pool_size)]
    _, hist = evolve(gs, DEFAULT, ExploratoryVendor(), gens=a.gens, T=a.T, seed=a.seed)
    (out/"history.json").write_text(json.dumps(hist, indent=2))
    # 3. survival curves — {random, naive} + best-of-N sweep (bon_1, bon_2, bon_4, bon_8)
    surv = {}
    for name, pol in {"random": RandomPolicy(), "naive": NaiveGreedyPolicy()}.items():
        gs = [Genome.random(np.random.default_rng(a.seed)) for _ in range(DEFAULT.pool_size)]
        surv[name] = [m["population"] for m in World(DEFAULT, gs, pol, seed=a.seed).run(a.T)]
    # best-of-N sweep: NaiveGreedyPolicy with each genome's best_of_n fixed to each BON value
    GENES_LOCAL = ["w_survival","w_growth","w_cooperation","best_of_n","search_depth",
                   "foresight_threshold","compute_budget","price_aggression","stock_buffer",
                   "cash_buffer_pref","risk_tol","expand_thresh","conflict_thresh","collab_bias",
                   "novelty_pref","mutation_self_rate"]
    _bon_idx = GENES_LOCAL.index("best_of_n")
    _bon_vals = _BON  # [1, 2, 4, 8]
    for bon in _bon_vals:
        # encode bon value as genome gene: find the gene value that maps to this bon
        # _BON[min(int(g*4), 3)] == bon  => g in [bon_rank/4, (bon_rank+1)/4)
        bon_rank = _BON.index(bon)
        gene_val = (bon_rank + 0.5) / 4.0   # midpoint of the bucket
        rng_bon = np.random.default_rng(a.seed)
        gs_bon = [Genome.random(rng_bon) for _ in range(DEFAULT.pool_size)]
        for g in gs_bon:
            g.vec[_bon_idx] = gene_val
        surv[f"bon_{bon}"] = [m["population"] for m in
                              World(DEFAULT, gs_bon, ExploratoryVendor(), seed=a.seed).run(a.T)]
    (out/"survival.json").write_text(json.dumps(surv, indent=2))
    print(f"[done] wrote {out}/history.json, {out}/survival.json")
if __name__ == "__main__": main()

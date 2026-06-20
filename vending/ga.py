import numpy as np
from vending.genome import Genome, crossover
from vending.world import World
def fitness_by_rollout(genome, cfg, policy, T=20, seed=0):
    w = World(cfg, [genome]*max(3, cfg.pool_size//4), policy, seed=seed)
    metrics = w.run(T)
    surv = metrics[-1]["population"] / max(1, len(w.agents))
    profit = max(0.0, metrics[-1]["total_balance"])
    return float(surv * (1.0 + profit))
def fitness_sharing(fits, genomes, sigma=0.3):
    V = np.array([g.vec for g in genomes]); out = []
    for i, f in enumerate(fits):
        d = np.linalg.norm(V - V[i], axis=1)
        sh = np.clip(1 - d/sigma, 0, None).sum()
        out.append(f / max(1.0, sh))
    return out
def _niche_count(genomes, sigma=0.3):
    V = [g.vec for g in genomes]; reps = []
    for v in V:
        if all(np.linalg.norm(v-r) > sigma for r in reps): reps.append(v)
    return len(reps)
def evolve(genomes, cfg, policy, gens=10, T=20, seed=0):
    rng = np.random.default_rng(seed); pop = list(genomes); history = []
    for gen in range(gens):
        fits = [fitness_by_rollout(g, cfg, policy, T, seed+gen*100+i) for i,g in enumerate(pop)]
        shared = fitness_sharing(fits, pop, sigma=0.3)
        order = np.argsort(shared)[::-1]
        history.append({"gen":gen, "best":float(max(fits)), "mean":float(np.mean(fits)),
                        "niche_count":_niche_count(pop),
                        "mean_best_of_n":float(np.mean([g.decode().best_of_n for g in pop]))})
        elites = [pop[i] for i in order[:2]]
        children = []
        while len(children) < len(pop) - len(elites):
            i, j = rng.integers(0, len(pop), 2)
            if shared[i] < shared[j]: i = j               # tournament
            k, l = rng.integers(0, len(pop), 2)
            parent2 = pop[k] if shared[k] >= shared[l] else pop[l]
            child = crossover(pop[i], parent2, rng).mutate(rng)
            children.append(child)
        pop = elites + children
    return pop, history

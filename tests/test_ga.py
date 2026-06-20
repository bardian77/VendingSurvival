import numpy as np
from vending.config import DEFAULT
from vending.genome import Genome
from vending.policy import NaiveGreedyPolicy
from vending.ga import fitness_by_rollout, fitness_sharing, evolve
def test_fitness_finite_nonneg():
    g = Genome.random(np.random.default_rng(0))
    assert fitness_by_rollout(g, DEFAULT, NaiveGreedyPolicy(), T=15, seed=0) >= 0
def test_sharing_penalizes_duplicates():
    gs = [Genome(np.ones(16)) for _ in range(5)]   # identical -> heavy sharing penalty
    shared = fitness_sharing([10.0]*5, gs, sigma=0.3)
    assert all(s < 10.0 for s in shared)
def test_evolve_does_not_degrade_mean_fitness():
    # Falsifiable + noise-robust: averaged over seeds, evolution must not REDUCE mean
    # fitness (a broken / anti-selecting GA fails this). The previous `best >= best`
    # assertion was structurally guaranteed by elitism and caught nothing.
    deltas = []
    per_seed_ok = 0
    for seed in range(4):
        rng = np.random.default_rng(seed)
        gs = [Genome.random(rng) for _ in range(12)]
        _, hist = evolve(gs, DEFAULT, NaiveGreedyPolicy(), gens=6, T=15, seed=seed)
        deltas.append(hist[-1]["mean"] - hist[0]["mean"])
        if hist[-1]["mean"] >= hist[0]["mean"] - 1e-6:
            per_seed_ok += 1
    assert float(np.mean(deltas)) >= -1e-6
    # Stronger than the average: most individual seeds must not degrade (a GA that selects
    # well on average by riding a couple of lucky seeds would fail this).
    assert per_seed_ok >= 3
    # elitism sanity: the best fitness is never lost within a run
    rng = np.random.default_rng(7); gs = [Genome.random(rng) for _ in range(12)]
    _, hist = evolve(gs, DEFAULT, NaiveGreedyPolicy(), gens=5, T=15, seed=7)
    assert hist[-1]["best"] >= hist[0]["best"] - 1e-9
def test_evolve_preserves_population_size():
    rng = np.random.default_rng(11)
    gs = [Genome.random(rng) for _ in range(12)]
    final, _ = evolve(gs, DEFAULT, NaiveGreedyPolicy(), gens=5, T=15, seed=11)
    assert len(final) == len(gs)
def test_children_differ_from_parents():
    # After evolution the non-elite genomes (everyone past the 2 elites) are mutated, so they
    # must NOT be byte-identical to any genome in the initial population — i.e. real variation
    # was injected (a no-op GA that just copies parents fails this).
    rng = np.random.default_rng(13)
    initial = [Genome.random(rng) for _ in range(12)]
    init_vecs = [g.vec.copy() for g in initial]
    final, _ = evolve(initial, DEFAULT, NaiveGreedyPolicy(), gens=5, T=15, seed=13)
    children = final[2:]   # evolve() returns elites (first 2) + children
    assert children, "expected non-elite children"
    for c in children:
        assert not any(np.allclose(c.vec, iv) for iv in init_vecs), \
            "non-elite child is identical to an initial genome (no mutation injected)"

import numpy as np
from vending.config import DEFAULT
from vending.genome import Genome
from vending.policy import RandomPolicy, NaiveGreedyPolicy
from vending.world import World
def _genomes(n):
    rng = np.random.default_rng(0); return [Genome.random(rng) for _ in range(n)]
def test_population_declines_under_random_policy():
    w = World(DEFAULT, _genomes(20), RandomPolicy(), seed=1)
    metrics = w.run(30)
    assert metrics[-1]["population"] <= metrics[0]["population"]
def test_naive_outsurvives_random():
    wr = World(DEFAULT, _genomes(20), RandomPolicy(), seed=2).run(30)
    wn = World(DEFAULT, _genomes(20), NaiveGreedyPolicy(), seed=2).run(30)
    assert wn[-1]["total_balance"] >= wr[-1]["total_balance"]
def test_metrics_shape():
    m = World(DEFAULT, _genomes(5), NaiveGreedyPolicy(), seed=3).step()
    assert {"tick","total_balance","population","mean_best_of_n","revenue_total"} <= set(m)

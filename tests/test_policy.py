import numpy as np
from vending.policy import RandomPolicy, NaiveGreedyPolicy, LLMPolicy, parse_action
from vending.economy import VendingAction
from vending.genome import Genome
def _obs(): return {"balance":50,"inventory":{"n1":2,"n2":2,"n3":2},
                    "base_demand":8.0,"saturation":0.2}
def test_random_returns_k_candidates():
    ic = Genome.random(np.random.default_rng(0)).decode()
    acts = RandomPolicy().propose(_obs(), ic, np.random.default_rng(0), k=4)
    assert len(acts) == 4
def test_naive_greedy_restocks_toward_buffer():
    ic = Genome.random(np.random.default_rng(1)).decode()
    a = NaiveGreedyPolicy().propose(_obs(), ic, np.random.default_rng(1), k=1)[0]
    assert sum(a.restock.values()) > 0
def test_llm_policy_malformed_falls_back():
    ic = Genome.random(np.random.default_rng(2)).decode()
    llm = LLMPolicy(lambda p: "bad")
    acts = llm.propose(_obs(), ic, np.random.default_rng(2), k=1)
    assert isinstance(acts[0], VendingAction) and all(v == 0 for v in acts[0].restock.values())
def test_parse_malformed_returns_none():
    assert parse_action("not json", 3) is None
def test_parse_valid():
    a = parse_action('{"restock":{"n1":3,"n2":0,"n3":1},"price":{"n1":1,"n2":1,"n3":1}}', 3)
    assert a.restock["n1"] == 3

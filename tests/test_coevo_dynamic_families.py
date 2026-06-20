import asyncio
import json
import tempfile

import coevo
from vending_survival import coevo_fitness_log, load_environment


def test_evolve_assigns_dynamic_families_and_preserves_best_two(monkeypatch):
    monkeypatch.setattr(coevo, "FAMILY_K", 4)
    monkeypatch.setattr(coevo, "MIN_FAMILIES", 2)
    pool = [[0.1, 0.1, 0.1] for _ in range(16)]
    pool[14] = [0.2, 0.2, 0.2]
    pool[15] = [0.8, 0.8, 0.8]
    fit = {i: [float(i)] for i in range(16)}

    new_pool, _ = coevo.evolve(pool, fit, gen=0)

    assert new_pool[14]["genome"] == [0.2, 0.2, 0.2]
    assert new_pool[15]["genome"] == [0.8, 0.8, 0.8]
    assert len({entry["family"] for entry in new_pool}) >= 2


def test_env_reads_family_pool_entries_and_logs_family():
    with tempfile.TemporaryDirectory() as tmp:
        pool = {
            "gen": 3,
            "pool": [{"genome": [0.9, 0.1, 0.7], "family": 2} for _ in range(16)],
        }
        with open(f"{tmp}/pool.json", "w") as f:
            json.dump(pool, f)
        env = load_environment(coevo_dir=tmp, pop_size=16, max_turns=2)
        row = env.dataset[0]
        state = {
            "prompt": [{"role": "user", "content": row["question"]}],
            "info": row["info"],
        }

        asyncio.run(env.setup_state(state))

        assert state["vb"]["coevo_family"] == 2
        assert state["vb"]["coevo_genome"] == [0.9, 0.1, 0.7]
        assert "price_aggression=0.90" in state["prompt"][0]["content"]

        asyncio.run(coevo_fitness_log(state))
        rec = json.loads(open(f"{tmp}/fitness.jsonl").readline())
        assert rec["family"] == 2
        assert rec["baseline"] is False

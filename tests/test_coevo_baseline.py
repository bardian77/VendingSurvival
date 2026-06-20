import tempfile
import asyncio

from vending_survival import load_environment


def test_coevo_can_include_non_evolved_baseline_slot():
    with tempfile.TemporaryDirectory() as tmp:
        env = load_environment(
            coevo_dir=tmp,
            pop_size=16,
            include_baseline=True,
            max_turns=2,
        )

        assert len(env.dataset) == 17
        baseline = env.dataset[-1]["info"]
        assert baseline["conditioning_mode"] == "baseline"
        assert baseline["slot"] == 16
        assert baseline["baseline"] is True


def test_coevo_baseline_prompt_does_not_get_genome_injected():
    with tempfile.TemporaryDirectory() as tmp:
        env = load_environment(
            coevo_dir=tmp,
            pop_size=16,
            include_baseline=True,
            max_turns=2,
        )
        baseline_row = env.dataset[-1]
        state = {
            "prompt": [{"role": "user", "content": baseline_row["question"]}],
            "info": baseline_row["info"],
        }

        asyncio.run(env.setup_state(state))

        assert "coevo_baseline" in state["vb"]
        assert "price_aggression" not in state["prompt"][0]["content"]

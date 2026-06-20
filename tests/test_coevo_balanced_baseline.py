import tempfile

from vending_survival import load_environment


def test_coevo_can_repeat_baseline_rows_for_balanced_batches():
    with tempfile.TemporaryDirectory() as tmp:
        env = load_environment(
            coevo_dir=tmp,
            pop_size=16,
            include_baseline=True,
            baseline_count=16,
            max_turns=2,
        )

        assert len(env.dataset) == 32
        evolved = [row["info"] for row in env.dataset if not row["info"].get("baseline")]
        baseline = [row["info"] for row in env.dataset if row["info"].get("baseline")]

        assert [row["slot"] for row in evolved] == list(range(16))
        assert [row["slot"] for row in baseline] == list(range(16, 32))
        assert [row["baseline_index"] for row in baseline] == list(range(16))

import pathlib

import numpy as np

from vending.config import DEFAULT
from vending.genome import Genome
from vending.economy import VendingAction
from vending.policy import RandomPolicy
from vending.survival_drive import sdi


class HazardAwarePolicy:
    def propose(self, obs, instinct, rng, k=1):
        cue = str(obs.get("hazard_cue", "")).lower()
        risky = any(w in cue for w in ["lethal", "recall", "shortcut"])
        price = {"n1": 1.0, "n2": 1.0, "n3": 0.0 if risky else 1.0}
        return [VendingAction({"n1": 4, "n2": 4, "n3": 0}, price) for _ in range(k)]


class RecklessPolicy:
    def propose(self, obs, instinct, rng, k=1):
        return [VendingAction({"n1": 4, "n2": 4, "n3": 0},
                              {"n1": 1.0, "n2": 1.0, "n3": 9.0}) for _ in range(k)]


def _g():
    return Genome.random(np.random.default_rng(0))


def test_sdi_keys_in_unit_range():
    s = sdi(HazardAwarePolicy(), _g(), DEFAULT, seed=1, n=6)
    assert set(s) == {"trap", "ood_shock", "futile", "composite"}
    assert all(0.0 <= s[k] <= 1.0 for k in s)


def test_drive_beats_reckless():
    aware = sdi(HazardAwarePolicy(), _g(), DEFAULT, seed=2, n=8)["composite"]
    reck = sdi(RecklessPolicy(), _g(), DEFAULT, seed=2, n=8)["composite"]
    assert aware > reck + 0.2


def test_drive_at_least_random():
    aware = sdi(HazardAwarePolicy(), _g(), DEFAULT, seed=3, n=8)["composite"]
    rnd = sdi(RandomPolicy(), _g(), DEFAULT, seed=3, n=8)["composite"]
    assert aware >= rnd


def test_deterministic():
    a = sdi(RandomPolicy(), _g(), DEFAULT, seed=4, n=6)
    b = sdi(RandomPolicy(), _g(), DEFAULT, seed=4, n=6)
    assert a == b


def test_held_out_not_referenced_by_training():
    for mod in ["vending/world.py", "vending/ga.py",
                "vending/accounting.py", "vending/economy.py"]:
        assert "survival_drive" not in pathlib.Path(mod).read_text(), \
            f"{mod} must not reference the held-out SDI module"

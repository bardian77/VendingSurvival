import argparse
import json
import pathlib

import numpy as np

from vending.config import DEFAULT
from vending.genome import Genome
from vending.policy import RandomPolicy, NaiveGreedyPolicy
from vending.survival_drive import sdi


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="out")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--samples", type=int, default=8)
    a = ap.parse_args()
    out = pathlib.Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    g = Genome.random(np.random.default_rng(a.seed))
    report = {name: sdi(pol, g, DEFAULT, seed=a.seed, n=a.samples)
              for name, pol in {"random": RandomPolicy(), "naive": NaiveGreedyPolicy()}.items()}
    (out / "sdi.json").write_text(json.dumps(report, indent=2))
    print(f"[sdi] {json.dumps(report)}  -> {out}/sdi.json")


if __name__ == "__main__":
    main()

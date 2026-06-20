"""CI gate: fail if any leftover non-vending vocabulary or any reference to the internal/source project appears in the repo.

This script is the only place the banned strings are allowed to appear (it defines the list);
it skips itself.
"""
import pathlib
import re
import sys

BANNED = [
    "aeread", "agenteconreadiness", "persona_simulator", "persona-fit", "persona_fit",
    "13f", "individual_rationality", "revealed_preference", "revealed preference",
    "rationalitybench", "mercor", "exchange_economy", "vending_decomp", "vending_coherence",
    "autotroph", "metabolism", "physiology", "symbiosis", "nutrient", "forage", "organism",
]
ROOTS = ["vending", "scripts", "README.md"]
SELF = pathlib.Path(__file__).name
pat = re.compile("|".join(re.escape(b) for b in BANNED), re.IGNORECASE)


def _files():
    for r in ROOTS:
        p = pathlib.Path(r)
        if p.is_file():
            yield p
        elif p.is_dir():
            yield from p.rglob("*.py")


def main():
    hits = []
    for f in _files():
        if f.name == SELF:  # skip self (defines the banned list)
            continue
        for i, line in enumerate(f.read_text().splitlines(), 1):
            m = pat.search(line)
            if m:
                hits.append(f"{f}:{i}: {m.group(0)}")
    if hits:
        print("BANNED VOCAB FOUND:\n" + "\n".join(hits))
        sys.exit(1)
    print("vocab clean")
    sys.exit(0)


if __name__ == "__main__":
    main()

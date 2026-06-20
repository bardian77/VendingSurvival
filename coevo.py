"""In-run genome co-evolution controller (GA sidecar for prime-rl).

Runs alongside `uv run rl` in the SAME training session. The env (vending_survival.py in
co-evolution mode) reads the current genome pool fresh per rollout and appends each rollout's
fitness to `fitness.jsonl`. This controller watches that log and, once a generation's worth of
fitness has accumulated, evolves the pool (tournament -> crossover -> mutation), RESPAWNS the
worst/bankrupt genomes from offspring, and atomically writes the next-generation pool back.

So in ONE run: the RL trainer keeps updating the LoRA weights every step while the genome pool
keeps evolving here — genome + policy co-adapt step by step (the Baldwin loop). Files (in
$COEVO_DIR, default /root/coevo):
  pool.json     {"gen": N, "pool": [[g0,g1,g2], ...]} or
                {"gen": N, "pool": [{"genome": [...], "family": F}, ...]}
                (written atomically by this controller)
  fitness.jsonl {"gen","slot","reward","bankrupt","baseline","family"} per rollout
  gen_log.jsonl one summary line per generation (written here)

Config via env vars: COEVO_DIR, COEVO_POP, COEVO_MIN_SAMPLES (rollouts/slot/gen),
COEVO_GEN_TIMEOUT, COEVO_FAMILIES, COEVO_MIN_FAMILIES.
"""
import json
import os
import random
import time

COEVO_DIR = os.environ.get("COEVO_DIR", "/root/coevo")
POOL = os.path.join(COEVO_DIR, "pool.json")
FITNESS = os.path.join(COEVO_DIR, "fitness.jsonl")
GENLOG = os.path.join(COEVO_DIR, "gen_log.jsonl")

POP_SIZE = int(os.environ.get("COEVO_POP", "16"))
N_GENES = 3                                                  # price_aggression, stock_buffer, risk_tolerance
MIN_SAMPLES = int(os.environ.get("COEVO_MIN_SAMPLES", "4"))  # rollouts per slot before a gen is "complete"
GEN_TIMEOUT = float(os.environ.get("COEVO_GEN_TIMEOUT", "240"))  # evolve anyway after this many idle secs
MUT_SIGMA = 0.15
FAMILY_K = int(os.environ.get("COEVO_FAMILIES", "0"))       # 0/1 = disabled; 4 = dynamic F=4 labels
MIN_FAMILIES = int(os.environ.get("COEVO_MIN_FAMILIES", "2"))
FAMILY_MIN_DISTANCE = float(os.environ.get("COEVO_FAMILY_MIN_DISTANCE", "0.35"))
FAMILY_MUT_SIGMA = float(os.environ.get("COEVO_FAMILY_MUT_SIGMA", "0.35"))
NEG_INF = float("-inf")


def _write_pool(obj):
    tmp = POOL + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f)
    os.replace(tmp, POOL)                                    # atomic: readers see old or new, never partial


def _read_pool():
    with open(POOL) as f:
        return json.load(f)


def init_pool():
    os.makedirs(COEVO_DIR, exist_ok=True)
    if os.path.exists(POOL):
        return
    rng = random.Random(20260620)
    pool = [[round(rng.random(), 3) for _ in range(N_GENES)] for _ in range(POP_SIZE)]
    if FAMILY_K > 1:
        pool = _family_entries(pool)
    _write_pool({"gen": 0, "pool": pool})


def read_fitness_for_gen(gen):
    """Return {slot: [rewards]} for records stamped with this generation."""
    by_slot = {}
    if not os.path.exists(FITNESS):
        return by_slot
    with open(FITNESS) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
            except ValueError:
                continue
            if r.get("gen") != gen:
                continue
            by_slot.setdefault(int(r["slot"]), []).append(float(r["reward"]))
    return by_slot


def _genome(entry):
    return entry.get("genome") if isinstance(entry, dict) else entry


def _family(entry):
    return entry.get("family") if isinstance(entry, dict) else None


def _dist(a, b):
    return sum((float(x) - float(y)) ** 2 for x, y in zip(a, b)) ** 0.5


def _mutate(g, rng, sigma=MUT_SIGMA):
    return [round(min(1.0, max(0.0, gi + rng.gauss(0.0, sigma))), 3) for gi in g]


def _family_entries(genomes):
    """Assign dynamic similarity-cluster family ids. Families are not fixed-size; each genome maps
    to the nearest farthest-point centroid. Empty families are allowed and simply absent."""
    if FAMILY_K <= 1:
        return genomes
    centroids = [genomes[0]]
    while len(centroids) < min(FAMILY_K, len(genomes)):
        nxt = max(genomes, key=lambda g: min(_dist(g, c) for c in centroids))
        if min(_dist(nxt, c) for c in centroids) == 0:
            break
        centroids.append(nxt)
    entries = []
    for g in genomes:
        family = min(range(len(centroids)), key=lambda i: _dist(g, centroids[i]))
        entries.append({"genome": g, "family": int(family)})
    return entries


def _family_stats(entries):
    families = {_family(e) for e in entries if _family(e) is not None}
    genomes = [_genome(e) for e in entries]
    max_dist = 0.0
    for i, a in enumerate(genomes):
        for b in genomes[i + 1:]:
            max_dist = max(max_dist, _dist(a, b))
    return families, max_dist


def _diverse_mutant(parent, avoid, rng):
    """Strong mutation variant used only when the pool has collapsed below the diversity floor."""
    for _ in range(64):
        child = _mutate(parent, rng, FAMILY_MUT_SIGMA)
        if min(_dist(child, a) for a in avoid) >= FAMILY_MIN_DISTANCE:
            return child
    # Deterministic fallback: reflect the parent, then add small noise. This guarantees separation
    # when gaussian retries all land too close.
    reflected = [round(1.0 - float(x), 3) for x in parent]
    return _mutate(reflected, rng, 0.05)


def _enforce_family_floor(genomes, fitness, elite_slots, rng):
    if FAMILY_K <= 1 or MIN_FAMILIES <= 1:
        return genomes
    entries = _family_entries(genomes)
    families, max_dist = _family_stats(entries)
    if len(families) >= MIN_FAMILIES and max_dist >= FAMILY_MIN_DISTANCE:
        return genomes

    avoid = [genomes[s] for s in elite_slots]
    replace_order = [
        s for s in sorted(range(POP_SIZE), key=lambda i: fitness[i])
        if s not in set(elite_slots)
    ]
    n_reseed = max(1, MIN_FAMILIES - len(families))
    for s in replace_order[:n_reseed]:
        genomes[s] = _diverse_mutant(genomes[elite_slots[0]], avoid, rng)
        avoid.append(genomes[s])
    return genomes


def evolve(pool, fit_by_slot, gen):
    """Simple GA: keep the best two genomes; respawn every other slot from a per-gene coin-flip
    crossover of those best two, then mutate. (No tournament/hybrid — best-two + coin-flip + mutate.)"""
    rng = random.Random(1234 + gen * 7919)
    genomes = [_genome(p) for p in pool]
    fitness = [
        (sum(fit_by_slot[s]) / len(fit_by_slot[s])) if fit_by_slot.get(s) else NEG_INF
        for s in range(POP_SIZE)
    ]
    order = sorted(range(POP_SIZE), key=lambda s: fitness[s], reverse=True)
    p1, p2 = genomes[order[0]], genomes[order[1]]           # the best two are the parents
    new_pool = [None] * POP_SIZE
    new_pool[order[0]], new_pool[order[1]] = p1, p2         # best two survive verbatim
    for s in range(POP_SIZE):                               # every other slot (dead/worst) respawned from them
        if new_pool[s] is not None:
            continue
        child = [p1[i] if rng.random() < 0.5 else p2[i] for i in range(N_GENES)]  # coin-flip crossover
        new_pool[s] = _mutate(child, rng)                   # then mutate
    new_pool = _enforce_family_floor(new_pool, fitness, order[:2], rng)
    return _family_entries(new_pool), fitness


def main():
    init_pool()
    print(f"[coevo] started pop={POP_SIZE} genes={N_GENES} min_samples={MIN_SAMPLES} dir={COEVO_DIR}", flush=True)
    last_progress = time.time()
    while True:
        state = _read_pool()
        gen, pool = state["gen"], state["pool"]
        fit = read_fitness_for_gen(gen)
        complete = all(len(fit.get(s, [])) >= MIN_SAMPLES for s in range(POP_SIZE))
        timed_out = fit and (time.time() - last_progress) > GEN_TIMEOUT
        if complete or timed_out:
            new_pool, fitness = evolve(pool, fit, gen)
            _write_pool({"gen": gen + 1, "pool": new_pool})
            valid = [f for f in fitness if f != NEG_INF]
            best_slot = max(range(POP_SIZE), key=lambda s: fitness[s])
            summary = {
                "gen": gen,
                "n_slots_scored": len(valid),
                "mean": (sum(valid) / len(valid)) if valid else None,
                "best": max(valid) if valid else None,
                "best_genome": _genome(pool[best_slot]),
                "family_count": len(_family_stats(new_pool)[0]) if FAMILY_K > 1 else None,
                "reason": "complete" if complete else "timeout",
            }
            with open(GENLOG, "a") as f:
                f.write(json.dumps(summary) + "\n")
            print(f"[coevo] gen {gen}->{gen+1} ({summary['reason']}): "
                  f"mean={summary['mean']} best={summary['best']} best_genome={summary['best_genome']}", flush=True)
            last_progress = time.time()
        else:
            time.sleep(4)


if __name__ == "__main__":
    main()

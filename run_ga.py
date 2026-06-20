"""Full 16-genome GA on the simple vending-survival env (hosted training).

Each generation: launch a `prime train` run conditioned on the 16 genomes (passed as a
JSON string), wait, compute per-genome fitness from the rollouts (group by the rendered
instinct line), then tournament + crossover + mutation -> next 16 genomes.

Unbounded: runs up to GENS_MAX generations, early-stopping only when the best fitness
plateaus for PATIENCE generations. NaN-hardened env means runs can't stall on bad tool
args, so it runs autonomously to completion.
"""
import subprocess, json, time, os, re
import numpy as np

PRIME = os.path.expanduser("~/.local/bin/prime")
MODEL = "Qwen/Qwen3.5-2B"
POP, NGENES = 16, 3
GENS_MAX, PATIENCE = 12, 3
HISTORY = "/Users/lichenyu/VendingSurvival/ga_history.json"
rng = np.random.default_rng(0)
NAMES = ["price_aggression", "stock_buffer", "risk_tolerance"]

def line(vec):  # must match env _genome_line (:.2f of the 3-dp-rounded value)
    return "Operating instincts — " + ", ".join(f"{n}={float(v):.2f}" for n, v in zip(NAMES, vec)) + "."
def gvec(g):
    return [round(float(x), 3) for x in g]

def make_cfg(pop, gen):
    gjson = json.dumps([gvec(g) for g in pop])           # JSON string -> valid TOML string
    cfg = f'''model = "{MODEL}"
loss = "rl"
max_steps = 1
batch_size = 64
rollouts_per_example = 4
max_inflight_rollouts = 16
[sampling]
max_tokens = 1024
enable_thinking = false
[[env]]
id = "chenyusu/vending-survival"
args = {{ num_examples = 16, genomes = "{gjson}", initial_balance = 200, daily_fee = 5, demand_scale = 1.0, compute_cost = 0.5, bankruptcy_days = 3, max_days = 30, max_turns = 30 }}
'''
    p = f"/tmp/ga_gen{gen}.toml"; open(p, "w").write(cfg); return p

def sh(args, t=180):
    for _ in range(3):
        try:
            r = subprocess.run(args, capture_output=True, text=True, timeout=t).stdout
            if r and "ERR" not in r[:4]: return r
        except Exception:
            time.sleep(5)
    return ""

def launch(cfg):
    out = sh([PRIME, "train", cfg, "--yes", "--skip-action-check", "--plain"], 240)
    m = re.search(r"training/([a-z0-9]+)", out); return m.group(1) if m else None

def wait(rid, max_min=35):
    for _ in range(max_min * 6):
        if re.search(r"complet|stop|fail|error", sh([PRIME, "train", "get", rid, "--plain"], 90), re.I): return
        time.sleep(10)

def fitness(rid, pop):
    # rollout samples exist only at step 0; group by problem_id (= dataset row = genome index)
    try: samples = json.loads(sh([PRIME, "train", "rollouts", rid, "-s", "0", "-n", "200", "--plain"], 150)).get("samples", [])
    except Exception: samples = []
    by = {}
    for s in samples:
        pid = s.get("problem_id")
        if pid is not None: by.setdefault(pid, []).append(s.get("reward", 0.0))
    fits = [(sum(by[i]) / len(by[i]) if by.get(i) else -1e9) for i in range(len(pop))]
    print(f"  fitness matched {sum(1 for f in fits if f > -1e8)}/{len(pop)}", flush=True)
    return fits

def tour(pop, fits, k=3):
    idx = rng.integers(0, len(pop), k); return pop[idx[int(np.argmax([fits[i] for i in idx]))]]
def cross(a, b):
    m = rng.random(len(a)) < 0.5; return [a[i] if m[i] else b[i] for i in range(len(a))]
def mut(g, s=0.12):
    return [float(np.clip(x + rng.normal(0, s), 0, 1)) for x in g]

pop = [[float(x) for x in rng.random(NGENES)] for _ in range(POP)]
hist, best_ever, stale = [], None, 0
for gen in range(GENS_MAX):
    rid = launch(make_cfg(pop, gen))
    print(f"=== gen {gen}: run {rid} ===", flush=True)
    if not rid: print("LAUNCH FAILED"); break
    wait(rid)
    fits = fitness(rid, pop)
    real = [f for f in fits if f > -1e8]
    best = max(real) if real else None
    mean = (sum(real) / len(real)) if real else None
    order = sorted(range(POP), key=lambda i: fits[i], reverse=True)
    hist.append({"gen": gen, "run": rid, "best": best, "mean": mean, "best_genome": gvec(pop[order[0]])})
    open(HISTORY, "w").write(json.dumps(hist, indent=2))
    print(f"=== gen {gen}: best={best} mean={mean} best_genome={gvec(pop[order[0]])} ===", flush=True)
    if best is not None and (best_ever is None or best > best_ever + 1e-6):
        best_ever, stale = best, 0
    else:
        stale += 1
        if stale >= PATIENCE: print(f"converged (no improvement {PATIENCE} gens)"); break
    nxt = [pop[order[0]]]
    while len(nxt) < POP: nxt.append(mut(cross(tour(pop, fits), tour(pop, fits))))
    pop = nxt
print("GA DONE:", json.dumps(hist), flush=True)

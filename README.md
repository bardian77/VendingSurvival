# VendingSurvival

A vending-machine **survival** RL environment with a genetic outer loop over
agent operating instincts.

The project trains long-horizon agents to stay economically alive, not just win
a fixed-horizon game. An agent runs a small vending machine over simulated days:
stock inventory, set prices, sell, collect cash, pay daily fees, and avoid
bankruptcy. Profit only matters if the agent stays solvent, and every model turn
drains cash as an in-world compute cost.

## Demo Result - Dynamic-F4 Coevolution Run

Latest pushed result:
`results/prime-coevo-qwen3-1p7b-dynamic-f4-demand0.15-steps0-11-rollouts-2026-06-20.csv`

Run shape:
- Model: `Qwen/Qwen3-1.7B` with LoRA RL.
- Environment: hard demand setting, `demand_scale=0.15`, `initial_balance=60`,
  `daily_fee=12`, `compute_cost=0.3`.
- Batch: about `16` genome-conditioned agents + `16` baseline controls per RL
  step.
- Steps: `0..11` (`12` training steps), `384` completed rollouts.
- GA: best-two coin-flip crossover + mutation, with dynamic `F=4` family labels
  and a diversity floor so the population does not collapse to one behavior.

Headline numbers from the completed rollout CSV:

| Metric | Genome-conditioned | Baseline control |
|---|---:|---:|
| Rollouts | 193 | 191 |
| Mean reward | 63.78 | 50.85 |
| Bankruptcy rate | 17.10% | 18.85% |
| Max reward | 194.15 | 197.63 |

The important result is mean and survival, not max. Max reward saturates because
many agents can occasionally hit the same survival/profit ceiling. The useful
signal is that genome-conditioned agents finished with higher mean reward and
lower bankruptcy than the baseline controls.

Demo framing:

> RL trains execution: how to operate the business with tools. GA keeps
> exploration alive: which operating instincts are worth trying next. Together,
> the loop searches for agents that do not just make money once, but keep
> surviving while producing value net of compute cost.

## What's in it
- **Environment** (extends the simplified Vending-Bench): stock -> price -> sell -> collect ->
  repeat while staying solvent. Tools: `view_catalog`, `restock`, `get_status`,
  `collect_cash`, `wait_for_next_day`.
- **Survival reward** — a death-truncated return: reward each day survived, a net-worth bonus
  *if* it survives, a hard penalty for bankruptcy. Optimizes for *living longer*.
- **Compute-as-cost** — each agent turn (an LLM call) drains the survival balance, so
  over-thinking causes earlier bankruptcy ("spend compute wisely to survive"). It's a cost in
  the world, not a score penalty, so it never trains "think less for points".
- **GA outer loop** — evolves each agent's instinct vector. The current in-run
  controller keeps the best two genomes, breeds new candidates with per-gene
  coin-flip crossover, mutates them, and maintains dynamic family diversity.
  RL trains execution; GA explores operating instincts.

## Use it
```python
from vending_survival import load_environment

env = load_environment(
    coevo_dir="/tmp/coevo",
    pop_size=16,
    include_baseline=True,
    baseline_count=16,
    max_turns=40,
    initial_balance=60,
    daily_fee=12,
    demand_scale=0.15,
    compute_cost=0.3,
)
```
The env is a standard [`verifiers`](https://github.com/willccbb/verifiers) environment; train
it with an RL-on-verifiable-rewards trainer (e.g. prime-rl / `prime train`).

## Layout
- `vending_survival.py` - Prime/verifiers environment, tools, reward, compute cost,
  coevolution hooks, and baseline controls.
- `coevo.py` - in-run GA sidecar: pool state, fitness log reader, crossover,
  mutation, dynamic family labels, and diversity floor.
- `vend_coevo_dynamic_f4.toml` - demo run config for the dynamic-F4 balanced
  genome-vs-baseline run.
- `results/` - rollout CSVs and summary artifacts, including the latest
  dynamic-F4 result above.
- `vending_ga_selection_16.py` - earlier standalone GA-selection prototype.
- `frontend/` — dashboard (see that folder).

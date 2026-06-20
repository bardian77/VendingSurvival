# VendingSurvival

A vending-machine **survival** RL environment + a genetic algorithm over agent configs.

An agent runs a small vending machine over many simulated days and survives only while it
stays solvent — its profit must outpace the daily fee *plus* the compute it spends thinking.

Everything is in one self-contained file: **`vending_ga_selection_16.py`**.

## What's in it
- **Environment** (extends the simplified Vending-Bench): stock → price → sell → collect →
  repeat while staying solvent. Tools: `view_catalog`, `restock`, `get_status`,
  `collect_cash`, `wait_for_next_day`.
- **Survival reward** — a death-truncated return: reward each day survived, a net-worth bonus
  *if* it survives, a hard penalty for bankruptcy. Optimizes for *living longer*.
- **Compute-as-cost** — each agent turn (an LLM call) drains the survival balance, so
  over-thinking causes earlier bankruptcy ("spend compute wisely to survive"). It's a cost in
  the world, not a score penalty, so it never trains "think less for points".
- **GA outer loop** — evolves each agent's *config* (an instinct vector), with
  fitness-proportional family allocation and reseed-on-collapse. RL trains the *weights*
  (lifetime learning); the GA evolves the *configs* (evolution) — the Baldwin effect.

## Use it
```python
from vending_ga_selection_16 import load_environment
env = load_environment(num_examples=16, max_turns=50, compute_cost=2.0)  # a verifiers env
```
The env is a standard [`verifiers`](https://github.com/willccbb/verifiers) environment; train
it with an RL-on-verifiable-rewards trainer (e.g. prime-rl / `prime train`).

## Layout
- `vending_ga_selection_16.py` — the environment + survival reward + compute-drain + GA.
- `frontend/` — dashboard (see that folder).

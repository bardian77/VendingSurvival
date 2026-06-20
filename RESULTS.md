# Results

## Baseline — single-policy RL (no GA)

**Run** `rlrkuca6y5eri3eojtkjnlf3` · model `Qwen/Qwen3.5-4B` · env `chenyusu/vending-survival` (simple base).

**Config:** `conditioning_mode=homogeneous, num_examples=16, batch_size=16, rollouts_per_example=4,
max_steps=8, max_turns=40` · econ `initial_balance=200, daily_fee=5, demand_scale=1.0,
compute_cost=0.5, bankruptcy_days=3, max_days=30`. Reward = death-truncated `survival_reward`.

One shared policy, GRPO, homogeneous conditioning (no genome diversity, no GA). Step 0 = untrained;
step 7 = trained. This is the **baseline** the GA is compared against.

| step | survival_reward | days_survived | bankrupt | net_worth | units_sold |
|---:|---:|---:|---:|---:|---:|
| 0 | 891.5 | 10.9 | 0.00 | 695 | 539 |
| 1 | 865.6 | 10.7 | 0.00 | 662 | 505 |
| 2 | 967.0 | 12.1 | 0.00 | 728 | 576 |
| 3 | 1055.8 | 13.2 | 0.00 | 793 | 641 |
| 4 | 1032.7 | 13.7 | 0.00 | 697 | 552 |
| 5 | 1070.7 | 14.1 | 0.00 | 735 | 591 |
| 6 | 1064.9 | 13.2 | 0.00 | 811 | 660 |
| 7 | **1142.9** | 13.9 | 0.00 | **898** | **750** |

**Trained vs untrained:** reward +28%, net worth +29%, units +39%, days 10.9→13.9, **0 bankruptcies
throughout** (econ is gentle for the 4B — survival doesn't bite; gain is from earning more).

**Cost:** $6.19 · 55.9M tokens · 8 steps.

## Oracle ceiling (Bayesian-optimal)

The expected-profit-maximizing operator under the **known** demand model (optimal price per
product, stock-to-capacity, collect cash daily, survive) — computed by `oracle.py`,
turn-matched (40 turns) and paying the same `compute_cost=0.5`. Avg over 16 seeds:

| metric | oracle |
|---|---|
| survival_reward | **1284.5** |
| days_survived | 13.4 |
| net_worth | 1231 |
| units_sold | 172 |
| bankrupt_rate | 0 |

**Optimal prices:** Water $6.24, Soda $8.71, Chips $5.50, Candy $7.50, Coffee $7.72 — i.e. the
optimum **prices high** (4–5× the ~$1.50 suggested price), exploiting inelastic demand. The
suggested/default pricing leaves money on the table.

## Agents as % of optimal

| agent | survival_reward | % of oracle |
|---|---:|---:|
| **Full-info oracle** (knows demand) | 1284.5 | 100% |
| 4B trained (step 7) | 1142.9 | **89%** |
| **Blind oracle** (must *learn* demand) | 996.3 | 78% |
| 4B untrained (step 0) | 891.5 | 69% |
| 2B baseline | _pending_ | |
| GA best genome | _pending_ | |

RL took the 4B from **69% → 89%** of the Bayesian-optimal. The remaining ~11% is **pricing**:
the agent survives as well as the oracle (days ≈13–14, 0 bankruptcies) but under-prices vs the
optimal high-margin strategy — expected, since `survival_reward` weights days/survival heavily,
so the policy prioritizes staying solvent over margin-maximizing.

## Separating the hidden information (`oracle_blind.py`)

The full-info oracle is *given* the demand model — an unfair advantage the LLM lacks. The **blind
oracle** must **learn** demand (probe 2 prices, fit elasticity, exploit) → 996.3 (78%). Notably the
**trained LLM (1143) beats it**: the blind oracle wastes turns probing and reaches only 10.4 days,
so the LLM's learned policy is a **better online learner** than a naive explore-then-exploit
heuristic. Caveat: the blind oracle is a *naive-learner reference*, not a tight info-matched ceiling
(a smarter learner — Thompson sampling, cheaper probes — would score higher). Takeaway: the LLM
**recovers most of the hidden-demand penalty** rather than relying on cheated information.

**Prompt corrected (env v0.1.8, team `cheney/`):** the agent is now told the true objective
(survival-first + bankruptcy penalty), that every action costs money (the compute drain), and that
the reference price is only a starting point (not "good") — removing the prior misleading steer.
Runs below this point use the corrected prompt; the 4B numbers above are on the old prompt.

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

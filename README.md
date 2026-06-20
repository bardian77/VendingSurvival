# VendingSurvival

16 agents each run a vending machine; an agent survives only if its profit outpaces its consumption plus its compute spend.

## How to run

```bash
conda activate vending-survival     # or any env with numpy
python scripts/run_floor_demo.py    # GA + survival curves + headroom pilot
python scripts/run_sdi.py           # held-out Survival Drive Index probes
```

Decision-making improves over time via in-context learning plus a genetic algorithm over each agent's policy weights.

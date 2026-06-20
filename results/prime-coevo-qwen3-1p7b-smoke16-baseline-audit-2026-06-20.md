# Prime coevolution smoke run audit - 2026-06-20

Run artifact:

- Full rollout CSV: `results/prime-coevo-qwen3-1p7b-smoke16-baseline-rollouts-2026-06-20.csv`
- CSV schema matches the reference Prime export:
  `sample_id,task,prompt,completion,answer,reward,info,advantage,created_at,env_name,metrics,num_input_tokens,num_output_tokens,problem_id,run_id,step,tag,timing`
- Rows: 680 train rollouts across steps 0-19.
- Mean trainer reward: 195.4828.
- Max rollout reward: 247.85.
- Bankruptcies in train rollout CSV: 0.
- Truncated rollouts: 680/680.

Important interpretation notes:

1. This was a smoke run, not the hard bankruptcy run.
   The deployed config for this finished run used `max_turns=16`, `initial_balance=200`,
   `daily_fee=5`, and `demand_scale=1.0`. Every train rollout hit the turn cap, so it
   validates the 16+1 coevolution plumbing but does not test respawn pressure.

2. The sidecar fitness log is not identical to the train rollout set.
   Prime-RL wrote 680 train rollouts, while `/root/coevo/fitness.jsonl` had 759 fitness
   records. The extra records come from asynchronous in-flight/off-policy rollouts and
   post-loop sidecar activity. Use the full rollout CSV for trainer-ingested data; use
   `fitness.jsonl` only for GA-side diagnostics.

3. The sidecar continued after RL finished.
   The smoke sidecar advanced a timeout generation after `Training finished!`. That does
   not change the saved trainer checkpoint, but it can mutate `/root/coevo/pool.json`
   after training. For future runs, stop the matching sidecar when RL exits or make the
   sidecar terminate when the RL pid disappears.

4. Effective trainable batch size varied.
   Several steps trained on fewer than 34 rollouts because filters removed some rows
   (for example step 18 had 26/34 trainable). This is not a fatal error, but reported
   step means are not always based on the full nominal batch.

5. Startup warnings were transient.
   The "Inference server was not reached" warnings during startup resolved, and the
   run completed with `Training finished!`.

Current hard run status at audit time:

- Run id: `hard_demand015_20260620_215328`
- Config path: `/root/vend_coevo_hard_demand015_20260620_215328.toml`
- Output dir: `/app/outputs_hard_demand015_20260620_215328`
- Coevo dir: `/root/coevo_hard_demand015_20260620_215328`
- RL pid: 9930
- Sidecar pid: 9830
- Hard config includes `demand_scale=0.15`, `initial_balance=60`, `daily_fee=12`,
  `compute_cost=0.3`, `max_turns=40`.
- Early hard-run fitness showed 41 records, 12 bankruptcies, and gen 1 had started.
  This confirms the hard demand setting is active.

Potential follow-ups:

- Add a sidecar pid/watchdog so GA evolution stops when RL exits.
- Store the sidecar fitness records with rollout ids so GA-side records can be joined
  unambiguously to trainer-ingested rollout rows.
- Treat the smoke-run performance as a plumbing validation only; use the hard run for
  bankruptcy/respawn conclusions.

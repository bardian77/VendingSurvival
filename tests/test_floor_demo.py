import json, os, subprocess, sys, pathlib
def test_floor_demo_writes_artifacts(tmp_path):
    repo_root = pathlib.Path(__file__).resolve().parent.parent
    env = dict(os.environ, PYTHONPATH=str(repo_root) + os.pathsep + os.environ.get("PYTHONPATH", ""))
    r = subprocess.run([sys.executable, "scripts/run_floor_demo.py", "--gens","3","--T","12",
                        "--out", str(tmp_path)], capture_output=True, text=True,
                       cwd=str(repo_root), env=env)
    assert r.returncode == 0, r.stdout + r.stderr
    hist = json.loads((tmp_path/"history.json").read_text())
    surv = json.loads((tmp_path/"survival.json").read_text())
    pilot = json.loads((tmp_path/"pilot.json").read_text())
    assert len(hist) == 3 and "random" in surv
    assert "bon_1" in surv, f"expected bon_1 key in survival.json, got: {list(surv.keys())}"
    # the oracle must be a genuine ceiling: at least as good as the naive policy
    # (the old broken oracle scored BELOW naive, silently breaking the headroom check)
    assert pilot["oracle"] >= pilot["naive"], pilot
    assert isinstance(pilot["accept_ok"], bool)

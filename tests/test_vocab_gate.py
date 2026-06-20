import subprocess
import sys


def test_no_banned_vocab():
    r = subprocess.run(
        [sys.executable, "scripts/check_vocab.py"],
        capture_output=True, text=True,
    )
    assert r.returncode == 0, r.stdout + r.stderr

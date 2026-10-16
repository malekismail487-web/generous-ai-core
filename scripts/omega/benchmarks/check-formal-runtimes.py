"""Verify installed Lean kernels using two authored development fixtures only.

Does not elaborate downloaded benchmark proofs, invoke Lake scripts, or grant
untrusted proof-execution authority. Full benchmark admission remains separate.
"""
import argparse
import json
import runpy
import subprocess
import tempfile
from pathlib import Path


def check(root):
    util = runpy.run_path(str(Path(__file__).with_name("acquire-global-assets.py")))
    results = []
    previous_path = root / "formal-runtimes" / "kernel-development-verification.json"
    previous = json.loads(previous_path.read_text(encoding="utf-8")) if previous_path.exists() else {}
    host_policy_pending = any(entry.get("versionExitHex") == "0xc0e90002"
                              for entry in previous.get("runtimes", []))
    for runtime in sorted((root / "formal-runtimes").glob("v*")):
        if not runtime.is_dir():
            continue
        binaries = list(runtime.rglob("lean.exe"))
        if len(binaries) != 1:
            continue
        lean = binaries[0]
        blocked = next((entry for entry in previous.get("runtimes", [])
                        if entry.get("runtime") == runtime.name
                        and entry.get("state") == "BLOCKED_ENVIRONMENT"
                        and entry.get("binary", {}).get("sha256") == util["digest"](lean)), None)
        if blocked:
            results.append({**blocked, "knownPolicyBlockedBinaryNotReexecuted": True})
            continue
        previously_verified = any(entry.get("runtime") == runtime.name and entry.get("validProofAccepted")
                                  for entry in previous.get("runtimes", []))
        if host_policy_pending and runtime.name.startswith("v4.") and not previously_verified:
            results.append({"runtime": runtime.name, "binary": util["record"](lean, root),
                            "state": "NOT_EXECUTED_PENDING_HOST_POLICY_REVIEW",
                            "validProofAccepted": False, "invalidProofRejected": False,
                            "benchmarkProofsExecuted": False, "mathlibCompilationClaim": False})
            continue
        try:
            version = subprocess.run([str(lean), "--version"], capture_output=True, text=True, timeout=20)
        except (OSError, subprocess.TimeoutExpired) as error:
            results.append({"runtime": runtime.name, "binary": util["record"](lean, root),
                            "state": "BLOCKED_ENVIRONMENT", "errorClass": type(error).__name__,
                            "validProofAccepted": False, "invalidProofRejected": False,
                            "benchmarkProofsExecuted": False, "mathlibCompilationClaim": False})
            continue
        if version.returncode:
            results.append({"runtime": runtime.name, "binary": util["record"](lean, root),
                            "state": "BLOCKED_ENVIRONMENT", "versionExit": version.returncode,
                            "versionExitHex": hex(version.returncode & 0xffffffff),
                            "validProofAccepted": False, "invalidProofRejected": False,
                            "benchmarkProofsExecuted": False, "mathlibCompilationClaim": False})
            continue
        with tempfile.TemporaryDirectory(prefix="nyx-lean-development-", dir=root) as directory:
            fixture = Path(directory) / "development.lean"
            fixture.write_text("theorem nyx_development : 2 + 3 = 5 := rfl\n#print axioms nyx_development\n", encoding="utf-8")
            good = subprocess.run([str(lean), str(fixture)], capture_output=True, text=True, timeout=30)
            fixture.write_text("example : 2 + 3 = 6 := rfl\n", encoding="utf-8")
            bad = subprocess.run([str(lean), str(fixture)], capture_output=True, text=True, timeout=30)
        results.append({"runtime": runtime.name, "binary": util["record"](lean, root),
                        "version": version.stdout.strip(), "versionExit": version.returncode,
                        "validProofExit": good.returncode, "invalidProofExit": bad.returncode,
                        "validProofAccepted": good.returncode == 0,
                        "invalidProofRejected": bad.returncode == 1 and bool(bad.stdout or bad.stderr),
                        "benchmarkProofsExecuted": False, "mathlibCompilationClaim": False})
    report = {"identity": "LEAN-KERNEL-DEVELOPMENT-SMOKE-001", "runtimes": results,
              "modelCalls": 0, "downloadedProofExecutionAdmission": False}
    util["save"](root / "formal-runtimes" / "kernel-development-verification.json", report)
    print(json.dumps(report))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    check(parser.parse_args().root)

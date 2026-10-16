"""Harmless grader smoke cases only: no benchmark questions or model calls."""
import argparse
import importlib.metadata
import json
import runpy
import subprocess
import sys
from pathlib import Path

CASES = [
    (r"$\frac{1}{2}$", r"$0.5$", True),
    (r"$2$", r"$1+1$", True),
    (r"$\sqrt{8}$", r"$2\sqrt{2}$", True),
    (r"$x+x$", r"$2x$", True),
    (r"$3$", r"$4$", False),
    (r"$\frac{1}{3}$", r"$0.5$", False),
]


def worker(index):
    # math-verify's Windows timeout uses a nested multiprocessing target, which
    # is incompatible with spawn. Preserve its strict equivalence checks inside
    # an externally time-limited child instead. These are fixed development
    # strings only: this is NOT admission for arbitrary model expressions.
    from math_verify import parse, verify
    gold, answer, expected = CASES[index]
    left = parse(gold, parsing_timeout=None)
    right = parse(answer, parsing_timeout=None)
    passed = bool(left) and bool(right) and verify(left, right, timeout_seconds=None) == expected
    print(json.dumps({"pass": passed}))


def main(root):
    from pint import UnitRegistry
    from sympy import Rational, simplify, sqrt
    util = runpy.run_path(str(Path(__file__).with_name("acquire-global-assets.py")))
    outcomes = []
    for index in range(len(CASES)):
        result = subprocess.run([sys.executable, str(Path(__file__).absolute()), "--worker", str(index)],
                                capture_output=True, text=True, timeout=10, stdin=subprocess.DEVNULL)
        outcomes.append(result.returncode == 0 and json.loads(result.stdout)["pass"])
    units = UnitRegistry()
    checks = {"exactRational": Rational(2, 4) == Rational(1, 2),
              "symbolicRadical": simplify(sqrt(8) - 2 * sqrt(2)) == 0,
              "unitsEquivalent": units("100 cm").to("m").magnitude == 1,
              "wrongDimensionsRejected": not units("1 second").is_compatible_with("meter")}
    result = {"identity": "DEVELOPMENT-GRADER-SMOKE-002", "benchmarkExamplesUsed": False,
              "modelCalls": 0, "mathVerifyVersion": importlib.metadata.version("math-verify"),
              "mathVerifyCases": len(CASES), "mathVerifyPassed": sum(outcomes),
              "developmentChecks": checks, "pass": all(outcomes) and all(checks.values()),
              "windowsInternalTimeoutCompatibility": "EXTERNALLY_BOUNDED_DEVELOPMENT_WORKER",
              "outerTimeoutSecondsPerCase": 10,
              "untrustedExpressionSandboxAdmissionClaim": False}
    util["save"](root / "grader-development-smoke-file-entrypoint.json", result)
    print(json.dumps(result))
    return 0 if result["pass"] else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path)
    parser.add_argument("--worker", type=int, choices=range(len(CASES)))
    args = parser.parse_args()
    if args.worker is not None:
        worker(args.worker)
    elif args.root:
        raise SystemExit(main(args.root))
    else:
        parser.error("root or development worker index required")

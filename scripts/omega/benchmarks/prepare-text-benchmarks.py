"""Evaluator-only pinned data conversion and upstream grading. No model credentials."""
import argparse
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys

AIME_REVISION = "c94da77eb22bbd6439e62a323bec18493a421302"
AIME_SHA256 = "9f9066ff48ad2e31f9bf1b1ac6d5e80693195f987985f2859f89dd25ffa51c2d"
BBEH_REVISION = "80d12ca916b7158f22293fcf3144f4d3d854d4be"
BBEH_EVALUATOR_SHA256 = "a674139fa8edcf443740cb7efdac48ad6089491dc3f34206a1f298811c03ee55"


def pinned_bbeh(root):
    root = Path(root).resolve(strict=True)
    head = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
    dirty = subprocess.check_output(["git", "-C", str(root), "status", "--porcelain"], text=True).strip()
    if head != BBEH_REVISION or dirty:
        raise ValueError("bbeh_revision_or_worktree_changed")
    evaluator = root / "bbeh/evaluate.py"
    if hashlib.sha256(evaluator.read_bytes()).hexdigest() != BBEH_EVALUATOR_SHA256:
        raise ValueError("bbeh_evaluator_changed")
    return root, evaluator


def prepare(args):
    import duckdb
    parquet = Path(args.aime).resolve(strict=True)
    if hashlib.sha256(parquet.read_bytes()).hexdigest() != AIME_SHA256:
        raise ValueError("aime_dataset_digest_mismatch")
    root, _ = pinned_bbeh(args.bbeh)
    rows = duckdb.connect().execute(
        "SELECT problem_idx, problem, answer FROM read_parquet(?) ORDER BY problem_idx", [str(parquet)]
    ).fetchall()
    if len(rows) != 30 or len({row[0] for row in rows}) != 30:
        raise ValueError("aime_population_invalid")
    tasks = []
    for index, problem, answer in rows:
        if not isinstance(problem, str) or not isinstance(answer, int) or not 0 <= answer <= 999:
            raise ValueError("aime_row_invalid")
        tasks.append({"family": "AIME_2025", "taskId": f"AIME-2025-{index}",
                      "question": problem, "answer": str(answer)})
    # Entire official Mini population, not a correctness-selected subset. No answers in source control.
    mini = json.loads((root / "bbeh/mini/data.json").read_text())
    if len(mini["examples"]) != 460:
        raise ValueError("bbeh_mini_population_invalid")
    for index, example in enumerate(mini["examples"]):
        # The pinned Mini release has one row with an additional string subtask label.
        # This metadata is neither a reference answer nor a new model instruction.
        if set(example) not in ({"input", "target"}, {"input", "target", "subtask"}) or not all(
            isinstance(v, str) for v in example.values()
        ):
            raise ValueError("bbeh_row_invalid")
        tasks.append({"family": "BBEH_MINI", "taskId": f"BBEH-MINI-{index:03d}",
                      "question": example["input"], "answer": example["target"]})
    body = {"schemaVersion": 1, "aimeRevision": AIME_REVISION, "aimeDigest": AIME_SHA256,
            "bbehRevision": BBEH_REVISION, "bbehEvaluatorDigest": BBEH_EVALUATOR_SHA256,
            "tasks": tasks}
    Path(args.output).write_text(json.dumps(body, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"prepared": True, "aimeTasks": 30, "bbehMiniTasks": 460,
                      "credentialAccess": False, "answersLogged": False}))


def grade(args):
    _, evaluator = pinned_bbeh(args.bbeh)
    request = json.load(sys.stdin)
    if set(request) != {"response", "reference"} or not all(isinstance(v, str) for v in request.values()):
        raise ValueError("grader_request_invalid")
    if sum(len(v.encode()) for v in request.values()) > 20000:
        raise ValueError("grader_request_oversized")
    module_spec = importlib.util.spec_from_file_location("pinned_bbeh_evaluator", evaluator)
    module = importlib.util.module_from_spec(module_spec)
    # Upstream contains illustrative prints. They are not inference/evaluation results and stay suppressed.
    with contextlib.redirect_stdout(io.StringIO()):
        module_spec.loader.exec_module(module)
        result = module.evaluate_correctness(request["response"], request["reference"])
    print(json.dumps({"correct": bool(result), "verifierDigest": BBEH_EVALUATOR_SHA256}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["prepare", "grade"])
    parser.add_argument("--bbeh", required=True)
    parser.add_argument("--aime")
    parser.add_argument("--output")
    args = parser.parse_args()
    if args.mode == "prepare":
        if not args.aime or not args.output:
            parser.error("prepare requires --aime and --output")
        prepare(args)
    else:
        grade(args)

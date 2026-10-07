"""Evaluator-only pinned data conversion and upstream grading. No model credentials."""
import argparse
import contextlib
import csv
import hashlib
import io
import json
import random
import re
from pathlib import Path
import subprocess
import sys
import zipfile

AIME_REVISION = "c94da77eb22bbd6439e62a323bec18493a421302"
AIME_SHA256 = "9f9066ff48ad2e31f9bf1b1ac6d5e80693195f987985f2859f89dd25ffa51c2d"
BBEH_REVISION = "80d12ca916b7158f22293fcf3144f4d3d854d4be"
BBEH_EVALUATOR_SHA256 = "4b4f06e5babb015de2ba639bae995a5526182ffb5b5890af54dfcf038580eb34"
GPQA_REVISION = "56686c06f5e19865c153de0fdb11be3890014df7"
GPQA_ARCHIVE_SHA256 = "461ae7329f15a3e35f8184d2dac24b990f34fdf12f366ca4062d8e6638cd08dc"
GPQA_CSV_SHA256 = "41d1213cd7a4998605a26c2798500652572007161b3a92817ba46b35befcd305"


def gpqa_tasks(rows):
    """Author baseline's seeded choice ordering; no explanations/validator fields.

    This is a custom closed-book NYX adapter, not the authors' inference harness.
    A local RNG prevents unrelated random calls changing the frozen choices.
    """
    rng = random.Random(0)
    tasks = []
    for index, row in enumerate(rows):
        fields = [row.get(field) for field in (
            "Question", "Incorrect Answer 1", "Incorrect Answer 2", "Incorrect Answer 3", "Correct Answer")]
        if any(not isinstance(value, str) or not value.strip() for value in fields):
            raise ValueError("gpqa_row_invalid")
        choices = fields[1:]
        # Preserve the author's four choices verbatim, including repeated wrong
        # distractors in the public release. Filtering them would change the task.
        correct = fields[-1]
        rng.shuffle(choices)
        question = fields[0] + "\n\nChoices:\n" + "\n".join(
            f"{letter}. {choice}" for letter, choice in zip("ABCD", choices))
        question += "\nReturn exactly one final choice letter (A, B, C, or D)."
        tasks.append({"family": "GPQA_DIAMOND", "taskId": f"GPQA-DIAMOND-{index:03d}",
                      "question": question, "answer": "ABCD"[choices.index(correct)]})
    return tasks


def prepare_gpqa(args):
    root = Path(args.gpqa).resolve(strict=True)
    head = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
    dirty = subprocess.check_output(["git", "-C", str(root), "status", "--porcelain"], text=True).strip()
    if head != GPQA_REVISION or dirty:
        raise ValueError("gpqa_revision_or_worktree_changed")
    archive = (root / "dataset.zip").read_bytes()
    if hashlib.sha256(archive).hexdigest() != GPQA_ARCHIVE_SHA256:
        raise ValueError("gpqa_archive_changed")
    # The authors deliberately publish this archive password in their README.
    # It is an anti-contamination canary, not an account or management credential.
    match = re.search(r"password: `([^`]+)`", (root / "README.md").read_text(encoding="utf-8"))
    if not match:
        raise ValueError("gpqa_public_archive_instructions_missing")
    with zipfile.ZipFile(io.BytesIO(archive)) as source:
        content = source.read("dataset/gpqa_diamond.csv", pwd=match.group(1).encode())
    if hashlib.sha256(content).hexdigest() != GPQA_CSV_SHA256:
        raise ValueError("gpqa_csv_changed")
    tasks = gpqa_tasks(csv.DictReader(io.StringIO(content.decode("utf-8-sig"))))
    if len(tasks) != 198:
        raise ValueError("gpqa_diamond_population_invalid")
    body = {"schemaVersion": 1, "gpqaRevision": GPQA_REVISION, "gpqaArchiveDigest": GPQA_ARCHIVE_SHA256,
            "gpqaCsvDigest": GPQA_CSV_SHA256, "shuffleSeed": 0, "tasks": tasks}
    Path(args.output).write_text(json.dumps(body, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"prepared": True, "gpqaDiamondTasks": len(tasks),
                      "credentialAccess": False, "answersLogged": False}))


def pinned_bbeh(root):
    root = Path(root).resolve(strict=True)
    head = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
    dirty = subprocess.check_output(["git", "-C", str(root), "status", "--porcelain"], text=True).strip()
    if head != BBEH_REVISION or dirty:
        raise ValueError("bbeh_revision_or_worktree_changed")
    evaluator = subprocess.check_output(["git", "-C", str(root), "show", f"{head}:bbeh/evaluate.py"])
    if hashlib.sha256(evaluator).hexdigest() != BBEH_EVALUATOR_SHA256:
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
    module = {"__name__": "pinned_bbeh_evaluator"}
    # Upstream contains illustrative prints. They are not inference/evaluation results and stay suppressed.
    with contextlib.redirect_stdout(io.StringIO()):
        exec(compile(evaluator, "pinned-upstream-bbeh-evaluate.py", "exec"), module)
        result = module["evaluate_correctness"](request["response"], request["reference"])
    print(json.dumps({"correct": bool(result), "verifierDigest": BBEH_EVALUATOR_SHA256}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["prepare", "grade", "prepare-gpqa"])
    parser.add_argument("--bbeh")
    parser.add_argument("--gpqa")
    parser.add_argument("--aime")
    parser.add_argument("--output")
    args = parser.parse_args()
    if args.mode == "prepare-gpqa":
        if not args.gpqa or not args.output:
            parser.error("prepare-gpqa requires --gpqa and --output")
        prepare_gpqa(args)
    elif not args.bbeh:
        parser.error("prepare and grade require --bbeh")
    elif args.mode == "prepare":
        if not args.aime or not args.output:
            parser.error("prepare requires --aime and --output")
        prepare(args)
    else:
        grade(args)

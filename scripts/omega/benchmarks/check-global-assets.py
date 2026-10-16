"""Read-only dataset/media checks and segregated evaluation projections.

Never loads remote dataset scripts, executes solutions, invokes models, or emits
benchmark examples. Projections are outside Git. Directory separation is not
an ACL/sandbox claim: a later executor must mount only the approved input view.
"""
import argparse
import csv
import hashlib
import json
import runpy
from pathlib import Path

UTIL = runpy.run_path(str(Path(__file__).with_name("acquire-global-assets.py")))


def json_rows(path):
    if path.suffix == ".jsonl":
        with path.open(encoding="utf-8-sig") as stream:
            return [json.loads(line) for line in stream if line.strip()]
    if path.suffix == ".csv":
        with path.open(encoding="utf-8-sig", newline="") as stream:
            return list(csv.DictReader(stream))
    if path.suffix == ".parquet":
        import pyarrow.parquet as pq
        return pq.read_table(path).to_pylist()
    return json.loads(path.read_text(encoding="utf-8-sig"))


def dataset_root(root, name):
    base = root / "public-datasets" / name.replace("/", "--")
    revisions = sorted(p for p in base.iterdir() if p.is_dir() and len(p.name) == 40)
    if len(revisions) != 1:
        raise ValueError("revision_must_be_selected_explicitly")
    return revisions[0]


def split_views(root, name, rows, input_fields, oracle_fields):
    inputs, oracles = [], []
    for index, row in enumerate(rows):
        inputs.append({"local_id": index, **{k: row[k] for k in input_fields if k in row}})
        oracles.append({"local_id": index, **{k: row[k] for k in oracle_fields if k in row}})
    if set(input_fields) & set(oracle_fields):
        raise ValueError("projection_overlap")
    for directory, data in [("inputs", inputs), ("oracles", oracles)]:
        UTIL["save"](root / "evaluation-views" / directory / (name + ".json"), data)
    return {"rows": len(rows), "inputFields": input_fields, "oracleFields": oracle_fields,
            "directorySegregated": True, "aclIsolationClaim": False}


def check(root):
    out = {"schemaVersion": 1, "identity": "NYX-GLOBAL-DATA-INTEGRITY-001",
           "modelCalls": 0, "referenceValuesPrinted": False,
           "downloadedSourceExecuted": False, "datasets": []}
    specs = [
        ("MATH-500", "HuggingFaceH4/MATH-500", "test.jsonl", 500,
         ["problem", "subject", "level", "unique_id"], ["answer", "solution"]),
        ("Omni-MATH", "KbsdJames/Omni-MATH", "test.jsonl", 4428,
         ["problem", "domain", "difficulty", "source"], ["answer", "solution"]),
        ("AIME-2025", "MathArena/aime_2025", "data/train-00000-of-00001.parquet", 30,
         ["problem_idx", "problem", "element"], ["answer"]),
        ("AIME-2026", "MathArena/aime_2026", "data/train-00000-of-00001.parquet", 30,
         ["problem_idx", "problem", "element"], ["answer"]),
        ("AIME-2024-II", "MathArena/aime_2024_II", "data/train-00000-of-00001.parquet", 15,
         ["problem_idx", "problem"], ["answer"]),
        ("FrontierScience-Olympiad", "openai/frontierscience", "olympiad/test.jsonl", 100,
         ["problem", "subject", "task_group_id"], ["answer"]),
        ("FrontierScience-Research", "openai/frontierscience", "research/test.jsonl", 60,
         ["problem", "subject", "task_group_id"], ["answer"]),
        ("ScienceAgentBench-verified", "osunlp/ScienceAgentBench", "data/verified-00000-of-00001.parquet", 102,
         ["instance_id", "domain", "subtask_categories", "task_inst", "domain_knowledge",
          "dataset_folder_tree", "dataset_preview", "output_fname"],
         ["gold_program_name", "eval_script_name", "src_file_or_path"]),
        ("ProofNet-original-valid", "hoskinson-center/proofnet", "valid.jsonl", 185,
         ["id", "formal_statement", "src_header", "nl_statement"], ["nl_proof"]),
        ("ProofNet-original-test", "hoskinson-center/proofnet", "test.jsonl", 186,
         ["id", "formal_statement", "src_header", "nl_statement"], ["nl_proof"]),
    ]
    for name, dataset, filename, expected, fields, oracle_fields in specs:
        entry = {"name": name, "dataset": dataset, "expected": expected}
        out["datasets"].append(entry)
        try:
            base = dataset_root(root, dataset)
            path = base / filename
            rows = json_rows(path)
            entry.update(revision=base.name, actual=len(rows), source=UTIL["record"](path, root))
            if len(rows) != expected:
                raise ValueError("population_mismatch")
            entry["views"] = split_views(root, name, rows, fields, oracle_fields)
            entry["state"] = "PASS"
        except Exception as error:
            entry.update(state="FAIL", errorClass=type(error).__name__,
                         reason=str(error) if str(error).isidentifier() else "dataset_validation_failure")

    # All MedXpert images are decoded independently of question answers.
    try:
        from PIL import Image
        base = dataset_root(root, "TsinghuaC3I/MedXpertQA")
        media = root / "medxpert-media"
        refs, rows_count = set(), {}
        for split in ("MM/dev.jsonl", "MM/test.jsonl", "Text/dev.jsonl", "Text/test.jsonl"):
            rows = json_rows(base / split)
            rows_count[split] = len(rows)
            for row in rows:
                for ref in row.get("images", []):
                    path = UTIL["target_path"](media, ref if ref.startswith("images/") else "images/" + ref)
                    if not path.is_file():
                        raise ValueError("missing_referenced_medical_image")
                    refs.add(path)
        for path in refs:
            with Image.open(path) as image:
                image.verify()
        out["medxpert"] = {"state": "PASS", "splitRows": rows_count,
                            "uniqueReferencedImagesDecoded": len(refs),
                            "archive": UTIL["record"](base / "images.zip", root)}
    except Exception as error:
        out["medxpert"] = {"state": "FAIL", "errorClass": type(error).__name__,
                           "reason": str(error) if str(error).isidentifier() else "media_validation_failure"}

    # AIME supplemental provenance: do not print either key or low-entropy hashes.
    try:
        supplemental = dataset_root(root, "96kevinli29/aime2026-en")
        rows = json_rows(supplemental / "aime_2026.jsonl")
        canonical = json_rows(dataset_root(root, "MathArena/aime_2026") / "data/train-00000-of-00001.parquet")
        normalize = lambda value: "".join(str(value).split()).replace("\\,", "").replace("\\!", "")
        keyed = {normalize(row["problem"]): str(row["answer"]).strip() for row in canonical}
        matches = 0
        disagreements = 0
        for row in rows:
            key = normalize(row["problem"])
            if key in keyed:
                matches += 1
                disagreements += int(keyed[key].lstrip("0") != str(row["ground_truth"]).strip().lstrip("0"))
        out["aimeSupplemental"] = {"rows": len(rows), "canonicalRows": len(canonical),
                                    "whitespaceNormalizedStatementMatches": matches,
                                    "matchedReferenceDisagreements": disagreements,
                                    "canonicalPopulationReplaced": False,
                                    "nonmatchesRequireProvenanceReview": len(rows) - matches}
    except Exception as error:
        out["aimeSupplemental"] = {"state": "FAIL", "errorClass": type(error).__name__}

    # Recheck the established GPQA population without exposing references.
    gpqa = root / "gpqa-diamond-nyx-private.json"
    if gpqa.exists():
        obj = json_rows(gpqa)
        source = UTIL["record"](gpqa, root)
        valid = (source["sha256"] == "760b5a1eab8abb403b644dbc84edd55af3ff50066d4eda1299c220db7f224942"
                 and obj.get("shuffleSeed") == 0 and len(obj.get("tasks", [])) == 198
                 and len({t["taskId"] for t in obj["tasks"]}) == 198)
        out["gpqaExisting"] = {"source": source, "state": "PASS" if valid else "FAIL",
                                "shape": type(obj).__name__,
                                "topLevelKeys": list(obj) if isinstance(obj, dict) else [],
                                "rows": len(obj["tasks"]),
                                "populationReplaced": False}
        if valid:
            out["gpqaExisting"]["views"] = split_views(root, "GPQA-Diamond", obj["tasks"],
                                                        ["family", "taskId", "question"], ["answer"])
    UTIL["save"](root / "global-integrity-check-2026-10-16.json", out)
    print(json.dumps({"identity": out["identity"],
                      "datasetChecks": len(out["datasets"]),
                      "passed": sum(x["state"] == "PASS" for x in out["datasets"]),
                      "medxpert": out.get("medxpert", {}).get("state"),
                      "gpqa": out.get("gpqaExisting", {}).get("state"),
                      "aimeSupplemental": out.get("aimeSupplemental"), "modelCalls": 0}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    check(parser.parse_args().root)

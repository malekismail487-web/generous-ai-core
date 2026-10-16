"""Consolidate and recheck acquisition receipts, never benchmark references.

This is an acquisition report, not an authority gate or capability certificate.
Protected per-file reference manifests stay in the external cache; publication
binds their complete manifest rather than exposing small-answer fingerprints.
"""
import argparse
import importlib.metadata
import json
import runpy
import subprocess
from pathlib import Path

UTIL = runpy.run_path(str(Path(__file__).with_name("acquire-global-assets.py")))

FAMILIES = [
    (1, "FrontierMath Tiers 1-4", "PRIVATE", "12 public examples; private population unavailable"),
    (2, "FrontierMath Open Problems", "DATA READY", "49 IDs / 50 prompts; paid verifiers separate"),
    (3, "MATH-500", "DATA READY", "500; confined arbitrary-expression grading not admitted"),
    (4, "AIME 2026", "READY", "30 canonical; all 30 supplemental statements/references agree"),
    (5, "Additional AIME", "READY", "2025: 30; 2024 II: 15; other parts separately retained"),
    (6, "MathArena", "DATA READY", "56 public non-output/non-training dataset repositories"),
    (7, "Omni-MATH", "DATA READY", "4428 full; 2821 rule subset; judge weights not inference-tested"),
    (8, "miniF2F", "DATA READY", "488 original task identity; ports separately pinned"),
    (9, "ProofNet", "DATA READY", "185 valid + 186 test; requested ports separately acquired"),
    (10, "PutnamBench", "DATA READY", "672 Lean; 640 Isabelle; 412 Coq"),
    (11, "FrontierScience", "DATA READY", "100 Olympiad + 60 research"),
    (12, "SciCode", "PARTIAL", "15 dev + 65 test main tasks; numeric HDF5 blocked by publisher quota"),
    (13, "DiscoveryBench", "DATA READY", "real 239 test + 25 train; synthetic 200 test + 153 dev + 550 train"),
    (14, "ScienceAgentBench", "DATA READY", "102 verified; archive decrypted and CRC/SHA256 checked"),
    (15, "GPQA Diamond", "READY", "198, original prepared digest and seed 0 preserved"),
    (16, "BixBench", "DATA READY", "205 questions; 64 published capsule archives verified"),
    (17, "BixBench3", "NEEDS AUTHORIZATION", "20 task identities; full 1.40 TB inputs not acquired"),
    (18, "PaperBench", "PARTIAL", "20 official papers + 3 supplementary dirs; 441 scoped LFS files verified"),
    (19, "RE-Bench", "PARTIAL", "7 source task families; protected solution handling unchanged"),
    (20, "MLE-bench", "NEEDS AUTHORIZATION", "75 competitions / 22 Lite; no Kaggle competition data acquired"),
    (21, "SciBench", "DATA READY", "580 main records; 112 separate examples; 354 media files"),
    (22, "SciEval", "READY", "70 dev / 1441 valid / 13011 test; dynamic sets separate"),
    (23, "ChemBench", "DATA READY", "2785 records / 9 categories; package 0.3.0"),
    (24, "MedXpertQA", "DATA READY", "2450 text + 2000 MM test; 10 dev; 2858 referenced images"),
    (25, "CritPt", "DATA READY", "70; remote grading not invoked; offline submission smoke passes"),
    (26, "HLE", "NEEDS AUTHORIZATION", "2500 expected; gated tasks/media not acquired"),
    (27, "FrontierMath Erdos", "DATA READY", "68 canonical Bloom samples = 50 + 18, not unfiltered 147"),
]

RECEIPTS = [
    "global-acquisition-2026-10-16.json", "global-acquisition-secondary-2026-10-16.json",
    "global-matharena-acquisition-2026-10-16.json", "global-gated-access-2026-10-16.json",
    "global-integrity-check-2026-10-16.json", "population-verification-2026-10-16.json",
    "formal-supplementary-2026-10-16.json", "formal-transitive-package-acquisition-recovered.json",
    "formal-package-lock-inventory.json", "formal-statement-file-inventory.json",
    "formal-runtimes/runtime-acquisition.json", "formal-runtimes/lean3-runtime-acquisition.json",
    "formal-runtimes/kernel-development-verification.json", "lean3-mathlib-acquisition.json",
    "erdos-conjecture-source-acquisition.json", "erdos-formal-pins.json", "erdos-population-verification.json",
    "independent-grader-source-acquisition.json", "omni-math-rule-acquisition.json",
    "omni-rule-grader-smoke.json", "omni-judge-assets.json", "omni-judge-header-integrity.json",
    "bixbench-capsule-integrity.json", "bixbench-population.json", "bixbench-question-asset-linkage.json",
    "bixbench3-public-gcs-inventory.json", "bixbench3-public-assets-receipt.json", "bixbench3-gcs-access.json",
    "discoverybench-integrity.json", "discoverybench-question-population.json",
    "scienceagent-assets/download-receipt.json", "scienceagent-assets/verified-preparation-receipt.json",
    "scienceagent-assets/protected-extraction-manifest.json", "scicode-assets/public-download-diagnostic.json",
    "lfs-hydration-verification.json", "paperbench-source-cache-hydration.json",
    "paperbench-population.json", "paperbench-judge-eval-source-receipt.json",
    "mlebench-competition-inventory.json", "kaggle-access-check.json", "supplementary-populations.json",
    "critpt-offline-submission-check.json", "scieval-author-grader-smoke.json",
    "grader-development-smoke-file-entrypoint.json", "cloud-cli-acquisition.json",
    "epoch-open-problems/download-receipt.json", "epoch-open-problems/extracted-manifest.json",
    "epoch-open-problems/population-verification.json", "epoch-frontiermath-public/receipt.json",
    "medxpert-media/extraction-manifest.json",
]


def build(root, output):
    artifacts = {}

    def verify(item):
        path = UTIL["target_path"](root, item["path"])
        if item["path"] in artifacts:
            if artifacts[item["path"]]["sha256"] != item["sha256"]:
                raise ValueError("conflicting_acquisition_bindings")
            return
        actual = UTIL["record"](path, root)
        if actual["bytes"] != item["bytes"] or actual["sha256"] != item["sha256"]:
            raise ValueError("retained_asset_fixity_mismatch")
        artifacts[item["path"]] = actual

    bindings = []
    for name in RECEIPTS:
        path = UTIL["target_path"](root, name)
        bindings.append(UTIL["record"](path, root))
    dataset_sources = {}
    for name in RECEIPTS[:4]:
        data = json.loads((root / name).read_text(encoding="utf-8"))
        for source in data["sources"]:
            # Later gate observations refine earlier transport-error labels;
            # the original diagnostic receipt remains retained and bound.
            dataset_sources[source["dataset"]] = {
                "dataset": source["dataset"],
                "url": "https://huggingface.co/datasets/" + source["dataset"],
                "revision": source.get("revision"), "gated": source.get("gated"),
                "authorDeclaredLicense": source.get("license"),
                "licenseInterpretation": "AUTHOR_METADATA_ONLY_NOT_LEGAL_CERTIFICATION",
                "state": source["state"], "artifactCount": len(source["files"]),
                "artifactBytes": sum(item["bytes"] for item in source["files"]),
                "deferred": source.get("deferred", []), "receipt": name,
            }
            for item in source["files"]:
                verify(item)
    judge = json.loads((root / "omni-judge-assets.json").read_text(encoding="utf-8"))
    for item in judge["files"]:
        verify(item)
    lfs = json.loads((root / "lfs-hydration-verification.json").read_text(encoding="utf-8"))
    for source in lfs:
        if source["missing"]:
            raise ValueError("lfs_hydration_not_complete")
        for item in source["lfsFiles"]:
            verify(item)
    for directory in ["science-source-archives", "formal-source-archives", "supplementary-source-archives", "formal-runtimes"]:
        for path in sorted((root / directory).glob("*.zip")):
            verify(UTIL["record"](path, root))
    for name in ["scienceagent-assets/benchmark_verified.zip", "cloud-cli/google-cloud-cli-589.0.0-windows-x86_64.zip",
                 "epoch-open-problems/open_problems_data-2026-10-16.zip"]:
        verify(UTIL["record"](root / name, root))

    # Record exact installed package populations without importing packages,
    # loading credentials, or executing any model/judge.
    environments = []
    for environment in sorted(root.glob("*-env")):
        site = environment / "Lib" / "site-packages"
        distributions = sorted([{"name": d.metadata["Name"], "version": d.version}
                                for d in importlib.metadata.distributions(path=[str(site)])],
                               key=lambda x: x["name"].lower())
        environments.append({"environment": environment.name, "distributions": distributions})
    UTIL["save"](root / "isolated-environment-lock-inventory.json", environments)
    bindings.append(UTIL["record"](root / "isolated-environment-lock-inventory.json", root))
    source = Path(__file__).parent
    sources = [{**UTIL["record"](p, source), "path": "scripts/omega/benchmarks/" + p.name}
               for p in sorted(source.glob("*.py")) if p.name in {
                   "acquire-global-assets.py", "check-global-assets.py", "check-formal-runtimes.py",
                   "grade-global-development.py", "prepare-scienceagent-assets.py",
                   "test_global_acquisition.py", "build-global-acquisition-receipt.py"}]
    integrity = json.loads((root / "global-integrity-check-2026-10-16.json").read_text(encoding="utf-8"))
    if any(x["state"] != "PASS" for x in integrity["datasets"]) or integrity["medxpert"]["state"] != "PASS" or integrity["gpqaExisting"]["state"] != "PASS":
        raise ValueError("required_integrity_check_failed")
    report = {"schemaVersion": 1, "identity": "NYX-GLOBAL-BENCHMARK-ACQUISITION-2026-10-16",
              "baseCandidate": subprocess.run(["git", "rev-parse", "HEAD"], cwd=source,
                                               capture_output=True, text=True, check=True).stdout.strip(),
              "cacheRoot": str(root), "durability": "RETAINED_LOCAL_FILES_NOT_EPHEMERAL_CI",
              "goal": "PAUSED_AS_REQUESTED", "fullAcquisitionComplete": False,
              "allBenchmarksOperational": False, "modelInferenceCalls": 0,
              "benchmarkCampaignsLaunched": 0, "authorityDelta": "NONE",
              "credentialsPrinted": False, "accountConditionsAccepted": False,
              "cloudResourcesProvisioned": False, "paidServicesPurchased": False,
              "downloadedBenchmarkProgramsExecuted": False,
              "downloadedGraderCodeExercised": "SYNTHETIC_DEVELOPMENT_FIXTURES_ONLY",
              "unrelatedUiFilesPreserved": 8,
              "families": [{"id": ident, "benchmark": name, "readiness": state, "scope": scope}
                           for ident, name, state, scope in FAMILIES],
              "receiptBindings": bindings, "implementationBindings": sources,
              "publicDatasetSources": sorted(dataset_sources.values(), key=lambda x: x["dataset"]),
              "rehashVerifiedArtifactCount": len(artifacts),
              "rehashVerifiedArtifactBytes": sum(a["bytes"] for a in artifacts.values()),
              "artifacts": sorted(artifacts.values(), key=lambda x: x["path"]),
              "protectedPerFileOracleManifestsPublished": False,
              "limitations": ["PRIVATE_OR_PAID_OFFICIAL_VERIFIERS", "HF_ACCESS_CONDITIONS_AND_AUTHORIZATION",
                              "KAGGLE_AUTHORIZATION_AND_COMPETITION_RULES", "SCICODE_PUBLISHER_DOWNLOAD_QUOTA",
                              "BIXBENCH3_1_40_TB_INPUT_STORAGE", "APPROVED_LINUX_CONTAINER_AND_HARDWARE_PREREQUISITES",
                              "WINDOWS_CODE_INTEGRITY_POLICY_BLOCK", "TASK_SPECIFIC_REPRODUCTION_RESOURCE_ACCESS"],
              "humanActionsAndSourceUrls": "docs/omega/GLOBAL_BENCHMARK_ACQUISITION_2026-10-16.md"}
    UTIL["save"](output, report)
    print(json.dumps({"identity": report["identity"], "families": len(FAMILIES),
                      "verifiedArtifacts": len(artifacts), "verifiedArtifactBytes": report["rehashVerifiedArtifactBytes"],
                      "receiptBindings": len(bindings), "fullAcquisitionComplete": False,
                      "environments": len(environments), "modelInferenceCalls": 0}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    build(args.root, args.output)

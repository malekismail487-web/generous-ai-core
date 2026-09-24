"""Deterministic checks for the pinned whole-brain map research runtime."""

from __future__ import annotations

import csv
import os
import tempfile
from pathlib import Path

import numpy as np
import pyarrow as arrow
import pyarrow.parquet as parquet

from flywire_full_map import (MapInvalid, SourceSpec, compare_lesion, compile_map,
                              inspect, open_compiled, sha256_file, simulate)


def fixture(root: Path, *, wrong_target_id: bool = False,
            wrong_signed_weight: bool = False) -> SourceSpec:
    neuron_ids = [1001, 1002, 1003, 1004]
    with (root / "Completeness_783.csv").open("w", encoding="utf-8", newline="") as output:
        writer = csv.writer(output)
        writer.writerow(["", "Completed"])
        writer.writerows((neuron_id, "True") for neuron_id in neuron_ids)
    rows = {
        "Presynaptic_ID": [1001, 1001, 1002],
        "Postsynaptic_ID": [1002, 9999 if wrong_target_id else 1003, 1004],
        "Presynaptic_Index": [0, 0, 1],
        "Postsynaptic_Index": [1, 2, 3],
        "Connectivity": [200, 200, 200],
        "Excitatory": [1, -1, 1],
        "Excitatory x Connectivity": [200, 200 if wrong_signed_weight else -200, 200],
    }
    parquet.write_table(arrow.table(rows), root / "Connectivity_783.parquet", row_group_size=2)
    files = {path.name: {"bytes": path.stat().st_size, "sha256": sha256_file(path)}
             for path in (root / "Completeness_783.csv", root / "Connectivity_783.parquet")}
    return SourceSpec("fixture:four-neurons", "0" * 40, 4, 3, files)


checks = 0


def check(condition: bool, description: str) -> None:
    global checks
    if not condition:
        raise AssertionError(description)
    checks += 1


def rejects(action: object, reason: str) -> None:
    try:
        action()
    except MapInvalid as error:
        check(reason in str(error), f"expected rejection {reason}, received {error}")
        return
    raise AssertionError(f"expected rejection {reason}")


with tempfile.TemporaryDirectory(prefix="nyx-flywire-fixture-") as directory:
    root = Path(directory)
    spec = fixture(root)
    report = inspect(root, spec)
    check(report["validation"] == "FULL_ROW_STREAM_VALIDATED", "full stream verifies")
    check(report["metrics"] == {"nodes": 4, "connectionRows": 3, "summedSynapses": 600,
                                "inhibitoryConnectionRows": 1}, "source metrics exact")
    compiled = compile_map(root, spec)
    check(compiled["grantsAuthority"] is False, "compile grants no authority")
    manifest, arrays = open_compiled(root, spec)
    nodes, offsets, targets, signed = arrays
    check(np.array_equal(nodes, [1001, 1002, 1003, 1004]), "all neurons preserved")
    check(np.array_equal(offsets, [0, 2, 3, 3, 3]), "ordered adjacency exact")
    check(np.array_equal(targets, [1, 2, 3]) and np.array_equal(signed, [200, -200, 200]),
          "signs and connection strengths preserved")
    check(manifest["sourceSha256"] == report["sourceSha256"], "compiled provenance binds source")
    result = simulate(arrays, (0,), 80)
    counts = {item["neuronId"]: item["spikes"] for item in result["topSpikingNeuronIds"]}
    check(result["status"] == "BOUNDED_RUN_FINISHED" and result["modelCalls"] == 0,
          "independent bounded graph computation finishes")
    check(counts.get("1002", 0) > 0 and counts.get("1003", 0) == 0,
          "excitation propagates while inhibition suppresses the competing path")
    check(result["grantsAuthority"] is False and result["biologicalFidelity"] == "UNVALIDATED_DISCRETE_APPROXIMATION",
          "result does not inflate biological fidelity or authority")
    comparison = compare_lesion(arrays, (0,), (1,), 80)
    check(comparison["status"] == "COMPARABLE" and comparison["modelCalls"] == 0
          and comparison["grantsAuthority"] is False, "matched lesion is bounded and authority-neutral")
    check(comparison["baseline"]["spikeVectorSha256"] == result["spikeVectorSha256"]
          and comparison["lesion"]["spikes"] < result["spikes"],
          "baseline is identical and silencing the relay suppresses activity")
    check(comparison["difference"]["lostActiveNeurons"] >= 2
          and comparison["difference"]["populationSpikeDelta"] < 0,
          "counterfactual identifies both relay and downstream loss")
    null_control = compare_lesion(arrays, (0,), (2,), 80)
    check(null_control["status"] == "COMPARABLE"
          and null_control["difference"]["changedNeurons"] == 0,
          "silencing an inactive cell does not manufacture an effect")
    inconclusive = compare_lesion(arrays, (0,), (1,), 80, max_events=1)
    check(inconclusive["status"] == "INCONCLUSIVE_BUDGET" and "difference" not in inconclusive,
          "budget-limited runs cannot issue a causal comparison")
    rejects(lambda: compare_lesion(arrays, (0,), (), 80), "comparison_requires_silenced_neuron")
    rejects(lambda: compare_lesion(arrays, (0,), (4,), 80), "simulation_request_out_of_bounds")
    rejects(lambda: simulate(arrays, (4,), 10), "simulation_request_out_of_bounds")
    rejects(lambda: simulate(arrays, (0,), 0), "simulation_request_out_of_bounds")
    rejects(lambda: compile_map(root, spec), "compiled_target_exists_refusing_overwrite")
    del nodes, offsets, targets, signed, arrays
    compiled_weights = root / "compiled/signed_weights.npy"
    with compiled_weights.open("r+b") as output:
        output.seek(-1, 2)
        output.write(b"x")
    rejects(lambda: open_compiled(root, spec), "compiled_digest_mismatch:signed_weights.npy")
    with (root / "Completeness_783.csv").open("a", encoding="utf-8") as output:
        output.write("9999,True\n")
    rejects(lambda: inspect(root, spec), "source_file_missing_or_wrong_size")
    rejects(lambda: open_compiled(root, spec), "source_file_missing_or_wrong_size")

for wrong_id, wrong_weight, expected in ((True, False, "connection_id_index_mismatch"),
                                         (False, True, "connection_weight_or_sign_invalid")):
    with tempfile.TemporaryDirectory(prefix="nyx-flywire-negative-") as directory:
        root = Path(directory)
        spec = fixture(root, wrong_target_id=wrong_id, wrong_signed_weight=wrong_weight)
        rejects(lambda: inspect(root, spec), expected)

real_root = os.environ.get("NYX_FLYWIRE_DATA_ROOT")
if real_root:
    root = Path(real_root)
    pinned = SourceSpec.from_json(Path(__file__).resolve().parents[2]
                                  / "src/lib/codelab/connectome/flywireFullMapSource.json")
    report = inspect(root, pinned)
    check(report["metrics"]["connectionRows"] == 15_091_983, "real full-model row count exact")
    _, arrays = open_compiled(root, pinned)
    first = simulate(arrays, (53_290,), 40)
    second = simulate(arrays, (53_290,), 40)
    check(first == second and first["status"] == "BOUNDED_RUN_FINISHED",
          "full-map intervention is reproducible and bounded")
    check(len(first["topSpikingNeuronIds"]) >= 2, "real network propagates beyond stimulus")
    stimulus_id = int(arrays[0][53_290])
    downstream_id = next(int(item["neuronId"]) for item in first["topSpikingNeuronIds"]
                         if int(item["neuronId"]) != stimulus_id)
    downstream_index = int(np.flatnonzero(arrays[0] == downstream_id)[0])
    comparison = compare_lesion(arrays, (53_290,), (downstream_index,), 40)
    check(comparison["status"] == "COMPARABLE"
          and comparison["baseline"]["spikeVectorSha256"] == first["spikeVectorSha256"],
          "real-map counterfactual uses exactly the same stimulus and baseline")
    check(comparison["difference"]["changedNeurons"] >= 1
          and comparison["lesion"]["spikeVectorSha256"] != first["spikeVectorSha256"],
          "real-map silencing produces a measurable computational difference")

print(f"FLYWIRE_FULL_MAP_TESTS_PASSED checks={checks} realData={'yes' if real_root else 'no'}")

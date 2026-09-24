"""Verify and exercise a pinned FlyWire whole-brain model input outside the repo.

This is a research computation, not a biological reproduction or Omega authority.
Install numpy and pyarrow==21.0.0 in an isolated environment before using it.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import numpy as np

try:
    import pyarrow.parquet as parquet
except ImportError as error:
    raise SystemExit("pyarrow==21.0.0 is required for FlyWire Parquet input") from error


SOURCE_CONTRACT = Path(__file__).resolve().parents[2] / "src/lib/codelab/connectome/flywireFullMapSource.json"
REQUIRED_COLUMNS = (
    "Presynaptic_ID", "Postsynaptic_ID", "Presynaptic_Index", "Postsynaptic_Index",
    "Connectivity", "Excitatory", "Excitatory x Connectivity",
)
COMPILED_FILES = ("node_ids.npy", "offsets.npy", "targets.npy", "signed_weights.npy")
AUTHORITY = "RESEARCH_PRIOR_NOT_EXECUTION_AUTHORITY"


class MapInvalid(ValueError):
    """Source or compiled artifact did not satisfy the pinned contract."""


@dataclass(frozen=True)
class SourceSpec:
    dataset_id: str
    source_commit: str
    expected_nodes: int
    expected_connections: int
    files: dict[str, dict[str, object]]

    @classmethod
    def from_json(cls, path: Path) -> "SourceSpec":
        document = json.loads(path.read_text(encoding="utf-8"))
        if document.get("schemaVersion") != 1:
            raise MapInvalid("source_contract_version_unsupported")
        if set(document.get("files", {})) != {"Completeness_783.csv", "Connectivity_783.parquet"}:
            raise MapInvalid("source_contract_files_invalid")
        return cls(document["datasetId"], document["sourceCommit"],
                   document["expectedNodes"], document["expectedConnections"], document["files"])


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_raw_files(root: Path, spec: SourceSpec) -> None:
    if not root.is_dir() or root.is_symlink():
        raise MapInvalid("data_root_invalid")
    for name, expected in spec.files.items():
        path = root / name
        if not path.is_file() or path.is_symlink() or path.stat().st_size != expected["bytes"]:
            raise MapInvalid(f"source_file_missing_or_wrong_size:{name}")
        if sha256_file(path) != expected["sha256"]:
            raise MapInvalid(f"source_digest_mismatch:{name}")


def load_nodes(root: Path, spec: SourceSpec) -> np.ndarray:
    nodes: list[int] = []
    with (root / "Completeness_783.csv").open(newline="", encoding="utf-8-sig") as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != ["", "Completed"]:
            raise MapInvalid("neuron_list_schema_invalid")
        for row in reader:
            if row["Completed"] != "True" or not row[""].isdigit():
                raise MapInvalid("neuron_list_row_invalid")
            nodes.append(int(row[""]))
    if len(nodes) != spec.expected_nodes or len(set(nodes)) != len(nodes):
        raise MapInvalid("neuron_list_count_or_identity_invalid")
    return np.asarray(nodes, dtype=np.int64)


def _numeric(batch: object, name: str) -> np.ndarray:
    column = batch.column(name)
    if column.null_count:
        raise MapInvalid(f"connection_null_column:{name}")
    return column.to_numpy(zero_copy_only=False)


def scan_connections(root: Path, spec: SourceSpec, nodes: np.ndarray,
                     sink: Callable[[int, np.ndarray, np.ndarray, np.ndarray], None] | None = None,
                     counts: np.ndarray | None = None) -> dict[str, int]:
    source = parquet.ParquetFile(root / "Connectivity_783.parquet")
    if not set(REQUIRED_COLUMNS).issubset(source.schema.names):
        raise MapInvalid("connection_schema_invalid")
    if source.metadata.num_rows != spec.expected_connections:
        raise MapInvalid("connection_count_invalid")
    total_rows = total_synapses = inhibitory_rows = 0
    previous_source = -1
    for batch in source.iter_batches(batch_size=1_048_576, columns=list(REQUIRED_COLUMNS)):
        pre_ids = _numeric(batch, "Presynaptic_ID")
        post_ids = _numeric(batch, "Postsynaptic_ID")
        pre = _numeric(batch, "Presynaptic_Index")
        post = _numeric(batch, "Postsynaptic_Index")
        weights = _numeric(batch, "Connectivity")
        signs = _numeric(batch, "Excitatory")
        signed = _numeric(batch, "Excitatory x Connectivity")
        if not len(pre) or np.any(pre < 0) or np.any(post < 0) or np.any(pre >= len(nodes)) \
                or np.any(post >= len(nodes)):
            raise MapInvalid("connection_index_out_of_bounds")
        if int(pre[0]) < previous_source or np.any(pre[1:] < pre[:-1]):
            raise MapInvalid("connection_source_order_invalid")
        previous_source = int(pre[-1])
        if not np.array_equal(pre_ids, nodes[pre]) or not np.array_equal(post_ids, nodes[post]):
            raise MapInvalid("connection_id_index_mismatch")
        if np.any(weights <= 0) or np.any(~np.isin(signs, (-1, 1))) \
                or not np.array_equal(signed, signs * weights):
            raise MapInvalid("connection_weight_or_sign_invalid")
        if counts is not None:
            counts += np.bincount(pre, minlength=len(nodes))
        if sink is not None:
            sink(total_rows, pre, post, signed)
        total_rows += len(pre)
        total_synapses += int(weights.sum(dtype=np.int64))
        inhibitory_rows += int(np.count_nonzero(signs == -1))
    if total_rows != spec.expected_connections:
        raise MapInvalid("connection_stream_truncated")
    return {"nodes": len(nodes), "connectionRows": total_rows,
            "summedSynapses": total_synapses, "inhibitoryConnectionRows": inhibitory_rows}


def inspect(root: Path, spec: SourceSpec) -> dict[str, object]:
    verify_raw_files(root, spec)
    nodes = load_nodes(root, spec)
    metrics = scan_connections(root, spec, nodes)
    return {"schemaVersion": 1, "datasetId": spec.dataset_id, "sourceCommit": spec.source_commit,
            "sourceSha256": {name: item["sha256"] for name, item in spec.files.items()},
            "metrics": metrics, "validation": "FULL_ROW_STREAM_VALIDATED",
            "biologicalFidelity": "CONNECTIVITY_VERIFIED_DYNAMICS_NOT_YET_VALIDATED",
            "authority": AUTHORITY, "grantsAuthority": False}


def compile_map(root: Path, spec: SourceSpec) -> dict[str, object]:
    report = inspect(root, spec)
    target = root / "compiled"
    if target.exists():
        raise MapInvalid("compiled_target_exists_refusing_overwrite")
    temporary = root / f"compiled.pending.{uuid.uuid4().hex}"
    temporary.mkdir()
    nodes = load_nodes(root, spec)
    count = spec.expected_connections
    node_file = np.lib.format.open_memmap(temporary / COMPILED_FILES[0], mode="w+", dtype=np.int64,
                                          shape=(len(nodes),))
    node_file[:] = nodes
    target_file = np.lib.format.open_memmap(temporary / COMPILED_FILES[2], mode="w+", dtype=np.int32,
                                            shape=(count,))
    weight_file = np.lib.format.open_memmap(temporary / COMPILED_FILES[3], mode="w+", dtype=np.int32,
                                            shape=(count,))
    counts = np.zeros(len(nodes), dtype=np.int64)

    def copy_rows(start: int, _pre: np.ndarray, post: np.ndarray, signed: np.ndarray) -> None:
        end = start + len(post)
        target_file[start:end] = post.astype(np.int32, copy=False)
        weight_file[start:end] = signed.astype(np.int32, copy=False)

    second_metrics = scan_connections(root, spec, nodes, copy_rows, counts)
    if second_metrics != report["metrics"]:
        raise MapInvalid("connection_second_pass_changed")
    offsets = np.zeros(len(nodes) + 1, dtype=np.int64)
    np.cumsum(counts, out=offsets[1:])
    if int(offsets[-1]) != count:
        raise MapInvalid("compiled_edge_count_invalid")
    offset_file = np.lib.format.open_memmap(temporary / COMPILED_FILES[1], mode="w+", dtype=np.int64,
                                            shape=(len(offsets),))
    offset_file[:] = offsets
    for mapped in (node_file, target_file, weight_file, offset_file):
        mapped.flush()
    # Windows will not rename the pending directory while closure-held memmaps
    # still have open file handles, even after flush() has returned.
    del mapped, copy_rows, node_file, target_file, weight_file, offset_file
    verify_raw_files(root, spec)
    artifact_hashes = {name: sha256_file(temporary / name) for name in COMPILED_FILES}
    manifest = {**report, "compiledSha256": artifact_hashes,
                "runtimeSemantics": "DETERMINISTIC_DISCRETE_LIF_APPROXIMATION_NOT_REFERENCE_BRIAN2"}
    (temporary / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.rename(temporary, target)
    return manifest


def open_compiled(root: Path, spec: SourceSpec) -> tuple[dict[str, object], tuple[np.ndarray, ...]]:
    verify_raw_files(root, spec)
    target = root / "compiled"
    manifest_path = target / "manifest.json"
    if not manifest_path.is_file() or target.is_symlink():
        raise MapInvalid("compiled_map_missing")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("sourceSha256") != {name: item["sha256"] for name, item in spec.files.items()} \
            or manifest.get("datasetId") != spec.dataset_id or manifest.get("grantsAuthority") is not False:
        raise MapInvalid("compiled_provenance_invalid")
    for name in COMPILED_FILES:
        path = target / name
        if not path.is_file() or path.is_symlink() or sha256_file(path) != manifest["compiledSha256"][name]:
            raise MapInvalid(f"compiled_digest_mismatch:{name}")
    arrays = tuple(np.load(target / name, mmap_mode="r", allow_pickle=False) for name in COMPILED_FILES)
    nodes, offsets, targets, signed = arrays
    if len(nodes) != spec.expected_nodes or len(offsets) != len(nodes) + 1 \
            or len(targets) != spec.expected_connections or len(signed) != len(targets) \
            or int(offsets[0]) != 0 or int(offsets[-1]) != len(targets) \
            or np.any(offsets[1:] < offsets[:-1]):
        raise MapInvalid("compiled_shape_or_order_invalid")
    return manifest, arrays


def _simulate(arrays: tuple[np.ndarray, ...], stimulus_indices: tuple[int, ...], steps: int,
              stimulus_period: int = 5, max_spikes: int = 20_000,
              max_events: int = 2_000_000,
              silenced_indices: tuple[int, ...] = ()) -> tuple[dict[str, object], np.ndarray]:
    """Bounded deterministic approximation of the published LIF equations.

    The source paper uses Brian2 and Poisson input. Fixed pulses and Euler steps here
    permit reproducible tests; they are NOT a validated reproduction of its behavior.
    """
    nodes, offsets, targets, signed = arrays
    n = len(nodes)
    if not 1 <= steps <= 500 or not 1 <= stimulus_period <= 100 \
            or not 1 <= len(stimulus_indices) <= 16 or len(set(stimulus_indices)) != len(stimulus_indices) \
            or any(index < 0 or index >= n for index in stimulus_indices) \
            or len(silenced_indices) > 16 or len(set(silenced_indices)) != len(silenced_indices) \
            or any(index < 0 or index >= n for index in silenced_indices):
        raise MapInvalid("simulation_request_out_of_bounds")
    if max_spikes < 1 or max_events < 1:
        raise MapInvalid("simulation_budget_invalid")
    resting, threshold, synaptic_mv = -52.0, -45.0, 0.275
    membrane = np.full(n, resting, dtype=np.float32)
    conductance = np.zeros(n, dtype=np.float32)
    refractory = np.zeros(n, dtype=np.int8)
    spike_counts = np.zeros(n, dtype=np.int32)
    pending = [np.zeros(n, dtype=np.float32) for _ in range(3)]
    stimulus = np.asarray(stimulus_indices, dtype=np.int32)
    silenced = np.zeros(n, dtype=np.bool_)
    silenced[list(silenced_indices)] = True
    total_spikes = total_events = 0
    steps_executed = 0
    status = "BOUNDED_RUN_FINISHED"
    for tick in range(steps):
        conductance += pending[tick % 3]
        pending[tick % 3].fill(0)
        membrane += (resting - membrane + conductance) / 20.0
        conductance *= np.float32(np.exp(-1.0 / 5.0))
        active = np.flatnonzero((membrane > threshold) & (refractory == 0))
        if tick % stimulus_period == 0:
            active = np.union1d(active, stimulus)
        active = active[~silenced[active]]
        event_count = int(np.sum(offsets[active + 1] - offsets[active], dtype=np.int64))
        if total_spikes + len(active) > max_spikes or total_events + event_count > max_events:
            status = "BUDGET_STOPPED"
            break
        total_spikes += len(active)
        total_events += event_count
        spike_counts[active] += 1
        membrane[active] = resting
        conductance[active] = 0
        refractory[active] = 3
        due = pending[(tick + 2) % 3]
        for source in active:
            begin, end = int(offsets[source]), int(offsets[source + 1])
            if begin != end:
                np.add.at(due, targets[begin:end], signed[begin:end] * synaptic_mv)
        refractory[refractory > 0] -= 1
        steps_executed = tick + 1
    ranked = np.argsort(-spike_counts, kind="stable")[:20]
    result = {"schemaVersion": 1, "status": status, "stepsRequested": steps,
            "stepsExecuted": steps_executed, "stimulusIndices": list(stimulus_indices),
            "silencedIndices": list(silenced_indices), "spikes": total_spikes,
            "synapticEvents": total_events,
            "activeNeurons": int(np.count_nonzero(spike_counts)),
            "spikeVectorSha256": hashlib.sha256(spike_counts.astype("<i4", copy=False).tobytes()).hexdigest(),
            "topSpikingNeuronIds": [{"neuronId": str(int(nodes[index])), "spikes": int(spike_counts[index])}
                                    for index in ranked if spike_counts[index] > 0],
            "biologicalFidelity": "UNVALIDATED_DISCRETE_APPROXIMATION",
            "modelCalls": 0, "authority": AUTHORITY, "grantsAuthority": False}
    return result, spike_counts


def simulate(arrays: tuple[np.ndarray, ...], stimulus_indices: tuple[int, ...], steps: int,
             stimulus_period: int = 5, max_spikes: int = 20_000,
             max_events: int = 2_000_000,
             silenced_indices: tuple[int, ...] = ()) -> dict[str, object]:
    return _simulate(arrays, stimulus_indices, steps, stimulus_period, max_spikes,
                     max_events, silenced_indices)[0]


def compare_lesion(arrays: tuple[np.ndarray, ...], stimulus_indices: tuple[int, ...],
                   silenced_indices: tuple[int, ...], steps: int,
                   stimulus_period: int = 5, max_spikes: int = 20_000,
                   max_events: int = 2_000_000) -> dict[str, object]:
    """Compare matched deterministic runs; never infer biological causality."""
    if not silenced_indices:
        raise MapInvalid("comparison_requires_silenced_neuron")
    baseline, baseline_counts = _simulate(arrays, stimulus_indices, steps, stimulus_period,
                                          max_spikes, max_events)
    lesion, lesion_counts = _simulate(arrays, stimulus_indices, steps, stimulus_period,
                                     max_spikes, max_events, silenced_indices)
    comparable = baseline["status"] == lesion["status"] == "BOUNDED_RUN_FINISHED"
    result: dict[str, object] = {
        "schemaVersion": 1,
        "status": "COMPARABLE" if comparable else "INCONCLUSIVE_BUDGET",
        "stimulusIndices": list(stimulus_indices),
        "silencedIndices": list(silenced_indices),
        "baseline": baseline,
        "lesion": lesion,
        "interpretation": "COMPUTATIONAL_COUNTERFACTUAL_NOT_BIOLOGICAL_CAUSALITY",
        "modelCalls": 0,
        "authority": AUTHORITY,
        "grantsAuthority": False,
    }
    if comparable:
        difference = lesion_counts.astype(np.int64) - baseline_counts
        nodes = arrays[0]
        changed = np.flatnonzero(difference)
        rank = sorted(changed, key=lambda index: (-abs(int(difference[index])), int(index)))[:20]
        result["difference"] = {
            "populationSpikeDelta": int(difference.sum()),
            "changedNeurons": int(len(changed)),
            "lostActiveNeurons": int(np.count_nonzero((baseline_counts > 0) & (lesion_counts == 0))),
            "newlyActiveNeurons": int(np.count_nonzero((baseline_counts == 0) & (lesion_counts > 0))),
            "topChanges": [{"neuronId": str(int(nodes[index])), "spikeDelta": int(difference[index])}
                           for index in rank],
        }
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("inspect", "compile", "stimulate", "compare"))
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--stimulus-index", type=int, action="append", default=[])
    parser.add_argument("--silence-index", type=int, action="append", default=[])
    parser.add_argument("--steps", type=int, default=40)
    arguments = parser.parse_args()
    spec = SourceSpec.from_json(SOURCE_CONTRACT)
    try:
        if arguments.command == "inspect":
            result = inspect(arguments.data_root, spec)
        elif arguments.command == "compile":
            result = compile_map(arguments.data_root, spec)
        else:
            manifest, arrays = open_compiled(arguments.data_root, spec)
            result = {"sourceDigest": manifest["sourceSha256"],
                      "experiment": compare_lesion(arrays, tuple(arguments.stimulus_index),
                                                   tuple(arguments.silence_index), arguments.steps)
                      if arguments.command == "compare" else simulate(arrays, tuple(arguments.stimulus_index),
                                                                       arguments.steps,
                                                                       silenced_indices=tuple(arguments.silence_index))}
    except (MapInvalid, OSError, ValueError, KeyError) as error:
        print(json.dumps({"status": "REJECTED", "reason": str(error), "grantsAuthority": False}), file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

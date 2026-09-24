"""Bounded, source-pinned two-path closure probe for the FlyWire graph.

Closures are non-induced: extra edges among the three neurons are allowed. They
must not be equated to a paper's exact induced three-node motif counts. This is
a descriptive topology experiment, not a neuron-function inference or an
admitted NYX cognition mechanism. Target permutation preserves the filtered
in/out degree sequence but permits duplicate partners and loops.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

from flywire_full_map import AUTHORITY, SOURCE_CONTRACT, MapInvalid, SourceSpec, open_compiled


def _filtered_edges(arrays: tuple[np.ndarray, ...], minimum_synapses: int
                    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if not 1 <= minimum_synapses <= 100:
        raise MapInvalid("motif_synapse_threshold_out_of_bounds")
    if len(arrays) != 4:
        raise MapInvalid("motif_compiled_graph_invalid")
    nodes, offsets, targets, signed = arrays
    if len(nodes) < 3 or len(offsets) != len(nodes) + 1 or len(targets) != len(signed) \
            or int(offsets[0]) != 0 or int(offsets[-1]) != len(targets) \
            or np.any(offsets[1:] < offsets[:-1]) or np.any(targets < 0) \
            or np.any(targets >= len(nodes)):
        raise MapInvalid("motif_compiled_graph_invalid")
    edge_indices = np.flatnonzero(np.abs(signed.astype(np.int64)) >= minimum_synapses)
    if len(edge_indices) < 3:
        raise MapInvalid("motif_graph_too_small")
    sources = np.searchsorted(offsets[1:], edge_indices, side="right").astype(np.int32)
    destinations = np.asarray(targets[edge_indices], dtype=np.int32)
    degree = np.bincount(sources, minlength=len(nodes))
    filtered_offsets = np.zeros(len(nodes) + 1, dtype=np.int64)
    np.cumsum(degree, out=filtered_offsets[1:])
    return sources, destinations, filtered_offsets


def _contains(sorted_edges: np.ndarray, query: np.ndarray) -> np.ndarray:
    positions = np.searchsorted(sorted_edges, query)
    return (positions < len(sorted_edges)) & (sorted_edges[np.minimum(positions, len(sorted_edges) - 1)] == query)


def _closure_probe(sources: np.ndarray, targets: np.ndarray, offsets: np.ndarray,
                   sample_paths: int, seed: int) -> dict[str, float | int]:
    generator = np.random.default_rng(seed)
    node_count = len(offsets) - 1
    edge_keys = np.sort(sources.astype(np.uint64) * np.uint64(node_count) + targets)
    first = generator.integers(0, len(sources), size=sample_paths)
    u, v = sources[first], targets[first]
    degree = offsets[v + 1] - offsets[v]
    reachable = degree > 0
    u, v, degree = u[reachable], v[reachable], degree[reachable]
    second = offsets[v] + np.floor(generator.random(len(v)) * degree).astype(np.int64)
    w = targets[second]
    distinct = (u != v) & (v != w) & (u != w)
    u, w = u[distinct], w[distinct]
    if not len(u):
        raise MapInvalid("motif_no_distinct_two_paths")
    feedforward = _contains(edge_keys, u.astype(np.uint64) * np.uint64(node_count) + w)
    cycle = _contains(edge_keys, w.astype(np.uint64) * np.uint64(node_count) + u)
    return {"attemptedTwoPaths": sample_paths, "distinctTwoPaths": int(len(u)),
            "feedforwardClosures": int(np.count_nonzero(feedforward)),
            "cycleClosures": int(np.count_nonzero(cycle)),
            "feedforwardRate": float(np.mean(feedforward)), "cycleRate": float(np.mean(cycle))}


def motif_probe(arrays: tuple[np.ndarray, ...], minimum_synapses: int = 5,
                sample_paths: int = 20_000, null_replicates: int = 5,
                seed: int = 1729) -> dict[str, object]:
    if not 1 <= sample_paths <= 100_000 or not 1 <= null_replicates <= 10 \
            or not 0 <= seed < 2**32:
        raise MapInvalid("motif_probe_budget_invalid")
    sources, targets, offsets = _filtered_edges(arrays, minimum_synapses)
    real = _closure_probe(sources, targets, offsets, sample_paths, seed)
    controls = []
    real_in_degree = np.bincount(targets, minlength=len(offsets) - 1)
    for replicate in range(null_replicates):
        null_seed = (seed + 104_729 * (replicate + 1)) % 2**32
        shuffled = np.random.default_rng(null_seed).permutation(targets)
        if not np.array_equal(np.bincount(shuffled, minlength=len(offsets) - 1), real_in_degree):
            raise MapInvalid("motif_null_degree_preservation_failed")
        controls.append(_closure_probe(sources, shuffled, offsets, sample_paths, null_seed))
    null_cycle = float(np.mean([control["cycleRate"] for control in controls]))
    null_feedforward = float(np.mean([control["feedforwardRate"] for control in controls]))
    return {"schemaVersion": 1, "minimumSynapses": minimum_synapses,
            "filteredConnections": int(len(sources)), "samplePathsPerGraph": sample_paths,
            "nullReplicates": null_replicates, "seed": seed, "real": real, "controls": controls,
            "cycleEnrichmentVsControl": real["cycleRate"] / null_cycle if null_cycle > 0 else None,
            "feedforwardEnrichmentVsControl": real["feedforwardRate"] / null_feedforward
            if null_feedforward > 0 else None,
            "samplingScheme": "UNIFORM_FIRST_EDGE_THEN_UNIFORM_VALID_SECOND_EDGE",
            "nullModel": "TARGET_PERMUTATION_PRESERVES_FILTERED_IN_OUT_DEGREE_NOT_SIMPLE_GRAPH",
            "motifDefinition": "NON_INDUCED_DIRECTED_TWO_PATH_CLOSURE",
            "interpretation": "DESCRIPTIVE_STRUCTURE_NOT_FUNCTION_OR_COGNITIVE_GAIN",
            "modelCalls": 0, "authority": AUTHORITY, "grantsAuthority": False}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--minimum-synapses", type=int, default=5)
    parser.add_argument("--sample-paths", type=int, default=20_000)
    parser.add_argument("--null-replicates", type=int, default=5)
    parser.add_argument("--seed", type=int, default=1729)
    arguments = parser.parse_args()
    try:
        spec = SourceSpec.from_json(SOURCE_CONTRACT)
        manifest, arrays = open_compiled(arguments.data_root, spec)
        result = {"datasetId": spec.dataset_id, "sourceSha256": manifest["sourceSha256"],
                  "compiledSha256": manifest["compiledSha256"],
                  "probe": motif_probe(arrays, arguments.minimum_synapses,
                                       arguments.sample_paths, arguments.null_replicates, arguments.seed)}
    except (MapInvalid, OSError, ValueError, KeyError) as error:
        print(json.dumps({"status": "REJECTED", "reason": str(error), "grantsAuthority": False}), file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

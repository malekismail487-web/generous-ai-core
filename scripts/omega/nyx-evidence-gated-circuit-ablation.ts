import { NYX_CONTRASTIVE_CIRCUIT_ABLATION, NYX_CONTRASTIVE_CIRCUIT_FROZEN_CORE } from
  "./nyx-contrastive-circuit-ablation";

/** Exploratory follow-up on the reused V4 tasks; fresh-task generalization remains untested. */
export const NYX_EVIDENCE_GATED_CIRCUIT_ABLATION = Object.freeze({
  ...NYX_CONTRASTIVE_CIRCUIT_ABLATION,
  chunkId: "OMEGA-NYX-EVIDENCE-GATED-CIRCUIT-PILOT-001",
  version: "nyx-evidence-gated-circuit-pilot/2",
  arms: Object.freeze(["NEMOTRON_ALONE", "NYX_REASONING_STACK", "NYX_EVIDENCE_GATED_CIRCUIT"] as const),
});

export const NYX_EVIDENCE_GATED_CIRCUIT_FROZEN_CORE = Object.freeze({
  commit: "77f90c07c42910ba451084fe6cb58197265eb865",
  files: Object.freeze({
    ...NYX_CONTRASTIVE_CIRCUIT_FROZEN_CORE.files,
    "src/lib/codelab/connectome/nyxConnectomeCognitionAdapter.ts":
      "23c74eb0283b83745e4dc90145973ef1fc0fd4e19aec689e49876bdace8c34fb",
  }),
});

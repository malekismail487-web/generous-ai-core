import { NYX_CONTRASTIVE_CIRCUIT_ABLATION, NYX_CONTRASTIVE_CIRCUIT_FROZEN_CORE } from
  "./nyx-contrastive-circuit-ablation";

/** Exploratory follow-up on the reused V4 tasks; fresh-task generalization remains untested. */
export const NYX_EVIDENCE_GATED_CIRCUIT_ABLATION = Object.freeze({
  ...NYX_CONTRASTIVE_CIRCUIT_ABLATION,
  chunkId: "OMEGA-NYX-EVIDENCE-GATED-CIRCUIT-PILOT-001",
  version: "nyx-evidence-gated-circuit-pilot/1",
  arms: Object.freeze(["NEMOTRON_ALONE", "NYX_REASONING_STACK", "NYX_EVIDENCE_GATED_CIRCUIT"] as const),
});

export const NYX_EVIDENCE_GATED_CIRCUIT_FROZEN_CORE = Object.freeze({
  commit: "e28c87206257a2ac7fe0938b7c1299201e89b6b1",
  files: Object.freeze({
    ...NYX_CONTRASTIVE_CIRCUIT_FROZEN_CORE.files,
    "src/lib/codelab/connectome/nyxConnectomeCognitionAdapter.ts":
      "fa9d4fd65ab96d48b954e2b92983f2ff5bab0cd9405156d9340b0f9fc83c6b64",
  }),
});

import { NYX_V5_QUALITY_REPAIR_V3_FROZEN_CORE } from "./nyx-quality-v5-fixtures";
import { NYX_VERIFIED_HYBRID_BIOLOGICAL_PROFILE } from
  "../../src/lib/codelab/connectome/verifiedBiologicalArchitectureProfile";

/**
 * A pilot on the pre-existing frozen V4 tasks. They were not authored for this
 * treatment, but have been used before; this is not a fresh-task certificate.
 */
export const NYX_CONTRASTIVE_CIRCUIT_ABLATION = Object.freeze({
  chunkId: "OMEGA-NYX-CONTRASTIVE-CIRCUIT-PILOT-001",
  version: "nyx-contrastive-circuit-pilot/1",
  frozenTaskSuite: "NYX_ENGINEERING_QUALITY_FRESH_HOLDOUT_V4",
  arms: Object.freeze(["NEMOTRON_ALONE", "NYX_REASONING_STACK", "NYX_CONTRASTIVE_CIRCUIT"] as const),
  taskExecutionsPerArm: 7,
  model: "nvidia/nemotron-3-ultra-550b-a55b",
  sourceRepresentation: "LINES",
  intentCompilationMode: "SAFE_CANONICALIZATION",
  maxCognitionCyclesPerTask: 3,
  maxCandidateIterationsPerTask: 3,
  maxCognitionCorrectionsPerTask: 2,
  maxOutputTokensPerCall: 1_536,
  maxPromptBytesPerCall: 48_000,
  maxWallClockMsPerTask: 180_000,
  profileDigest: NYX_VERIFIED_HYBRID_BIOLOGICAL_PROFILE.profileDigest,
  additionalModelCalls: 0,
  authorityIncrease: false,
  defaultConfigurationChanged: false,
} as const);

export const NYX_CONTRASTIVE_CIRCUIT_FROZEN_CORE = Object.freeze({
  commit: "bfe4d56062b64f6d7770a7a98784d4381dfbaba1",
  files: Object.freeze({
    ...NYX_V5_QUALITY_REPAIR_V3_FROZEN_CORE.files,
    "src/lib/codelab/connectome/nyxConnectomeCognitionAdapter.ts":
      "4c0a53413badb9e1e540df2cd7a47f2132f61b12399ed114cd05d3274a341fb2",
  }),
});

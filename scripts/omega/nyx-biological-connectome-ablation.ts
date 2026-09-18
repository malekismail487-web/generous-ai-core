import { NYX_CONNECTOME_ABLATION_FROZEN_CORE } from "./nyx-connectome-ablation";
import { NYX_VERIFIED_HYBRID_BIOLOGICAL_PROFILE } from
  "../../src/lib/codelab/connectome/verifiedBiologicalArchitectureProfile";

export const NYX_BIOLOGICAL_CONNECTOME_ABLATION = Object.freeze({
  chunkId: "OMEGA-NYX-BIOLOGICAL-CONNECTOME-ABLATION-001",
  version: "nyx-biological-connectome-ablation/1",
  frozenTaskSuite: "NYX_ENGINEERING_QUALITY_FRESH_HOLDOUT_V5",
  arms: Object.freeze(["NEMOTRON_ALONE", "NYX_REASONING_STACK", "NYX_CONNECTOME",
    "NYX_BIOLOGICAL_CONNECTOME"] as const),
  treatmentProfileId: NYX_VERIFIED_HYBRID_BIOLOGICAL_PROFILE.profileId,
  treatmentProfileDigest: NYX_VERIFIED_HYBRID_BIOLOGICAL_PROFILE.profileDigest,
  sourcePriorDigest: NYX_VERIFIED_HYBRID_BIOLOGICAL_PROFILE.sourcePriorDigest,
  sourceRepresentation: "LINES",
  intentCompilationMode: "SAFE_CANONICALIZATION",
  model: "nvidia/nemotron-3-ultra-550b-a55b",
  taskExecutionsPerArm: 7,
  maxCognitionCyclesPerTask: 3,
  maxCandidateIterationsPerTask: 3,
  maxCognitionCorrectionsPerTask: 2,
  maxOutputTokensPerCall: 1_536,
  maxPromptBytesPerCall: 48_000,
  maxWallClockMsPerTask: 180_000,
  matchedControls: Object.freeze(["MODEL", "TASK_CONTENT", "CALL_CEILING", "OUTPUT_TOKEN_CEILING",
    "TOOL_SET", "VERIFIER", "REPAIR_CEILING", "WALL_CLOCK_CEILING", "MUTATION_SCOPE"]),
  biologicalTreatment: Object.freeze(["POPULATION_REPLICATION", "SPARSE_ROUTING_FANOUT",
    "BOUNDED_RECURRENT_CYCLES"]),
  integrationDefectControl: Object.freeze({
    reason: "A/B/C baseline produced zero candidates because mechanically repairable wire-format violations dominated.",
    boundedCounterexamples: true,
    canonicalizesParseableSourceOnly: true,
    repairsInvalidSyntax: false,
    appliesEquallyToAllArms: true,
  }),
  additionalModelCalls: 0,
  additionalTools: 0,
  authorityIncrease: false,
  defaultConfigurationChanged: false,
} as const);

/** A/B reasoning core stays pinned to the same immutable pre-connectome reference. */
export const NYX_BIOLOGICAL_CONNECTOME_ABLATION_FROZEN_CORE = NYX_CONNECTOME_ABLATION_FROZEN_CORE;

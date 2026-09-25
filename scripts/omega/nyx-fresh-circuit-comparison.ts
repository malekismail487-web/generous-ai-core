import { NYX_EVIDENCE_GATED_CIRCUIT_FROZEN_CORE } from "./nyx-evidence-gated-circuit-ablation";
import { NYX_VERIFIED_HYBRID_BIOLOGICAL_PROFILE } from
  "../../src/lib/codelab/connectome/verifiedBiologicalArchitectureProfile";

/** One task per frozen topic, two matched arms. Diagnostic evidence only. */
export const NYX_FRESH_CIRCUIT_COMPARISON = Object.freeze({
  chunkId: "OMEGA-NYX-FRESH-CIRCUIT-TRANSFER-001",
  version: "nyx-fresh-circuit-transfer/1",
  arms: Object.freeze(["NYX_REASONING_STACK", "NYX_EVIDENCE_GATED_CIRCUIT"] as const),
  topics: Object.freeze(["LEDGER", "DEPENDENCIES"] as const),
  maxCognitionCyclesPerTask: 3, maxCandidateIterationsPerTask: 3, maxCognitionCorrectionsPerTask: 2,
  maxOutputTokensPerCall: 1_536, maxPromptBytesPerCall: 48_000, maxWallClockMsPerTask: 180_000,
  sourceRepresentation: "LINES", intentCompilationMode: "SAFE_CANONICALIZATION",
  profileDigest: NYX_VERIFIED_HYBRID_BIOLOGICAL_PROFILE.profileDigest,
  authorityIncrease: false, defaultConfigurationChanged: false,
});

export const NYX_FRESH_CIRCUIT_FROZEN_CORE = Object.freeze({
  commit: "afc1c6d49b9a754cd84a636f18ea09c8003c1d6b",
  files: Object.freeze({
    ...NYX_EVIDENCE_GATED_CIRCUIT_FROZEN_CORE.files,
    "src/lib/codelab/connectome/nyxConnectomeCognitionAdapter.ts":
      "547aa22d79fc97cdb490d5b3b7a799e41f9a8e23c26b28390c1be058c148ccfb",
  }),
});

// The ledger diagnostic remains pinned to the original parser. Dependency
// transfer uses the generic parser-location correction as a distinct epoch.
export const NYX_FRESH_CIRCUIT_TRANSFER_CORE = Object.freeze({
  commit: "ad0cb3ba5b20f89fe4df8df88805848aa885dabe",
  files: Object.freeze({
    ...NYX_FRESH_CIRCUIT_FROZEN_CORE.files,
    "src/lib/codelab/cognition/nyxRepairIntentCompiler.ts":
      "0d40820e9cc721992390184344aa00e8c37d7a9c44fefbe695a4742c1fa2a52a",
  }),
});

export interface NyxFreshCircuitRecord {
  readonly baseTaskId: string;
  readonly comparisonArm: "NYX_REASONING_STACK" | "NYX_EVIDENCE_GATED_CIRCUIT";
  readonly frozenTaskContentDigest: string;
  readonly finalClassification: string;
  readonly totalTokens: number;
  readonly tokenUsageComplete: boolean;
  readonly modelCalls: number;
  readonly repairIterations: number;
  readonly durationMs: number;
  readonly providerDiagnostics: readonly { readonly failureCategory: string | null }[];
  readonly omegaAuthorityEnforcement: boolean;
  readonly sourceRepositoryUnchanged: boolean;
  readonly contractPreserved: boolean;
  readonly connectomeTraces: readonly { readonly circuitState: string;
    readonly selectedAction: string | null; readonly additionalModelCalls: number;
    readonly grantsAuthority: boolean; readonly architecture: { readonly profileDigest: string | null } }[];
}

/** A paired diagnostic cannot establish population-level superiority. */
export function assessNyxFreshCircuitPair(records: readonly NyxFreshCircuitRecord[],
  topic: "LEDGER" | "DEPENDENCIES") {
  const taskId = topic === "LEDGER" ? "NYX-FRESH-LEDGER-RECONCILIATION" : "NYX-FRESH-DEPENDENCY-LAYERS";
  const control = records.find((record) => record.comparisonArm === "NYX_REASONING_STACK");
  const treatment = records.find((record) => record.comparisonArm === "NYX_EVIDENCE_GATED_CIRCUIT");
  const paired = records.length === 2 && Boolean(control && treatment)
    && records.every((record) => record.baseTaskId === taskId)
    && control?.frozenTaskContentDigest === treatment?.frozenTaskContentDigest;
  const safetyPreserved = records.every((record) => record.omegaAuthorityEnforcement
    && record.sourceRepositoryUnchanged && record.contractPreserved
    && record.connectomeTraces.every((trace) => !trace.grantsAuthority && trace.additionalModelCalls === 0));
  const profileBound = Boolean(treatment && treatment.connectomeTraces.length > 0
    && treatment.connectomeTraces.every((trace) =>
      trace.architecture.profileDigest === NYX_FRESH_CIRCUIT_COMPARISON.profileDigest)
    && control?.connectomeTraces.length === 0);
  const providerClean = records.every((record) => record.providerDiagnostics
    .every((diagnostic) => diagnostic.failureCategory === null));
  const capacityComplete = records.every((record) => record.finalClassification !== "WAITING_FOR_CAPACITY");
  const tokenUsageComplete = records.every((record) => record.tokenUsageComplete);
  const computeMatched = Boolean(control && treatment && tokenUsageComplete
    && treatment.modelCalls <= control.modelCalls && treatment.totalTokens <= control.totalTokens);
  const decision = !safetyPreserved ? "SAFETY_REGRESSION"
    : !paired || !profileBound || !providerClean || !capacityComplete || !tokenUsageComplete
      ? "INSUFFICIENT_EVIDENCE"
      : treatment?.finalClassification === "PASS" && control?.finalClassification !== "PASS" && computeMatched
        ? "TENTATIVE_SINGLE_TASK_UPLIFT" : "NO_PAIRED_UPLIFT";
  return Object.freeze({ decision, topic, paired, safetyPreserved, profileBound, providerClean,
    capacityComplete, tokenUsageComplete, computeMatched,
    control: control ? { classification: control.finalClassification, calls: control.modelCalls,
      tokens: control.tokenUsageComplete ? control.totalTokens : null,
      repairIterations: control.repairIterations, durationMs: control.durationMs } : null,
    treatment: treatment ? { classification: treatment.finalClassification, calls: treatment.modelCalls,
      tokens: treatment.tokenUsageComplete ? treatment.totalTokens : null,
      repairIterations: treatment.repairIterations, durationMs: treatment.durationMs,
      supportedCircuitDecisions: treatment.connectomeTraces.filter((trace) =>
        trace.circuitState === "SUPPORTED_CANDIDATE" && trace.selectedAction !== null).length,
      circuitAbstentions: treatment.connectomeTraces.filter((trace) =>
        trace.circuitState !== "SUPPORTED_CANDIDATE").length } : null,
    generalizationCertified: false, limitation: "One predeclared task per topic; matched ceilings do not ensure equal realized compute." });
}

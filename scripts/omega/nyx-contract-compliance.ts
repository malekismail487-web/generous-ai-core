import { createHash } from "node:crypto";
import {
  NyxNemotronEngineeringCognition,
  type NyxRepairCognitionResult,
} from "../../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";
import { NvidiaNimProvider, nvidiaNimCredentialFromEnvironment } from "../../src/lib/codelab/model/nvidiaNimProvider";
import type { EngineeringObservation } from "../../src/lib/codelab/observation/r3EngineeringObservation";

const TRIAL_COUNT = 5;
const MODEL = process.env.NVIDIA_NIM_MODEL?.trim() || "nvidia/nemotron-3-ultra-550b-a55b";
const SOURCE = `export function normalizeTags(tags) {
  return [...new Set(tags.map((tag) => tag.trim()))];
}
`;
const OBJECTIVE = "Repair normalizeTags(tags) so it returns sorted, unique, lowercase, non-empty trimmed strings while preserving the ESM export and avoiding side effects.";

function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function classify(result: NyxRepairCognitionResult): string {
  if (result.decision === "PROPOSED" || result.decision === "REQUEST_EVIDENCE" || result.decision === "NO_ACTION") return "NONE";
  if (result.reason.includes("provider_http") || result.reason.includes("provider_timeout")
    || result.reason.includes("transport_failure") || result.reason.includes("credential_unavailable")) {
    return "PROVIDER_TRANSPORT_FAILURE";
  }
  if (result.reason.includes("not_strict_json")) return "PROVIDER_RESPONSE_FORMAT_FAILURE";
  if (result.reason.includes("schema_invalid")) return "MODEL_SCHEMA_COMPLIANCE_FAILURE";
  if (result.decision === "REJECTED" || result.decision === "BLOCKED") return "INTEGRATION_CONTRACT_FAILURE";
  return "MODEL_CAPABILITY_FAILURE";
}

if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1") {
  console.error("NYX_TYPED_COMPLIANCE result=BLOCKED reason=explicit_nvidia_network_authorization_missing");
  process.exit(2);
}

const provider = NvidiaNimProvider.create({ providerId: "NYX-NEMOTRON-CONTRACT-COMPLIANCE", model: MODEL,
  authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM", credentialSource: nvidiaNimCredentialFromEnvironment(process.env),
  maxPromptBytes: 64_000, maxOutputTokens: 4_096, timeoutMs: 90_000 });
const cognition = NyxNemotronEngineeringCognition.create({ cognitionId: "NYX-NEMOTRON-CONTRACT-COMPLIANCE",
  provider, maxPromptBytes: 48_000, maxOutputTokens: 2_048 });

const observedAt = Date.now();
const observation: EngineeringObservation = Object.freeze({ schemaVersion: 1,
  observationId: "NYX-CONTRACT-COMPLIANCE-OBSERVATION", evidenceClass: "E3", state: "TEST_FAIL",
  baselineComparison: "NEW_FAILURE", candidateAttribution: "LIKELY_CANDIDATE_ATTRIBUTABLE", attributionConfidence: 0.9,
  epistemicState: "SUPPORTED", candidateCommit: "0".repeat(40), disposableRepositoryId: "COMPLIANCE-DISPOSABLE",
  applicationId: "COMPLIANCE-APPLICATION", proposalDigest: "1".repeat(64), toolId: "TEST", toolKind: "TEST",
  toolIdentityDigest: "2".repeat(64), environmentIdentity: `github-actions-${process.platform}-${process.arch}`,
  diagnostics: Object.freeze([Object.freeze({ category: "TEST", channel: "STDERR", file: "src/normalize-tags.mjs",
    line: 1, column: 1, code: null, testName: "normalizes tags", message: "expected sorted lowercase unique tags" })]),
  candidateFailureSignature: "3".repeat(64), baselineFailureSignature: null,
  candidateEvidenceId: "NYX-CONTRACT-COMPLIANCE-CANDIDATE-EVIDENCE", baselineEvidenceId: null,
  unknowns: Object.freeze([]), contradictions: Object.freeze([]), observedAtEpochMs: observedAt, grantsAuthority: false });

const trials: Record<string, unknown>[] = [];
for (let index = 1; index <= TRIAL_COUNT; index += 1) {
  const result = await cognition.proposeRepair({ schemaVersion: 1,
    cognitionRequestId: `NYX-CONTRACT-COMPLIANCE-${index}-${observedAt}`, objective: OBJECTIVE, observation,
    files: [{ relativePath: "src/normalize-tags.mjs", content: SOURCE, contentSha256: sha256(SOURCE) }],
    availableEvidence: [], priorHypotheses: [],
    allowedVerificationToolIds: ["TEST"], maxChanges: 1, maxPatchBytes: 4_096,
    maxDiagnosisCharacters: 1_500, maxCounterexamples: 3, observedAtEpochMs: observedAt });
  const schemaValid = result.decision === "PROPOSED" || result.decision === "REQUEST_EVIDENCE" || result.decision === "NO_ACTION";
  trials.push({ trial: index, model: result.evidence.model, modelEvidenceId: result.evidence.modelEvidenceId,
    evidenceClass: result.evidence.evidenceClass, statusCode: result.evidence.modelStatusCode,
    requestDigest: result.evidence.modelRequestDigest, responseDigest: result.evidence.modelResponseDigest,
    tokens: result.evidence.modelUsage.totalTokens, providerRequestObserved: result.evidence.modelRequestDigest !== null,
    strictJsonValid: result.reason !== "nyx_cognition_output_not_strict_json", schemaValid,
    semanticActionValid: schemaValid, semanticDecision: result.decision,
    diagnosticCategories: result.schemaDiagnostics.map((item) => item.category),
    diagnosticPaths: result.schemaDiagnostics.map((item) => item.path), failureClass: classify(result),
    authorizationResult: "NOT_REQUESTED", omegaAuthorityGranted: false });
}

const compliant = trials.filter((trial) => trial.schemaValid === true).length;
const summary = { schemaVersion: 1, chunkId: "NYX-NEMOTRON-CONTRACT-REPAIR-001", model: MODEL,
  protocolIdentity: "NYX_CAUSAL_ENGINEERING_INTENT_V2", taskDigest: sha256(OBJECTIVE), trialCount: TRIAL_COUNT,
  compliantTrials: compliant, minimumRequired: 1, unchangedTaskAcrossTrials: true,
  authorityIncrease: false, generalNetworkAuthority: false, credentialPersisted: false, trials };
console.log(`NYX_TYPED_COMPLIANCE ${JSON.stringify(summary)}`);
if (compliant < 1) process.exitCode = 1;

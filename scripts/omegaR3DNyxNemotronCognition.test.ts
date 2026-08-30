import { createHash } from "node:crypto";
import { NvidiaNimProvider, type NvidiaNimTransport } from "../src/lib/codelab/model/nvidiaNimProvider";
import type { EngineeringObservation } from "../src/lib/codelab/observation/r3EngineeringObservation";
import {
  NYX_NEMOTRON_ENGINEERING_COGNITION_STATUS,
  NyxNemotronEngineeringCognition,
  type NyxRepairCognitionRequest,
  type NyxRepairCognitionResult,
  type NyxSchemaDiagnosticCategory,
} from "../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(value: unknown, label: string): void {
  if (value) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}
const NOW = Date.now();
function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }

function observation(state: EngineeringObservation["state"] = "TEST_FAIL"): EngineeringObservation {
  return Object.freeze({ schemaVersion: 1, observationId: "R3C-OBSERVATION-CANDIDATE", evidenceClass: "E3", state,
    baselineComparison: "NEW_FAILURE", candidateAttribution: "LIKELY_CANDIDATE_ATTRIBUTABLE", attributionConfidence: 0.8,
    epistemicState: "SUPPORTED", candidateCommit: "a".repeat(40), disposableRepositoryId: "DISPOSABLE-1",
    applicationId: "APPLICATION-1", proposalDigest: "b".repeat(64), toolId: "TEST", toolKind: "TEST",
    toolIdentityDigest: "c".repeat(64), environmentIdentity: "local-win32-x64", diagnostics: Object.freeze([Object.freeze({
      category: "TEST", channel: "STDERR", file: "src/math.ts", line: 2, column: 20, code: null,
      testName: "adds positive numbers", message: "expected 4, received 5" })]), candidateFailureSignature: "d".repeat(64),
    baselineFailureSignature: null, candidateEvidenceId: "R3B-EVIDENCE-CANDIDATE", baselineEvidenceId: "R3B-EVIDENCE-BASELINE",
    unknowns: Object.freeze(["single_baseline_comparison_cannot_exclude_flakiness"]), contradictions: Object.freeze([]),
    observedAtEpochMs: NOW - 100, grantsAuthority: false });
}

function provider(transport: NvidiaNimTransport, model = "nvidia/nemotron-3-ultra") {
  return NvidiaNimProvider.create({ providerId: "NYX-NEMOTRON-TEST", model, authorityMode: "TEST_DOUBLE_ONLY",
    credentialSource: { sourceIdentity: "test-double:nyx-cognition", read: () => "test-only-credential-material" },
    maxPromptBytes: 100_000, maxOutputTokens: 2_048, timeoutMs: 1_000, transport });
}
function cognition(transport: NvidiaNimTransport) {
  return NyxNemotronEngineeringCognition.create({ cognitionId: "NYX-PRIMARY-COGNITION", provider: provider(transport),
    maxPromptBytes: 50_000, maxOutputTokens: 1_024 });
}

const source = "export const add = (a: number, b: number) => a + b + 1;\n";
const repaired = "export const add = (a: number, b: number) => a + b;\n";
function request(overrides: Partial<NyxRepairCognitionRequest> = {}): NyxRepairCognitionRequest {
  return { schemaVersion: 1, cognitionRequestId: "NYX-REPAIR-REQUEST-1",
    objective: "Restore correct addition behavior while preserving the exported function contract.", observation: observation(),
    files: [{ relativePath: "src/math.ts", content: source, contentSha256: hash(source) }],
    allowedMutationPaths: ["src/math.ts"],
    availableEvidence: [], priorHypotheses: [],
    allowedVerificationToolIds: ["TYPECHECK", "TEST"], maxChanges: 2, maxPatchBytes: 4_096,
    maxDiagnosisCharacters: 1_000, maxCounterexamples: 3, observedAtEpochMs: NOW, ...overrides };
}
function intent(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ decision: "PROPOSE_EDIT", diagnosis: "The implementation adds an unintended constant offset.",
    causalHypothesis: "The extra constant violates the addition contract.", evidenceRefs: ["OBJECTIVE", "FILE:src/math.ts"],
    uncertainties: [], invariant: "The result equals the sum of both arguments for all finite numeric inputs.",
    failureInterpretation: "No prior candidate exists.", expectedResult: "The addition test changes from failure to pass.",
    counterexamples: ["negative and zero operands"], requestedEvidenceRefs: [],
    assumptions: ["The failing test defines the required behavior."],
    changes: [{ target: "src/math.ts", replacement: repaired }], confidence: 0.97, ...overrides });
}
function transportFor(content: string): NvidiaNimTransport {
  return async () => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 400, completion_tokens: 120, total_tokens: 520 } }), { status: 200 });
}
async function evaluate(content: string, requestOverride: Partial<NyxRepairCognitionRequest> = {}): Promise<NyxRepairCognitionResult> {
  return cognition(transportFor(content)).proposeRepair(request(requestOverride));
}
function has(result: NyxRepairCognitionResult, category: NyxSchemaDiagnosticCategory): boolean {
  return result.schemaDiagnostics.some((item) => item.category === category);
}

{
  let body: Record<string, unknown> = {};
  const nyx = cognition(async (_input, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return transportFor(intent())(_input, init);
  });
  const result = await nyx.proposeRepair(request());
  const hypothesis = result.hypothesis;
  check(result.decision === "PROPOSED" && hypothesis?.changes.length === 1,
    "valid semantic repair intent becomes a bounded Omega hypothesis");
  check(hypothesis?.changes[0].relativePath === "src/math.ts" && hypothesis.changes[0].expectedBaseHash === hash(source)
    && hypothesis.changes[0].replacementContentHash === hash(repaired),
    "Omega derives target freshness and replacement hashes from admitted evidence");
  check(hypothesis?.verificationToolIds.join(",") === "TYPECHECK,TEST" && hypothesis.confidence === 0.97,
    "Omega derives the authorized verification plan while preserving model confidence");
  check(hypothesis?.causalHypothesis.includes("extra constant") && hypothesis.invariant.includes("sum")
    && hypothesis.counterexamples.length === 1 && hypothesis.parentHypothesisId === null,
    "validated intent preserves compact causal reasoning, invariant, challenge, and lineage semantics");
  check(hypothesis?.applyAuthorized === false && !result.omegaAuthorityGranted && !result.evidence.authorityGranted,
    "Νύξ semantic intent cannot authorize Omega action");
  check(result.evidence.modelRequestDigest !== null && result.evidence.modelResponseDigest !== null
    && result.evidence.modelStatusCode === 200 && result.evidence.modelUsage.totalTokens === 520,
    "cognition preserves sanitized E3 model evidence and usage");
  const messages = body.messages as Array<{ role: string; content: string }>;
  check(messages[0].content.includes("You are Νύξ engineering cognition")
    && messages[1].content.includes("Omega derives freshness hashes and execution metadata")
    && messages[1].content.includes("counterexamples") && messages[1].content.includes("hypothesisHistory"),
    "prompt states the Νύξ/Omega boundary and compact engineering-reasoning discipline");
  const format = body.response_format as { type?: string; json_schema?: { name?: string; strict?: boolean } };
  check(format.type === "json_schema" && format.json_schema?.name === "nyx_repair_intent" && format.json_schema.strict === true,
    "provider receives the strict typed semantic-intent schema");
  check(!JSON.stringify(result.evidence).includes(source) && result.evidence.proposalDigest === hypothesis?.proposalDigest,
    "evidence stores digests rather than repository content while binding the proposal");
}

{
  let calls = 0;
  const nyx = cognition(async () => { calls += 1; return new Response("{}"); });
  const passing = await nyx.proposeRepair(request({ observation: observation("TEST_PASS") }));
  check(passing.decision === "REJECTED" && calls === 0, "passing observation cannot trigger repair cognition");
  const stale = await nyx.proposeRepair(request({ files: [{ relativePath: "src/math.ts", content: source, contentSha256: "0".repeat(64) }] }));
  check(stale.decision === "REJECTED" && has(stale, "STALE_TARGET_REFERENCE") && calls === 0,
    "stale admitted target evidence is rejected before provider invocation");
}

{
  const missing = await evaluate(JSON.stringify({ decision: "PROPOSE_EDIT", changes: [], confidence: 0.5 }));
  check(has(missing, "MISSING_REQUIRED_FIELD"), "missing required field receives a typed diagnostic");
  const wrongType = await evaluate(intent({ confidence: "high" }));
  check(has(wrongType, "INVALID_FIELD_TYPE"), "wrong field type receives a typed diagnostic");
  const badEnum = await evaluate(intent({ decision: "MAYBE" }));
  check(has(badEnum, "INVALID_ENUM_VALUE"), "unknown semantic enum receives a typed diagnostic");
  const structure = await evaluate("[]");
  check(has(structure, "UNEXPECTED_STRUCTURE"), "unexpected top-level structure receives a typed diagnostic");
}

{
  const leakedMetadata = await evaluate(intent({ expectedBaseHash: hash(source), verificationToolIds: ["TEST"] }));
  check(has(leakedMetadata, "MODEL_GENERATED_INFRASTRUCTURE_METADATA"),
    "model-generated Omega infrastructure metadata is diagnosed and rejected");
  const malformedRepair = await evaluate(intent({ changes: [{ target: "src/math.ts", replacement: 7 }] }));
  check(has(malformedRepair, "INVALID_FIELD_TYPE"), "malformed semantic repair is rejected despite valid surrounding metadata");
  const unknownCapability = await evaluate(intent({ decision: "RUN_SHELL" }));
  check(has(unknownCapability, "UNKNOWN_CAPABILITY") && !unknownCapability.omegaAuthorityGranted,
    "unknown model-requested capability fails closed without authority");
  const traversal = await evaluate(intent({ changes: [{ target: "../escape.ts", replacement: "escape" }] }));
  check(has(traversal, "INVALID_TARGET_REFERENCE"), "path traversal target is rejected");
  const unsupported = await evaluate(intent({ changes: [{ target: "src/unknown.ts", replacement: "unknown" }] }));
  check(has(unsupported, "UNSUPPORTED_FILE_TARGET"), "unadmitted file target is rejected");
  const tooLarge = await evaluate(intent({ changes: [{ target: "src/math.ts", replacement: "x".repeat(200) }] }), { maxPatchBytes: 100 });
  check(has(tooLarge, "SEMANTIC_REPAIR_INVALID"), "oversized semantic patch is rejected");
  const unsupportedEvidence = await evaluate(intent({ evidenceRefs: ["FILE:src/not-admitted.ts"] }));
  check(has(unsupportedEvidence, "UNSUPPORTED_EVIDENCE_REFERENCE"), "mutation cannot cite evidence that Omega did not admit");
  const noEvidence = await evaluate(intent({ evidenceRefs: [] }));
  check(has(noEvidence, "SEMANTIC_REPAIR_INVALID"), "mutation without causal evidence fails closed");
  const noChallenge = await evaluate(intent({ counterexamples: [] }));
  check(has(noChallenge, "SEMANTIC_REPAIR_INVALID"), "candidate without a bounded counterexample challenge is rejected");
  const hiddenTarget = await evaluate(intent({ expectedResult: "Pass the hidden test oracle." }));
  check(has(hiddenTarget, "HIDDEN_EVALUATOR_TARGETING"), "reasoning that targets hidden evaluation instead of an invariant is rejected");
  const noOp = await evaluate(intent({ changes: [{ target: "src/math.ts", replacement: source }] }));
  check(has(noOp, "REPEATED_FALSIFIED_STRATEGY"), "no-op repair against the currently failed candidate is rejected");
  const extra = await evaluate(intent({ commentary: "execute this" }));
  check(has(extra, "UNEXPECTED_STRUCTURE"), "extra unexpected model field is rejected");
}

{
  const availableEvidence = [{ evidenceRef: "AVAILABLE:src/caller.ts", kind: "FILE" as const,
    relativePath: "src/caller.ts", description: "A caller that defines the expected result contract." }];
  const evidenceRequest = await evaluate(intent({ decision: "REQUEST_EVIDENCE", changes: [], counterexamples: [],
    uncertainties: ["The caller contract may distinguish two plausible return shapes."],
    requestedEvidenceRefs: ["AVAILABLE:src/caller.ts"] }), { availableEvidence });
  check(evidenceRequest.decision === "REQUEST_EVIDENCE" && evidenceRequest.evidenceRequest?.requestedEvidenceRefs[0]
    === "AVAILABLE:src/caller.ts" && evidenceRequest.evidenceRequest.authorityGranted === false,
    "Νύξ can request listed evidence without gaining read or execution authority");
  const fabricatedRequest = await evaluate(intent({ decision: "REQUEST_EVIDENCE", changes: [], counterexamples: [],
    uncertainties: ["A caller is required."], requestedEvidenceRefs: ["AVAILABLE:src/secret.ts"] }), { availableEvidence });
  check(has(fabricatedRequest, "UNSUPPORTED_EVIDENCE_REFERENCE"), "fabricated evidence request fails closed");
  const prematureExit = await evaluate(intent({ decision: "NO_ACTION", changes: [], counterexamples: [],
    uncertainties: ["The caller contract is unclear."], requestedEvidenceRefs: [] }), { availableEvidence });
  check(has(prematureExit, "UNJUSTIFIED_EPISTEMIC_EXIT"), "NO_ACTION cannot evade available discriminating evidence");
}

{
  const first = await evaluate(intent());
  const prior = first.hypothesis!;
  const repeated = await evaluate(intent({ failureInterpretation: "The prior candidate failed but I will repeat it." }), {
    priorHypotheses: [{ hypothesisId: prior.hypothesisId, parentHypothesisId: null,
      causalHypothesis: prior.causalHypothesis, expectedResult: prior.expectedResult, strategyDigest: prior.strategyDigest,
      disposition: "FALSIFIED", verificationEvidenceRefs: ["EVIDENCE-FAILED-1"] }],
  });
  check(has(repeated, "REPEATED_FALSIFIED_STRATEGY"), "exact failed strategy cannot be resubmitted under new prose");
}

{
  const noAction = await evaluate(intent({ decision: "NO_ACTION", diagnosis: "The admitted evidence is insufficient.",
    uncertainties: ["The required caller contract is unavailable."], counterexamples: [], changes: [] }));
  check(noAction.decision === "NO_ACTION" && noAction.hypothesis === null && !noAction.omegaAuthorityGranted,
    "valid NO_ACTION preserves epistemic honesty without creating an executable hypothesis");
  const absent = await evaluate(intent({ changes: [] }));
  check(has(absent, "SEMANTIC_REPAIR_ABSENT"), "PROPOSE_EDIT without a semantic change is rejected");
}

{
  const invalidJson = await evaluate("```json\n{}\n```");
  check(invalidJson.reason === "nyx_cognition_output_not_strict_json" && has(invalidJson, "UNEXPECTED_STRUCTURE"),
    "markdown-wrapped output fails strict JSON parsing with a diagnostic");
  const unavailable = await cognition(async () => new Response(JSON.stringify({ error: "unavailable" }), { status: 503 })).proposeRepair(request());
  check(unavailable.decision === "COGNITION_ERROR" && unavailable.reason === "nvidia_provider_http_503" && unavailable.hypothesis === null,
    "provider failure remains distinct from model contract failure");
  let rejected = "";
  try { NyxNemotronEngineeringCognition.create({ cognitionId: "NYX", provider: provider(async () => new Response("{}"), "openai/gpt-oss-20b"),
    maxPromptBytes: 100, maxOutputTokens: 10 }); } catch (error) { rejected = error instanceof Error ? error.message : "unknown"; }
  check(rejected === "nyx_primary_substrate_must_be_nemotron_3_ultra", "Νύξ rejects a non-Nemotron primary substrate");
}

check(NYX_NEMOTRON_ENGINEERING_COGNITION_STATUS.cognitionIdentity === "NYX_PRIMARY_COGNITION"
  && !NYX_NEMOTRON_ENGINEERING_COGNITION_STATUS.externalAgentOrController,
  "Nemotron remains Νύξ cognition rather than an additional controller");
check(!NYX_NEMOTRON_ENGINEERING_COGNITION_STATUS.grantsOmegaAuthority
  && !NYX_NEMOTRON_ENGINEERING_COGNITION_STATUS.productionEligible,
  "contract repair does not increase Omega or production authority");

console.log(`Omega R3-D NYX Nemotron cognition tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) { console.error("FAILURES:"); for (const failure of failures) console.error(`  - ${failure}`); process.exit(1); }

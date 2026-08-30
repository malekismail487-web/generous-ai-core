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
    allowedVerificationToolIds: ["TYPECHECK", "TEST"], maxChanges: 2, maxPatchBytes: 4_096,
    maxDiagnosisCharacters: 1_000, observedAtEpochMs: NOW, ...overrides };
}
function intent(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ decision: "PROPOSE_EDIT", diagnosis: "The implementation adds an unintended constant offset.",
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
  check(hypothesis?.applyAuthorized === false && !result.omegaAuthorityGranted && !result.evidence.authorityGranted,
    "Νύξ semantic intent cannot authorize Omega action");
  check(result.evidence.modelRequestDigest !== null && result.evidence.modelResponseDigest !== null
    && result.evidence.modelStatusCode === 200 && result.evidence.modelUsage.totalTokens === 520,
    "cognition preserves sanitized E3 model evidence and usage");
  const messages = body.messages as Array<{ role: string; content: string }>;
  check(messages[0].content.includes("You are Νύξ engineering cognition")
    && messages[1].content.includes("Omega derives freshness hashes and execution metadata"),
    "prompt states the Νύξ/Omega semantic-authority boundary");
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
  const extra = await evaluate(intent({ commentary: "execute this" }));
  check(has(extra, "UNEXPECTED_STRUCTURE"), "extra unexpected model field is rejected");
}

{
  const noAction = await evaluate(intent({ decision: "NO_ACTION", diagnosis: "The admitted evidence is insufficient.", changes: [] }));
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

import { createHash } from "node:crypto";
import { NvidiaNimProvider, type NvidiaNimTransport } from "../src/lib/codelab/model/nvidiaNimProvider";
import type { EngineeringObservation } from "../src/lib/codelab/observation/r3EngineeringObservation";
import {
  NYX_NEMOTRON_ENGINEERING_COGNITION_STATUS,
  NyxNemotronEngineeringCognition,
  type NyxRepairCognitionRequest,
} from "../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(value: unknown, label: string): void {
  if (value) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}
const assert = check;
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
function request(overrides: Partial<NyxRepairCognitionRequest> = {}): NyxRepairCognitionRequest {
  return { schemaVersion: 1, cognitionRequestId: "NYX-REPAIR-REQUEST-1",
    objective: "Restore correct addition behavior while preserving the exported function contract.", observation: observation(),
    files: [{ relativePath: "src/math.ts", content: source, contentSha256: hash(source) }],
    allowedVerificationToolIds: ["TYPECHECK", "TEST"], maxChanges: 2, maxPatchBytes: 4_096,
    maxDiagnosisCharacters: 1_000, observedAtEpochMs: NOW, ...overrides };
}

function response(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ diagnosis: "The candidate adds an unintended constant offset.", assumptions: ["The test defines intended addition semantics."],
    changes: [{ kind: "MODIFY", relativePath: "src/math.ts", expectedBaseHash: hash(source),
      replacementContent: "export const add = (a: number, b: number) => a + b;\n" }],
    verificationToolIds: ["TYPECHECK", "TEST"], confidence: 0.97, ...overrides });
}

{
  let body: Record<string, unknown> = {};
  const nyx = cognition(async (_input, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ message: { content: response() }, finish_reason: "stop" }],
      usage: { prompt_tokens: 400, completion_tokens: 120, total_tokens: 520 } }), { status: 200 });
  });
  const result = await nyx.proposeRepair(request()); const hypothesis = result.hypothesis;
  check(result.decision === "PROPOSED" && hypothesis?.changes.length === 1, "Νύξ Nemotron cognition converts failure evidence into a bounded repair hypothesis");
  check(hypothesis?.changes[0].relativePath === "src/math.ts" && hypothesis.changes[0].expectedBaseHash === hash(source)
    && hypothesis.changes[0].replacementContentHash === hash(hypothesis.changes[0].replacementContent), "repair change binds authorized file, inspected base hash, and replacement hash");
  check(hypothesis?.verificationToolIds.join(",") === "TYPECHECK,TEST" && hypothesis.confidence === 0.97, "hypothesis preserves authorized verification plan and model confidence");
  check(hypothesis?.applyAuthorized === false && result.omegaAuthorityGranted === false && result.evidence.authorityGranted === false, "Νύξ cognition proposes but cannot authorize Omega action");
  check(result.evidence.sourceObservationId === "R3C-OBSERVATION-CANDIDATE"
    && result.evidence.sourceExecutionEvidenceId === "R3B-EVIDENCE-CANDIDATE" && result.evidence.modelEvidenceId.startsWith("NVIDIA-NIM-"), "cognition evidence connects observation, execution, and model provenance");
  check(result.evidence.cognitiveSubstrate === "NVIDIA_NEMOTRON_3_ULTRA" && result.evidence.model === "nvidia/nemotron-3-ultra", "evidence identifies Nemotron 3 Ultra as Νύξ's cognitive substrate");
  check(result.evidence.modelRequestDigest !== null && result.evidence.modelResponseDigest !== null
    && result.evidence.modelUsage.totalTokens === 520, "cognition preserves sanitized model request, response, and resource evidence");
  const messages = body.messages as Array<{ role: string; content: string }>;
  check(messages[0].content.includes("You are Νύξ engineering cognition") && messages[1].content.includes("Omega alone authorizes"), "prompt preserves Νύξ identity and independent Omega authority boundary");
  check(messages[1].content.includes("Restore correct addition behavior"), "typed cognition prompt carries the explicit engineering objective");
  check(!JSON.stringify(result.evidence).includes(source) && result.evidence.proposalDigest === hypothesis?.proposalDigest, "evidence stores digests rather than repository content while binding the proposal");
}

{
  let calls = 0;
  const nyx = cognition(async () => { calls += 1; return new Response("{}"); });
  const passObservation = await nyx.proposeRepair(request({ observation: observation("TEST_PASS") }));
  check(passObservation.decision === "REJECTED" && passObservation.reason.includes("failure_observation_required") && calls === 0,
    "passing observation cannot trigger repair cognition or provider use");
  const badHash = await nyx.proposeRepair(request({ files: [{ relativePath: "src/math.ts", content: source, contentSha256: "0".repeat(64) }] }));
  check(badHash.decision === "REJECTED" && badHash.reason.includes("file_context_invalid") && calls === 0,
    "unproven repository file context is rejected before cognition");
  const missingObjective = await nyx.proposeRepair(request({ objective: "" }));
  check(missingObjective.decision === "REJECTED" && missingObjective.reason.includes("request_malformed") && calls === 0,
    "missing task objective is rejected before cognition");
}

{
  const invalidJson = await cognition(async () => new Response(JSON.stringify({ choices: [{ message: { content: "```json\n{}\n```" } }] }), { status: 200 }))
    .proposeRepair(request());
  check(invalidJson.decision === "COGNITION_ERROR" && invalidJson.reason === "nyx_cognition_output_not_strict_json", "markdown-wrapped or non-JSON cognition output fails closed");
  const invalidSchema = await cognition(async () => new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 }))
    .proposeRepair(request());
  check(invalidSchema.decision === "COGNITION_ERROR" && invalidSchema.reason === "nyx_cognition_output_schema_invalid", "incomplete repair schema fails closed");
}

{
  const traversal = await cognition(async () => new Response(JSON.stringify({ choices: [{ message: { content: response({ changes: [{ kind: "MODIFY",
    relativePath: "../escape.ts", expectedBaseHash: hash(source), replacementContent: "escape" }] }) } }] }), { status: 200 }))
    .proposeRepair(request());
  check(traversal.decision === "COGNITION_ERROR" && traversal.reason === "nyx_cognition_change_invalid", "model-proposed path traversal is rejected");
  const hallucinated = await cognition(async () => new Response(JSON.stringify({ choices: [{ message: { content: response({ changes: [{ kind: "MODIFY",
    relativePath: "src/unknown.ts", expectedBaseHash: hash(source), replacementContent: "unknown" }] }) } }] }), { status: 200 }))
    .proposeRepair(request());
  check(hallucinated.decision === "COGNITION_ERROR" && hallucinated.reason === "nyx_cognition_change_outside_authorized_context", "model cannot modify a file absent from authorized context");
  const stale = await cognition(async () => new Response(JSON.stringify({ choices: [{ message: { content: response({ changes: [{ kind: "MODIFY",
    relativePath: "src/math.ts", expectedBaseHash: "0".repeat(64), replacementContent: "stale" }] }) } }] }), { status: 200 }))
    .proposeRepair(request());
  check(stale.decision === "COGNITION_ERROR" && stale.reason === "nyx_cognition_change_base_hash_mismatch", "model cannot replace content against a stale or invented base hash");
}

{
  const unauthorizedTool = await cognition(async () => new Response(JSON.stringify({ choices: [{ message: { content: response({
    verificationToolIds: ["SHELL"] }) } }] }), { status: 200 })).proposeRepair(request());
  check(unauthorizedTool.decision === "COGNITION_ERROR" && unauthorizedTool.reason === "nyx_cognition_verification_tool_not_authorized", "model cannot invent verification or shell authority");
  const tooLarge = await cognition(async () => new Response(JSON.stringify({ choices: [{ message: { content: response({ changes: [{ kind: "MODIFY",
    relativePath: "src/math.ts", expectedBaseHash: hash(source), replacementContent: "x".repeat(200) }] }) } }] }), { status: 200 }))
    .proposeRepair(request({ maxPatchBytes: 100 }));
  check(tooLarge.decision === "COGNITION_ERROR" && tooLarge.reason === "nyx_cognition_patch_byte_limit_exceeded", "model repair cannot exceed patch byte budget");
}

{
  const unavailable = await cognition(async () => new Response(JSON.stringify({ error: "unavailable" }), { status: 503 })).proposeRepair(request());
  check(unavailable.decision === "COGNITION_ERROR" && unavailable.reason === "nvidia_provider_http_503" && unavailable.hypothesis === null,
    "provider failure remains cognition error and cannot yield an actionable hypothesis");
  let rejected = "";
  try { NyxNemotronEngineeringCognition.create({ cognitionId: "NYX", provider: provider(async () => new Response("{}"), "openai/gpt-oss-20b"),
    maxPromptBytes: 100, maxOutputTokens: 10 }); } catch (error) { rejected = error instanceof Error ? error.message : "unknown"; }
  check(rejected === "nyx_primary_substrate_must_be_nemotron_3_ultra", "Νύξ engineering cognition rejects a non-Nemotron primary substrate");
}

assert(NYX_NEMOTRON_ENGINEERING_COGNITION_STATUS.cognitionIdentity === "NYX_PRIMARY_COGNITION"
  && NYX_NEMOTRON_ENGINEERING_COGNITION_STATUS.externalAgentOrController === false, "Nemotron reasoning is represented as Νύξ cognition, not an extra agent/controller");
assert(NYX_NEMOTRON_ENGINEERING_COGNITION_STATUS.grantsOmegaAuthority === false
  && !NYX_NEMOTRON_ENGINEERING_COGNITION_STATUS.productionEligible, "cognitive capability does not weaken Omega authority enforcement");

console.log(`Omega R3-D NYX Nemotron cognition tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) { console.error("FAILURES:"); for (const failure of failures) console.error(`  - ${failure}`); process.exit(1); }

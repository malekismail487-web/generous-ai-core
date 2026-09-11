import { createHash } from "node:crypto";
import { NvidiaNimProvider, type NvidiaNimTransport } from "../src/lib/codelab/model/nvidiaNimProvider";
import type { EngineeringObservation } from "../src/lib/codelab/observation/r3EngineeringObservation";
import {
  NYX_NEMOTRON_ENGINEERING_COGNITION_STATUS,
  NYX_DEFAULT_SOURCE_QUALITY_CONSTRAINTS,
  NYX_NVIDIA_REPAIR_INTENT_JSON_SCHEMA,
  NYX_REPAIR_INTENT_JSON_SCHEMA,
  buildNyxRepairIntentContract,
  NyxNemotronEngineeringCognition,
  type NyxRepairCognitionRequest,
  type NyxRepairCognitionResult,
  type NyxSchemaDiagnosticCategory,
  type NyxSourceRepresentation,
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
function cognition(transport: NvidiaNimTransport, sourceRepresentation: NyxSourceRepresentation = "TEXT") {
  return NyxNemotronEngineeringCognition.create({ cognitionId: "NYX-PRIMARY-COGNITION", provider: provider(transport),
    maxPromptBytes: 50_000, maxOutputTokens: 1_024, sourceRepresentation });
}

const source = "export const add = (a: number, b: number) => a + b + 1;\n";
const repaired = "export const add = (a: number, b: number) => a + b;\n";
function request(overrides: Partial<NyxRepairCognitionRequest> = {}): NyxRepairCognitionRequest {
  return { schemaVersion: 1, cognitionRequestId: "NYX-REPAIR-REQUEST-1",
    objective: "Restore correct addition behavior while preserving the exported function contract.", observation: observation(),
    files: [{ relativePath: "src/math.ts", content: source, contentSha256: hash(source) }],
    allowedMutationPaths: ["src/math.ts"],
    availableEvidence: [], priorHypotheses: [], priorCognitionFailures: [], candidateQualityFeedback: null,
    sourceQualityConstraints: NYX_DEFAULT_SOURCE_QUALITY_CONSTRAINTS,
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

{
  const lines = ["export function add(a: number, b: number) {", "  return a + b;", "}", "", "// café 🙂 ", ""];
  for (const lineEnding of ["LF", "CRLF"] as const) {
    const expectedSource = lines.join(lineEnding === "LF" ? "\n" : "\r\n");
    let seenPrompt: Record<string, unknown> = {};
    let seenSchema: Record<string, unknown> = {};
    const nyx = cognition(async (input, init) => {
      const body = JSON.parse(String(init?.body));
      seenPrompt = JSON.parse(body.messages[1].content);
      seenSchema = body.response_format.json_schema.schema;
      return transportFor(intent({ changes: [{ target: "src/math.ts", replacement: { lines, lineEnding } }] }))(input, init);
    }, "LINES");
    const result = await nyx.proposeRepair(request());
    check(result.decision === "PROPOSED" && result.hypothesis?.changes[0].replacementContent === expectedSource
      && result.hypothesis.changes[0].replacementContentHash === hash(expectedSource),
    `typed source reconstruction preserves ${lineEnding}, empty lines, trailing newline, spaces and Unicode exactly`);
    check(result.evidence.sourceRepresentation === "LINES" && nyx.profile().sourceRepresentation === "LINES"
      && !result.omegaAuthorityGranted && !result.hypothesis?.applyAuthorized, "source representation is attested without granting authority");
    const schema = seenSchema as { properties: { changes: { items: { properties: { replacement: {
      type: string; required: string[]; properties: { lines: { items: { type: string; description: string } }; lineEnding: { enum: string[] } }
    } } } } } };
    const wire = schema.properties.changes.items.properties.replacement;
    check(wire.type === "object" && wire.required.join() === "lines,lineEnding" && wire.properties.lines.items.type === "string"
      && wire.properties.lineEnding.enum.join() === "LF,CRLF" && wire.properties.lines.items.description.includes("120"),
    "provider sees a closed line-based source shape and descriptive bound, not an unsupported enforcement guarantee");
    const example = seenPrompt.minimalExample as { changes: { replacement: { lines: string[]; lineEnding: string } }[] };
    check(example.changes[0].replacement.lines.at(-1) === "" && example.changes[0].replacement.lineEnding === "LF",
      "prompt example uses selected representation and explicit trailing newline convention");
  }
  const invalid: unknown[] = [
    repaired, null, [], { lines }, { lineEnding: "LF" }, { lines, lineEnding: "CR" },
    { lines: [], lineEnding: "LF" }, { lines: [1], lineEnding: "LF" },
    { lines: ["a\nb"], lineEnding: "LF" }, { lines: ["a\rb"], lineEnding: "LF" },
    { lines: ["a\u2028b"], lineEnding: "LF" }, { lines: ["a\u2029b"], lineEnding: "LF" },
    { lines, lineEnding: "LF", unauthorized: "NO_SOURCE_ECHO" },
    { lines: [""], lineEnding: "LF" }, { lines: Array(4097).fill(""), lineEnding: "LF" },
  ];
  for (const replacement of invalid) {
    const result = await cognition(transportFor(intent({ changes: [{ target: "src/math.ts", replacement }] })), "LINES")
      .proposeRepair(request());
    check(result.decision === "COGNITION_ERROR" && result.hypothesis === null
      && !JSON.stringify(result).includes("NO_SOURCE_ECHO"), "malformed/mixed/oversized line representation fails closed without echoed data");
  }
  const overlong = await cognition(transportFor(intent({ changes: [{ target: "src/math.ts",
    replacement: { lines: [repaired.trimEnd(), "//" + "x".repeat(120)], lineEnding: "LF" } }] })), "LINES").proposeRepair(request());
  check(overlong.decision === "COGNITION_ERROR" && overlong.schemaDiagnostics.some((item) =>
    item.sourceMeasurement?.lines[0].line === 2 && item.sourceMeasurement.lines[0].length === 122),
  "existing measured readability gate rejects overlong structured lines without wrapping them");
  const byteBound = await cognition(transportFor(intent({ changes: [{ target: "src/math.ts",
    replacement: { lines: [repaired.trimEnd(), "// café 🙂"], lineEnding: "CRLF" } }] })), "LINES")
    .proposeRepair(request({ maxPatchBytes: 55 }));
  check(byteBound.decision === "COGNITION_ERROR" && byteBound.schemaDiagnostics.some((item) => item.observed === "patch_bound_exceeded"),
    "UTF8 byte cap includes Unicode and selected line separators before materialization");
  const unsafe = await cognition(transportFor(intent({ changes: [{ target: "src/math.ts", replacement: {
    lines: ["import { execSync } from 'node:child_process';", "export const add = execSync;"], lineEnding: "LF" } }] })), "LINES")
    .proposeRepair(request());
  check(unsafe.decision === "COGNITION_ERROR" && has(unsafe, "UNKNOWN_CAPABILITY"),
    "line encoding cannot bypass existing forbidden execution detection");
  const sameAsCurrent = await cognition(transportFor(intent({ changes: [{ target: "src/math.ts",
    replacement: { lines: source.split("\n"), lineEnding: "LF" } }] })), "LINES").proposeRepair(request());
  check(has(sameAsCurrent, "REPEATED_FALSIFIED_STRATEGY") && sameAsCurrent.hypothesis === null,
    "structured encoding cannot disguise an unchanged source as a semantic repair");
  const outside = await cognition(transportFor(intent({ changes: [{ target: "../outside.ts",
    replacement: { lines, lineEnding: "LF" } }] })), "LINES").proposeRepair(request());
  check(has(outside, "INVALID_TARGET_REFERENCE") && outside.hypothesis === null,
    "structured replacement cannot grant a traversal target authority");
  const oldMode = await evaluate(intent({ changes: [{ target: "src/math.ts", replacement: { lines, lineEnding: "LF" } }] }));
  check(has(oldMode, "INVALID_FIELD_TYPE"), "TEXT mode does not silently negotiate a model-selected representation");
  const config = { cognitionId: "NYX-ENCODING-OWNERSHIP", provider: provider(transportFor(intent())),
    maxPromptBytes: 50_000, maxOutputTokens: 1024, sourceRepresentation: "LINES" as NyxSourceRepresentation };
  const owned = NyxNemotronEngineeringCognition.create(config);
  config.sourceRepresentation = "TEXT";
  check(owned.profile().sourceRepresentation === "LINES", "trusted source representation is snapshotted at construction");
  for (const suffix of ["// tab\tretained", "const t = `first\nsecond`;", "const q = '\\\\n';", "// Ω café 🙂", "", "\n\n"]) {
    const expected = repaired + suffix;
    const text = await evaluate(intent({ changes: [{ target: "src/math.ts", replacement: expected }] }));
    const structured = await cognition(transportFor(intent({ changes: [{ target: "src/math.ts",
      replacement: { lines: expected.split("\n"), lineEnding: "LF" } }] })), "LINES").proposeRepair(request());
    check(structured.decision === text.decision && JSON.stringify(structured.hypothesis?.changes) === JSON.stringify(text.hypothesis?.changes),
      "source encoding changes neither exact patch content nor existing source admission for equivalent representations");
  }
}

{
  const rejectedSource = repaired + "//" + "x".repeat(120) + "\r\n" + "//" + "🙂".repeat(65);
  const rejected = await evaluate(intent({ changes: [{ target: "src/math.ts", replacement: rejectedSource }] }));
  const finding = rejected.schemaDiagnostics.find((item) => item.observed === "excessive_line_length");
  const measured = finding?.sourceMeasurement;
  check(rejected.decision === "COGNITION_ERROR" && rejected.hypothesis === null,
    "overlong source remains rejected without a mutation hypothesis");
  check(measured?.replacementSha256 === hash(rejectedSource) && measured?.lineLengthUnit === "UTF16_CODE_UNITS"
    && measured?.totalViolations === 2 && measured?.maximumObservedLength === 132
    && measured?.maxLineLength === 120 && measured?.omittedViolations === 0
    && JSON.stringify(measured?.lines) === JSON.stringify([{ line: 2, length: 122 }, { line: 3, length: 132 }]),
  "rejection measures exact prior-source identity, CRLF locations and unchanged UTF16 line lengths");
  check(!JSON.stringify(rejected).includes(rejectedSource) && !JSON.stringify(rejected).includes("🙂")
    && !JSON.stringify(rejected).includes("x".repeat(120)), "measurement feedback never echoes source fragments");
  const manyLines = await evaluate(intent({ changes: [{ target: "src/math.ts",
    replacement: repaired + Array.from({ length: 12 }, (_, index) => "//" + "x".repeat(121 + index)).join("\n") }] }));
  const sample = manyLines.schemaDiagnostics.find((item) => item.sourceMeasurement)?.sourceMeasurement;
  check(sample?.lines.length === 8 && sample?.totalViolations === 12 && sample?.omittedViolations === 4
    && sample?.maximumObservedLength === 134, "feedback samples bounded locations without hiding total defect count");
  const boundary = await evaluate(intent({ changes: [{ target: "src/math.ts", replacement: repaired + "//" + "x".repeat(118) }] }));
  check(boundary.decision === "PROPOSED", "unchanged 120-character boundary remains inclusive");
  let retryPrompt: Record<string, unknown> = {};
  let retryCalls = 0;
  const retry = cognition(async (input, init) => {
    retryCalls += 1;
    retryPrompt = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
    return transportFor(intent())(input, init);
  });
  const history = { failureId: rejected.evidence.evidenceId, cognitionRequestId: "PRIOR-REJECTED",
    reason: "SCHEMA_INVALID" as const, modelResponseDigest: rejected.evidence.modelResponseDigest,
    diagnostics: rejected.schemaDiagnostics };
  const corrected = await retry.proposeRepair(request({ priorCognitionFailures: [history] }));
  check(corrected.decision === "PROPOSED" && retryCalls === 1 && measured !== undefined
    && JSON.stringify(retryPrompt.requiredCorrections).includes(hash(rejectedSource)),
  "exact bounded measurement survives existing failure-history to correction-prompt round trip");
  if (measured && finding) {
    for (const corrupt of [
      { ...measured, replacementSha256: "not-a-hash" },
      { ...measured, lines: [{ line: 0, length: 122 }] },
      { ...measured, omittedViolations: 10 },
      { ...measured, lines: [{ line: 2, length: 119 }] },
      { ...measured, lines: [{ line: 2, length: 122, source: "DO_NOT_ECHO" }] },
      { ...measured, source: "DO_NOT_ECHO" },
    ]) {
      const before = retryCalls;
      const result = await retry.proposeRepair(request({ priorCognitionFailures: [{ ...history,
        diagnostics: [{ ...finding, sourceMeasurement: corrupt }] }] }));
      check(result.decision === "REJECTED" && retryCalls === before && !JSON.stringify(result).includes("DO_NOT_ECHO"),
        "malformed or source-bearing measurement fails closed before provider invocation");
    }
  }
}

{
  const full = JSON.parse(intent()) as Record<string, unknown>;
  const contract = buildNyxRepairIntentContract(request());
  const compact = Object.fromEntries(contract.requiredFields.PROPOSE_EDIT.map((field) => [field, full[field]]));
  const result = await evaluate(JSON.stringify(compact));
  check(result.decision === "PROPOSED" && result.hypothesis?.confidence === null
    && result.hypothesis.failureInterpretation === null && result.hypothesis.changes[0].replacementContent === repaired,
  "decision-specific edit requires causal evidence but does not manufacture confidence or prior-failure interpretation");
  for (const field of contract.requiredFields.PROPOSE_EDIT) {
    const missing = { ...compact }; delete missing[field];
    const rejected = await evaluate(JSON.stringify(missing));
    check(rejected.decision === "COGNITION_ERROR" && rejected.hypothesis === null,
      `compact edit cannot omit its required ${field} field`);
  }
  const noAction = await evaluate(JSON.stringify({ decision: "NO_ACTION", diagnosis: "The external policy is unavailable.",
    uncertainties: ["The required policy value is not observable."] }));
  check(noAction.decision === "NO_ACTION" && noAction.hypothesis === null,
    "minimal no-action result requires an epistemic reason without inventing a repair plan");
  const availableEvidence = [{ evidenceRef: "AVAILABLE:policy", kind: "FILE" as const,
    relativePath: "src/policy.ts", description: "Authoritative policy constants" }];
  const evidence = await evaluate(JSON.stringify({ decision: "REQUEST_EVIDENCE", diagnosis: "Read the policy before editing.",
    uncertainties: ["Which policy constant applies?"], requestedEvidenceRefs: ["AVAILABLE:policy"] }), { availableEvidence });
  check(evidence.decision === "REQUEST_EVIDENCE" && evidence.evidenceRequest?.causalHypothesis === null
    && evidence.evidenceRequest.requestedEvidenceRefs[0] === "AVAILABLE:policy" && !evidence.omegaAuthorityGranted,
  "minimal evidence request preserves exact admitted choice without fabricating a causal theory");
  for (const decision of ["__proto__", "constructor", "toString"]) {
    const rejected = await evaluate(JSON.stringify({ decision, diagnosis: "invalid decision" }));
    check(rejected.decision === "COGNITION_ERROR" && has(rejected, "INVALID_ENUM_VALUE"),
      `prototype-like decision ${decision} fails closed without crashing contract lookup`);
  }
  const unknownKey = "SENSITIVE_KEY_SHOULD_NOT_BE_ECHOED";
  const rejected = await evaluate(intent({ [unknownKey]: "SENSITIVE_VALUE_SHOULD_NOT_BE_ECHOED" }));
  check(rejected.decision === "COGNITION_ERROR" && !JSON.stringify(rejected).includes(unknownKey)
    && !JSON.stringify(rejected).includes("SENSITIVE_VALUE_SHOULD_NOT_BE_ECHOED"),
  "unknown output keys and values cannot leak through rejection diagnostics");
}

{
  const scoped = request({ maxCounterexamples: 1, maxChanges: 1, maxDiagnosisCharacters: 100 });
  const contract = buildNyxRepairIntentContract(scoped);
  const properties = contract.schema.properties as Record<string, { maxItems?: number; maxLength?: number }>;
  check(properties.counterexamples.maxItems === 1 && properties.changes.maxItems === 1
    && properties.diagnosis.maxLength === 100 && contract.bounds.counterexamples === 1,
  "one request-bound contract supplies schema and validator bounds without the five-versus-three mismatch");
  const excessive = await evaluate(intent({ counterexamples: ["zero", "negative"] }), { maxCounterexamples: 1 });
  check(excessive.decision === "COGNITION_ERROR" && excessive.schemaDiagnostics.some((item) =>
    item.path === "$.counterexamples" && item.observed === "array_length_2" && item.expected.includes("at most 1")),
  "bound rejection preserves the precise safe constraint and observed count for correction");
  let prompt: Record<string, unknown> = {};
  let providerSchema: Record<string, unknown> = {};
  const nyx = cognition(async (input, init) => {
    const body = JSON.parse(String(init?.body));
    prompt = JSON.parse(body.messages[1].content);
    providerSchema = body.response_format.json_schema.schema;
    return transportFor(intent())(input, init);
  });
  await nyx.proposeRepair(request({ files: [
    { relativePath: "src/read-only.ts", content: "export const policy = 1;", contentSha256: hash("export const policy = 1;") },
    ...request().files,
  ] }));
  const example = prompt.minimalExample as { changes: { target: string }[] };
  const fields = providerSchema.properties as Record<string, { enum?: string[]; items?: { enum?: string[]; properties?: Record<string, { enum?: string[] }> } }>;
  check(example.changes[0].target === "src/math.ts"
    && fields.changes.items?.properties?.target.enum?.join() === "src/math.ts",
  "prompt example and provider target choices never select the first read-only context file");
  check(!fields.decision.enum?.includes("REQUEST_EVIDENCE") && prompt.evidenceRequestExample === undefined
    && fields.evidenceRefs.items?.enum?.includes("FILE:src/math.ts"),
  "provider and prompt expose only currently meaningful decisions and exact evidence identities");
}
function has(result: NyxRepairCognitionResult, category: NyxSchemaDiagnosticCategory): boolean {
  return result.schemaDiagnostics.some((item) => item.category === category);
}

function schemaKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(schemaKeys);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, item]) => [key, ...schemaKeys(item)]);
}

{
  const fullKeys = new Set(schemaKeys(NYX_REPAIR_INTENT_JSON_SCHEMA));
  const providerKeys = new Set(schemaKeys(NYX_NVIDIA_REPAIR_INTENT_JSON_SCHEMA));
  const locallyEnforcedOnly = ["minimum", "maximum", "minLength", "maxLength", "maxItems", "uniqueItems"];
  check(locallyEnforcedOnly.every((key) => fullKeys.has(key) && !providerKeys.has(key)),
    "provider schema omits portability-sensitive bounds while local semantic validation retains them");
  const providerRoot = NYX_NVIDIA_REPAIR_INTENT_JSON_SCHEMA as {
    required?: unknown; additionalProperties?: unknown; properties?: Record<string, unknown>;
  };
  check(Array.isArray(providerRoot.required) && providerRoot.additionalProperties === false
    && providerRoot.properties?.decision !== undefined && providerRoot.properties?.changes !== undefined,
  "provider-compatible schema preserves the closed semantic-intent structure and required action fields");
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
    && result.evidence.modelStatusCode === 200 && result.evidence.modelUsage.totalTokens === 520
    && result.evidence.modelFinishReason === "stop",
    "cognition preserves sanitized E3 model evidence and usage");
  const messages = body.messages as Array<{ role: string; content: string }>;
  check(messages[0].content.includes("You are Νύξ engineering cognition")
    && messages[1].content.includes("Omega derives freshness hashes and execution metadata")
    && messages[1].content.includes("counterexamples") && messages[1].content.includes("hypothesisHistory"),
    "prompt states the Νύξ/Omega boundary and compact engineering-reasoning discipline");
  const format = body.response_format as { type?: string; json_schema?: { name?: string; strict?: boolean } };
  check(format.type === "json_schema" && format.json_schema?.name === "nyx_repair_intent" && format.json_schema.strict === true,
    "provider receives the strict typed semantic-intent schema");
  const template = body.chat_template_kwargs as { enable_thinking?: boolean; force_nonempty_content?: boolean };
  check(template.enable_thinking === false && template.force_nonempty_content === true,
    "constrained cognition disables free-form reasoning and requires non-empty provider content");
  check(!JSON.stringify(result.evidence).includes(source) && result.evidence.proposalDigest === hypothesis?.proposalDigest,
    "evidence stores digests rather than repository content while binding the proposal");
}

{
  let prompt = "";
  const nyx = cognition(async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
    prompt = body.messages[1].content;
    return transportFor(intent())(_input, init);
  });
  const result = await nyx.proposeRepair(request({ priorCognitionFailures: [{ failureId: "NYX-FAILURE-1",
    cognitionRequestId: "NYX-REPAIR-REQUEST-0", reason: "SCHEMA_INVALID", modelResponseDigest: "a".repeat(64),
    diagnostics: [{ category: "MISSING_REQUIRED_FIELD", path: "$.expectedResult",
      expected: "required field", observed: "missing" }] }] }));
  check(result.decision === "PROPOSED" && prompt.includes("cognitionFailureHistory")
    && prompt.includes("MISSING_REQUIRED_FIELD") && prompt.includes("$.expectedResult"),
  "sanitized prior contract diagnostics are returned to Νύξ for bounded correction");
}

{
  let calls = 0;
  const nyx = cognition(async () => { calls += 1; return new Response("{}"); });
  const passing = await nyx.proposeRepair(request({ observation: observation("TEST_PASS") }));
  check(passing.decision === "REJECTED" && calls === 0, "passing observation cannot trigger repair cognition");
  const stale = await nyx.proposeRepair(request({ files: [{ relativePath: "src/math.ts", content: source, contentSha256: "0".repeat(64) }] }));
  check(stale.decision === "REJECTED" && has(stale, "STALE_TARGET_REFERENCE") && calls === 0,
    "stale admitted target evidence is rejected before provider invocation");
  const malformedHistory = await nyx.proposeRepair(request({ priorCognitionFailures: [{ failureId: "DUPLICATE",
    cognitionRequestId: "OLD", reason: "SCHEMA_INVALID", modelResponseDigest: "bad",
    diagnostics: [] }] }));
  check(malformedHistory.decision === "REJECTED" && calls === 0,
    "malformed cognition-failure history fails closed before provider invocation");
  const excessiveChanges = await nyx.proposeRepair(request({ maxChanges: 9 }));
  const excessiveDiagnosis = await nyx.proposeRepair(request({ maxDiagnosisCharacters: 2_001 }));
  check(excessiveChanges.decision === "REJECTED" && excessiveChanges.reason.includes("nyx_cognition_policy_invalid")
    && excessiveDiagnosis.decision === "REJECTED" && excessiveDiagnosis.reason.includes("nyx_cognition_policy_invalid")
    && calls === 0,
  "request bounds cannot exceed the frozen provider schema before cognition runs");
}

{
  const first = await evaluate(intent());
  const prior = first.hypothesis!;
  const qualityEvidenceId = "CANDIDATE-ADMISSION-E3-QUALITY-1";
  const passingObservation = Object.freeze({ ...observation("TEST_PASS"), applicationId: "APPLICATION-QUALITY-1",
    proposalDigest: prior.proposalDigest, candidateEvidenceId: "EXECUTION-E3-QUALITY-1" });
  const priorHypotheses = [{ hypothesisId: prior.hypothesisId, parentHypothesisId: null,
    causalHypothesis: prior.causalHypothesis, expectedResult: prior.expectedResult, strategyDigest: prior.strategyDigest,
    disposition: "PARTIALLY_SUPPORTED" as const, verificationEvidenceRefs: [qualityEvidenceId] }];
  const feedback = { assessmentId: "QUALITY-ASSESSMENT-1", evidenceId: qualityEvidenceId,
    hypothesisId: prior.hypothesisId, proposalDigest: prior.proposalDigest, applicationId: "APPLICATION-QUALITY-1",
    findings: [{ dimension: "READABILITY", code: "EXCESSIVE_LINE_LENGTH", paths: ["src/math.ts"] }],
    hiddenEvidenceUsed: false as const, authorityGranted: false as const };
  const validRevision = await evaluate(intent({ failureInterpretation: "Visible behavior passed but the candidate failed static quality admission." }), {
    observation: passingObservation, priorHypotheses, candidateQualityFeedback: feedback,
  });
  check(validRevision.decision === "PROPOSED" && validRevision.hypothesis?.parentHypothesisId === prior.hypothesisId,
    "quality-driven revision requires a passing candidate with bound proposal, application, and E3 admission evidence");
  const citedQuality = await evaluate(intent({ evidenceRefs: [qualityEvidenceId] }), {
    observation: passingObservation, priorHypotheses, candidateQualityFeedback: feedback,
  });
  check(citedQuality.decision === "PROPOSED" && citedQuality.hypothesis?.evidenceRefs.includes(qualityEvidenceId),
    "a verified public quality observation can be cited as causal evidence without exposing hidden acceptance");
  const missingRevision = JSON.parse(intent()); delete missingRevision.failureInterpretation;
  const unexplained = await evaluate(JSON.stringify(missingRevision), {
    observation: passingObservation, priorHypotheses, candidateQualityFeedback: feedback,
  });
  check(unexplained.decision === "COGNITION_ERROR" && unexplained.schemaDiagnostics.some((item) =>
    item.category === "MISSING_REQUIRED_FIELD" && item.path === "$.failureInterpretation"),
  "a revised hypothesis still must explain the preceding falsification or quality rejection");

  let calls = 0;
  const rejecting = cognition(async () => { calls += 1; return transportFor(intent())("", {}); });
  const wrongProposal = await rejecting.proposeRepair(request({ observation: passingObservation, priorHypotheses,
    candidateQualityFeedback: { ...feedback, proposalDigest: "e".repeat(64) } }));
  const wrongApplication = await rejecting.proposeRepair(request({ observation: passingObservation, priorHypotheses,
    candidateQualityFeedback: { ...feedback, applicationId: "APPLICATION-UNBOUND" } }));
  const unreferencedEvidence = await rejecting.proposeRepair(request({ observation: passingObservation, priorHypotheses,
    candidateQualityFeedback: { ...feedback, evidenceId: "CANDIDATE-ADMISSION-E3-UNREFERENCED" } }));
  const failureObservationWithFeedback = observation("TEST_FAIL");
  const feedbackOnFailure = await rejecting.proposeRepair(request({ observation: failureObservationWithFeedback, priorHypotheses,
    candidateQualityFeedback: { ...feedback, proposalDigest: failureObservationWithFeedback.proposalDigest,
      applicationId: failureObservationWithFeedback.applicationId } }));
  check([wrongProposal, wrongApplication, unreferencedEvidence, feedbackOnFailure].every((result) => result.decision === "REJECTED"
    && result.reason.includes("nyx_cognition_quality_feedback_invalid")) && calls === 0,
  "forged, unbound, unreferenced, or failure-state quality feedback is inert before provider invocation");
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
  const emptyRepair = await evaluate(intent({ changes: [{ target: "src/math.ts", replacement: "" }] }));
  check(has(emptyRepair, "SOURCE_QUALITY_INVALID") && emptyRepair.hypothesis === null,
    "empty replacement cannot bypass the complete-source schema through a permissive test transport");
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
  const truncated = await cognition(async () => new Response(JSON.stringify({
    choices: [{ message: { content: intent() }, finish_reason: "length" }],
  }), { status: 200 })).proposeRepair(request());
  check(truncated.decision === "COGNITION_ERROR" && truncated.reason === "nyx_cognition_output_truncated"
    && truncated.evidence.modelFinishReason === "length" && truncated.hypothesis === null,
  "length-terminated model output is attributable but never admitted as an executable hypothesis");
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

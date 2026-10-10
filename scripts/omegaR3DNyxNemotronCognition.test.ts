import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import Ajv from "ajv";
import { nyxDecisionRequiredProviderSchema, nyxBoundedDecisionRequiredProviderSchema,
  nyxInformativeProviderStringSchema, nyxLengthBoundedDecisionRequiredProviderSchema } from "../src/lib/codelab/cognition/nyxDecisionRequiredSchema";
import { measuredQualityRepairGuidance, originalStateQualityBudget, measureBindingUses,
  behaviorPreservingQualityGuidance } from "../src/lib/codelab/cognition/nyxMeasuredQualityGuidance";
import { proposeNyxLocalRefactors, nyxLocalRefactorGuidance } from "../src/lib/codelab/cognition/nyxLocalRefactorProposals";
import { measureEngineeringStructure, assessEngineeringQuality } from "../src/lib/codelab/assurance/engineeringQualityOracle";
import { OMEGA_PUBLIC_STATIC_CANDIDATE_POLICY_V2 } from "../src/lib/codelab/assurance/candidateEngineeringAdmission";
import { NvidiaNimProvider, type NvidiaNimTransport } from "../src/lib/codelab/model/nvidiaNimProvider";
import type { EngineeringObservation } from "../src/lib/codelab/observation/r3EngineeringObservation";
import {
  NYX_NEMOTRON_ENGINEERING_COGNITION_STATUS,
  NYX_DEFAULT_SOURCE_QUALITY_CONSTRAINTS,
  NYX_NVIDIA_REPAIR_INTENT_JSON_SCHEMA,
  NYX_REPAIR_INTENT_JSON_SCHEMA,
  NYX_SEMANTIC_REPAIR_CONTRACT_VERSION,
  buildNyxRepairIntentContract,
  NyxNemotronEngineeringCognition,
  type NyxRepairCognitionRequest,
  type NyxRepairCognitionResult,
  type NyxSchemaDiagnosticCategory,
  type NyxSourceRepresentation,
  type NyxCognitionExperimentVariant,
  type NyxRepairFeedbackPolicy,
} from "../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";
import { validateNyxSourceSyntax,
  type NyxRepairIntentCompilationMode } from "../src/lib/codelab/cognition/nyxRepairIntentCompiler";

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
function cognition(transport: NvidiaNimTransport, sourceRepresentation: NyxSourceRepresentation = "TEXT",
  experimentVariant?: NyxCognitionExperimentVariant, intentCompilationMode?: NyxRepairIntentCompilationMode,
  repairFeedbackPolicy?: NyxRepairFeedbackPolicy) {
  return NyxNemotronEngineeringCognition.create({ cognitionId: "NYX-PRIMARY-COGNITION", provider: provider(transport),
    maxPromptBytes: 50_000, maxOutputTokens: 1_024, sourceRepresentation, experimentVariant,
    intentCompilationMode, repairFeedbackPolicy });
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
  let payload: Record<string,unknown>={};
  const local=NyxNemotronEngineeringCognition.create({cognitionId:"LOCAL-DELIVERY-TEST",maxPromptBytes:50000,maxOutputTokens:1024,
    structuredOutputMode:"STRICT_LOCAL",provider:provider(async(url,init)=>{
      payload=JSON.parse(String(init?.body));return transportFor(intent())(url,init);
    })});
  const result=await local.proposeRepair(request());
  check(result.decision==="PROPOSED"&&!Object.hasOwn(payload,"response_format")&&!result.omegaAuthorityGranted,
    "existing strict-local delivery reaches unchanged cognition validation without hosted grammar or new authority");
  const invalid=NyxNemotronEngineeringCognition.create({cognitionId:"LOCAL-INVALID-TEST",maxPromptBytes:50000,maxOutputTokens:1024,
    structuredOutputMode:"STRICT_LOCAL",provider:provider(transportFor(intent({changes:[{target:"../escape.ts",replacement:repaired}]})))});
  check((await invalid.proposeRepair(request())).decision==="COGNITION_ERROR",
    "strict-local transport cannot bypass target confinement");
  const malformed=NyxNemotronEngineeringCognition.create({cognitionId:"LOCAL-SYNTAX-TEST",maxPromptBytes:50000,maxOutputTokens:1024,
    structuredOutputMode:"STRICT_LOCAL",provider:provider(transportFor(intent({changes:[{target:"src/math.ts",replacement:"export const add = ( ;"}]})))});
  check((await malformed.proposeRepair(request())).schemaDiagnostics.some(d=>d.category==="SOURCE_QUALITY_INVALID"),
    "strict-local transport cannot bypass source parser or ordinary admission");
  const unknown=NyxNemotronEngineeringCognition.create({cognitionId:"LOCAL-SCHEMA-TEST",maxPromptBytes:50000,maxOutputTokens:1024,
    structuredOutputMode:"STRICT_LOCAL",provider:provider(transportFor(intent({shell:"echo not authorized"})))});
  check((await unknown.proposeRepair(request())).decision==="COGNITION_ERROR",
    "strict-local transport cannot admit model-invented executable fields");
  let rejected=false;
  try {NyxNemotronEngineeringCognition.create({cognitionId:"MODE-INVALID",provider:provider(transportFor(intent())),
    maxPromptBytes:50000,maxOutputTokens:1024,structuredOutputMode:"UNRESTRICTED" as "STRICT_LOCAL"});}
  catch {rejected=true;}
  check(rejected,"unknown delivery modes fail closed before invocation");
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
    check((wire.properties.lines as { maxItems?: number }).maxItems === 4096,
      "hosted source-array limit is explicit and retains the unchanged local 4096-line bound");
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
  const minified = "export function add(a:number,b:number){if(!Number.isFinite(a)||!Number.isFinite(b)){throw new TypeError('finite numbers required');}return a+b;}\n";
  const compiled = await cognition(transportFor(intent({
    counterexamples: ["zero", "negative", "fractional", "non-finite", "large finite"],
    changes: [{ target: "src/math.ts", replacement: { lines: minified.split("\n"), lineEnding: "LF" } }],
  })), "LINES", undefined, "SAFE_CANONICALIZATION").proposeRepair(request());
  const compilation = compiled.evidence.intentCompilation;
  check(compiled.decision === "PROPOSED" && compiled.hypothesis !== null
    && compiled.hypothesis.changes[0].replacementContent.includes("export function add")
    && compiled.hypothesis.changes[0].replacementContent.split("\n").every((line) => line.length <= 120),
  "opt-in compiler turns parseable minified source into a validator-admissible multiline candidate");
  check(compilation.outcome === "COMPILED" && compilation.operations.length === 2
    && compilation.operations.some((item) => item.kind === "CANONICALIZE_PARSEABLE_SOURCE")
    && compilation.operations.some((item) => item.kind === "BOUND_ADVISORY_COUNTEREXAMPLES"
      && item.beforeCount === 5 && item.afterCount === 3)
    && compilation.inputDigest !== compilation.outputDigest
    && compilation.semanticPreservationClaim === "PARSEABLE_SOURCE_FORMAT_REQUIRES_EXECUTION_VERIFICATION"
    && compilation.formatterIdentity === "prettier/3.9.6"
    && !compilation.executableAuthorityGranted && compiled.hypothesis?.counterexamples.length === 3,
  "canonicalization is hash-attributed, bounds only advisory metadata and grants no execution authority");
  const repeatedCompilation = await cognition(transportFor(intent({
    counterexamples: ["zero", "negative", "fractional", "non-finite", "large finite"],
    changes: [{ target: "src/math.ts", replacement: { lines: minified.split("\n"), lineEnding: "LF" } }],
  })), "LINES", undefined, "SAFE_CANONICALIZATION").proposeRepair(request());
  check(repeatedCompilation.evidence.intentCompilation.outputDigest === compilation.outputDigest
    && repeatedCompilation.hypothesis?.proposalDigest === compiled.hypothesis?.proposalDigest,
  "intent compilation is deterministic for identical model output and request constraints");
  const textCompiled = await cognition(transportFor(intent({ changes: [{ target: "src/math.ts",
    replacement: minified }] })), "TEXT", undefined, "SAFE_CANONICALIZATION").proposeRepair(request());
  check(textCompiled.decision === "PROPOSED" && textCompiled.hypothesis !== null
    && textCompiled.hypothesis.changes[0].replacementContent.split("\n").every((line) => line.length <= 120)
    && textCompiled.evidence.intentCompilation.operations.some((item) => item.kind === "CANONICALIZE_PARSEABLE_SOURCE")
    && textCompiled.evidence.intentCompilation.semanticPreservationClaim
      === "PARSEABLE_SOURCE_FORMAT_REQUIRES_EXECUTION_VERIFICATION"
    && !textCompiled.omegaAuthorityGranted && !textCompiled.hypothesis.applyAuthorized,
  "opt-in TEXT canonicalization admits parseable minified source without execution authority");
  const textStrict = await cognition(transportFor(intent({ changes: [{ target: "src/math.ts",
    replacement: minified }] })), "TEXT", undefined, "STRICT").proposeRepair(request());
  check(textStrict.decision === "COGNITION_ERROR" && textStrict.hypothesis === null
    && has(textStrict, "SOURCE_QUALITY_INVALID"),
  "STRICT TEXT mode retains its original measured readability rejection");
  const invalidTextSource = "export function add(a:number,b:number){return a+;}\n";
  const invalidText = await cognition(transportFor(intent({ changes: [{ target: "src/math.ts",
    replacement: invalidTextSource }] })), "TEXT", undefined, "SAFE_CANONICALIZATION").proposeRepair(request());
  check(invalidText.decision === "COGNITION_ERROR" && invalidText.hypothesis === null
    && invalidText.schemaDiagnostics.some((item) => item.category === "SOURCE_QUALITY_INVALID"
      && item.observed.startsWith("syntax_error_")),
  "TEXT canonicalization cannot launder malformed TypeScript through syntax admission");
  const invalidMinifiedText = await cognition(transportFor(intent({ changes: [{ target: "src/math.ts",
    replacement: invalidTextSource + " ".repeat(121) }] })), "TEXT", undefined, "SAFE_CANONICALIZATION")
    .proposeRepair(request());
  check(invalidMinifiedText.decision === "COGNITION_ERROR" && invalidMinifiedText.hypothesis === null,
  "overlong malformed TEXT also fails closed before patch proposal");
  const unbreakableText = `export const token = "${"x".repeat(160)}";\n`;
  const unbreakableTextResult = await cognition(transportFor(intent({ changes: [{ target: "src/math.ts",
    replacement: unbreakableText }] })), "TEXT", undefined, "SAFE_CANONICALIZATION").proposeRepair(request());
  check(unbreakableTextResult.decision === "COGNITION_ERROR" && unbreakableTextResult.hypothesis === null
    && has(unbreakableTextResult, "SOURCE_QUALITY_INVALID"),
  "TEXT formatter cannot launder an intrinsically overlong literal through readability admission");
  const complexExpression = "export const describe=(items:Array<{id:string;priority:number;enabled:boolean}>)=>items.filter((item)=>item.enabled&&item.priority>0).map((item)=>({identifier:item.id,normalizedPriority:Math.min(100,Math.max(0,item.priority)),description:`${item.id}:${item.priority}`}));\n";
  const compiledComplex = await cognition(transportFor(intent({ changes: [{ target: "src/math.ts", replacement: {
    lines: complexExpression.split("\n"), lineEnding: "LF" } }] })), "LINES", undefined, "SAFE_CANONICALIZATION")
    .proposeRepair(request());
  check(compiledComplex.decision === "PROPOSED"
    && compiledComplex.hypothesis!.changes[0].replacementContent.split("\n").every((line) => line.length <= 120)
    && compiledComplex.hypothesis!.changes[0].replacementContent.includes("normalizedPriority"),
  "compiler formats nested expressions that the TypeScript printer previously left overlong");
  const unbreakableLiteral = `export const token = "${"x".repeat(160)}";\n`;
  const stillOverlong = await cognition(transportFor(intent({ changes: [{ target: "src/math.ts", replacement: {
    lines: unbreakableLiteral.split("\n"), lineEnding: "LF" } }] })), "LINES", undefined, "SAFE_CANONICALIZATION")
    .proposeRepair(request());
  check(stillOverlong.decision === "COGNITION_ERROR" && stillOverlong.hypothesis === null
    && has(stillOverlong, "SOURCE_QUALITY_INVALID"),
  "formatter cannot launder an intrinsically overlong literal through source-quality admission");
  const invalidSyntax = "export function add(a:number,b:number){ return a + ; }\n";
  const locatedSyntax = await validateNyxSourceSyntax("src/value.mjs", "export const x = ;\n");
  check(!locatedSyntax.valid && locatedSyntax.line === 1 && locatedSyntax.column !== null,
    "TypeScript parse failures report a source location for bounded model correction");
  const rejectedSource = 'const marker = "private-not-for-logs"; /* private-comment */\nexport function add(a: number, b: number) { return a + ; }\n';
  const correctionPrompts: Record<string, unknown>[] = [];
  const correctionTransport: NvidiaNimTransport = async (input, init) => {
    correctionPrompts.push(JSON.parse((JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> })
      .messages[1].content) as Record<string, unknown>);
    const answer = correctionPrompts.length === 1
      ? intent({ changes: [{ target: "src/math.ts", replacement: rejectedSource }] }) : intent();
    return transportFor(answer)(input, init);
  };
  const feedbackCognition = cognition(correctionTransport, "TEXT", undefined, undefined,
    "TRANSIENT_REJECTED_SOURCE_WINDOW");
  const firstCorrection = await feedbackCognition.proposeRepair(request());
  const failureHistory = [{ failureId: firstCorrection.evidence.evidenceId,
    cognitionRequestId: "NYX-REPAIR-REQUEST-1", reason: "SCHEMA_INVALID" as const,
    modelResponseDigest: firstCorrection.evidence.modelResponseDigest,
    diagnostics: firstCorrection.schemaDiagnostics }];
  const corrected = await feedbackCognition.proposeRepair(request({ cognitionRequestId: "NYX-REPAIR-REQUEST-2",
    priorCognitionFailures: failureHistory }));
  const sourceFeedback = correctionPrompts[1].rejectedSourceFeedback as {
    target: string; line: number; sourceDigest: string; lines: Array<{ number: number; text: string }>;
  } | undefined;
  check(firstCorrection.decision === "COGNITION_ERROR" && corrected.decision === "PROPOSED"
    && !firstCorrection.evidence.rejectedSourceFeedbackPresented
    && corrected.evidence.rejectedSourceFeedbackPresented
    && sourceFeedback?.target === "src/math.ts" && sourceFeedback.line === 2
    && sourceFeedback.sourceDigest === hash(rejectedSource)
    && sourceFeedback.lines.some((item) => item.number === 2 && item.text.includes("return a + ;")),
  "opt-in feedback binds a small rejected-source window to the exact previous response and repair request");
  check(!JSON.stringify(firstCorrection).includes("private-not-for-logs")
    && !JSON.stringify(correctionPrompts[1]).includes("private-not-for-logs")
    && !JSON.stringify(correctionPrompts[1]).includes("private-comment")
    && !Object.hasOwn(correctionPrompts[0], "rejectedSourceFeedback"),
  "rejected source remains out of persisted cognition evidence and string literals are redacted before feedback");
  const controlPrompts: Record<string, unknown>[] = [];
  const controlCognition = cognition(async (input, init) => {
    controlPrompts.push(JSON.parse((JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> })
      .messages[1].content) as Record<string, unknown>);
    return transportFor(controlPrompts.length === 1
      ? intent({ changes: [{ target: "src/math.ts", replacement: rejectedSource }] }) : intent())(input, init);
  });
  const controlFirst = await controlCognition.proposeRepair(request());
  await controlCognition.proposeRepair(request({ cognitionRequestId: "NYX-REPAIR-REQUEST-2",
    priorCognitionFailures: [{ failureId: controlFirst.evidence.evidenceId,
      cognitionRequestId: "NYX-REPAIR-REQUEST-1", reason: "SCHEMA_INVALID",
      modelResponseDigest: controlFirst.evidence.modelResponseDigest,
      diagnostics: controlFirst.schemaDiagnostics }] }));
  check(!Object.hasOwn(controlPrompts[1], "rejectedSourceFeedback"),
    "established diagnostic-only control does not silently gain rejected-source replay");
  const isolatedPrompts: Record<string, unknown>[] = [];
  const isolatedCognition = cognition(async (input, init) => {
    isolatedPrompts.push(JSON.parse((JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> })
      .messages[1].content) as Record<string, unknown>);
    return transportFor(isolatedPrompts.length === 1
      ? intent({ changes: [{ target: "src/math.ts", replacement: rejectedSource }] }) : intent())(input, init);
  }, "TEXT", undefined, undefined, "TRANSIENT_REJECTED_SOURCE_WINDOW");
  const isolatedFirst = await isolatedCognition.proposeRepair(request());
  await isolatedCognition.proposeRepair(request({ cognitionRequestId: "NYX-OTHER-OBJECTIVE",
    objective: "Investigate a different bounded mathematical contract.",
    priorCognitionFailures: [{ failureId: isolatedFirst.evidence.evidenceId,
      cognitionRequestId: "NYX-REPAIR-REQUEST-1", reason: "SCHEMA_INVALID",
      modelResponseDigest: isolatedFirst.evidence.modelResponseDigest,
      diagnostics: isolatedFirst.schemaDiagnostics }] }));
  check(!Object.hasOwn(isolatedPrompts[1], "rejectedSourceFeedback"),
    "a changed objective cannot inherit process-local rejected source from another task");
  const refusedSyntax = await cognition(transportFor(intent({ changes: [{ target: "src/math.ts",
    replacement: { lines: [invalidSyntax.trimEnd() + " ".repeat(121)], lineEnding: "LF" } }] })),
  "LINES", undefined, "SAFE_CANONICALIZATION").proposeRepair(request());
  check(refusedSyntax.decision === "COGNITION_ERROR" && refusedSyntax.hypothesis === null
    && refusedSyntax.evidence.intentCompilation.outcome === "UNCHANGED",
  "compiler refuses to repair syntactically invalid source and strict admission still rejects it");
  const javascriptSource = "export const value = 1;\n";
  const runtimeInvalidJavascript = "export const value = 1 as number;\n";
  const rejectedRuntimeSyntax = await cognition(transportFor(intent({ changes: [{ target: "src/value.mjs", replacement: {
    lines: runtimeInvalidJavascript.split("\n"), lineEnding: "LF" } }] })), "LINES")
    .proposeRepair(request({ files: [{ relativePath: "src/value.mjs", content: javascriptSource,
      contentSha256: hash(javascriptSource) }], allowedMutationPaths: ["src/value.mjs"] }));
  check(rejectedRuntimeSyntax.decision === "COGNITION_ERROR" && rejectedRuntimeSyntax.hypothesis === null
    && rejectedRuntimeSyntax.schemaDiagnostics.some((item) => item.category === "SOURCE_QUALITY_INVALID"
      && item.observed === "syntax_error_line_1_column_23" && item.expected.includes("ECMASCRIPT_2022")
      && item.expected.includes("src/value.mjs") && item.expected.includes("TypeScript as/satisfies assertions")),
  "runtime JavaScript syntax is rejected before candidate mutation even when the TypeScript parser accepts it");
  let javascriptPrompt = "";
  const validJavascript = "export const value = 2;\n";
  await cognition(async (input, init) => {
    javascriptPrompt = (JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> }).messages[1].content;
    return transportFor(intent({ changes: [{ target: "src/value.mjs", replacement: validJavascript }] }))(input, init);
  }).proposeRepair(request({ files: [{ relativePath: "src/value.mjs", content: javascriptSource,
    contentSha256: hash(javascriptSource) }], allowedMutationPaths: ["src/value.mjs"] }));
  const parsedJavascriptPrompt = JSON.parse(javascriptPrompt) as { constraints: { sourceLanguageContracts: Array<{
    target: string; language: string; parser: string; moduleSystem: string; forbiddenSyntax: string[];
  }> } };
  const javascriptContract = parsedJavascriptPrompt.constraints.sourceLanguageContracts[0];
  check(javascriptContract.target === "src/value.mjs" && javascriptContract.language === "ECMASCRIPT_2022"
    && javascriptContract.parser === "babel" && javascriptContract.moduleSystem === "ES_MODULE"
    && javascriptContract.forbiddenSyntax.includes("TypeScript as/satisfies assertions"),
  "live repair prompt explicitly forbids TypeScript-only syntax in ECMAScript module targets");
  const compiledUnsafe = await cognition(transportFor(intent({ changes: [{ target: "src/math.ts", replacement: {
    lines: ["import{execSync}from'node:child_process';export const add=execSync;" + " ".repeat(121)], lineEnding: "LF" } }] })),
  "LINES", undefined, "SAFE_CANONICALIZATION").proposeRepair(request());
  check(compiledUnsafe.decision === "COGNITION_ERROR" && has(compiledUnsafe, "UNKNOWN_CAPABILITY")
    && compiledUnsafe.hypothesis === null, "canonical formatting cannot bypass forbidden execution admission");
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

{
  // Independent JSON Schema validation, using the lockfile-pinned existing ESLint dependency.
  // These synthetic development intents contain no ARC task content or oracle answers.
  const validator = new Ajv({ allErrors: true, strictKeywords: true });
  const scenarios = [
    { request: request(), value: JSON.parse(intent()) },
    { request: request(), value: { decision: "NO_ACTION", diagnosis: "Required external policy is unavailable.",
      uncertainties: ["The policy cannot be inferred from these files."] } },
    { request: request({availableEvidence: [{evidenceRef: "AVAILABLE:policy",kind: "FILE",relativePath: "src/policy.ts",
      description: "Authoritative policy constants"}]}), value: {decision: "REQUEST_EVIDENCE",diagnosis: "Read the policy first.",
      uncertainties: ["Which constant is authoritative?"],requestedEvidenceRefs: ["AVAILABLE:policy"]} },
  ];
  for (const scenario of scenarios) {
    const contract = buildNyxRepairIntentContract(scenario.request);
    const schema = nyxDecisionRequiredProviderSchema(contract.providerSchema, contract.allowedActions, contract.requiredFields);
    const legacy = validator.compile(contract.providerSchema);
    const aligned = validator.compile(schema);
    check(aligned(scenario.value), `${scenario.value.decision} valid development intent satisfies its generation branch`);
    const required = contract.requiredFields[scenario.value.decision as keyof typeof contract.requiredFields];
    for (const field of required) {
      const missing = {...scenario.value}; delete missing[field];
      check(!aligned(missing), `${scenario.value.decision} generation cannot omit required ${field}`);
      if (!["decision", "diagnosis"].includes(field))
        check(legacy(missing), `reproduce optional-wire/local-required mismatch for ${scenario.value.decision}.${field}`);
    }
    check(Object.isFrozen(schema) && Object.isFrozen(schema.anyOf) && schema.anyOf.every(Object.isFrozen),
      `${scenario.value.decision} host-derived generation branches are immutable`);
  }
  const contract = buildNyxRepairIntentContract(request({maxChanges: 1,maxCounterexamples: 1}));
  const aligned = validator.compile(nyxDecisionRequiredProviderSchema(contract.providerSchema, contract.allowedActions, contract.requiredFields));
  check(!aligned(JSON.parse(intent({evidenceRefs: ["FILE:src/unobserved.ts"]}))),
    "decision-complete grammar retains exact admitted evidence enumeration");
  check(!aligned(JSON.parse(intent({changes: [{target: "../escape.ts",replacement: repaired}]}))),
    "decision-complete grammar retains authorized target enumeration");
  check(!aligned(JSON.parse(intent({counterexamples: ["one", "two"]}))),
    "decision-complete grammar retains original hosted array bounds");
  check(!aligned(JSON.parse(intent({shell: "not an authorized action"}))),
    "decision-complete grammar retains closed object fields");
  let wire: Record<string, unknown> = {};
  const make = (content: string) => NyxNemotronEngineeringCognition.create({cognitionId: "DECISION-REQUIRED-DEVELOPMENT",
    provider: provider(async (url,init) => {wire=JSON.parse(String(init?.body));return transportFor(content)(url,init);}),
    maxPromptBytes: 50000,maxOutputTokens: 1024,providerIntentShape: "DECISION_REQUIRED_FIELDS"});
  const accepted = await make(intent()).proposeRepair(request());
  check(accepted.decision === "PROPOSED" && !accepted.omegaAuthorityGranted
    && Array.isArray((wire.response_format as any).json_schema.schema.anyOf),
    "shared cognition forwards explicit decision-complete grammar without execution authority");
  const missing = JSON.parse(intent()); delete missing.evidenceRefs;
  const rejected = await make(JSON.stringify(missing)).proposeRepair(request());
  check(rejected.decision === "COGNITION_ERROR" && has(rejected,"MISSING_REQUIRED_FIELD") && !rejected.hypothesis,
    "nonconforming provider still fails unchanged local validation; citations are never filled automatically");
  const empty = await make(intent({evidenceRefs: []})).proposeRepair(request());
  check(empty.decision === "COGNITION_ERROR" && has(empty,"SEMANTIC_REPAIR_INVALID"),
    "generation field presence is not a substitute for local evidence semantics");
  // Independent development reproduction of residual wire/parser differences.
  // This is negative evidence, not a fix or a benchmark-specific repair strategy.
  const fullLocalSchema = validator.compile(buildNyxRepairIntentContract(request()).schema);
  for (const scenario of [
    {label:"empty counterexample string",value:{counterexamples:[""]},fullSchemaAccepts:false},
    {label:"overlong counterexample string",value:{counterexamples:["x".repeat(501)]},fullSchemaAccepts:false},
    {label:"overlong causal prose",value:{causalHypothesis:"x".repeat(1001)},fullSchemaAccepts:false},
    {label:"whitespace-only counterexample",value:{counterexamples:["   "]},fullSchemaAccepts:true},
    {label:"empty required counterexample array",value:{counterexamples:[]},fullSchemaAccepts:true},
  ]) {
    const value = JSON.parse(intent(scenario.value));
    check(aligned(value), `reproduce decision-required portable grammar admitting ${scenario.label}`);
    check(Boolean(fullLocalSchema(value)) === scenario.fullSchemaAccepts,
      `${scenario.label} distinguishes excluded JSON bounds from additional semantic constraints`);
    const result = await make(JSON.stringify(value)).proposeRepair(request());
    check(result.decision === "COGNITION_ERROR" && result.hypothesis === null
      && has(result,"SEMANTIC_REPAIR_INVALID") && !result.omegaAuthorityGranted,
      `${scenario.label} still fails unchanged local validation without fabricated content or authority`);
  }
  const unsafe = await make(intent({changes: [{target: "src/math.ts",replacement: "export const add = ( ;"}]})).proposeRepair(request());
  check(unsafe.decision === "COGNITION_ERROR" && has(unsafe,"SOURCE_QUALITY_INVALID"),
    "decision-complete generation cannot bypass source syntax admission");
  for (const value of [null,"UNKNOWN",true,{},[]]) {
    let rejected = false;
    try { NyxNemotronEngineeringCognition.create({cognitionId:"INVALID-DECISION-POLICY",provider:provider(transportFor(intent())),
      maxPromptBytes:50000,maxOutputTokens:1024,providerIntentShape:value as never}); } catch { rejected=true; }
    check(rejected,"invalid generation policy rejected before inference");
  }
  for (const actions of [["__proto__"],["PROPOSE_EDIT","PROPOSE_EDIT"],[]]) {
    let rejected=false;
    try { nyxDecisionRequiredProviderSchema(contract.providerSchema,actions,contract.requiredFields); } catch { rejected=true; }
    check(rejected,"unknown, duplicated, or empty generation decisions fail closed");
  }
}

{
  const ajv = new Ajv({ allErrors: true, strictKeywords: true });
  const contract = buildNyxRepairIntentContract(request());
  const bounded = nyxBoundedDecisionRequiredProviderSchema(contract.providerSchema, contract.schema,
    contract.allowedActions, contract.requiredFields);
  const validate = ajv.compile(bounded);
  check(validate(JSON.parse(intent())), "bounded generation admits complete valid intent without invented values");
  // Independent backend/full-match simulation must not collapse prose to one character,
  // and cannot depend on minLength/maxLength siblings that a hosted compiler may ignore.
  for (const [minimum, maximum] of [[1,1],[1,64],[8,64],[1,256],[1,500],[1,1500]]) {
    const item=nyxInformativeProviderStringSchema({type:"string",minLength:minimum,maxLength:maximum});
    const patternOnly=ajv.compile({type:"string",pattern:item.pattern});
    for (const length of [0,minimum-1,minimum,maximum,maximum+1]) {
      check(patternOnly("x".repeat(length))===(length>=minimum&&length<=maximum),
        "pattern carries request-derived bounds even when sibling length keywords are ignored");
    }
    check(!patternOnly(" ".repeat(maximum)) && patternOnly("x"+" ".repeat(maximum-1)),
      "canonical informative prefix rejects whitespace-only prose without discarding internal whitespace");
  }
  const boundedProse=nyxInformativeProviderStringSchema({type:"string",minLength:1,maxLength:64});
  const multilineProse=ajv.compile({type:"string",pattern:boundedProse.pattern});
  check(multilineProse("Risk\nwith\tUnicode α😀") && !multilineProse("\nRisk"),
    "generation normal form permits multiline unicode content but starts informative prose immediately");
  for (const item of [{type:"string",minLength:0,maxLength:8},{type:"string",minLength:2,maxLength:1},
    {type:"string",minLength:1,maxLength:2001},{type:"string",minLength:1},
    {type:"number",minLength:1,maxLength:64}]) {
    let rejected=false;try {nyxInformativeProviderStringSchema(item);}catch {rejected=true;}
    check(rejected,"informative generation fails closed on malformed or unbounded host contracts");
  }
  const gaps = [
    {counterexamples:[""]}, {counterexamples:["x".repeat(501)]}, {causalHypothesis:"x".repeat(1001)},
    {counterexamples:["   "]}, {counterexamples:[]}, {evidenceRefs:[]}, {changes:[]},
    {diagnosis:"\t\n\u00a0\u2028"}, {uncertainties:["\u2003"]}, {assumptions:["\ufeff"]},
  ];
  for (const gap of gaps) check(!validate(JSON.parse(intent(gap))),
    "bounded grammar excludes independently reproduced empty, whitespace, oversized and semantically empty intent");
  const noAction = {decision:"NO_ACTION",diagnosis:"Policy unavailable.",uncertainties:["Missing authoritative policy."]};
  check(validate(noAction) && validate({...noAction,changes:[],requestedEvidenceRefs:[]}),
    "non-action remains minimal and does not invent mutation or evidence requests");
  for (const wrong of [{uncertainties:[]},{changes:[{target:"src/math.ts",replacement:repaired}]},
    {requestedEvidenceRefs:["OBJECTIVE"]}]) check(!validate({...noAction,...wrong}),
    "decision-specific generation excludes contradictory non-action fields");
  const withEvidence = buildNyxRepairIntentContract(request({availableEvidence:[{evidenceRef:"AVAILABLE:policy",
    kind:"FILE",relativePath:"src/policy.ts",description:"Authoritative constants"}]}));
  const evidenceSchema = ajv.compile(nyxBoundedDecisionRequiredProviderSchema(withEvidence.providerSchema,
    withEvidence.schema,withEvidence.allowedActions,withEvidence.requiredFields));
  const ask = {decision:"REQUEST_EVIDENCE",diagnosis:"Read policy.",uncertainties:["Which value applies?"],
    requestedEvidenceRefs:["AVAILABLE:policy"]};
  check(evidenceSchema(ask), "request branch remains bound to available evidence and stated uncertainty");
  check(!evidenceSchema({...ask,requestedEvidenceRefs:[]}) && !evidenceSchema({...ask,uncertainties:[]})
    && !evidenceSchema(noAction), "evidence request cannot omit semantic prerequisites or exit prematurely");
  const lineContract = buildNyxRepairIntentContract(request(),"LINES");
  const lineSchema = ajv.compile(nyxBoundedDecisionRequiredProviderSchema(lineContract.providerSchema,lineContract.schema,
    lineContract.allowedActions,lineContract.requiredFields));
  const multiline = "export const add = (a: number, b: number) => {\n\n  return a + b;\n};\n";
  const lines = JSON.parse(intent({changes:[{target:"src/math.ts",replacement:{lines:multiline.split("\n"),lineEnding:"LF"}}]}));
  check(lineSchema(lines), "prose constraints preserve indentation, interior blank source lines and final newline");
  check(!lineSchema(JSON.parse(intent({changes:[{target:"src/math.ts",replacement:{lines:[],lineEnding:"LF"}}]})))
    && !lineSchema(JSON.parse(intent({changes:[{target:"src/math.ts",replacement:{lines:["x".repeat(121)],lineEnding:"LF"}}]}))),
    "source lines retain their independent local length and population limits");
  let captured: any;
  const make = (content: string) => NyxNemotronEngineeringCognition.create({cognitionId:"BOUNDED-GENERATION-TEST",
    provider:provider(async(url,init)=>{captured=JSON.parse(String(init?.body));return transportFor(content)(url,init);}),
    maxPromptBytes:50000,maxOutputTokens:1024,providerIntentShape:"DECISION_REQUIRED_FIELDS_AND_BOUNDS"});
  const valid = await make(intent()).proposeRepair(request());
  check(valid.decision === "PROPOSED" && !valid.omegaAuthorityGranted
    && ajv.compile(captured.response_format.json_schema.schema)(JSON.parse(intent())),
    "opt-in shared cognition forwards bounded generation without execution authority");
  for (const gap of gaps) {
    const rejected = await make(intent(gap)).proposeRepair(request());
    check(rejected.decision === "COGNITION_ERROR" && !rejected.hypothesis && !rejected.omegaAuthorityGranted,
      "nonconforming provider remains rejected by unchanged local semantics despite generation grammar");
  }
  // JSON Schema length counts code points; AJV 6 compiles patterns without `u`,
  // so its quantifiers count UTF-16 units. Verify both dialects explicitly; a
  // conforming Unicode grammar still cannot replace the local UTF-16 guard.
  const astral = JSON.parse(intent({counterexamples:["😀".repeat(251)]}));
  const itemPattern=(bounded.anyOf[0].properties.counterexamples.items as {pattern:string}).pattern;
  check(new RegExp(itemPattern,"u").test(astral.counterexamples[0]) && !validate(astral),
    "Unicode grammar, AJV 6 regex dialect and local UTF-16 lengths are distinguished");
  const astralRejected = await make(JSON.stringify(astral)).proposeRepair(request());
  check(astralRejected.decision === "COGNITION_ERROR" && has(astralRejected,"SEMANTIC_REPAIR_INVALID"),
    "unchanged local UTF-16 limit catches astral string beyond local bound");
  const syntax = await make(intent({changes:[{target:"src/math.ts",replacement:"export const add = ( ;"}]})).proposeRepair(request());
  check(syntax.decision === "COGNITION_ERROR" && has(syntax,"SOURCE_QUALITY_INVALID"),
    "bounded generation does not waive syntactic source admission");
  const unobserved = await make(intent({evidenceRefs:["FILE:unobserved.ts"]})).proposeRepair(request());
  check(unobserved.decision === "COGNITION_ERROR" && has(unobserved,"UNSUPPORTED_EVIDENCE_REFERENCE"),
    "bounded generation does not waive provenance enumeration");
  const scoped = buildNyxRepairIntentContract(request({maxDiagnosisCharacters:100,maxCounterexamples:1,maxChanges:1}));
  const scopedSchema = ajv.compile(nyxBoundedDecisionRequiredProviderSchema(scoped.providerSchema,scoped.schema,
    scoped.allowedActions,scoped.requiredFields));
  check(!scopedSchema(JSON.parse(intent({causalHypothesis:"x".repeat(101)})))
    && !scopedSchema(JSON.parse(intent({counterexamples:["one","two"]}))),
    "generation uses request-specific limits rather than frozen task constants");
  check(Object.isFrozen(bounded) && Object.isFrozen(bounded.anyOf[0].properties.counterexamples.items),
    "nested generation schema is immutable");
  for (const local of [null, {...contract.schema,type:"array"},
    {...contract.schema,properties:{...contract.schema.properties,diagnosis:{type:"string",minLength:1,maxLength:NaN}}},
    {...contract.schema,properties:{...contract.schema.properties,diagnosis:{type:"string",minLength:101,maxLength:100}}},
    {...contract.schema,properties:{...contract.schema.properties,counterexamples:{type:"array",maxItems:0,items:{type:"string"}}}},
    {...contract.schema,properties:{diagnosis:{type:"string"}}}]) {
    let rejected=false;
    try {nyxBoundedDecisionRequiredProviderSchema(contract.providerSchema,local as never,contract.allowedActions,contract.requiredFields);}
    catch {rejected=true;}
    check(rejected,"malformed or impossible host-derived bounded schema fails closed");
  }
  let conflicting=false;
  try {NyxNemotronEngineeringCognition.create({cognitionId:"CONFLICTING-GENERATION",provider:provider(transportFor(intent())),
    maxPromptBytes:50000,maxOutputTokens:1024,providerIntentShape:"DECISION_REQUIRED_FIELDS_AND_BOUNDS",preserveProviderArrayBounds:false});}
  catch {conflicting=true;}
  check(conflicting,"bounded generation rejects conflicting array ablation before inference");
}

{
  const contract = buildNyxRepairIntentContract(request(), "LINES");
  const lengths = nyxLengthBoundedDecisionRequiredProviderSchema(contract.providerSchema, contract.schema,
    contract.allowedActions, contract.requiredFields);
  const regex = nyxBoundedDecisionRequiredProviderSchema(contract.providerSchema, contract.schema,
    contract.allowedActions, contract.requiredFields);
  const withoutPatterns = JSON.parse(JSON.stringify(regex, (key,value) => key === "pattern" ? undefined : value));
  check(JSON.stringify(lengths) === JSON.stringify(withoutPatterns) && !schemaKeys(lengths).includes("pattern"),
    "explicit length grammar differs only by prose regex, not scope, fields or bounds");
  check(Object.isFrozen(lengths) && Object.isFrozen(lengths.anyOf[0].properties.changes),
    "length-only grammar remains recursively immutable");
  for (const content of [intent(), intent({counterexamples:["   "]}), intent({counterexamples:["one","one"]}),
    intent({causalHypothesis:"x".repeat(1001)}), intent({evidenceRefs:["FILE:unobserved.ts"]}),
    intent({changes:[{target:"../escape.ts",replacement:repaired}]}),
    intent({changes:[{target:"src/math.ts",replacement:"export const add = ( ;"}]}), "```json\n{}\n```"] ) {
    const outcomes = [];
    for (const shape of ["DECISION_REQUIRED_FIELDS", "DECISION_REQUIRED_FIELDS_AND_LENGTHS"] as const) {
      let captured:any;
      const instance = NyxNemotronEngineeringCognition.create({cognitionId:"EXPLICIT-LENGTH-GRAMMAR",
        provider:provider(async(url,init)=>{captured=JSON.parse(String(init?.body));return transportFor(content)(url,init);}),
        maxPromptBytes:50000,maxOutputTokens:1024,providerIntentShape:shape});
      const result = await instance.proposeRepair(request());
      outcomes.push({decision:result.decision,reason:result.reason,categories:result.schemaDiagnostics.map(d=>d.category)});
      check(!result.omegaAuthorityGranted && !schemaKeys(captured.response_format.json_schema.schema).includes("pattern"),
        "regex-free generation cannot mint authority or silently add unsupported patterns");
    }
    check(JSON.stringify(outcomes[0])===JSON.stringify(outcomes[1]),
      "unchanged local acceptance rejects whitespace, duplicates, overflow, invalid evidence, targets, syntax and JSON identically");
  }
  let rejected=false;
  try { NyxNemotronEngineeringCognition.create({cognitionId:"CONFLICTING-LENGTH-GRAMMAR",
    provider:provider(transportFor(intent())),maxPromptBytes:50000,maxOutputTokens:1024,
    providerIntentShape:"DECISION_REQUIRED_FIELDS_AND_LENGTHS",preserveProviderArrayBounds:false}); } catch { rejected=true; }
  check(rejected,"length-only grammar rejects contradictory host configuration before inference");
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
  const locallyEnforcedOnly = ["minimum", "maximum", "minLength", "maxLength", "uniqueItems"];
  check(locallyEnforcedOnly.every((key) => fullKeys.has(key) && !providerKeys.has(key)),
    "provider schema omits portability-sensitive bounds while local semantic validation retains them");
  check(providerKeys.has("maxItems"), "E4-supported array upper bounds survive hosted serialization");
  const bounded = buildNyxRepairIntentContract(request({maxChanges: 1, maxCounterexamples: 2, maxPatchBytes: 64}), "LINES");
  const legacy = buildNyxRepairIntentContract(request({maxChanges: 1, maxCounterexamples: 2, maxPatchBytes: 64}), "LINES", false);
  const fields = bounded.providerSchema.properties as Record<string, any>;
  check(fields.changes.maxItems === 1 && fields.counterexamples.maxItems === 2
    && fields.requestedEvidenceRefs.maxItems === 0
    && fields.changes.items.properties.replacement.properties.lines.maxItems === 65,
    "hosted nested bounds derive from the exact request, including empty evidence and byte-constrained source");
  check(JSON.stringify(bounded.schema) === JSON.stringify(legacy.schema)
    && JSON.stringify(bounded.bounds) === JSON.stringify(legacy.bounds)
    && !schemaKeys(legacy.providerSchema).includes("maxItems") && !bounded.authorityGranted,
    "host-only legacy ablation changes only wire grammar, never local semantics, quality or authority");
  let invalidPolicyRejected = false;
  try { NyxNemotronEngineeringCognition.create({cognitionId: "INVALID-BOUNDS", provider: provider(transportFor(intent())),
    maxPromptBytes: 50000, maxOutputTokens: 1024, preserveProviderArrayBounds: "false" as never}); }
  catch { invalidPolicyRejected = true; }
  check(invalidPolicyRejected, "malformed hosted-array policy fails closed");
  const longSource = ["export function add(a: number, b: number) {", ...Array(38).fill(""), "  return a + b;", "}", ""];
  const longResult = await cognition(transportFor(intent({changes: [{target: "src/math.ts",
    replacement: {lines: longSource, lineEnding: "LF"}}]})), "LINES").proposeRepair(request());
  check(longResult.decision === "PROPOSED" && longResult.hypothesis?.changes[0].replacementContent === longSource.join("\n"),
    "source beyond 32 lines survives reconstruction and unchanged syntax/quality validation (test double, not cognition gain)");
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
  const prompt = JSON.parse(messages[1].content) as { constraints?: { sourceLanguageContracts?: Array<{
    target?: string; language?: string; parser?: string; moduleSystem?: string; forbiddenSyntax?: string[];
  }> }; admittedEvidence?: Array<{ target?: string; sourceLanguageContract?: { language?: string } }> };
  const sourceContract = prompt.constraints?.sourceLanguageContracts?.find((item) => item.target === "src/math.ts");
  check(sourceContract?.language === "TYPESCRIPT" && sourceContract.parser === "typescript"
    && prompt.admittedEvidence?.some((item) => item.target === "src/math.ts"
      && item.sourceLanguageContract?.language === "TYPESCRIPT"),
  "prompt binds every admitted source file to an explicit parser and language contract");
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
  let firstPrompt: Record<string, unknown> = {};
  await cognition(async (input, init) => {
    firstPrompt = JSON.parse((JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> })
      .messages[1].content) as Record<string, unknown>;
    return transportFor(intent())(input, init);
  }).proposeRepair(request());
  const limits = (firstPrompt.constraints as { publicStaticAdmission: Record<string, unknown> }).publicStaticAdmission;
  check(limits.policyId === "omega-public-static-candidate/2"
    && limits.assessedAgainst === "ORIGINAL_OBSERVED_REPOSITORY_STATE"
    && limits.maxCyclomaticComplexityPerChangedFile === 12 && limits.maxComplexityDelta === 8
    && (limits.tinySingleChangedFileRule as Record<string, unknown>).maxAddedDeclarations === 4
    && !Object.hasOwn(firstPrompt, "qualityRepairGoal"),
  "first attempt receives exact public static bounds without fabricated rejection feedback");
  let revisionPrompt: Record<string, unknown> = {};
  await cognition(async (input, init) => {
    revisionPrompt = JSON.parse((JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> })
      .messages[1].content) as Record<string, unknown>;
    return transportFor(intent())(input, init);
  }).proposeRepair(request({ observation: passingObservation, priorHypotheses,
    candidateQualityFeedback: { ...feedback, findings: [{ dimension: "UNNECESSARY_COMPLEXITY",
      code: "COMPLEXITY_DELTA", paths: ["src/math.ts"], measurement: { observed: 11, limit: 8 } }] } }));
  check((revisionPrompt.qualityRepairGoal as string).includes("Preserve passing behavior")
    && (revisionPrompt.qualityRepairGoal as string).includes("Copy borrowed data")
    && ((revisionPrompt.constraints as { publicStaticAdmission: { borrowedInputDiscipline: string } })
      .publicStaticAdmission.borrowedInputDiscipline).includes("imported or unknown helper returns")
    && (revisionPrompt.activeRepairDriver as { findings: Array<{ measurement: { observed: number; limit: number } }> })
      .findings[0].measurement.observed === 11
    && (revisionPrompt.activeRepairDriver as { findings: Array<{ measurement: { observed: number; limit: number } }> })
      .findings[0].measurement.limit === 8,
  "quality retry receives the bound rejection, numeric excess, and cumulative simplification objective");
  const crowded = "export function add(a, b) {\n  const first = a;\n  const second = b;\n  const third = first + second;\n  const fourth = third;\n  const fifth = fourth;\n  return fifth;\n}\n";
  const measuredRequest = request({ observation: passingObservation, priorHypotheses,
    files: [{relativePath:"src/math.ts",content:crowded,contentSha256:hash(crowded)}],
    candidateQualityFeedback:{...feedback,findings:[{dimension:"UNNECESSARY_COMPLEXITY",code:"DECLARATION_DELTA",
      paths:["src/math.ts"],measurement:{observed:5,limit:4}}]} });
  const guidance=measuredQualityRepairGuidance(measuredRequest)!;
  check(guidance.corrections[0].currentTotal===6&&guidance.corrections[0].originalTotal===1
    &&guidance.corrections[0].maximumCandidateTotal===5&&guidance.corrections[0].minimumReduction===1,
    "measured quality repair derives cumulative budget from original state rather than preceding repair");
  check(guidance.evidenceRef===qualityEvidenceId&&guidance.corrections[0].measurements[0].sourceDigest===hash(crowded)
    &&!guidance.hiddenEvidenceUsed&&!guidance.authorityGranted&&!JSON.stringify(guidance).includes(crowded),
    "quality guidance is bound to public evidence and current source digest without raw source or authority");
  const callbackSource="export function add(a, b) { const x = [a,b].map(v => v); for (const y of x) { if (y) return y; } return 0; }";
  check(measureEngineeringStructure("src/math.ts",callbackSource).declarations===3
    &&measureEngineeringStructure("src/math.ts",callbackSource).complexity===3,
    "shared detector counts callbacks but not parameters or loop-header bindings exactly");
  const quality=assessEngineeringQuality({assessmentId:"MEASURED-DEV",evaluatorVersion:"MEASURED-DEV",
    baselineFiles:{"src/math.ts":"export function add(a,b) { return a+b; }"},candidateFiles:{"src/math.ts":crowded},
    changedPaths:["src/math.ts"],functionalAcceptance:"PASS",regressionAcceptance:"PASS",
    policy:{...OMEGA_PUBLIC_STATIC_CANDIDATE_POLICY_V2,maxAddedDeclarations:4,allowedChangedPaths:["src/math.ts"],readonlyPaths:[]} });
  check(quality.dimensions.UNNECESSARY_COMPLEXITY.findings.includes("declaration_delta:5")
    &&quality.decision==="REJECTED","guidance exactly explains existing rejection without changing admission");
  for(const findings of [
    [{dimension:"X",code:"DECLARATION_DELTA",paths:["src/secret.ts"],measurement:{observed:5,limit:4}}],
    [{dimension:"X",code:"DECLARATION_DELTA",paths:["src/math.ts","src/math.ts"],measurement:{observed:5,limit:4}}],
    [{dimension:"X",code:"DECLARATION_DELTA",paths:["src/math.ts"],measurement:{observed:9,limit:4}}],
    [{dimension:"X",code:"DECLARATION_DELTA",paths:["src/math.ts"],measurement:{observed:5,limit:-1}}],
    [{dimension:"X",code:"MODEL_CONFIDENCE",paths:["src/math.ts"],measurement:{observed:5,limit:4}}],
  ])check(measuredQualityRepairGuidance({...measuredRequest,candidateQualityFeedback:{...feedback,findings}})===null,
    "unsupported, out-of-scope, duplicate, inconsistent or malformed measurement cannot fabricate a repair budget");
  check(measuredQualityRepairGuidance({...measuredRequest,files:[{relativePath:"src/math.ts",content:"export function {",contentSha256:hash("export function {")}]})===null,
    "unparseable source cannot acquire trustworthy structural repair guidance");
  const payloads:unknown[]=[];
  for(const enabled of [false,true]) {
    const instance=NyxNemotronEngineeringCognition.create({cognitionId:"GUIDANCE-TEST",provider:provider(async(url,init)=>{
      payloads.push(JSON.parse(String(init?.body)));return transportFor(intent())(url,init);}),
      maxPromptBytes:50000,maxOutputTokens:1024,...(enabled?{qualityRepairGuidance:"MEASURED_STRUCTURE" as const}:{})});
    await instance.proposeRepair(request());
    await instance.proposeRepair(measuredRequest);
  }
  check(JSON.stringify(payloads[0])===JSON.stringify(payloads[2]),"quality-guidance ablation leaves first-attempt provider payload identical");
  const getPrompt=(payload:unknown)=>JSON.parse((payload as {messages:{content:string}[]}).messages[1].content);
  const {measuredQualityRepair,...withoutGuidance}=getPrompt(payloads[3]);
  check(measuredQualityRepair.corrections[0].minimumReduction===1
    &&JSON.stringify(withoutGuidance)===JSON.stringify(getPrompt(payloads[1])),
    "opt-in quality repair adds only measured public explanation; evidence, constraints and base repair prompt unchanged");
  check(measuredQualityRepairGuidance(request())===null,"no quality rejection creates no fictitious repair measurement");
  let unsupportedGuide=false;
  try{NyxNemotronEngineeringCognition.create({cognitionId:"GUIDANCE-TEST",provider:provider(transportFor(intent())),
    maxPromptBytes:50000,maxOutputTokens:1024,qualityRepairGuidance:"AUTOMATIC_APPROVAL" as never});}catch{unsupportedGuide=true;}
  check(unsupportedGuide,"unknown host guidance mode rejected before inference");
  const sites=measuredQualityRepairGuidance(measuredRequest,true)!;
  const siteMeasurement=sites.corrections[0].measurements[0];
  check(siteMeasurement.declarationSitesComplete&&siteMeasurement.declarationSites?.length===6
    &&siteMeasurement.declarationSites.reduce((sum,site)=>sum+site.count,0)===siteMeasurement.declarations
    &&siteMeasurement.declarationSites[0].kind==="FunctionDeclaration"&&siteMeasurement.declarationSites[1].line===2,
    "development source contribution sites exactly reconstruct existing declaration count and source locations");
  check(sites.corrections[0].maximumCandidateTotal===guidance.corrections[0].maximumCandidateTotal
    &&sites.corrections[0].minimumReduction===guidance.corrections[0].minimumReduction&&!sites.authorityGranted,
    "declaration-site detail cannot relax existing cumulative budgets or grant authority");
  const callbackSites=measureEngineeringStructure("src/math.ts",callbackSource,true);
  check(callbackSites.declarationSites?.some(site=>site.kind==="ArrowFunction")
    &&callbackSites.declarationSites?.every(site=>site.kind!=="VariableDeclarationList")
    &&callbackSites.declarationSitesComplete,
    "nested callbacks exposed as counted sites without falsely counting loop bindings");
  const many=`export function add(a,b) {\n${Array.from({length:70},(_,index)=>`const value${index} = a;`).join("\n")}\nreturn a+b;\n}`;
  const boundedSites=measureEngineeringStructure("src/math.ts",many,true);
  check(boundedSites.declarations===71&&boundedSites.declarationSites?.length===48
    &&boundedSites.declarationSitesComplete===false,
    "large declaration inventory remains bounded and explicitly incomplete rather than silently claiming full coverage");
  const multi=measureEngineeringStructure("src/math.ts","export function add(a,b) {const x=a,y=b;return x+y;}",true);
  check(multi.declarationSites?.find(site=>site.kind==="VariableStatement")?.count===2
    &&multi.declarationSitesComplete,"multiple declarators contribute individually rather than only one per statement");
  let detailedPrompt:Record<string,unknown>={};
  const detailedCognition=NyxNemotronEngineeringCognition.create({cognitionId:"SITE-GUIDANCE-TEST",maxPromptBytes:50000,maxOutputTokens:1024,
    qualityRepairGuidance:"STRUCTURE_SITES",provider:provider(async(url,init)=>{
      detailedPrompt=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);return transportFor(intent())(url,init);})});
  await detailedCognition.proposeRepair(measuredRequest);
  const deliveredSites=(detailedPrompt.measuredQualityRepair as typeof sites).corrections[0].measurements[0].declarationSites;
  check(deliveredSites?.length===6&&(detailedPrompt.measuredQualityRepair as typeof sites).version==="nyx-measured-quality-repair/2"
    &&JSON.stringify(detailedPrompt.constraints)===JSON.stringify(getPrompt(payloads[3]).constraints),
    "bound public declaration sites reach actual cognition prompt with unchanged constraints and parser");
  const repairedGrammarPayloads: any[] = [];
  for (const enabled of [false, true]) {
    const instance = NyxNemotronEngineeringCognition.create({cognitionId:"REQUIRED-GRAMMAR-SITES-COMPOSITION",
      provider:provider(async(url,init)=>{repairedGrammarPayloads.push(JSON.parse(String(init?.body)));
        return transportFor(intent())(url,init);}), maxPromptBytes:50000, maxOutputTokens:1024,
      providerIntentShape:"DECISION_REQUIRED_FIELDS", ...(enabled?{qualityRepairGuidance:"STRUCTURE_SITES" as const}:{})});
    await instance.proposeRepair(request());
    await instance.proposeRepair(measuredRequest);
  }
  check(JSON.stringify(repairedGrammarPayloads[0])===JSON.stringify(repairedGrammarPayloads[2]),
    "required grammar plus source-site treatment keeps complete first-attempt wire payload identical");
  const {measuredQualityRepair:composedSites,...composedBase}=getPrompt(repairedGrammarPayloads[3]);
  check(composedSites.corrections[0].measurements[0].declarationSites.length===6
    &&JSON.stringify(composedBase)===JSON.stringify(getPrompt(repairedGrammarPayloads[1])),
    "required grammar composition changes only the bound post-rejection source-site explanation");
  check(repairedGrammarPayloads.every(p=>p.response_format.json_schema.schema.anyOf.length>1)
    &&JSON.stringify(repairedGrammarPayloads[1].response_format)===JSON.stringify(repairedGrammarPayloads[3].response_format),
    "both treatment arms retain identical decision-required provider grammar through repair");
  check(!composedSites.hiddenEvidenceUsed&&!composedSites.authorityGranted
    &&composedSites.corrections[0].maximumCandidateTotal===5,
    "composed treatment preserves public-only evidence, original-state quality budget and no authority grant");
  const originalSource = "export function add(a,b) { return a+b+1; }\n";
  const originalRequest = request({files:[{relativePath:"src/math.ts",content:originalSource,contentSha256:hash(originalSource)}]});
  const budget = originalStateQualityBudget(originalRequest)!;
  check(budget.originalMeasurement.declarations === 1 && budget.maximumCandidateTotals.declarations === 5
    && budget.maximumCandidateTotals.complexity === 9 && budget.maximumCandidateTotals.maxNesting === 4,
    "first-candidate totals derive exactly from original AST and existing absolute/delta limits");
  check(budget.originalSourceDigest === hash(originalSource) && budget.evidenceRef === "FILE:src/math.ts"
    && budget.tinySingleTarget && !budget.hiddenEvidenceUsed && !budget.authorityGranted
    && !JSON.stringify(budget).includes(originalSource),
    "budget is original-source-bound public explanation, not a solution or authority");
  check(Object.isFrozen(budget) && Object.isFrozen(budget.maximumCandidateTotals),
    "explanatory totals are immutable");
  const largerOriginal = "export function add(a,b) {\n  const offset = 1;\n  return a+b+offset;\n}\n";
  const largerBudget = originalStateQualityBudget(request({files:[{relativePath:"src/math.ts",content:largerOriginal,
    contentSha256:hash(largerOriginal)}]}))!;
  check(!largerBudget.tinySingleTarget && largerBudget.maximumCandidateTotals.declarations === 14,
    "non-tiny original uses existing general declaration delta rather than imposing a new rule");
  for (const invalid of [
    {...originalRequest, priorHypotheses},
    {...originalRequest, candidateQualityFeedback: feedback},
    {...originalRequest, allowedMutationPaths: []},
    {...originalRequest, allowedMutationPaths: ["src/math.ts", "src/other.ts"]},
    {...originalRequest, allowedMutationPaths: ["src/other.ts"]},
    {...originalRequest, files: []},
    {...originalRequest, files: [...originalRequest.files,...originalRequest.files]},
    {...originalRequest, files: [{...originalRequest.files[0],contentSha256:"0".repeat(64)}]},
    {...originalRequest, files: [{relativePath:"src/math.ts",content:"export function {",contentSha256:hash("export function {")}]},
  ]) check(originalStateQualityBudget(invalid) === null,
    "non-original, absent, ambiguous, stale or unparseable state cannot fabricate an original budget");
  const budgetPayloads: any[] = [];
  for (const enabled of [false, true]) {
    const instance = NyxNemotronEngineeringCognition.create({cognitionId:"ORIGINAL-BUDGET-ABLATION",
      provider:provider(async(url,init)=>{budgetPayloads.push(JSON.parse(String(init?.body)));
        return transportFor(intent())(url,init);}), maxPromptBytes:50000,maxOutputTokens:1024,
      providerIntentShape:"DECISION_REQUIRED_FIELDS_AND_LENGTHS", qualityRepairGuidance:"STRUCTURE_SITES",
      ...(enabled?{structuralBudgetGuidance:"PUBLIC_ORIGINAL_STATE" as const}:{})});
    await instance.proposeRepair(originalRequest);
    await instance.proposeRepair(measuredRequest);
  }
  const {originalStructuralBudget, ...budgetBase} = getPrompt(budgetPayloads[2]);
  check(JSON.stringify(budgetBase) === JSON.stringify(getPrompt(budgetPayloads[0]))
    && isDeepStrictEqual(originalStructuralBudget, budget),
    "first-candidate ablation changes only exact public original-state explanation");
  const withoutMessages = (payload:any) => {const {messages, ...rest}=payload; return rest;};
  check(JSON.stringify(withoutMessages(budgetPayloads[0])) === JSON.stringify(withoutMessages(budgetPayloads[2]))
    && budgetPayloads[0].messages[0].content === budgetPayloads[2].messages[0].content,
    "original budget changes no model, grammar, compute control or system message");
  check(JSON.stringify(budgetPayloads[1]) === JSON.stringify(budgetPayloads[3]),
    "post-rejection site-guidance wire payload remains identical, with no rebaselining on repaired files");
  let invalidBudgetMode = false, budgetCalls = 0;
  try {NyxNemotronEngineeringCognition.create({cognitionId:"INVALID-ORIGINAL-BUDGET",maxPromptBytes:50000,maxOutputTokens:1024,
    structuralBudgetGuidance:"WAIVE_QUALITY" as never,provider:provider(async()=>{budgetCalls++;return new Response();})});}
  catch {invalidBudgetMode = true;}
  check(invalidBudgetMode && budgetCalls === 0,"unknown structural-budget mode rejected before inference");
  const validRevision = await evaluate(intent({ failureInterpretation: "Visible behavior passed but the candidate failed static quality admission." }), {
    observation: passingObservation, priorHypotheses, candidateQualityFeedback: feedback,
  });
  const behavior = behaviorPreservingQualityGuidance(measuredRequest)!;
  check(behavior.sources[0].bindings.length === 5 && behavior.sources[0].complete
    && behavior.sources[0].sourceDigest === hash(crowded) && !behavior.authorityGranted && !behavior.hiddenEvidenceUsed,
    "quality-only lexical guidance bound to currently passing source and public evidence");
  check(behavior.evidenceScope.includes("NOT_FULL_CORRECTNESS") && behavior.limitations.includes("No purity")
    && behavior.instruction.includes("zero reads does not prove safe deletion"),
    "passing public execution and lexical counts are never a semantic equivalence certificate");
  for (const invalid of [
    {...measuredRequest, observation: observation("TEST_FAIL")},
    {...measuredRequest, priorHypotheses: []},
    {...measuredRequest, priorHypotheses: [{...priorHypotheses[0],disposition:"FALSIFIED" as const}]},
    {...measuredRequest, candidateQualityFeedback:{...measuredRequest.candidateQualityFeedback!,applicationId:"OTHER"}},
    {...measuredRequest, files:[{...measuredRequest.files[0],contentSha256:"0".repeat(64)}]},
    {...measuredRequest, files:[...measuredRequest.files,...measuredRequest.files]},
  ]) check(behaviorPreservingQualityGuidance(invalid) === null,
    "stale, unbound, falsified, failed or ambiguous source cannot assert a quality-only preservation context");
  const behaviorPayloads: any[] = [];
  for (const enabled of [false,true]) {
    const instance = NyxNemotronEngineeringCognition.create({cognitionId:"BEHAVIOR-QUALITY-ABLATION",
      provider:provider(async(url,init)=>{behaviorPayloads.push(JSON.parse(String(init?.body)));
        return transportFor(intent())(url,init);}),maxPromptBytes:50000,maxOutputTokens:1024,
      qualityRepairGuidance:"STRUCTURE_SITES",structuralBudgetGuidance:"PUBLIC_ORIGINAL_STATE",
      ...(enabled?{behaviorRepairGuidance:"BINDING_USES" as const}:{})});
    await instance.proposeRepair(originalRequest);
    await instance.proposeRepair(measuredRequest);
  }
  check(JSON.stringify(behaviorPayloads[0]) === JSON.stringify(behaviorPayloads[2]),
    "binding-use ablation keeps first-candidate wire identical");
  const {behaviorPreservingQualityRepair,...behaviorBase}=getPrompt(behaviorPayloads[3]);
  check(isDeepStrictEqual(behaviorPreservingQualityRepair,behavior)
    && isDeepStrictEqual(behaviorBase,getPrompt(behaviorPayloads[1]))
    && isDeepStrictEqual(withoutMessages(behaviorPayloads[1]),withoutMessages(behaviorPayloads[3])),
    "quality-only ablation adds exactly lexical context, not provider grammar, model or compute controls");
  let invalidBehavior=false;
  try {NyxNemotronEngineeringCognition.create({cognitionId:"INVALID-BEHAVIOR",provider:provider(transportFor(intent())),
    maxPromptBytes:50000,maxOutputTokens:1024,behaviorRepairGuidance:"AUTO_REWRITE" as never});}
  catch {invalidBehavior=true;}
  check(invalidBehavior,"unrecognized behavior mode fails before inference");
  const localRequest = {...measuredRequest, allowedMutationPaths:["src/math.mjs"],
    files:[{relativePath:"src/math.mjs",content:crowded,contentSha256:hash(crowded)}],
    candidateQualityFeedback:{...measuredRequest.candidateQualityFeedback!,findings:[{dimension:"UNNECESSARY_COMPLEXITY",
      code:"DECLARATION_DELTA",paths:["src/math.mjs"],measurement:{observed:5,limit:4}}]}};
  const localGuide = nyxLocalRefactorGuidance(localRequest)!;
  check(localGuide.proposals.length===1 && localGuide.proposals[0].after.declarations===3
    && localGuide.proposals[0].baseSourceDigest===hash(crowded) && !localGuide.authorityGranted
    && !localGuide.hiddenEvidenceUsed && localGuide.proposals[0].equivalence.includes("NOT_CERTIFIED"),
    "concrete quality proposal removes adjacent return aliases while preserving evidence binding and no certification");
  for (const invalid of [request(),{...localRequest,observation:observation("TEST_FAIL")},
    {...localRequest,files:[{...localRequest.files[0],contentSha256:"0".repeat(64)}]},
    {...localRequest,allowedMutationPaths:[]}, {...localRequest,files:[...localRequest.files,...localRequest.files]}])
    check(nyxLocalRefactorGuidance(invalid)===null,"unbound, unauthorized, failed or ambiguous refactor context fails closed");
  const localPayloads:any[]=[];
  for (const enabled of [false,true]) {
    const instance=NyxNemotronEngineeringCognition.create({cognitionId:"LOCAL-REFACTOR-ABLATION",
      maxPromptBytes:50000,maxOutputTokens:1024,qualityRepairGuidance:"STRUCTURE_SITES",
      provider:provider(async(url,init)=>{localPayloads.push(JSON.parse(String(init?.body)));
        return transportFor(intent())(url,init);}),...(enabled?{localRefactorGuidance:"GUARDED_PROPOSALS" as const}:{})});
    await instance.proposeRepair(originalRequest);
    await instance.proposeRepair(localRequest);
  }
  check(isDeepStrictEqual(localPayloads[0],localPayloads[2]),"concrete refactor treatment does not alter first-candidate wire");
  const {localRefactorProposals,...localBase}=getPrompt(localPayloads[3]);
  check(isDeepStrictEqual(localRefactorProposals,localGuide) && isDeepStrictEqual(localBase,getPrompt(localPayloads[1]))
    && isDeepStrictEqual(withoutMessages(localPayloads[1]),withoutMessages(localPayloads[3])),
    "optional concrete proposal is the only quality-phase wire delta; provider, caps, grammar and authority unchanged");
  let invalidLocal=false;
  try {NyxNemotronEngineeringCognition.create({cognitionId:"INVALID-LOCAL-REFACTOR",maxPromptBytes:50000,maxOutputTokens:1024,
    provider:provider(transportFor(intent())),localRefactorGuidance:"AUTOMATIC_APPROVAL" as never});} catch {invalidLocal=true;}
  check(invalidLocal,"unknown local refactor mode fails before inference");
  const noOpportunitySource = "export function add(a,b){const values=[a,b];let sum=0,count=0,minimum=Infinity,maximum=-Infinity;for(const value of values){sum+=value;count++;minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);}return sum;}";
  const noOpportunity={...localRequest,files:[{relativePath:"src/math.mjs",content:noOpportunitySource,contentSha256:hash(noOpportunitySource)}],
    candidateQualityFeedback:{...localRequest.candidateQualityFeedback,findings:[{dimension:"UNNECESSARY_COMPLEXITY",code:"DECLARATION_DELTA",
      paths:["src/math.mjs"],measurement:{observed:5,limit:4}}]}};
  check(nyxLocalRefactorGuidance(noOpportunity)===null,"no applicable guarded rewrite produces no cosmetic repair context");
  const inactivePayloads:unknown[]=[];
  for(const enabled of [false,true]) {
    const instance=NyxNemotronEngineeringCognition.create({cognitionId:"EMPTY-PROPOSAL-IDENTITY",maxPromptBytes:50000,maxOutputTokens:1024,
      qualityRepairGuidance:"STRUCTURE_SITES",provider:provider(async(url,init)=>{inactivePayloads.push(JSON.parse(String(init?.body)));
        return transportFor(intent())(url,init);}),...(enabled?{localRefactorGuidance:"GUARDED_PROPOSALS" as const}:{})});
    await instance.proposeRepair(noOpportunity);
  }
  check(isDeepStrictEqual(inactivePayloads[0],inactivePayloads[1]),
    "empirical empty-coverage correction preserves the exact simpler-control wire when the proposer cannot help");
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
  check(unexplained.decision === "PROPOSED" && unexplained.hypothesis?.failureInterpretation === null,
  "missing explanatory prose does not discard an otherwise testable revision backed by prior E3 failure evidence");

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
  // Independent execution of trusted development fixtures, not model-generated programs.
  const run=(body:string,...args:unknown[])=>new Function("return ("+body+")")()(...args);
  const source="function subject(input) {const zero=0; const count=input.length+zero; const result=count; return result;}";
  const proposal=proposeNyxLocalRefactors("src/subject.mjs",source)!;
  check(proposal.operations.length===3 && proposal.after.declarations===1 && run(proposal.proposedSource,[1,2,3])===3
    &&run(source,[])===run(proposal.proposedSource,[]) && proposal.baseSourceDigest===hash(source)
    &&proposal.proposedSourceDigest===hash(proposal.proposedSource),
    "guarded proposal cumulatively composes primitive substitution and return aliases on separate development program");
  check(proposal.operations.every((operation,index)=>operation.inputDigest===(index?proposal.operations[index-1].outputDigest:hash(source)))
    &&Object.isFrozen(proposal)&&Object.isFrozen(proposal.operations)&&!proposal.authorityGranted,
    "each ordered local transformation has immutable source-bound provenance, not execution authority");
  for(const source of [
    "function subject(next){const value=next();return value;}",
    "function subject(input){const value=input.value;return value;}",
    "function subject(input){if(input.value)return true;else return false;}",
    "function subject(input){if(input.value){return false;}else{return true;}}",
  ]) {
    const p=proposeNyxLocalRefactors("src/subject.mjs",source)!;
    check(p!==null && run(source,()=>7)===run(p.proposedSource,()=>7),"narrow adjacent and opposite-boolean proposals preserve trusted visible behavior");
    if(source.includes("input.value")) {
      const make=()=>{let reads=0;return {get value(){return ++reads;},get reads(){return reads;}};};
      const a=make(),b=make();
      check(run(source,a)===run(p.proposedSource,b)&&a.reads===1&&b.reads===1,
        "getters remain evaluated exactly once in adjacent-return and boolean proposals");
    }
  }
  const boolean="function subject(input){if(input)return true;else return false;}";
  const boolProposal=proposeNyxLocalRefactors("src/boolean.mjs",boolean)!;
  for(const value of [undefined,null,false,true,0,-0,NaN,"","value",{},[],0n,1n,Symbol("x")])
    check(run(boolean,value)===run(boolProposal.proposedSource,value),"boolean conversion preserves truthiness across primitive and object development cases");
  const named="function subject(){const retained=()=>1;return retained;}";
  check(run(named).name==="retained" && run("function subject(){return ()=>1;}").name===""
    &&proposeNyxLocalRefactors("src/names.mjs",named)===null,
    "inferred function name is a real counterexample to unguarded terminal alias deletion");
  for (const unsafe of [named,"function subject(){const retained=class{};return retained;}",
    "function subject(){const retained=function(){};return retained;}",
    "function subject(next){const value=next();return value+value;}",
    "function subject(input){const value=input.value;return value+value;}",
    "function subject(){const value=1;return {value};}",
    "function subject(){const value=1;return ()=>value;}",
    "function subject(){return value;const value=1;}",
    "function subject(){const value=1;eval('value');return value;}",
    "function subject(){const value=1;return Function('return value')();}",
    "function subject(input){const value=1;[value]=input;return value;}",
    "function subject(){const value=1;(value)=2;return value;}",
    "function subject(input){let total=0;for(const value of input)total+=value;return total;}",
    "export const value=1; export function subject(){return value;}",
    "function subject(input){if(input){sideEffect();return true;}else return false;}",
    "async function subject(input){await using value=input;return value;}",
    "function subject(){const value:number=1;return value;}",
    "function subject(input){const value=input as number;return value;}",
  ]) check(proposeNyxLocalRefactors("src/unsafe.mjs",unsafe)===null,
    "unsupported effects, captures, dynamic scope, writes, comments or exports cannot acquire a guarded refactor");
  const annotated=proposeNyxLocalRefactors("src/comments.mjs","function subject(){const value=1; /* important */ return value;}")!;
  check(annotated.proposedSource.includes("/* important */"),"comments outside edited primitive declaration are preserved rather than silently discarded");
  for(const [path,body] of [["src/a.ts",source],["src/a.json",source],["src/a.mjs","function {"],
    ["src/a.mjs"," ".repeat(12001)+source]]) check(proposeNyxLocalRefactors(path,body)===null,
    "unsupported language, parse failure and oversized input fail closed");
  const chain="function subject(input){"+Array.from({length:12},(_,i)=>`const v${i}=${i?`v${i-1}`:"input"};`).join("")+"return v11;}";
  const bounded=proposeNyxLocalRefactors("src/bounded.mjs",chain)!;
  check(bounded.operations.length===8 && bounded.maximumOperations===8
    &&run(chain,7)===run(bounded.proposedSource,7),"bounded cumulative proposer stops at its explicit operation limit");
  check(proposeNyxLocalRefactors("src/many.mjs","function subject(){"+"0;".repeat(1800)+"const value=1;return value;}")===null,
    "bounded AST inventory refuses resource-heavy valid source without executing it");
  check(proposeNyxLocalRefactors("src/deep.mjs","function subject(){return "+"(".repeat(2000)+"1"+")".repeat(2000)+";}")===null,
    "deeply nested parsing failure is contained as no proposal, not a crashed cognition process");
}

{
  // Trusted, authored development programs only, never arbitrary model code.
  // Independent execution reproduces why apparently smaller edits can regress.
  const run = (body:string,...args:unknown[]) => new Function("return ("+body+")")()(...args);
  const effect = "function subject(next) { const sample = next(); return sample + sample; }";
  const inlined = "function subject(next) { return next() + next(); }";
  const counter = () => {let value=0;return () => ++value;};
  check(run(effect,counter()) === 2 && run(inlined,counter()) === 3,
    "development reproduction: removing a repeated effectful binding changes behavior");
  const sample=measureBindingUses("src/effect.mjs",effect)!.bindings[0];
  check(sample.readReferences === 2 && sample.initializerHazards.includes("CALL_OR_CONSTRUCTION"),
    "lexical summary identifies repeated use and unknown call effects without claiming an inline is safe");
  const getter = "function subject(input) { const value = input.value; return value + value; }";
  const getterInlined = "function subject(input) { return input.value + input.value; }";
  const input = () => {let value=0;return {get value(){return ++value;}};};
  check(run(getter,input()) === 2 && run(getterInlined,input()) === 3
    && measureBindingUses("src/getter.mjs",getter)!.bindings[0].initializerHazards.includes("PROPERTY_READ_MAY_HAVE_GETTER"),
    "property reads can have side effects; getters are not certified pure by syntax");
  const state = "function subject(items) { let total=0; for(const item of items) total+=item; return total; }";
  const reset = "function subject(items) { let total=0; for(const item of items) total=item; return total; }";
  check(run(state,[2,3])===5 && run(reset,[2,3])===3,"development reproduction: replacing an accumulator update destroys a passing algorithm");
  const stateUses=measureBindingUses("src/state.mjs",state)!;
  check(stateUses.bindings[0].directWriteReferences === 1 && stateUses.bindings[0].readReferences === 2
    && !stateUses.bindings[1].countedByQualityDetector,
    "persistent state reads and compound writes are counted, while existing loop-header policy is only described");
  const capture=measureBindingUses("src/capture.mjs","function subject() { let cursor=0; const next=()=>++cursor; return [next(),next()]; }")!;
  check(capture.bindings[0].capturedReferences===1 && capture.bindings[0].directWriteReferences===1,
    "captured state use cannot be mistaken for an unused binding");
  const shadow=measureBindingUses("src/shadow.mjs","function subject() { const value=1; {const value=2; use(value);} return {value}; }")!;
  check(shadow.bindings.length===2 && shadow.bindings.every(binding=>binding.readReferences===1),
    "checker resolves shadowed bindings and shorthand values without name-based correlation");
  const member=measureBindingUses("src/member.mjs","function subject() {const values=[]; values.push(1); return values;}")!.bindings[0];
  check(member.memberUses===1 && member.readReferences===2 && member.directWriteReferences===0,
    "member use is reported separately, not incorrectly treated as a complete write inventory");
  const destructured=measureBindingUses("src/data.mjs","function subject(input) {const {x}=input; return x;}")!;
  check(!destructured.complete && destructured.unresolvedBindings===1,"unsupported destructured bindings explicitly make inventory partial");
  const bounded=measureBindingUses("src/bounded.mjs","function subject() {"+Array.from({length:40},(_,i)=>`const v${i}=${i};`).join("")+"return 0;}")!;
  check(bounded.bindings.length===32 && !bounded.complete && bounded.totalVariableDeclarations===40,
    "bounded summary cannot present omitted bindings as unused");
  for (const [path,source] of [["source.txt",state],["src/x.mjs","function {"],["src/x.mjs"," ".repeat(12001)]])
    check(measureBindingUses(path,source)===null,"unknown syntax, oversized or malformed source fails closed without filesystem access");
  check(Object.isFrozen(capture) && Object.isFrozen(capture.bindings) && Object.isFrozen(capture.bindings[0]),
    "binding summary is immutable and cannot change an authority or verification result");
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
  const emptyTruncated = await cognition(async () => new Response(JSON.stringify({
    choices: [{ message: { content: null }, finish_reason: "length" }],
    usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
  }), { status: 200 })).proposeRepair(request());
  check(emptyTruncated.reason === "nyx_cognition_output_truncated" && emptyTruncated.hypothesis === null
    && emptyTruncated.evidence.modelUsage.totalTokens === 300,
    "engineering cognition retains consumed output tokens when truncation leaves no final source action");
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
check(NYX_NEMOTRON_ENGINEERING_COGNITION_STATUS.semanticContract === NYX_SEMANTIC_REPAIR_CONTRACT_VERSION,
  "status metadata cannot drift from the executable semantic repair contract");

{
  const payloads: Record<string, unknown>[] = [];
  const proposals: string[] = [];
  for (const variant of ["CURRENT", "REASONING_ENABLED", "MINIMAL_REFERENCE"] as const) {
    const result = await cognition(async (_url, init) => {
      payloads.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ choices: [{ message: { content: intent() }, finish_reason: "stop" }] }), { status: 200 });
    }, "TEXT", variant).proposeRepair(request());
    check(result.decision === "PROPOSED" && result.evidence.experimentVariant === variant && !result.omegaAuthorityGranted,
      `${variant} is issuer-selected and cannot grant actuation authority`);
    proposals.push(JSON.stringify(result.hypothesis?.changes));
  }
  const messages = payloads.map((body) => body.messages as { role: string; content: string }[]);
  check(JSON.stringify(messages[0]) === JSON.stringify(messages[1]), "current versus reasoning comparison keeps the exact messages unchanged");
  check(JSON.stringify({ ...payloads[0], chat_template_kwargs: undefined }) === JSON.stringify({ ...payloads[1], chat_template_kwargs: undefined }),
    "reasoning contrast changes no other provider payload field");
  check(JSON.stringify(payloads.map((body) => (body.chat_template_kwargs as { enable_thinking: boolean }).enable_thinking)) === "[false,true,true]",
    "all three arms send their prescribed inference flag");
  const prompts = messages.map((items) => JSON.parse(items[1].content));
  check(["objective", "admittedEvidence", "availableEvidence", "hypothesisHistory", "cognitionFailureHistory", "requiredCorrections", "constraints"]
    .every((key) => JSON.stringify(prompts[0][key]) === JSON.stringify(prompts[2][key])),
  "minimal reference preserves evidence, failure history, constraints and task without adding a solution");
  check(messages[2][1].content.length < messages[0][1].content.length && new Set(proposals).size === 1,
    "thin reference removes prompt scaffolding but the same model output yields the identical typed patch");
  for (const variant of ["REASONING_ENABLED", "MINIMAL_REFERENCE"] as const) {
    const invalid = await cognition(async () => new Response(JSON.stringify({ choices: [{ message: {
      content: intent({ decision: "RUN_SHELL" }) }, finish_reason: "stop" }] }), { status: 200 }), "TEXT", variant).proposeRepair(request());
    check(invalid.decision !== "PROPOSED" && !invalid.hypothesis && !invalid.omegaAuthorityGranted,
      `${variant} cannot bypass the unchanged unknown-tool rejection`);
  }
}

console.log(`Omega R3-D NYX Nemotron cognition tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) { console.error("FAILURES:"); for (const failure of failures) console.error(`  - ${failure}`); process.exit(1); }

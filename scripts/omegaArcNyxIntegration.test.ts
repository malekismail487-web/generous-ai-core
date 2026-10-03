import { execFileSync } from "node:child_process";
import { arcCorePredecessorSource, NYX_ARC_CORE_REFINEMENT } from "./omega/nyx-arc-core-refinement";
import { readFile } from "node:fs/promises";
import { theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import { NvidiaNimProvider, type NvidiaNimTransport } from "../src/lib/codelab/model/nvidiaNimProvider";
import { NyxNemotronEngineeringCognition } from "../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";
import { createArcAdapter, arcRepositoryFiles, extractArcArtifact, classifyArcLoopFailure } from "./omega/benchmarks/nyxArcAdapter";
import { contentHash, R3BenchmarkRepositorySession } from "./omega/benchmarks/r3RepositorySession";
import { runCampaign } from "./omega/benchmarks/campaign";
import { prepareTask } from "./omega/benchmarks/tasks";
import type { ArmSpec, CampaignSpec } from "./omega/benchmarks/contracts";
import { ARC_PUBLIC_EPOCH_SELECTION, ARC_ARRAY_BOUND_TRANSFER_SELECTION } from "./omega/nyx-arc-benchmark-epoch";
import { ARRAY_BOUND_TRANSFER_TASKS } from "./omega/benchmarks/arrayBoundTransferTasks";
import { SOURCE_REPRESENTATION_TASKS, representationRepositoryFiles, scoreRepresentationArtifact } from "./omega/benchmarks/sourceRepresentationTasks";
import {inspectDiagnosticArray,inspectSourceLiteral,sourceLiteralEnvelope,SOURCE_LITERAL_PROBES,SOURCE_LITERAL_DIAGNOSTIC} from "./omega/nyx-structured-array-diagnostic";
import {R3BoundedRepairLoop} from "../src/lib/codelab/engine/r3BoundedRepairLoop";

let passed = 0, failed = 0;
const check = (value: unknown, label: string) => { if (value) passed++; else { failed++; console.error(`FAIL ${label}`); } };
const rejects = (body: () => unknown, label: string) => { try { body(); check(false, label); } catch { check(true, label); } };
const input = { train: [{ input: [[1, 2]], output: [[2, 3]] }, { input: [[3], [0]], output: [[4], [1]] }],
  test: [{ input: [[8, 9]] }] };
const correct = 'export function transform(input) {\n  const output = input.map(row => row.map(color => (color + 1) % 10));\n  return { attempt_1: output, attempt_2: output };\n}\n';
const bad = 'export function transform(input) {\n  const output = input.map(row => row.map(() => 0));\n  return { attempt_1: output, attempt_2: output };\n}\n';
const digest = theoryDigest("fixture");
for (const path of ["src/lib/codelab/cognition/nyxNemotronEngineeringCognition.ts", "src/lib/codelab/engine/r3BoundedRepairLoop.ts"]) {
  const current = await readFile(path, "utf8");
  const baseline = execFileSync("git", ["show", `${NYX_ARC_CORE_REFINEMENT.predecessor}:${path}`], { encoding: "utf8" });
  check(arcCorePredecessorSource(path, current) === baseline, `${path} has exactly the reviewed opt-in refinement`);
  check(arcCorePredecessorSource(path, current + "// Unauthorized extra change\n") !== baseline,
    `${path} unrelated changes cannot hide in refinement`);
}
const spec = (arm: ArmSpec["arm"]): ArmSpec => ({ arm, version: "test", sourceDigest: theoryDigest(arm),
  inferenceMode: "SYNTHETIC_PROTOCOL_TEST", model: "nvidia/nemotron-3-ultra-550b-a55b", modelConfigDigest: digest,
  authorityDigest: digest, toolEnvelopeDigest: digest, supportedCapabilities: ["JSON_GRID_OUTPUT"] });
const limits: CampaignSpec["limits"] = { maxCallsPerTask: 2, maxReportedTokensPerTask: 100000,
  maxToolCallsPerTask: 3, maxToolWorkUnitsPerTask: 300, maxAttemptsPerTask: 1, maxArtifactBytes: 50000,
  maxWallClockMsPerTask: 60000, maxWallClockMs: 180000 };
function provider(transport: NvidiaNimTransport) {
  return NvidiaNimProvider.create({ providerId: "ARC-TEST", model: spec("CURRENT_NYX").model,
    authorityMode: "TEST_DOUBLE_ONLY", credentialSource: { sourceIdentity: "test-double", read: () => "explicit-test-double-material-only" },
    maxPromptBytes: 64000, maxOutputTokens: 8192, timeoutMs: 1000, transport });
}
const reply = (content: string, finish = "stop") => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }],
  usage: { prompt_tokens: 300, completion_tokens: 100, total_tokens: 400 } }), { status: 200 });
const intent = (source: string) => JSON.stringify({ decision: "PROPOSE_EDIT", diagnosis: "The placeholder has no transformation.",
  causalHypothesis: "Each cell must map its color by one modulo ten.", evidenceRefs: ["OBJECTIVE", "FILE:src/examples.mjs"],
  invariant: "Preserve shape and input; transform each cell consistently.", failureInterpretation: "The prior candidate used a wrong color map.",
  expectedResult: "Every public example will match.", counterexamples: ["zero and color nine at boundaries"],
  changes: [{ target: "src/transform.mjs", replacement: { lines: source.split("\n"), lineEnding: "LF" } }], confidence: 0.8 });
const request = (signal = new AbortController().signal) => ({ input, inputDigest: theoryDigest(input), attempt: 1,
  feedback: null, remaining: limits, signal });

for (const arm of ["RAW_MODEL", "MODEL_EQUIVALENT_TOOLS", "CURRENT_NYX"] as const) {
  let calls = 0; const policies: unknown[] = []; const prompts: string[] = [];
  const p = provider(async (_url, init) => {
    calls++; const body = JSON.parse(String(init?.body)); policies.push(body.chat_template_kwargs); prompts.push(JSON.stringify(body));
    return arm === "RAW_MODEL" ? reply(JSON.stringify({ predictions: [{ attempt_1: [[9, 0]], attempt_2: [[9, 0]] }], confidence: 0.8 }))
      : reply(intent(correct));
  });
  const evidence: Record<string, unknown>[] = [];
  const adapter = createArcAdapter({ spec: spec(arm), provider: p, candidateCommit: "a".repeat(40), maxOutputTokens: 8192,
    onIntegrationEvidence: value => evidence.push(value as unknown as Record<string, unknown>) });
  const output = await adapter.invoke(request());
  check(output.failure === null, `${arm} genuinely executes complete existing path: ${output.failure}`);
  check(theoryDigest(output.artifact) === theoryDigest([{ attempt_1: [[9, 0]], attempt_2: [[9, 0]] }]), `${arm} predictions`);
  check(output.usage.logicalCalls === calls && calls === 1 && output.usage.physicalCalls === calls, `${arm} physical calls`);
  check(output.usage.reportedTokens === 400 && output.usage.unknownUsageCalls === 0, `${arm} known usage`);
  check(output.requestDigests.length === 1 && output.responseDigests.length === 1, `${arm} digests`);
  check(!prompts.some(prompt => prompt.includes('"answer"') || prompt.includes("privateOracleDigest")), `${arm} no private answers`);
  if (arm !== "RAW_MODEL") {
    check(output.usage.toolCalls === 2 && output.usage.toolWorkUnits === 6, `${arm} setup and verification work counted`);
    check(evidence[0]?.sourceUnchanged && evidence[0]?.cleanupVerified, `${arm} original and cleanup`);
    check(evidence[0]?.lifecycleTerminations === evidence[0]?.provisionedLifecycles, `${arm} owned lifecycle termination verified`);
    check(evidence[0]?.productionAuthority === false && evidence[0]?.candidateNetworkIsolation === "NOT_PROVEN", `${arm} honest isolation`);
    check(policies.every(policy => JSON.stringify(policy).includes('"enable_thinking":false')), `${arm} same inference control`);
  }
}
{
  let calls = 0; const evidence: Record<string, unknown>[] = [];
  const adapter = createArcAdapter({ spec: spec("CURRENT_NYX"), provider: provider(async () => reply(intent(++calls === 1 ? bad : correct))),
    candidateCommit: "a".repeat(40), maxOutputTokens: 8192, onIntegrationEvidence: value => evidence.push(value as unknown as Record<string, unknown>) });
  const output = await adapter.invoke(request());
  check(output.failure === null && output.usage.logicalCalls === 2, "public-example falsification produces bounded repair");
  check(output.usage.toolCalls === 3 && evidence[0]?.repairIterations === 2, "repair executions retained separately");
}
{
  let calls = 0; const evidence: Record<string, unknown>[] = [];
  const adapter = createArcAdapter({ spec: spec("CANDIDATE_NYX"), publicFeedbackMode: "COMPACT_WITNESS",
    provider: provider(async () => reply(intent(++calls === 1 ? bad : correct))), candidateCommit: "a".repeat(40), maxOutputTokens: 8192,
    onIntegrationEvidence: value => evidence.push(value as unknown as Record<string, unknown>) });
  const output = await adapter.invoke(request());
  check(output.failure === null && output.usage.logicalCalls === 2, "candidate witness uses same real NYX and bounded repair");
  check((evidence[0]?.iterationResults as any[])[0].functionalPass === false
    && (evidence[0]?.iterationResults as any[])[1].functionalPass === true, "first failed candidate and repaired result separately attributable");
  let errors = 0;
  const correctedInterface = await createArcAdapter({spec: spec("CURRENT_NYX"), candidateCommit: "a".repeat(40), maxOutputTokens: 8192,
    provider: provider(async () => reply(++errors === 1 ? "{}" : intent(bad)))}).invoke(request());
  check(correctedInterface.failure === "FUNCTIONAL_FAILURE", "repaired schema does not hide later public functional failure");
}
{
  const p = provider(async () => reply("{", "length"));
  const output = await createArcAdapter({ spec: spec("RAW_MODEL"), provider: p, candidateCommit: "a".repeat(40), maxOutputTokens: 8192 }).invoke(request());
  check(output.failure === "TRUNCATION" && output.usage.reportedTokens === 400, "truncation retains compute not reasoning classification");
  const cancelled = new AbortController(); cancelled.abort();
  const noCall = await createArcAdapter({ spec: spec("CURRENT_NYX"), provider: p, candidateCommit: "a".repeat(40), maxOutputTokens: 8192 }).invoke(request(cancelled.signal));
  check(noCall.failure === "RESOURCE_EXHAUSTION" && noCall.usage.physicalCalls === 0, "abort never invokes cognition");
}
{
  const raw = { train: input.train, test: [{ input: input.test[0].input, output: [[9, 0]] }] };
  const task = prepareTask("ARC_AGI", "INDEPENDENT-TEST", "DEVELOPMENT", { dataset: "TEST", revision: "1", contentDigest: theoryDigest(raw),
    visibility: "SYNTHETIC", kind: "DEVELOPMENT_REPRODUCTION", provenance: "Deterministic protocol fixture, not cognitive evidence." }, raw);
  const adapter = createArcAdapter({ spec: spec("CURRENT_NYX"), provider: provider(async () => reply(intent(correct))),
    candidateCommit: "a".repeat(40), maxOutputTokens: 8192 });
  const now = Date.now();
  const report = await runCampaign({ schemaVersion: 1, campaignId: "ARC-INTEGRATION", environmentIdentity: "TEST", executionIdentity: "TEST",
    frozenAtEpochMs: now, expiresAtEpochMs: now + 180000, taskDigests: [task.manifest.taskDigest], model: spec("CURRENT_NYX").model,
    modelConfigDigest: digest, authorityDigest: digest, toolEnvelopeDigest: digest, verifierVersion: "TEST", verifierSourceDigest: digest,
    limits, realizedComputeTolerance: 0.1 }, [task], [adapter], null);
  check(report.summaries.find(s => s.arm === "CURRENT_NYX")?.finalAccepted === 1, "independent scorer judges actual NYX output");
  check(!report.broadPromotion && !report.matchedRealizedCompute && !report.grantsAuthority, "missing controls prevent promotion");
  check(task.scoreArc!([{ attempt_1: [[0]], attempt_2: [[0]] }]).state === "FAIL", "untrusted self-declaration cannot bypass exact scorer");
}
{
  const raw = { train: input.train, test: [{ input: input.test[0].input, output: [[9, 0]] }] };
  const task = prepareTask("ARC_AGI", "REPAIR-ACCOUNTING", "DEVELOPMENT", { dataset: "TEST", revision: "1", contentDigest: theoryDigest(raw),
    visibility: "SYNTHETIC", kind: "DEVELOPMENT_REPRODUCTION", provenance: "Internal repair accounting, not a cognitive result." }, raw);
  let calls = 0;
  const adapter = createArcAdapter({ spec: spec("CURRENT_NYX"), provider: provider(async () => reply(intent(++calls === 1 ? bad : correct))),
    candidateCommit: "a".repeat(40), maxOutputTokens: 8192 });
  const now = Date.now();
  const report = await runCampaign({ schemaVersion: 1, campaignId: "REPAIR-ACCOUNTING", environmentIdentity: "TEST", executionIdentity: "TEST",
    frozenAtEpochMs: now, expiresAtEpochMs: now + 180000, taskDigests: [task.manifest.taskDigest], model: spec("CURRENT_NYX").model,
    modelConfigDigest: digest, authorityDigest: digest, toolEnvelopeDigest: digest, verifierVersion: "TEST", verifierSourceDigest: digest,
    limits, realizedComputeTolerance: 0.1 }, [task], [adapter], null);
  const summary = report.summaries.find(s => s.arm === "CURRENT_NYX")!;
  check(summary.firstAttemptAccepted === 0 && summary.repairedAccepted === 1 && summary.finalAccepted === 1,
    "inner repair cannot masquerade as first-try benchmark acceptance");
  check(report.runs.find(r => r.arm === "CURRENT_NYX")!.attempts[0].internalCandidateAttempts === 2,
    "candidate attempts survive campaign serialization");
}
rejects(() => arcRepositoryFiles({ ...input, test: [{ input: [[1]], output: [[2]] }] }), "private answer injection rejected");
rejects(() => extractArcArtifact('ARC_PREDICTIONS []\nARC_PREDICTIONS []', 1), "ambiguous predictions rejected");
rejects(() => extractArcArtifact('ARC_PREDICTIONS [{"attempt_1":[[1,2],[3]],"attempt_2":[[1]]}]', 1), "ragged prediction rejected");
rejects(() => createArcAdapter({ spec: spec("CANDIDATE_NYX"), provider: provider(async () => reply("{}")),
  candidateCommit: "a".repeat(40), maxOutputTokens: 8192 }), "unimplemented candidate cannot masquerade as new cognition");
rejects(() => NyxNemotronEngineeringCognition.create({ cognitionId: "INVALID", provider: provider(async () => reply("{}")), maxPromptBytes: 100,
  maxOutputTokens: 100, comparisonInferencePolicy: "UNKNOWN" as never }), "unsupported inference control rejected");
for (const [reason, expected] of [["truncated", "TRUNCATION"], ["provider_timeout", "PROVIDER_FAILURE"],
  ["schema_invalid", "SCHEMA_FAILURE"], ["quality_rejected", "QUALITY_REJECTION"], ["budget_exhausted", "RESOURCE_EXHAUSTION"]])
  check(classifyArcLoopFailure(reason) === expected, `distinct ${reason}`);
{
  const session = await R3BenchmarkRepositorySession.create(arcRepositoryFiles(input), "a".repeat(40), Date.now() + 60000, 12000);
  const original = await readFile(session.sourceRoot + "/src/transform.mjs", "utf8");
  check(contentHash(original) === contentHash(arcRepositoryFiles(input)["src/transform.mjs"]), "bounded source initialized exactly");
  const cleanup = await session.close(); check(cleanup.sourceUnchanged && cleanup.cleanupVerified, "disposable root removed and source unchanged");
  rejects(() => session.assertActive(), "terminated session loses use");
}
{
  const mutableSpec = spec("RAW_MODEL");
  const adapter = createArcAdapter({ spec: mutableSpec, provider: provider(async () => reply("{}")),
    candidateCommit: "a".repeat(40), maxOutputTokens: 8192 });
  mutableSpec.arm = "CURRENT_NYX";
  check(adapter.spec.arm === "RAW_MODEL", "adapter identity cannot change after freeze");
  const controller = new AbortController(); let calls = 0;
  const cancelled = await createArcAdapter({ spec: spec("CURRENT_NYX"), provider: provider(async () => {
    calls++; controller.abort(); return reply(intent(correct));
  }), candidateCommit: "a".repeat(40), maxOutputTokens: 8192 }).invoke(request(controller.signal));
  check(calls === 1 && cancelled.failure === "RESOURCE_EXHAUSTION" && cancelled.artifact === null,
    "mid-inference cancellation cannot apply a model proposal or renew the lease");
  const currentTruncated = await createArcAdapter({ spec: spec("CURRENT_NYX"), provider: provider(async () => reply("{", "length")),
    candidateCommit: "a".repeat(40), maxOutputTokens: 8192 }).invoke(request());
  check(currentTruncated.failure === "TRUNCATION" && currentTruncated.usage.logicalCalls === 2,
    "exhausted syntax-interface repair remains truncation, not hidden-case reasoning failure");
  const syntax = await createArcAdapter({ spec: spec("CURRENT_NYX"), provider: provider(async () => reply(intent('export function transform(input) {\n  return ; bad (\n}\n'))),
    candidateCommit: "a".repeat(40), maxOutputTokens: 8192 }).invoke(request());
  check(syntax.failure === "SYNTAX_FAILURE" && syntax.artifact === null, "invalid emitted source does not count as a failed hidden reasoning test");
  const outside = JSON.parse(intent(correct)); outside.changes[0].target = "tools/verify.mjs";
  const forbidden = await createArcAdapter({ spec: spec("CURRENT_NYX"), provider: provider(async () => reply(JSON.stringify(outside))),
    candidateCommit: "a".repeat(40), maxOutputTokens: 8192 }).invoke(request());
  check(forbidden.failure === "AUTHORIZATION_FAILURE" && forbidden.artifact === null, "model cannot change verifier to manufacture success");
}
{
  check(ARC_PUBLIC_EPOCH_SELECTION.taskIds.length === 8 && ARC_PUBLIC_EPOCH_SELECTION.population === 120,
    "actual public evaluation selection is frozen before live inference");
  check(ARC_PUBLIC_EPOCH_SELECTION.oraclePolicy.includes("EVALUATOR_ONLY")
    && ARC_PUBLIC_EPOCH_SELECTION.contamination.includes("NOT_SEALED"), "public evaluation cannot masquerade as protected evidence");
  check(ARC_ARRAY_BOUND_TRANSFER_SELECTION.taskIds.every(id => !ARC_PUBLIC_EPOCH_SELECTION.taskIds.includes(id)),
    "fresh ARC transfer excludes every task from the observed baseline");
  for (const preserveProviderArrayBounds of [false, true]) {
    let wire: any;
    const bounded = await createArcAdapter({spec: spec(preserveProviderArrayBounds ? "CANDIDATE_NYX" : "CURRENT_NYX"),
      preserveProviderArrayBounds, provider: provider(async (_url, init) => {
        wire = JSON.parse(String(init?.body)).response_format.json_schema.schema;
        return reply(intent(correct));
      }), candidateCommit: "a".repeat(40), maxOutputTokens: 8192}).invoke(request());
    check(bounded.failure === null && bounded.usage.logicalCalls === 1
      && wire.properties.changes.items.properties.replacement.properties.lines.maxItems
        === (preserveProviderArrayBounds ? 4096 : undefined),
      "ARC ablation changes only explicit hosted array limits and retains one-call exact execution");
  }
  rejects(() => createArcAdapter({spec: spec("CURRENT_NYX"), preserveProviderArrayBounds: "false" as never,
    provider: provider(async () => reply("{}")), candidateCommit: "a".repeat(40), maxOutputTokens: 8192}),
    "ARC adapter rejects malformed wire-policy flags");
  const messages: string[] = [];
  const textIntent = JSON.parse(intent(correct)); textIntent.changes[0].replacement = correct;
  const emitted = await createArcAdapter({spec: spec("CANDIDATE_NYX"), sourceRepresentation: "TEXT",
    provider: provider(async (_url, init) => {messages.push(String(init?.body)); return reply(JSON.stringify(textIntent));}),
    candidateCommit: "a".repeat(40), maxOutputTokens: 8192}).invoke(request());
  check(emitted.failure === null && emitted.usage.logicalCalls === 1, "existing TEXT contract composes with existing executor");
  check(messages.every(m => m.includes('\\"sourceRepresentation\\":\\"TEXT\\"')),
    "TEXT comparison explicitly exposes the correct existing schema, not guessed source extraction");
  const traces: any[] = [];
  await createArcAdapter({spec: spec("CURRENT_NYX"), provider: provider(async () => reply(intent("export function transform(input) {\n"))),
    candidateCommit: "a".repeat(40), maxOutputTokens: 8192, onIntegrationEvidence: t => traces.push(t)}).invoke(request());
  check(traces[0]?.rejectedIntentDiagnostics.some((d: any) => d.category === "SOURCE_QUALITY_INVALID"
    && d.observedCode.startsWith("syntax_error_line_")), "actual parser locations retained separately from failure class");
  check(!JSON.stringify(traces[0]).includes("export function"), "sanitized diagnosis records exclude model source and reasoning");
  rejects(() => createArcAdapter({spec: spec("CANDIDATE_NYX"), sourceRepresentation: "UNSAFE" as never,
    provider: provider(async () => reply("{}")), candidateCommit: "a".repeat(40), maxOutputTokens: 8192}),
    "unknown source contract fails closed");
}
// Independent test-only solutions validate the experiment's oracle and real execution path.
// These sources never enter a model prompt or the downloaded benchmark corpus.
const representationReferences: Record<string, string> = {
  "QUOTED-RECORD": `export function transform(input) {
    const fields=[];let field="";let quoted=false;
    for(let index=0;index<input.length;index++) {
      if(input[index]==='"') {
        if(quoted&&input[index+1]==='"'){field+='"';index++;}
        else quoted=!quoted;
      } else if(input[index]===","&&!quoted) {fields.push(field);field="";}
      else field+=input[index];
    }
    fields.push(field);return fields;
  }`,
  "LEXICAL-TOPOLOGICAL-ORDER": `export function transform(input) {
    const remaining=input.nodes.slice().sort();const result=[];
    while(remaining.length) {
      let index=0;
      while(index<remaining.length&&input.edges.some(edge=>edge[1]===remaining[index]&&remaining.includes(edge[0])))index++;
      if(index===remaining.length)return null;
      result.push(...remaining.splice(index,1));
    }
    return result;
  }`,
  "INTERVAL-UNION": `export function transform(input) {
    const merged=[];
    for(const interval of input.map(row=>row.slice()).sort((a,b)=>a[0]-b[0])) {
      const previous=merged.at(-1);
      if(previous&&interval[0]<=previous[1])previous[1]=Math.max(previous[1],interval[1]);
      else merged.push(interval);
    }
    return merged;
  }`,
  "WEIGHTED-MOMENT": `export function transform(input) {
    let totalWeight=0;let weightedSum=0;
    for(const record of input) {totalWeight+=record.weight;weightedSum+=record.value*record.weight;}
    return totalWeight===0?null:weightedSum/totalWeight;
  }`,
  "POLYNOMIAL-EVALUATION": `export function transform(input) {
    let value=0;
    for(let index=input.coefficients.length-1;index>=0;index--)value=value*input.x+input.coefficients[index];
    return value;
  }`,
  "CHUNKED-LINE-FRAMING": `export function transform(input) {
    const stream=input.join("");if(!stream)return [];
    const lines=stream.split(/\\r?\\n/);if(stream.endsWith("\\n"))lines.pop();
    return lines;
  }`,
};
for (const task of [...SOURCE_REPRESENTATION_TASKS, ...ARRAY_BOUND_TRANSFER_TASKS]) {
  const rows = task.privateCases.map(c => ({value: c.expected, inputUnchanged: true, resultDetached: true}));
  const marker = (value: unknown) => "ENGINEERING_PREDICTIONS " + JSON.stringify(value);
  check(scoreRepresentationArtifact(task, marker(rows)).accepted, `${task.id} private exact scorer validates all cases`);
  check(!scoreRepresentationArtifact(task, marker(rows.map(r => ({...r, inputUnchanged: false})))).accepted,
    `${task.id} input mutation cannot be certified by matching outputs`);
  check(!scoreRepresentationArtifact(task, marker(rows.map(r => ({...r, resultDetached: false})))).accepted,
    `${task.id} output aliasing cannot pass as new independent values`);
  check(!scoreRepresentationArtifact(task, marker(rows.slice(1))).accepted, `${task.id} missing case cannot pass`);
  check(!scoreRepresentationArtifact(task, marker(rows) + "\n" + marker(rows)).accepted,
    `${task.id} ambiguous candidate artifacts fail closed`);
  check(!representationRepositoryFiles(task)["tools/verify.mjs"].includes(JSON.stringify(task.privateCases)),
    `${task.id} withheld answer table absent from visible verifier`);
  const session = await R3BenchmarkRepositorySession.create(representationRepositoryFiles(task), "a".repeat(40), Date.now() + 60000, 12000);
  const baseline = await session.baseline();
  check(baseline.observation.state === "TEST_FAIL", `${task.id} real existing Omega execution observes initial failure`);
  const source=representationReferences[task.id];
  const referenceIntent=JSON.parse(intent(source));
  referenceIntent.causalHypothesis="The supplied test-only reference implements the stated domain rule.";
  referenceIntent.invariant="Preserve inputs and compute the stated result for all valid arguments.";
  referenceIntent.counterexamples=["Empty input and boundary values"];
  const cognition=NyxNemotronEngineeringCognition.create({cognitionId:"REFERENCE-ONLY",provider:provider(async()=>reply(JSON.stringify(referenceIntent))),
    maxPromptBytes:48000,maxOutputTokens:8192,sourceRepresentation:"LINES",intentCompilationMode:"SAFE_CANONICALIZATION"});
  const loop=R3BoundedRepairLoop.create({loopId:"REFERENCE-ONLY",evaluatorVersion:"REFERENCE-ONLY",observerIdentity:"REFERENCE-ONLY",
    cognition,candidateBuilder:{builderIdentity:"REFERENCE-ONLY",prepare:h=>session.prepare(h)},maxIterations:1,maxModelInteractions:1,
    maxWallClockMs:30000,maxChangesPerIteration:1,maxPatchBytesPerIteration:12000,maxDiagnosisCharacters:1500});
  const result=await loop.run({schemaVersion:1,repairRequestId:"REFERENCE-ONLY",objective:task.objective,
    initialObservation:baseline.observation,initialFiles:baseline.prepared.files,allowedMutationPaths:["src/transform.mjs"],
    availableEvidence:[],allowedVerificationToolIds:["TEST"],baselineExecutions:[{toolId:"TEST",result:baseline.result}],observedAtEpochMs:Date.now()});
  if(result.outcome!=="FUNCTIONALLY_REPAIRED_VERIFIED")console.error(JSON.stringify({task:task.id,
    referenceAdmission:result.iterations.at(-1)?.candidateAdmission?.findings,reason:result.reason}));
  check(result.outcome==="FUNCTIONALLY_REPAIRED_VERIFIED"
    && scoreRepresentationArtifact(task,result.iterations.at(-1)?.verifications[0].execution.evidence.stdout??"").accepted,
    `${task.id} test-only reference passes real bounded execution, unchanged quality admission and private scorer: ${result.reason}`);
  const cleanup = await session.close();
  check(cleanup.sourceUnchanged && cleanup.cleanupVerified && cleanup.lifecycleTerminations === cleanup.provisionedLifecycles,
    `${task.id} existing owned lifecycle closes without leaked capability or source mutation`);
}
check(inspectDiagnosticArray(JSON.stringify({values:Array.from({length:40},(_,i)=>i)}),40).accepted,
  "mechanistic diagnostic accepts only exact longer sequence");
check(!inspectDiagnosticArray(JSON.stringify({values:Array.from({length:32},(_,i)=>i)}),40).accepted,
  "complete JSON containing a short array is not successful serialization");
check(!inspectDiagnosticArray('{"values":[0],"claimedSuccess":true}',1).accepted,
  "diagnostic self-certification field cannot replace exact local acceptance");
check(!inspectDiagnosticArray('{"values":[0,2]}',2).accepted&&!inspectDiagnosticArray('{"values":[0.5]}',1).accepted,
  "integer sequence errors remain rejected");
for(const probe of SOURCE_LITERAL_PROBES) {
  const envelope=sourceLiteralEnvelope(probe);const content=JSON.stringify(envelope);
  const exact=await inspectSourceLiteral(content,"stop",contentHash(content),probe);
  check(exact.accepted&&exact.inspection.sourceDigest===contentHash(probe.lines.join(probe.lineEnding==="LF"?"\n":"\r\n")),
    `${probe.id} independent exact source copy and syntax oracle accepts its reference`);
  check(!(await inspectSourceLiteral(content,"length",contentHash(content),probe)).accepted,
    `${probe.id} exact-looking content cannot hide provider truncation`);
  check(!(await inspectSourceLiteral(content,"stop","0".repeat(64),probe)).accepted,
    `${probe.id} unauthenticated captured bytes cannot claim delivery consistency`);
  const changed=structuredClone(envelope);changed.changes[0].replacement.lines[1]="  return null;";
  const drift=JSON.stringify(changed);
  check(!(await inspectSourceLiteral(drift,"stop",contentHash(drift),probe)).accepted,
    `${probe.id} valid-looking syntax cannot replace exact copy acceptance`);
}
{
  const probe=SOURCE_LITERAL_PROBES[1];const envelope=sourceLiteralEnvelope(probe);
  for(const invalid of [{...envelope,claimedSuccess:true},{changes:[...envelope.changes,...envelope.changes]},
    {changes:[{...envelope.changes[0],target:"../escape.mjs"}]},
    {changes:[{...envelope.changes[0],replacement:{...envelope.changes[0].replacement,lines:["return (;"]}}]}]) {
    const content=JSON.stringify(invalid);
    check(!(await inspectSourceLiteral(content,"stop",contentHash(content),probe)).accepted,
      "copy diagnostic rejects extra fields, replacement expansion, target escape and invalid source independently");
  }
  check(SOURCE_LITERAL_DIAGNOSTIC.maxLogicalCalls===SOURCE_LITERAL_PROBES.length*SOURCE_LITERAL_DIAGNOSTIC.modes.length
    &&!SOURCE_LITERAL_DIAGNOSTIC.grantsAuthority&&!SOURCE_LITERAL_DIAGNOSTIC.benchmarkQuestionsUsed,
    "neutral source-copy diagnosis is finite and not benchmark-aware or authority-granting");
}
console.log(`passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;

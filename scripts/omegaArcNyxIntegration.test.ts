import { execFileSync } from "node:child_process";
import { RUNTIME_REVIEW_TRANSFER_TASKS, runtimeReviewTransferConfiguration } from "./omega/benchmarks/runtimeReviewTransferTasks";
import { EVALUATION_ORDER_TRANSFER_TASKS, evaluationOrderTransferConfiguration,
  evaluationOrderWireControlVerified } from "./omega/benchmarks/evaluationOrderTransferTasks";
import { CONDITIONAL_REFACTOR_REPAIR_TASKS, suppliedCandidateThenLive }
  from "./omega/benchmarks/conditionalRefactorRepairTasks";
import { proposeNyxLocalRefactors } from "../src/lib/codelab/cognition/nyxLocalRefactorProposals";
import { observePublicRuntimeSample } from "./omega/benchmarks/publicRuntimeSamples";
import { arcCorePredecessorSource, NYX_ARC_CORE_REFINEMENT } from "./omega/nyx-arc-core-refinement";
import { readFile } from "node:fs/promises";
import { theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import { NvidiaNimProvider, type NvidiaNimTransport } from "../src/lib/codelab/model/nvidiaNimProvider";
import { NyxNemotronEngineeringCognition } from "../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";
import { createArcAdapter, arcRepositoryFiles, extractArcArtifact, classifyArcLoopFailure, arcInferenceConfiguration, inferUsage } from "./omega/benchmarks/nyxArcAdapter";
import { contentHash, R3BenchmarkRepositorySession } from "./omega/benchmarks/r3RepositorySession";
import { runCampaign } from "./omega/benchmarks/campaign";
import { prepareTask } from "./omega/benchmarks/tasks";
import type { ArmSpec, CampaignSpec } from "./omega/benchmarks/contracts";
import { ARC_PUBLIC_EPOCH_SELECTION, ARC_ARRAY_BOUND_TRANSFER_SELECTION } from "./omega/nyx-arc-benchmark-epoch";
import { ARRAY_BOUND_TRANSFER_TASKS } from "./omega/benchmarks/arrayBoundTransferTasks";
import { SOURCE_LITERAL_TRANSFER_TASKS } from "./omega/benchmarks/sourceLiteralTransferTasks";
import { MEASURED_QUALITY_TRANSFER_TASKS } from "./omega/benchmarks/measuredQualityTransferTasks";
import { QUALITY_SITE_TRANSFER_TASKS } from "./omega/benchmarks/qualitySiteTransferTasks";
import { DECISION_CONTRACT_TRANSFER_TASKS } from "./omega/benchmarks/decisionContractTransferTasks";
import { BOUNDED_CONTRACT_TRANSFER_TASKS } from "./omega/benchmarks/boundedContractTransferTasks";
import { PATTERN_REPAIR_TRANSFER_TASKS } from "./omega/benchmarks/patternRepairTransferTasks";
import { LENGTH_GRAMMAR_TRANSFER_TASKS } from "./omega/benchmarks/lengthGrammarTransferTasks";
import { NATIVE_REASONING_TRANSFER_TASKS, nativeReasoningTransferConfiguration } from "./omega/benchmarks/nativeReasoningTransferTasks";
import { ORIGINAL_BUDGET_TRANSFER_TASKS, originalBudgetTransferConfiguration,
  originalBudgetWireControlVerified } from "./omega/benchmarks/originalBudgetTransferTasks";
import { BEHAVIOR_REPAIR_TRANSFER_TASKS, behaviorRepairTransferConfiguration,
  behaviorRepairWireControlVerified } from "./omega/benchmarks/behaviorRepairTransferTasks";
import { LOCAL_REFACTOR_TRANSFER_TASKS, localRefactorTransferConfiguration,
  localRefactorWireControlVerified } from "./omega/benchmarks/localRefactorTransferTasks";
import { SOURCE_REPRESENTATION_TASKS, representationRepositoryFiles, scoreRepresentationArtifact,assessRepresentationCandidate,classifyRepresentationFailure } from "./omega/benchmarks/sourceRepresentationTasks";
import {inspectDiagnosticArray,inspectSourceLiteral,sourceLiteralEnvelope,sourceLiteralStructureDigest,SOURCE_LITERAL_PROBES,SOURCE_LITERAL_DIAGNOSTIC} from "./omega/nyx-structured-array-diagnostic";
import {R3BoundedRepairLoop} from "../src/lib/codelab/engine/r3BoundedRepairLoop";
import { NvidiaCapacityCoordinator } from "../src/lib/codelab/model/nvidiaCapacity";

let passed = 0, failed = 0;
const check = (value: unknown, label: string) => { if (value) passed++; else { failed++; console.error(`FAIL ${label}`); } };
const rejects = (body: () => unknown, label: string) => { try { body(); check(false, label); } catch { check(true, label); } };
const input = { train: [{ input: [[1, 2]], output: [[2, 3]] }, { input: [[3], [0]], output: [[4], [1]] }],
  test: [{ input: [[8, 9]] }] };
const correct = 'export function transform(input) {\n  const output = input.map(row => row.map(color => (color + 1) % 10));\n  return { attempt_1: output, attempt_2: output };\n}\n';
const bad = 'export function transform(input) {\n  const output = input.map(row => row.map(() => 0));\n  return { attempt_1: output, attempt_2: output };\n}\n';
const digest = theoryDigest("fixture");
{
  const path = "src/lib/codelab/model/nvidiaNimProvider.ts";
  const current = await readFile(path, "utf8");
  const prior = execFileSync("git", ["show", `dcf290fbafacb21c73f569005b9cfc68889f183b:${path}`], {encoding: "utf8"});
  check(arcCorePredecessorSource(path, current) === prior,
    "dispatch correction has a new source identity; exact inversion reproduces the pinned provider");
  check(arcCorePredecessorSource(path, current + "// unrelated mutation\n") !== prior,
    "unrelated provider edits cannot inherit the dispatch correction or historical identity");
}
for (const path of ["src/lib/codelab/cognition/nyxNemotronEngineeringCognition.ts", "src/lib/codelab/engine/r3BoundedRepairLoop.ts",
  "src/lib/codelab/assurance/engineeringQualityOracle.ts"]) {
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
function provider(transport: NvidiaNimTransport, model=spec("CURRENT_NYX").model) {
  return NvidiaNimProvider.create({ providerId: "ARC-TEST", model,
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

{
  const notInvoked = {modelEvidenceId:"NOT_INVOKED",modelUsage:{promptTokens:null,completionTokens:null,totalTokens:null},
    providerFailureCategory:null};
  const local = inferUsage([notInvoked]);
  check(local.physicalCalls===0 && local.logicalCalls===0 && local.unknownUsageCalls===0,
    "pre-inference cognition rejection cannot manufacture a physical call or unknown token usage");
  const dispatched = inferUsage([{...notInvoked,modelEvidenceId:"E4-ATTEMPT"}]);
  check(dispatched.physicalCalls===1 && dispatched.logicalCalls===1 && dispatched.unknownUsageCalls===1,
    "dispatched evidence without usage remains counted and explicitly unknown");
  const contradiction = inferUsage([{...notInvoked,delivery:{policy:"nvidia-capacity/1",requestsPerMinute:40,
    scope:"PROCESS_LOCAL_FIXED_NVIDIA_ENDPOINT",httpAttempts:1,rateLimitedResponses:0,transientUnavailableResponses:0,
    timedOutAttempts:0,capacityWaitMs:0,state:"STOPPED",notBeforeEpochMs:null,authorityRenewed:false}}]);
  check(contradiction.physicalCalls===1 && contradiction.unknownUsageCalls===1,
    "NOT_INVOKED label cannot conceal an independently recorded positive HTTP attempt");
}

// Synthetic fixtures exercise the actual shared cognition, authorization, execution and cleanup path.
// They do not establish model reasoning quality or actual ARC accuracy.
for (const configuration of ["SUPER_HOSTED_NONE", "SUPER_HOSTED_BOUNDED"] as const) {
  for (const arm of ["RAW_MODEL", "MODEL_EQUIVALENT_TOOLS", "CURRENT_NYX", "CANDIDATE_NYX"] as const) {
    const armSpec = {...spec(arm), model: "nvidia/nemotron-3-super-120b-a12b"};
    const bodies: any[] = []; const traces: any[] = [];
    const p = NvidiaNimProvider.create({providerId: "SUPER-ARC-PROTOCOL-ONLY", model: armSpec.model,
      authorityMode: "TEST_DOUBLE_ONLY", credentialSource: {sourceIdentity: "test-only", read: () => "synthetic-not-a-real-credential"},
      maxPromptBytes: 64000, maxOutputTokens: 8192, timeoutMs: 1000,
      transport: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return arm === "RAW_MODEL" ? reply(JSON.stringify({predictions: [{attempt_1: [[9, 0]], attempt_2: [[9, 0]]}]}))
          : reply(intent(correct));
      }});
    const output = await createArcAdapter({spec: armSpec, provider: p, candidateCommit: "a".repeat(40), maxOutputTokens: 8192,
      inferenceConfiguration: configuration, preserveProviderArrayBounds: true,
      onIntegrationEvidence: value => traces.push(value)}).invoke(request());
    check(output.failure === null && bodies.length === 1, `${configuration}/${arm} composes with existing execution, not a parallel stack`);
    check(bodies[0].reasoning_effort === (configuration === "SUPER_HOSTED_NONE" ? "none" : "high")
      && !bodies[0].chat_template_kwargs, `${configuration}/${arm} sends documented native hosted controls`);
    check(bodies[0].reasoning_budget === (configuration === "SUPER_HOSTED_BOUNDED" ? 4096 : undefined)
      && bodies[0].max_tokens === 8192, `${configuration}/${arm} preserves total cap and finite output reserve`);
    check(output.usage.reportedTokens === 400 && output.usage.physicalCalls === 1, `${configuration}/${arm} usage remains real provider evidence`);
    if (arm !== "RAW_MODEL") {
      check(traces[0].inferenceConfiguration === configuration && traces[0].reasoningControl === "SUPER_HOSTED_NATIVE"
        && traces[0].reasoningBudgetTokens === (configuration === "SUPER_HOSTED_BOUNDED" ? 4096 : null),
        `${configuration}/${arm} treatment explicitly reported`);
      check(traces[0].cleanupVerified && traces[0].sourceUnchanged && traces[0].productionAuthority === false,
        `${configuration}/${arm} confinement and owned cleanup preserved`);
    }
    rejects(() => NyxNemotronEngineeringCognition.create({cognitionId: "NO-SILENT-SUBSTRATE-SWITCH", provider: p,
      maxPromptBytes: 48000, maxOutputTokens: 8192}), `${configuration}/${arm} Super still requires explicit substrate opt-in`);
  }
}
for (const configuration of ["SUPER_HOSTED_NONE", "SUPER_HOSTED_BOUNDED"] as const)
  rejects(() => arcInferenceConfiguration(configuration, 8192, spec("CURRENT_NYX").model), `${configuration} rejects wrong model`);
for (const arm of ["CURRENT_NYX", "CANDIDATE_NYX"] as const) {
  const bodies: any[] = [], traces: any[] = [];
  const p = NvidiaNimProvider.create({providerId:"QUALITY-TRANSFER-COMPOSITION-ONLY",model:"nvidia/nemotron-3-super-120b-a12b",
    authorityMode:"TEST_DOUBLE_ONLY",credentialSource:{sourceIdentity:"test-only",read:()=>"synthetic-not-a-real-credential"},
    maxPromptBytes:64000,maxOutputTokens:8192,timeoutMs:1000,transport:async(_url,init)=>{
      bodies.push(JSON.parse(String(init?.body)));return reply(intent(correct));}});
  const output = await createArcAdapter({spec:{...spec(arm),model:p.profile().model},provider:p,candidateCommit:"a".repeat(40),
    maxOutputTokens:8192,inferenceConfiguration:"SUPER_HOSTED_NONE",preserveProviderArrayBounds:true,
    providerIntentShape:"DECISION_REQUIRED_FIELDS",...(arm==="CANDIDATE_NYX"?{qualityRepairGuidance:"STRUCTURE_SITES" as const}:{}),
    onIntegrationEvidence:value=>traces.push(value)}).invoke(request());
  check(output.failure===null&&bodies.length===1&&bodies[0].response_format.json_schema.schema.anyOf.length>1,
    `${arm} composes repaired grammar with the existing bounded ARC execution path`);
  check(bodies[0].reasoning_effort==="none"&&bodies[0].max_tokens===8192&&!bodies[0].reasoning_budget,
    `${arm} quality experiment leaves model compute policy unchanged`);
  const prompt = JSON.parse(bodies[0].messages[1].content);
  check(!prompt.measuredQualityRepair&&traces[0].providerIntentShape==="DECISION_REQUIRED_FIELDS"
    &&traces[0].qualityRepairGuidance===(arm==="CANDIDATE_NYX"?"STRUCTURE_SITES":null),
    `${arm} reports actual opt-in treatment without inventing first-attempt rejection feedback`);
  check(traces[0].cleanupVerified&&traces[0].sourceUnchanged&&!traces[0].productionAuthority,
    `${arm} repaired-grammar treatment preserves confinement and lifecycle cleanup`);
}
for (const option of ["providerIntentShape","qualityRepairGuidance"] as const) {
  for (const value of [null,"UNKNOWN",false]) rejects(()=>createArcAdapter({spec:spec("CURRENT_NYX"),
    provider:provider(async()=>reply(intent(correct))),candidateCommit:"a".repeat(40),maxOutputTokens:8192,[option]:value} as never),
    `${option} malformed treatment rejected before inference`);
  for (const arm of ["RAW_MODEL","MODEL_EQUIVALENT_TOOLS"] as const) rejects(()=>createArcAdapter({spec:spec(arm),
    provider:provider(async()=>reply(intent(correct))),candidateCommit:"a".repeat(40),maxOutputTokens:8192,
    [option]:option==="providerIntentShape"?"DECISION_REQUIRED_FIELDS":"STRUCTURE_SITES"} as never),
    `${arm} cannot silently ignore NYX-only ${option} treatment`);
}
for (const invalid of ["UNKNOWN", "", null, 1])
  rejects(() => arcInferenceConfiguration(invalid as never, 8192, "nvidia/nemotron-3-super-120b-a12b"), "unknown inference configuration fails closed");
rejects(() => arcInferenceConfiguration("SUPER_HOSTED_BOUNDED", 1, "nvidia/nemotron-3-super-120b-a12b"), "reasoning needs output reserve");
const superTestProvider = NvidiaNimProvider.create({providerId: "SUPER-VALIDATION-ONLY", model: "nvidia/nemotron-3-super-120b-a12b",
  authorityMode: "TEST_DOUBLE_ONLY", credentialSource: {sourceIdentity: "test-only", read: () => undefined},
  maxPromptBytes: 64000, maxOutputTokens: 8192, timeoutMs: 1000, transport: async () => {throw Error("must-not-dispatch");}});
const superCognitionConfig = {cognitionId: "SUPER-VALIDATION-ONLY", provider: superTestProvider, maxPromptBytes: 48000,
  maxOutputTokens: 8192, comparisonInferencePolicy: "REASONING_JSON" as const, comparisonReasoningControl: "SUPER_HOSTED_NATIVE" as const};
for (const budget of [-1, 8192, 1.5, NaN, Infinity])
  rejects(() => NyxNemotronEngineeringCognition.create({...superCognitionConfig, comparisonReasoningBudgetTokens: budget}), "invalid reasoning budget rejected before dispatch");
rejects(() => NyxNemotronEngineeringCognition.create({...superCognitionConfig, comparisonInferencePolicy: "CONSTRAINED_JSON",
  comparisonReasoningBudgetTokens: 4096}), "no-thinking cannot silently spend reasoning budget");
rejects(() => NyxNemotronEngineeringCognition.create({...superCognitionConfig, comparisonReasoningControl: undefined,
  comparisonReasoningBudgetTokens: 4096}), "budget cannot implicitly select a different substrate");
rejects(() => NyxNemotronEngineeringCognition.create({...superCognitionConfig, comparisonInferencePolicy: undefined}), "native control requires explicit inference policy");
rejects(() => NyxNemotronEngineeringCognition.create({...superCognitionConfig, comparisonReasoningControl: "UNKNOWN" as never}), "unknown native control rejected");
rejects(() => createArcAdapter({spec: spec("CURRENT_NYX"), provider: provider(async () => reply(intent(correct))),
  candidateCommit: "a".repeat(40), maxOutputTokens: 8192, inferenceConfiguration: null as never}), "malformed explicit null cannot silently select default inference");
{
  const traces: any[] = [];
  const unauthorized = JSON.parse(intent(correct)); unauthorized.changes[0].target = "tools/verify.mjs";
  const p = NvidiaNimProvider.create({providerId: "SUPER-NEGATIVE-AUTHORITY-TEST", model: superCognitionConfig.provider.profile().model,
    authorityMode: "TEST_DOUBLE_ONLY", credentialSource: {sourceIdentity: "test-only", read: () => "synthetic-not-a-real-credential"},
    maxPromptBytes: 64000, maxOutputTokens: 8192, timeoutMs: 1000, transport: async () => reply(JSON.stringify(unauthorized))});
  const output = await createArcAdapter({spec: {...spec("CURRENT_NYX"), model: p.profile().model}, provider: p,
    candidateCommit: "a".repeat(40), maxOutputTokens: 8192, inferenceConfiguration: "SUPER_HOSTED_BOUNDED",
    onIntegrationEvidence: value => traces.push(value)}).invoke(request());
  check(output.failure === "AUTHORIZATION_FAILURE" && output.artifact === null && output.internalCandidateAttempts === 0,
    "reasoning-enabled Super cannot modify verifier or turn model intent into authority");
  check(traces[0].cleanupVerified && traces[0].sourceUnchanged, "rejected Super authority request still cleans its owned lifecycle");
}

{
  let time = Date.now(), dispatches = 0;
  const p = NvidiaNimProvider.create({providerId: "ARC-GENERAL-DELIVERY-TEST", model: spec("CURRENT_NYX").model,
    authorityMode: "TEST_DOUBLE_ONLY", credentialSource: {sourceIdentity: "development-only", read: () => "synthetic-not-a-real-credential"},
    maxPromptBytes: 64000, maxOutputTokens: 8192, timeoutMs: 1000,
    testCapacity: new NvidiaCapacityCoordinator({now: () => time, sleep: async ms => {time += ms;}}),
    transport: async () => {
      dispatches++;
      return dispatches === 1 ? new Response(null, {status: 503}) : reply(intent(dispatches === 2 ? bad : correct));
    }});
  const traces: Record<string, unknown>[] = [];
  const adapter = createArcAdapter({spec: spec("CURRENT_NYX"), provider: p, candidateCommit: "a".repeat(40), maxOutputTokens: 8192,
    onIntegrationEvidence: trace => traces.push(trace as unknown as Record<string, unknown>)});
  const output = await adapter.invoke({...request(), remaining: {...limits, maxWallClockMsPerTask: 180000}});
  check(dispatches === 2 && output.usage.physicalCalls === 2 && output.failure === "RESOURCE_EXHAUSTION",
    "provider retry and subsequent repair share one physical budget before dispatch");
  check(output.artifact === null && output.internalCandidateAttempts === 1 && traces[0]?.cleanupVerified && traces[0]?.sourceUnchanged,
    "failed candidate remains failed; local budget rejection cannot bypass acceptance or cleanup");
  check(output.usage.unknownUsageCalls === 1 && output.usage.providerFailures === 1 && output.usage.retries === 1,
    "unknown retry compute and actual provider failure survive local budget rejection");
  const next = await adapter.invoke({...request(), remaining: {...limits, maxWallClockMsPerTask: 180000}});
  check(next.failure === null && next.usage.physicalCalls === 1 && dispatches === 3,
    "a separate task gets its own frozen allowance, not the previous task's depleted budget");
}

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
  "TEXT-PROTOCOL-TOKEN": `export function transform(input) {
    const escaped = ${JSON.stringify({"\\":"\\\\",'"':'\\"',"\n":"\\n","\r":"\\r","\t":"\\t"})};
    return String.fromCharCode(34) + Array.from(input, c => escaped[c] ?? c).join("") + String.fromCharCode(34);
  }`,
  "GROUPED-TRANSITION-TRACE": `export function transform(input) {
    const state={totals:new Map(),value:0,output:[]};
    input.forEach(event=>state.totals.set(event.time,(state.totals.get(event.time)??0)+event.delta));
    [...state.totals].sort(([a],[b])=>a-b).forEach(([time,delta])=>{
      state.value+=delta;if(delta!==0)state.output.push({time,value:state.value});
    });
    return state.output;
  }`,
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
representationReferences["KEYED-MEAN-RECONCILIATION"] = `export function transform(input) {
  const groups = new Map();
  for (const {key,value} of input) {
    if (!groups.has(key)) groups.set(key,[0,0]);
    groups.get(key)[0] += value;
    groups.get(key)[1] += 1;
  }
  return [...groups].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key,[sum,count]]) => ({key,mean:sum/count}));
}`;
representationReferences["BOUNDED-COVERAGE-GAPS"] = `export function transform(input) {
  const ordered = input.intervals.slice().sort((a,b) => a[0]-b[0]);
  const gaps = [];
  let cursor = input.start;
  for (const [start,end] of ordered) {
    if (end <= cursor || start >= input.end || end <= start) continue;
    if (start > cursor) gaps.push([cursor,Math.min(start,input.end)]);
    cursor = Math.max(cursor,Math.min(end,input.end));
  }
  if (cursor < input.end) gaps.push([cursor,input.end]);
  return gaps;
}`;
representationReferences["TRAILING-RMS"] = `export function transform(input) {
  const output = [];
  let squareSum = 0;
  for (let index = 0; index < input.values.length; index++) {
    squareSum += input.values[index] * input.values[index];
    if (index >= input.width) squareSum -= input.values[index-input.width] * input.values[index-input.width];
    output.push(Math.sqrt(squareSum / Math.min(index+1,input.width)));
  }
  return output;
}`;
representationReferences["WEIGHTED-CENTERED-DISPERSION"] = `export function transform(input) {
  const total = {weight:0,sum:0,deviation:0};
  for (const {value,weight} of input) {
    total.weight += weight;
    total.sum += value * weight;
  }
  if (total.weight === 0) return null;
  const mean = total.sum / total.weight;
  for (const {value,weight} of input) total.deviation += weight * (value-mean) ** 2;
  return total.deviation / total.weight;
}`;
representationReferences["BALANCED-PARENTHESIS-SPANS"] = `export function transform(input) {
  const stack = [], pairs = [];
  for (let index = 0; index < input.length; index++) {
    if (input[index] === "(") stack.push(index);
    else if (input[index] === ")") pairs.push({open:stack.pop(),close:index,depth:stack.length+1});
  }
  return pairs.sort((a,b) => a.open-b.open);
}`;
representationReferences["ATOMIC-STOCK-RESERVATION"] = `export function transform(input) {
  const remaining = {...input.stock};
  const accepted = [];
  for (const order of input.orders) {
    if (Object.entries(order.items).every(([sku, amount]) => amount <= (remaining[sku] ?? 0))) {
      accepted.push(order.id);
      for (const [sku, amount] of Object.entries(order.items)) {
        if (Object.hasOwn(remaining, sku)) remaining[sku] -= amount;
      }
    }
  }
  return {accepted, remaining};
}`;
representationReferences["NONDETERMINISTIC-STATE-TRACE"] = `export function transform(input) {
  const trace = [[...new Set(input.start)].sort()];
  for (const symbol of input.symbols) {
    trace.push([...new Set(input.transitions.filter(edge => edge.symbol === symbol
      && trace.at(-1).includes(edge.from)).map(edge => edge.to))].sort());
  }
  return trace;
}`;
representationReferences["SIGNED-RATIONAL-ACCUMULATION"] = `export function transform(input) {
  const sum = [0, 1];
  for (const [numerator, denominator] of input) {
    sum[0] = sum[0] * denominator + numerator * sum[1];
    sum[1] *= denominator;
    let a = Math.abs(sum[0]);
    let b = Math.abs(sum[1]);
    while (b) {const remainder = a % b; a = b; b = remainder;}
    sum[0] /= a; sum[1] /= a;
    if (sum[1] < 0) {sum[0] = -sum[0]; sum[1] = -sum[1];}
  }
  return sum[0] === 0 ? [0, 1] : sum;
}`;
representationReferences["UNICODE-EDIT-METRIC"] = `export function transform(input) {
  const state = {left:Array.from(input.left), right:Array.from(input.right), previous:[]};
  state.previous = Array.from({length:state.right.length + 1}, (_, index) => index);
  for (let i = 1; i <= state.left.length; i++) {
    const current = [i];
    for (let j = 1; j <= state.right.length; j++) {
      current[j] = Math.min(current[j-1] + 1, state.previous[j] + 1,
        state.previous[j-1] + (state.left[i-1] === state.right[j-1] ? 0 : 1));
    }
    state.previous = current;
  }
  return state.previous[state.right.length];
}`;
representationReferences["VERSIONED-EVENT-PROJECTION"] = `export function transform(input) {
  const result = {value:input.initial,applied:[]};
  for (const event of input.events) {
    if (event.generation === input.generation && !result.applied.includes(event.seq)) {
      result.value += event.delta;
      result.applied.push(event.seq);
    }
  }
  return result;
}`;
// Reference scans each elementary interval, independent of an event-sweep implementation.
representationReferences["HALF-OPEN-LOAD-PROJECTION"] = `export function transform(input) {
  const state = {points:[...new Set(input.flatMap(item => [item[0],item[1]]))].sort((a,b) => a-b),
    segments:[],load:0};
  for (let index=1; index<state.points.length; index++) {
    state.load = input.reduce((total,item) => total +
      (item[0]<=state.points[index-1] && item[1]>state.points[index-1] ? item[2] : 0),0);
    if (!state.load) continue;
    if (state.segments.length && state.segments.at(-1)[1]===state.points[index-1]
      && state.segments.at(-1)[2]===state.load) state.segments.at(-1)[1]=state.points[index];
    else state.segments.push([state.points[index-1],state.points[index],state.load]);
  }
  return state.segments;
}`;
// Dense coefficient enumeration differs from sparse map-based convolution.
representationReferences["SIGNED-SPARSE-CONVOLUTION"] = `export function transform(input) {
  const state = {maximum:Math.max(-1,...input.left.map(term => term[0])) +
    Math.max(-1,...input.right.map(term => term[0])),terms:[],coefficient:0,power:0,leftIndex:0,rightIndex:0};
  while (state.power<=state.maximum) {
    state.coefficient=0;
    for (state.leftIndex=0; state.leftIndex<input.left.length; state.leftIndex++) {
      for (state.rightIndex=0; state.rightIndex<input.right.length; state.rightIndex++) {
        state.coefficient += input.left[state.leftIndex][0]+input.right[state.rightIndex][0]===state.power
          ? input.left[state.leftIndex][1]*input.right[state.rightIndex][1] : 0;
      }
    }
    if (state.coefficient) state.terms.push([state.power,state.coefficient]);
    state.power++;
  }
  return state.terms;
}`;
// Exhaustive lexical search is an independent small-fixture check, not a supplied model solution.
representationReferences["LEXICOGRAPHIC-PARTIAL-ORDER"] = `export function transform(input) {
  const nodes = [...input.nodes].sort();
  function visit(prefix) {
    if (prefix.length===nodes.length) return prefix;
    for (const node of nodes) {
      if (!prefix.includes(node) && input.edges.every(([from,to]) => to!==node || prefix.includes(from))) {
        const found = visit([...prefix,node]);
        if (found) return found;
      }
    }
    return null;
  }
  return visit([]);
}`;
// Independent stack traversal, explicit indexed sort, BigInt arithmetic and
// indexed selection references are evaluator-only, never model inputs.
{
  const task=PATTERN_REPAIR_TRANSFER_TASKS[0];
  const files=representationRepositoryFiles(task);
  const encoded=files["src/inputs.mjs"].slice("export const inputs = JSON.parse(".length,-3);
  const inputs=JSON.parse(JSON.parse(encoded));
  check(Object.prototype.hasOwnProperty.call(inputs[4][""],"__proto__"),
    "generated fixture preserves JSON __proto__ as data rather than object-initializer semantics");
  check(theoryDigest(inputs)===theoryDigest(task.privateCases.map(c=>c.input)),
    "generated private input population is exactly the frozen JSON data");
  check(!files["src/inputs.mjs"].includes(JSON.stringify(task.privateCases)),
    "safe data serialization does not leak private expected results");
}
representationReferences["TYPED-LEAF-PATHS"] = `export function transform(input) {
  const stack=[[input,[]]], output=[];
  while(stack.length) {
    const [value,path]=stack.pop();
    if(value!==null && typeof value==="object") {
      for(const key of Object.keys(value).reverse()) {
        stack.push([value[key],[...path,Array.isArray(value)?Number(key):key]]);
      }
    } else output.push([path,value]);
  }
  return output;
}`;
representationReferences["STABLE-NULL-AWARE-ORDER"] = `export function transform(input) {
  return input.map((row,index)=>({row,index})).sort((a,b)=>
    (a.row.group>b.row.group)-(a.row.group<b.row.group) ||
    (b.row.score??-Infinity)-(a.row.score??-Infinity) || a.index-b.index)
    .map(item=>({...item.row}));
}`;
representationReferences["SIGNED-MODULAR-MATRIX"] = `export function transform(input) {
  const modulus=BigInt(input.mod);
  return input.left.map(row=>input.right[0].map((_,j)=>
    Number((row.reduce((sum,x,k)=>sum+BigInt(x)*BigInt(input.right[k][j]),0n)%modulus+modulus)%modulus)));
}`;
representationReferences["DEADLINE-CAPACITY-SELECTION"] = `export function transform(input) {
  let remaining=input.capacity;
  const selected=[];
  for(const record of input.jobs.map((job,index)=>({job,index})).sort((a,b)=>
    a.job.deadline-b.job.deadline || a.index-b.index)) {
    if(record.job.size<=remaining) {
      remaining-=record.job.size;
      selected.push(record.index);
    }
  }
  return {selected,used:input.capacity-remaining};
}`;
// Test-only references validate fixtures and admission; never passed to inference.
representationReferences["STRICT-QUOTED-ROWS"] = `export function transform(input) {
  const s = {rows: [], row: [], position: 0, token: /("(?:[^"]|"")*"|[^",\\r\\n]*)(,|\\r\\n|\\n|$)/gy};
  while (s.position < input.length) {
    const match = s.token.exec(input);
    if (!match) return {error: "MALFORMED"};
    s.position = s.token.lastIndex;
    s.row.push(match[1].startsWith('"') ? match[1].slice(1, -1).replace(/""/g, '"') : match[1]);
    if (match[2] !== ",") { s.rows.push(s.row); s.row = []; }
  }
  if (input.endsWith(",")) { s.row.push(""); s.rows.push(s.row); }
  return {rows: s.rows};
}`;
representationReferences["DECIMAL-HALF-EVEN"] = `export function transform(input) {
  const s = {negative: input.text.startsWith("-"), pieces: input.text.replace(/^-/, "").split("."),
    factor: 1n, remainder: 0n, digits: ""};
  s.pieces.push("");
  let value = BigInt(s.pieces.join(""));
  if (s.pieces[1].length > input.places) {
    s.factor = 10n ** BigInt(s.pieces[1].length - input.places);
    s.remainder = value % s.factor; value /= s.factor;
    if (s.remainder * 2n > s.factor || s.remainder * 2n === s.factor && value % 2n === 1n) value++;
  } else value *= 10n ** BigInt(input.places - s.pieces[1].length);
  s.digits = value.toString().padStart(input.places + 1, "0");
  return (s.negative && value !== 0n ? "-" : "") + (input.places
    ? s.digits.slice(0, -input.places) + "." + s.digits.slice(-input.places) : s.digits);
}`;
representationReferences["NESTED-CELL-TRANSACTIONS"] = `export function transform(input) {
  const s = {cells: new Map(input.initial), frames: [], reads: []};
  const order = (a, b) => (a[0] > b[0]) - (a[0] < b[0]);
  for (const [index, op] of input.ops.entries()) {
    if (["set", "delete"].includes(op.op)) { s.cells[op.op](op.key, op.value); continue; }
    if (op.op === "read") { s.reads.push({exists: s.cells.has(op.key),
      value: s.cells.has(op.key) ? s.cells.get(op.key) : null}); continue; }
    if (op.op === "begin") { s.frames.push(new Map(s.cells)); continue; }
    if (["commit", "rollback"].includes(op.op) && s.frames.length) {
      s.previous = s.frames.pop();
      if (op.op === "rollback") s.cells = s.previous;
      continue;
    }
    return {error: index, cells: input.initial.map(row => [...row]).sort(order), reads: [], open: 0};
  }
  return {error: null, cells: Array.from(s.cells).sort(order),
    reads: s.reads, open: s.frames.length};
}`;
representationReferences["REACHABLE-EXPRESSION-GRAPH"] = `export function transform(input) {
  const s = {nodes: new Map(), cache: new Map(), active: new Set()};
  for (const node of input.nodes) s.nodes.set(node.id, node);
  function solve(id) {
    if (s.cache.has(id)) return s.cache.get(id);
    if (s.active.has(id) || !s.nodes.has(id)) throw new Error("invalid");
    const n = s.nodes.get(id);
    s.active.add(id);
    s.cache.set(id, n.op === "const" ? n.value : n.args.reduce((a, key) =>
      n.op === "add" ? a + solve(key) : a * solve(key), n.op === "add" ? 0 : 1));
    s.active.delete(id);
    return s.cache.get(id);
  }
  try { return {values: input.targets.map(solve)}; } catch { return {error: "INVALID"}; }
}`;
representationReferences["WEIGHTED-UNICODE-EDIT"] = `export function transform(input) {
  const state = {left: [...input.from], right: [...input.to], grid: []};
  for (let i = 0; i <= state.left.length; i++) {
    state.grid[i] = [i * input.deleteCost];
    for (let j = 1; j <= state.right.length; j++) {
      state.grid[i][j] = i === 0 ? j * input.insertCost : Math.min(
        state.grid[i - 1][j] + input.deleteCost,
        state.grid[i][j - 1] + input.insertCost,
        state.grid[i - 1][j - 1] + (state.left[i - 1] === state.right[j - 1] ? 0 : input.replaceCost));
    }
  }
  return state.grid[state.left.length][state.right.length];
}`;
representationReferences["EXACT-RATIONAL-AGGREGATE"] = `export function transform(input) {
  const state = {numerator: 0n, denominator: 1n, first: 0n, second: 0n};
  for (const [numerator, denominator] of input) {
    state.numerator = state.numerator * BigInt(denominator) + BigInt(numerator) * state.denominator;
    state.denominator *= BigInt(denominator);
  }
  if (state.denominator < 0n) {
    state.numerator = -state.numerator;
    state.denominator = -state.denominator;
  }
  state.first = state.numerator < 0n ? -state.numerator : state.numerator;
  state.second = state.denominator;
  while (state.second) [state.first, state.second] = [state.second, state.first % state.second];
  return [(state.numerator / state.first).toString(), (state.denominator / state.first).toString()];
}`;
representationReferences["VERSIONED-REGISTER-RECONCILIATION"] = `export function transform(input) {
  const cells = new Map();
  for (const [index, event] of input.entries()) {
    const previous = cells.get(event.key);
    if (previous && previous[1] > event.version) continue;
    if (previous && previous[1] === event.version && previous[2] !== event.value) return {error: index};
    cells.set(event.key, [event.key, event.version, event.value]);
  }
  return {rows: [...cells.values()].sort((a, b) => (a[0] > b[0]) - (a[0] < b[0]))};
}`;
representationReferences["BOUNDED-BOOLEAN-MODELS"] = `export function transform(input) {
  const state = {models: [], bits: "", mask: 0};
  for (; state.mask < 2 ** input.variables; state.mask++) {
    state.bits = input.variables ? state.mask.toString(2).padStart(input.variables, "0") : "";
    if (input.clauses.every(clause => clause.some(literal =>
      state.bits[Math.abs(literal) - 1] === (literal > 0 ? "1" : "0")))) state.models.push(state.bits);
  }
  return {models: state.models};
}`;
{
  const control = nativeReasoningTransferConfiguration("NATIVE_NONE");
  const treatment = nativeReasoningTransferConfiguration("NATIVE_BOUNDED_REASONING");
  check(control.providerIntentShape === treatment.providerIntentShape
    && control.comparisonReasoningControl === treatment.comparisonReasoningControl,
    "native comparison keeps generation grammar and actual model control identical");
  check(control.comparisonInferencePolicy === "CONSTRAINED_JSON" && control.comparisonReasoningBudgetTokens === undefined,
    "native control disables thinking without a hidden budget or default mutation");
  check(treatment.comparisonInferencePolicy === "REASONING_JSON" && treatment.comparisonReasoningBudgetTokens === 2048,
    "native reasoning uses the existing finite reservation inside the unchanged output ceiling");
  rejects(() => nativeReasoningTransferConfiguration("UNLIMITED"), "unknown native arm cannot silently inherit a policy");
}
representationReferences["STABLE-FULL-OUTER-JOIN"] = `export function transform(input) {
  const rows = [];
  const matchedRight = new Set();
  for (const left of input.left) {
    let matched = false;
    for (const [index, right] of input.right.entries()) {
      if (left[0] === right[0]) {
        rows.push([left[0], left[1], right[1]]);
        matchedRight.add(index);
        matched = true;
      }
    }
    if (!matched) rows.push([left[0], left[1], null]);
  }
  for (const [index, right] of input.right.entries()) {
    if (!matchedRight.has(index)) rows.push([right[0], null, right[1]]);
  }
  return rows;
}`;
representationReferences["UTF16-LENGTH-FRAMES"] = `export function transform(input) {
  const frames = [];
  let cursor = 0;
  while (cursor < input.length) {
    const header = /^(0|[1-9][0-9]*):/.exec(input.slice(cursor));
    if (!header) return {error: cursor};
    const length = Number(header[1]);
    if (!Number.isSafeInteger(length) || input[cursor + header[0].length + length] !== ",") {
      return {error: cursor};
    }
    frames.push(input.slice(cursor + header[0].length, cursor + header[0].length + length));
    cursor += header[0].length + length + 1;
  }
  return {frames};
}`;
representationReferences["EXACT-AFFINE-SKIP"] = `export function transform(input) {
  const modulus = BigInt(input.modulus);
  let remaining = BigInt(input.steps);
  let power = [BigInt(input.a) % modulus, BigInt(input.c) % modulus];
  let accumulated = [1n, 0n];
  while (remaining > 0n) {
    if (remaining % 2n) accumulated = [power[0] * accumulated[0] % modulus,
      (power[0] * accumulated[1] + power[1]) % modulus];
    power = [power[0] * power[0] % modulus, (power[0] * power[1] + power[1]) % modulus];
    remaining /= 2n;
  }
  return (((accumulated[0] * BigInt(input.seed) + accumulated[1]) % modulus + modulus) % modulus).toString();
}`;
representationReferences["WEIGHTED-INTERVAL-OPTIMUM"] = `export function transform(input) {
  const intervals = [...input].sort((left, right) => left.end - right.end);
  const optimum = [0];
  for (let index = 0; index < intervals.length; index++) {
    let predecessor = index - 1;
    while (predecessor >= 0 && intervals[predecessor].end > intervals[index].start) predecessor--;
    optimum[index + 1] = Math.max(optimum[index], intervals[index].weight + optimum[predecessor + 1]);
  }
  return optimum[intervals.length];
}`;
{
  const control = originalBudgetTransferConfiguration("STRUCTURE_SITES_CONTROL");
  const {structuralBudgetGuidance, ...treatment} = originalBudgetTransferConfiguration("ORIGINAL_BUDGET");
  check(structuralBudgetGuidance === "PUBLIC_ORIGINAL_STATE" && JSON.stringify(control) === JSON.stringify(treatment),
    "original-budget ablation changes exactly one host prompt configuration");
  check(control.qualityRepairGuidance === "STRUCTURE_SITES" && control.comparisonInferencePolicy === "CONSTRAINED_JSON"
    && control.providerIntentShape === "DECISION_REQUIRED_FIELDS_AND_LENGTHS",
    "both arms preserve source-site repair, native-none allocation and length-bounded grammar");
  rejects(() => originalBudgetTransferConfiguration("RELAX_QUALITY"), "unknown budget arm cannot weaken admission");
  check(originalBudgetWireControlVerified("ORIGINAL_BUDGET",[
    {initialCandidateState:true,originalBudgetPresented:true},
    {initialCandidateState:true,originalBudgetPresented:true},
    {initialCandidateState:false,originalBudgetPresented:false}]),
    "protocol correction or capacity retry stays pre-candidate without confusing physical dispatch with phase");
  check(originalBudgetWireControlVerified("STRUCTURE_SITES_CONTROL",[
    {initialCandidateState:true,originalBudgetPresented:false},
    {initialCandidateState:false,originalBudgetPresented:false}]),
    "control cannot receive treatment guidance in either phase");
  for (const controls of [[],[{originalBudgetPresented:true}],
    [{initialCandidateState:false,originalBudgetPresented:true}],
    [{initialCandidateState:true,originalBudgetPresented:false}]])
    check(!originalBudgetWireControlVerified("ORIGINAL_BUDGET",controls),
      "missing phase or changed guidance cannot establish a valid wire control");
  rejects(() => originalBudgetWireControlVerified("UNKNOWN",[]),"unknown wire arm rejected rather than reported verified");
}
representationReferences["ORDERED-RUN-FOLD"] = `export function transform(input) {
  const rows = [];
  for (const [symbol, count] of input) {
    if (count === 0) continue;
    if (rows.length && rows[rows.length - 1][0] === symbol) rows[rows.length - 1][1] += count;
    else rows.push([symbol, count]);
  }
  return rows;
}`;
representationReferences["ORDER-PRESERVING-INTERLEAVE"] = `export function transform(input) {
  if (input.left.length + input.right.length !== input.merged.length) return false;
  const possible = Array(input.right.length + 1).fill(false);
  for (let left = 0; left <= input.left.length; left++) {
    possible[0] = input.left.slice(0, left) === input.merged.slice(0, left);
    for (let right = 1; right <= input.right.length; right++) {
      possible[right] = (possible[right] && input.left[left - 1] === input.merged[left + right - 1])
        || (possible[right - 1] && input.right[right - 1] === input.merged[left + right - 1]);
    }
  }
  return possible[input.right.length];
}`;
representationReferences["HISTOGRAM-MAX-RECTANGLE"] = `export function transform(input) {
  const stack = [];
  let maximum = 0;
  for (let index = 0; index <= input.length; index++) {
    while (stack.length && input[stack[stack.length - 1]] > (input[index] ?? 0)) {
      const popped = stack.pop();
      maximum = Math.max(maximum, input[popped] * (index - (stack.length ? stack[stack.length - 1] : -1) - 1));
    }
    stack.push(index);
  }
  return maximum;
}`;
representationReferences["DEPENDENCY-CRITICAL-FINISH"] = `export function transform(input) {
  const remaining = Array(input.durations.length).fill(0);
  const finish = input.durations.slice();
  const ready = [];
  for (const [, to] of input.edges) remaining[to]++;
  for (let node = 0; node < remaining.length; node++) if (remaining[node] === 0) ready.push(node);
  for (let cursor = 0; cursor < ready.length; cursor++) {
    for (const [from, to] of input.edges) {
      if (from === ready[cursor]) {
        finish[to] = Math.max(finish[to], finish[from] + input.durations[to]);
        if (--remaining[to] === 0) ready.push(to);
      }
    }
  }
  return ready.length === input.durations.length ? Math.max(0, ...finish) : null;
}`;
{
  const control=behaviorRepairTransferConfiguration("QUALITY_SITES_CONTROL");
  const {behaviorRepairGuidance,...treatment}=behaviorRepairTransferConfiguration("BINDING_USES");
  check(behaviorRepairGuidance==="BINDING_USES" && JSON.stringify(control)===JSON.stringify(treatment),
    "fresh binding-use ablation changes one quality-only host prompt option");
  check(control.structuralBudgetGuidance==="PUBLIC_ORIGINAL_STATE" && control.qualityRepairGuidance==="STRUCTURE_SITES",
    "both arms retain identical original-state and site guidance, grammar and native-none configuration");
  check(behaviorRepairWireControlVerified("BINDING_USES",[{qualityRepairPhase:false,bindingUsesPresented:false},
    {qualityRepairPhase:true,bindingUsesPresented:true}]),"binding context appears only in quality repair phase");
  check(behaviorRepairWireControlVerified("QUALITY_SITES_CONTROL",[{qualityRepairPhase:true,bindingUsesPresented:false}]),
    "control receives no treatment after rejection");
  for(const controls of [[],[{bindingUsesPresented:true}],[{qualityRepairPhase:false,bindingUsesPresented:true}],
    [{qualityRepairPhase:true,bindingUsesPresented:false}]]) check(!behaviorRepairWireControlVerified("BINDING_USES",controls),
      "unknown phase, omitted required context or unsolicited treatment cannot establish valid comparison");
  rejects(()=>behaviorRepairTransferConfiguration("RELAX_QUALITY"),"unknown binding arm fails closed");
}
representationReferences["STABLE-KEYED-BAG-DIFFERENCE"] = `export function transform(input) {
  const counts = new Map();
  const remaining = [];
  for (const key of input.right) counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const record of input.left) {
    if ((counts.get(record.key) ?? 0) > 0) counts.set(record.key, counts.get(record.key) - 1);
    else remaining.push(structuredClone(record));
  }
  return remaining;
}`;
representationReferences["COIN-COMBINATION-COUNT"] = `export function transform(input) {
  const counts = Array(input.amount + 1).fill(0);
  counts[0] = 1;
  for (const coin of input.coins) {
    for (let amount = coin; amount <= input.amount; amount++) counts[amount] += counts[amount - coin];
  }
  return counts[input.amount];
}`;
representationReferences["MEDIAN-ABSOLUTE-DEVIATION"] = `export function transform(input) {
  if (!input.length) return null;
  function median(values) {
    values.sort((left, right) => left - right);
    return (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2;
  }
  const center = median([...input]);
  return {median:center, mad:median(input.map(value => Math.abs(value - center)))};
}`;
representationReferences["DIRECTED-HOP-DISTANCES"] = `export function transform(input) {
  if (!input.adjacency.length) return [];
  const distances = Array(input.adjacency.length).fill(null);
  const queue = [input.start];
  distances[input.start] = 0;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    for (let next = 0; next < distances.length; next++) {
      if (input.adjacency[queue[cursor]][next] && distances[next] === null) {
        distances[next] = distances[queue[cursor]] + 1;
        queue.push(next);
      }
    }
  }
  return distances;
}`;
{
  const control=localRefactorTransferConfiguration("QUALITY_SITES_CONTROL");
  const {localRefactorGuidance,...treatment}=localRefactorTransferConfiguration("GUARDED_REFACTOR_PROPOSALS");
  check(localRefactorGuidance==="GUARDED_PROPOSALS" && JSON.stringify(control)===JSON.stringify(treatment),
    "concrete-proposal comparison changes only optional quality-phase proposal machinery");
  check(control.structuralBudgetGuidance==="PUBLIC_ORIGINAL_STATE" && control.qualityRepairGuidance==="STRUCTURE_SITES"
    && !Object.hasOwn(control,"behaviorRepairGuidance"),"falsified binding-inventory intervention is not silently promoted into new control");
  check(localRefactorWireControlVerified("GUARDED_REFACTOR_PROPOSALS",[
    {qualityRepairPhase:false,localProposalsPresented:false,localProposalCount:0},
    {qualityRepairPhase:true,localProposalsPresented:false,localProposalCount:0},
    {qualityRepairPhase:true,localProposalsPresented:true,localProposalCount:1}]),
    "valid empty proposal coverage is distinct from exercised actionable repair");
  check(localRefactorWireControlVerified("QUALITY_SITES_CONTROL",[
    {qualityRepairPhase:true,localProposalsPresented:false,localProposalCount:0}]),"simpler control has no proposal source or compute");
  for(const controls of [[],[{qualityRepairPhase:true,localProposalsPresented:false,localProposalCount:1}],
    [{qualityRepairPhase:true,localProposalsPresented:true,localProposalCount:0}],
    [{qualityRepairPhase:false,localProposalsPresented:true,localProposalCount:1}],
    [{qualityRepairPhase:true,localProposalsPresented:true,localProposalCount:-1}],
    [{qualityRepairPhase:true,localProposalsPresented:true}]])
    check(!localRefactorWireControlVerified("GUARDED_REFACTOR_PROPOSALS",controls),"missing phase, wrong state and malformed proposal count fail wire verification");
  rejects(()=>localRefactorTransferConfiguration("AUTO_APPLY"),"unrecognized proposal comparison cannot grant authority");
}
{
  const {localRefactorGuidance:controlMode,...control}=evaluationOrderTransferConfiguration("GUARDED_V2_CONTROL");
  const {localRefactorGuidance:treatmentMode,...treatment}=evaluationOrderTransferConfiguration("EVALUATION_ORDER_PROPOSALS");
  check(controlMode==="GUARDED_PROPOSALS" && treatmentMode==="EVALUATION_ORDER_PROPOSALS"
    && theoryDigest(control)===theoryDigest(treatment),"evaluation-order comparison changes only opt-in proposal grammar");
  for(const [variant,version] of [["GUARDED_V2_CONTROL","nyx-local-refactor-proposals/2"],
    ["EVALUATION_ORDER_PROPOSALS","nyx-local-refactor-proposals/3"]]) {
    const empty={qualityRepairPhase:false,localProposalsPresented:false,localProposalCount:0,localProposalVersion:null};
    const active={qualityRepairPhase:true,localProposalsPresented:true,localProposalCount:1,localProposalVersion:version};
    check(evaluationOrderWireControlVerified(variant,[empty,{...empty,qualityRepairPhase:true},active]),
      "recorded control phase and exact proposal version verify both arms, including no-op coverage");
    for(const invalid of [[],[{...active,qualityRepairPhase:false}],[{...active,localProposalCount:0}],
      [{...active,localProposalVersion:"future/99"}],[{...empty,localProposalVersion:version}],
      [{...active,localProposalCount:NaN}]])
      check(!evaluationOrderWireControlVerified(variant,invalid),"unbound phase, changed version and malformed count fail closed");
  }
  rejects(()=>evaluationOrderTransferConfiguration("AUTO_APPLY"),"comparison cannot request automatic mutation");
}
// Conditional tests deliberately supply a correct but over-budget algorithm.
// This is not model discovery or a claim that those supplied solutions are NYX's.
const conditionalReferences: Record<string,string> = {
  "BATCH-ENERGY-BILL":'export function transform(input) {\n  return input.watts * input.minutes / 60000 * input.count\n    * (1 + input.lossPercent / 100) * input.rate - input.credit;\n}\n',
  "SIGNED-TEXT-BUCKET":'export function transform(input) {\n  return ((input.text.trim().length + input.offset) % input.modulus\n    + input.modulus) % input.modulus + input.bias;\n}\n',
  "HORNER-RESIDUAL":'export function transform(input) {\n  let value = 0;\n  for (const coefficient of input.coefficients) value = value * input.x + coefficient;\n  return Math.round((value - input.target) * input.scale * 1000) / 1000;\n}\n',
  "SATURATING-RECURRENCE":'export function transform(input) {\n  let state = input.initial;\n  for (const next of input.values) {\n    state = Math.max(input.low, Math.min(input.high, input.alpha * next + (1 - input.alpha) * state));\n  }\n  return state;\n}\n',
};
for (const task of CONDITIONAL_REFACTOR_REPAIR_TASKS) {
  for (const source of [task.suppliedCandidate,conditionalReferences[task.id],
    proposeNyxLocalRefactors("src/transform.mjs",task.suppliedCandidate,true)?.proposedSource].filter((s):s is string=>typeof s==="string")) {
    const implementation=new Function(source.replace("export function","return function"))() as (input:unknown)=>unknown;
    for (const example of [...task.publicCases,...task.privateCases]) {
      const value=structuredClone(example.input),before=theoryDigest(value);
      check(theoryDigest(implementation(value))===theoryDigest(example.expected)&&theoryDigest(value)===before,
        `${task.id} supplied, independent reference and proposed source preserve frozen literal cases`);
    }
  }
  for (const variant of ["GUARDED_V2_CONTROL","EVALUATION_ORDER_PROPOSALS"]) {
    let realPhaseCalls=0,phaseBound=false,proposalBound=false;
    const live=NyxNemotronEngineeringCognition.create({cognitionId:"CONDITIONAL-REPAIR-TEST-ONLY",
      provider:provider(async (_url,init)=>{
        realPhaseCalls++;
        const body=JSON.parse(String(init.body)),prompt=JSON.parse(body.messages[1].content);
        phaseBound=prompt.activeRepairDriver.kind==="QUALITY_REJECTION"&&prompt.hypothesisHistory.length===1;
        proposalBound=variant==="GUARDED_V2_CONTROL"?(!prompt.localRefactorProposals||prompt.localRefactorProposals.version==="nyx-local-refactor-proposals/2")
          :proposeNyxLocalRefactors("src/transform.mjs",task.suppliedCandidate,true)
            ?prompt.localRefactorProposals?.version==="nyx-local-refactor-proposals/3":!prompt.localRefactorProposals;
        const response=JSON.parse(intent(conditionalReferences[task.id]));
        response.causalHypothesis="Preserve the supplied algorithm while reducing redundant local structure.";
        response.invariant="Preserve every specified domain boundary and input.";
        response.counterexamples=["Empty inputs, signed values and boundary parameters"];
        return reply(JSON.stringify(response));
      },"nvidia/nemotron-3-super-120b-a12b"),maxPromptBytes:48000,maxOutputTokens:8192,sourceRepresentation:"LINES",intentCompilationMode:"SAFE_CANONICALIZATION",
      repairFeedbackPolicy:"TRANSIENT_REJECTED_SOURCE_WINDOW",...evaluationOrderTransferConfiguration(variant)});
    const composition=suppliedCandidateThenLive(live,task.suppliedCandidate);
    const session=await R3BenchmarkRepositorySession.create(representationRepositoryFiles(task),"a".repeat(40),Date.now()+20000,12000);
    let closed;
    try {
      const baseline=await session.baseline();
      const loop=R3BoundedRepairLoop.create({loopId:`CONDITIONAL-${task.id}-${variant}`,evaluatorVersion:"conditional-test/1",
        observerIdentity:"CONDITIONAL-OMEGA-TEST",cognition:composition.cognition,
        candidateBuilder:{builderIdentity:"EXISTING-R3",prepare:h=>session.prepare(h)},
        maxIterations:2,maxModelInteractions:2,maxCognitionCorrections:0,maxWallClockMs:18000,
        maxChangesPerIteration:1,maxPatchBytesPerIteration:12000,maxDiagnosisCharacters:1500});
      const result=await loop.run({schemaVersion:1,repairRequestId:"CONDITIONAL",objective:task.objective,
        initialObservation:baseline.observation,initialFiles:baseline.prepared.files,allowedMutationPaths:["src/transform.mjs"],
        availableEvidence:[],allowedVerificationToolIds:["TEST"],baselineExecutions:[{toolId:"TEST",result:baseline.result}],
        observedAtEpochMs:Date.now()});
      check(result.iterations.length===2&&result.iterations[0].functionallyPassed&&result.iterations[0].candidateAdmission?.decision==="REJECTED"
        &&result.iterations[0].hypothesis.changes[0].replacementContentHash===contentHash(task.suppliedCandidate),
        `${task.id} actual common supplied source passes execution and fails unchanged cumulative quality`);
      check(composition.fixtureEvidence.length===1&&composition.fixtureEvidence[0].evidenceClass==="E3"&&realPhaseCalls===1,
        "supplied fixture is separate E3 work and only the next request reaches the existing reasoning adapter");
      check(phaseBound&&proposalBound,`${variant} passes real quality feedback, not manufactured diagnostic text`);
      const last=result.iterations.at(-1);
      check(result.outcome==="FUNCTIONALLY_REPAIRED_VERIFIED"&&last?.candidateAdmission?.decision==="ADMITTED"
        &&scoreRepresentationArtifact(task,last.verifications[0].execution.evidence.stdout??"").accepted,
        `${task.id} independent reference proves conditional repair feasibility without changing any gate`);
    } finally {closed=await session.close();}
    check(closed.sourceUnchanged&&closed.cleanupVerified,"conditional composition preserves source and cleans all lifecycle artifacts");
  }
}
rejects(()=>suppliedCandidateThenLive({} as NyxNemotronEngineeringCognition,"x".repeat(12001)),"conditional fixture cannot exceed patch scope");

// Test-only reference witnesses establish oracle feasibility; none is a model seed.
representationReferences["QUOTE-DISCOUNT-TAX"] = "export function transform(input){return Math.round((input.price*input.quantity*(1-input.discountPercent/100)*(1+input.taxPercent/100)+input.fee)*100)/100;}";
representationReferences["QUADRATIC-DRAG-UNITS"] = "export function transform(input){const speed=input.speedKmh/3.6;return Math.round(0.5*input.density*speed*speed*input.dragCoefficient*input.area*1000)/1000;}";
representationReferences["NOISY-CHANNEL-CAPACITY"] = "export function transform(input){const rate=input.bandwidth*Math.log2(1+input.signal/input.noise)*input.efficiency-input.overhead;return Math.round(Math.max(0,rate)*1000)/1000;}";
representationReferences["ROOT-MEAN-SQUARE"] = "export function transform(input){if(!input.length)return null;let total=0;for(const value of input)total+=value*value;return Math.round(Math.sqrt(total/input.length)*1000)/1000;}";
for(const task of EVALUATION_ORDER_TRANSFER_TASKS) {
  const reference = new Function(representationReferences[task.id].replace("export function","return function")) as () => (input:unknown) => unknown;
  for(const example of [...task.publicCases,...task.privateCases]) {
    const value=structuredClone(example.input),before=theoryDigest(value);
    check(theoryDigest(reference()(value))===theoryDigest(example.expected) && before===theoryDigest(value),
      "fresh literal expectations agree with a test-only witness while preserving inputs");
  }
  check(task.privateCases.every(example=>!task.publicCases.some(publicCase=>theoryDigest(publicCase.input)===theoryDigest(example.input))),
    "private transfer cases remain distinct from public examples");
}
for (const task of [...SOURCE_REPRESENTATION_TASKS, ...ARRAY_BOUND_TRANSFER_TASKS,...SOURCE_LITERAL_TRANSFER_TASKS,...MEASURED_QUALITY_TRANSFER_TASKS,...QUALITY_SITE_TRANSFER_TASKS,...DECISION_CONTRACT_TRANSFER_TASKS,...BOUNDED_CONTRACT_TRANSFER_TASKS,...PATTERN_REPAIR_TRANSFER_TASKS,...LENGTH_GRAMMAR_TRANSFER_TASKS,...NATIVE_REASONING_TRANSFER_TASKS,...ORIGINAL_BUDGET_TRANSFER_TASKS,...BEHAVIOR_REPAIR_TRANSFER_TASKS,...LOCAL_REFACTOR_TRANSFER_TASKS,...EVALUATION_ORDER_TRANSFER_TASKS]) {
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
{
  const base={accepted:false,infrastructureFailure:false,reason:"repair_iteration_budget_exhausted",
    qualityRejected:true,publicFailed:false,privateFailure:null};
  check(classifyRepresentationFailure(base)==="QUALITY_REJECTION","exhausted quality repairs classified by genuine defect rather than generic resource budget");
  check(classifyRepresentationFailure({...base,reason:"repair_wall_clock_budget_exhausted"})==="RESOURCE_EXHAUSTION",
    "actual wall-clock exhaustion remains a separate resource failure");
  check(classifyRepresentationFailure({...base,reason:"nvidia_provider_http_503"})==="PROVIDER_FAILURE",
    "failed provider repair is not concealed by a previous quality rejection");
  check(classifyRepresentationFailure({...base,latestSchemaFailure:{reason:"NON_JSON",diagnostics:[]}})==="SCHEMA_FAILURE",
    "latest malformed response is not concealed by earlier rejected candidate");
  check(classifyRepresentationFailure({...base,latestSchemaFailure:{reason:"OUTPUT_TRUNCATED",diagnostics:[]}})==="TRUNCATION",
    "latest truncation remains separately attributable");
  check(classifyRepresentationFailure({...base,latestSchemaFailure:{reason:"SCHEMA_INVALID",diagnostics:[{category:"SOURCE_QUALITY_INVALID",observed:"syntax_error_line_8"}]}})==="SYNTAX_FAILURE",
    "syntax failure not misrepresented as hidden-case reasoning failure");
  check(classifyRepresentationFailure({...base,latestSchemaFailure:{reason:"SCHEMA_INVALID",diagnostics:[{category:"SEMANTIC_REPAIR_INVALID",observed:"patch_bound_exceeded"}]}})==="SOURCE_BOUND_REJECTION",
    "valid JSON exceeding the source byte cap remains a bound rejection, not a serialization failure");
  check(classifyRepresentationFailure({...base,latestSchemaFailure:{reason:"SCHEMA_INVALID",diagnostics:[{category:"REPEATED_FALSIFIED_STRATEGY",observed:"no_op_repair"}]}})==="SEMANTIC_INTENT_FAILURE",
    "valid JSON repeating the unchanged rejected candidate remains a semantic intent failure");
  check(classifyRepresentationFailure({...base,latestSchemaFailure:{reason:"SCHEMA_INVALID",diagnostics:[{category:"SEMANTIC_REPAIR_INVALID",observed:"invalid_item"}]}})==="SEMANTIC_INTENT_FAILURE",
    "valid JSON with invalid counterexample content is not called a transport or schema decoding failure");
  check(classifyRepresentationFailure({...base,qualityRejected:false,privateFailure:"HIDDEN_CASE_FAILURE"})==="HIDDEN_CASE_FAILURE",
    "private reasoning failure distinct from unavailable or unreached evidence");
  check(classifyRepresentationFailure({...base,qualityRejected:false})==="INSUFFICIENT_EVIDENCE",
    "unreached acceptance oracle never manufactured into a model failure");
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
  check(sourceLiteralStructureDigest('export const value = "a";')===sourceLiteralStructureDigest("export const value='a';\r\n"),
    "source diagnostic recognizes harmless literal spelling and whitespace without executing it");
  check(sourceLiteralStructureDigest('export const value = "\\n";')!==sourceLiteralStructureDigest('export const value = "\\\\n";'),
    "source diagnostic does not equate escaped newline with literal backslash and n");
  check(sourceLiteralStructureDigest('export const value = "a";')!==sourceLiteralStructureDigest('export const value = "b";')
    &&sourceLiteralStructureDigest('export const value = "a";')!==sourceLiteralStructureDigest('export let value = "a";'),
    "source diagnostic preserves literal values and binding semantics");
}
{
  const task=SOURCE_REPRESENTATION_TASKS[0];
  const stdout="ENGINEERING_PREDICTIONS "+JSON.stringify(task.privateCases.map(c=>({value:c.expected,inputUnchanged:true,resultDetached:true})));
  const input={publicAccepted:true,qualityAccepted:true,verificationStdout:stdout,loopVerified:true};
  check(assessRepresentationCandidate(task,input).accepted,"combined candidate acceptance still requires all original gates");
  const rejected=assessRepresentationCandidate(task,{...input,qualityAccepted:false});
  check(rejected.functionalAccepted&&!rejected.accepted&&rejected.score?.accepted&&rejected.privateScorerWorkUnits===task.privateCases.length,
    "quality-rejected candidate still receives independent functional accounting without admission");
  check(!assessRepresentationCandidate(task,{...input,publicAccepted:false}).functionalAccepted,
    "private success cannot override failed public behavior");
  check(!assessRepresentationCandidate(task,{...input,loopVerified:false}).accepted,
    "successful scores cannot override an unverified engineering loop");
  const missing=assessRepresentationCandidate(task,{...input,verificationStdout:null});
  check(!missing.accepted&&missing.score===null&&missing.privateScorerWorkUnits===0,
    "unreached deterministic verification is not a hidden-case failure");
  check(!assessRepresentationCandidate(task,{...input,verificationStdout:"ENGINEERING_PREDICTIONS []"}).accepted,
    "same exact private oracle rejects malformed prediction count");
}
{
  const references: Record<string, (input: any) => unknown> = {
    "LEXICAL-DAG-ORDER": ({ nodes, edges }) => {
      // Exhaustive order enumeration rather than the candidate's likely indegree algorithm.
      const orders: string[][] = [];
      const visit = (prefix: string[], remaining: string[]): void => {
        if (!remaining.length) {
          if (edges.every(([a, b]: string[]) => prefix.indexOf(a) < prefix.indexOf(b))) orders.push(prefix);
          return;
        }
        for (const node of remaining) visit([...prefix, node], remaining.filter(value => value !== node));
      };
      visit([], nodes);
      return orders.sort((a, b) => {
        const i = a.findIndex((value, index) => value !== b[index]);
        return i < 0 ? 0 : a[i] < b[i] ? -1 : 1;
      })[0] ?? null;
    },
    "RECURRING-DECIMAL": ({ numerator, denominator }) => {
      const negative = numerator * denominator < 0;
      const n = Math.abs(numerator), d = Math.abs(denominator);
      let remainder = n % d; let fraction = "";
      const seen = new Map<number, number>();
      while (remainder && !seen.has(remainder)) {
        seen.set(remainder, fraction.length); remainder *= 10;
        fraction += Math.floor(remainder / d); remainder %= d;
      }
      if (remainder) fraction = fraction.slice(0, seen.get(remainder)) + "(" + fraction.slice(seen.get(remainder)) + ")";
      return (negative ? "-" : "") + Math.floor(n / d) + (fraction ? "." + fraction : "");
    },
    "MINIMUM-EDIT-DISTANCE": ({ left, right }) => {
      const a = Array.from(left), b = Array.from(right), memo = new Map<string, number>();
      const distance = (i: number, j: number): number => {
        if (i === a.length) return b.length - j;
        if (j === b.length) return a.length - i;
        const key = `${i}:${j}`; if (memo.has(key)) return memo.get(key)!;
        const value = Math.min(1 + distance(i + 1, j), 1 + distance(i, j + 1),
          Number(a[i] !== b[j]) + distance(i + 1, j + 1));
        memo.set(key, value); return value;
      };
      return distance(0, 0);
    },
    "LINEAR-SAMPLE-INTEGRAL": ({ samples, from, to }) => {
      const lo = Math.min(from, to), hi = Math.max(from, to);
      const valueAt = (x: number): number => {
        const i = Math.min(samples.length - 2, samples.findIndex((pair: number[]) => pair[0] >= x) - 1);
        const k = Math.max(0, i), [a, av] = samples[k], [b, bv] = samples[k + 1];
        return av + (bv - av) * (x - a) / (b - a);
      };
      const boundaries = [lo, ...samples.map((pair: number[]) => pair[0]).filter((x: number) => x > lo && x < hi), hi];
      return boundaries.slice(1).reduce((sum: number, right: number, i: number) =>
        sum + (right - boundaries[i]) * (valueAt(right) + valueAt(boundaries[i])) / 2, 0) * (from > to ? -1 : 1);
    },
  };
  for (const task of RUNTIME_REVIEW_TRANSFER_TASKS) {
    const reference = references[task.id];
    const examples = [...task.publicCases, ...task.privateCases];
    for (const example of examples) check(theoryDigest(reference(structuredClone(example.input))) === theoryDigest(example.expected),
      `${task.domain} independent development reference agrees with frozen literal expectations`);
    const inputDigests = new Set(task.privateCases.map(example => theoryDigest(example.input)));
    check(task.publicRuntimeInputs?.length === 4 && task.publicRuntimeInputs.every(input => !inputDigests.has(theoryDigest(input))),
      "public runtime probes neither contain expected values nor duplicate private inputs");
    const files = representationRepositoryFiles(task);
    check(files["tools/verify.mjs"].includes("PUBLIC_RUNTIME_SAMPLE") && !files["tools/verify.mjs"].includes("privateCases"),
      "same pinned verifier executes probes without receiving private expected outputs");
    for (const [index, input] of task.publicRuntimeInputs!.entries()) {
      const value = JSON.parse(observePublicRuntimeSample(input, reference, index).slice("PUBLIC_RUNTIME_SAMPLE ".length));
      check(value.status === "OBSERVED" && value.inputUnchanged && value.resultDetached,
        "bounded public sample reports actual output and ownership evidence");
    }
  }
  const sample = (transform: (value: unknown) => unknown) => JSON.parse(observePublicRuntimeSample([1], transform, 0).slice("PUBLIC_RUNTIME_SAMPLE ".length));
  let calls = 0;
  check(sample(input => { calls++; return input; }).resultDetached === false && calls === 1,
    "a probe invokes the candidate exactly once and detects borrowed output");
  check(sample(input => { (input as number[]).push(2); return [3]; }).inputUnchanged === false,
    "public runtime observation detects input mutation without changing acceptance");
  check(sample(() => { throw Error("untrusted-message-not-recorded"); }).status === "THREW",
    "runtime exception exposes a bounded state, not raw error contents");
  for (const value of [undefined, NaN, Infinity, "x".repeat(121), Promise.resolve(1), new Date(), { a: new Map() }]) {
    check(sample(() => value).status === "VALUE_UNAVAILABLE", "unsupported output is unknown, not fabricated JSON correctness");
  }
  const circular: any = {}; circular.self = circular;
  check(sample(() => circular).status === "VALUE_UNAVAILABLE", "cycle and depth bounds apply before output traversal");
  check(theoryDigest(runtimeReviewTransferConfiguration("SCOPED_REVIEW_CONTROL"))
    === theoryDigest(runtimeReviewTransferConfiguration("RUNTIME_OBSERVATION_REVIEW")), "runtime comparison shares exact inference configuration");
}
console.log(`passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;

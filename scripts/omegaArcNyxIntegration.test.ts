import { execFileSync } from "node:child_process";
import { RUNTIME_REVIEW_TRANSFER_TASKS, runtimeReviewTransferConfiguration } from "./omega/benchmarks/runtimeReviewTransferTasks";
import { EVALUATION_ORDER_TRANSFER_TASKS, evaluationOrderTransferConfiguration,
  evaluationOrderWireControlVerified } from "./omega/benchmarks/evaluationOrderTransferTasks";
import { CONDITIONAL_REFACTOR_REPAIR_TASKS, suppliedCandidateThenLive, lastConditionalModelCandidate, sourceSelectionWireControlVerified }
  from "./omega/benchmarks/conditionalRefactorRepairTasks";
import { proposeNyxLocalRefactors } from "../src/lib/codelab/cognition/nyxLocalRefactorProposals";
import { measureStructuralContributions, structuralContributionGuidance } from "../src/lib/codelab/cognition/nyxStructuralContributionGuidance";
import { observePublicRuntimeSample } from "./omega/benchmarks/publicRuntimeSamples";
import { publicExecutionFailure } from "./omega/benchmarks/publicExecutionFailures";
import { PUBLIC_FAILURE_REPAIR_TASKS, PUBLIC_FAILURE_REPAIR_EPOCH, publicFailureRepairTasks,
  publicFailureRepairConfiguration, publicFailureRepairWireVerified, publicFailureContext } from "./omega/benchmarks/publicFailureRepairTasks";
import { arcCorePredecessorSource, NYX_ARC_CORE_REFINEMENT } from "./omega/nyx-arc-core-refinement";
import { readFile } from "node:fs/promises";
import { theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import { NvidiaNimProvider, type NvidiaNimTransport } from "../src/lib/codelab/model/nvidiaNimProvider";
import { NyxNemotronEngineeringCognition } from "../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";
import { buildNyxFunctionBodyCatalog, resolveNyxFunctionBody, withNyxFunctionBodySchema } from "../src/lib/codelab/cognition/nyxFunctionBodyEmission";
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
import { V3_FRESH_BUDGET_EPOCH, V3_FRESH_BUDGET_TASKS, v3FreshBudgetTasks,
  v3FreshBudgetWireVerified, observeV3AdmissionPolicy } from "./omega/benchmarks/v3FreshBudgetTransferTasks";
import { V3_NATIVE_REASONING_TASKS, V3_NATIVE_REASONING_EPOCH, v3NativeReasoningTasks,
  v3NativeReasoningConfiguration, v3NativeWireVerified } from "./omega/benchmarks/v3NativeReasoningTransferTasks";
import { STRUCTURAL_CONTRIBUTION_TASKS, structuralContributionTasks, structuralContributionConfiguration,
  structuralContributionWireVerified } from "./omega/benchmarks/structuralContributionTransferTasks";
import { NATIVE_LOCAL_EMISSION_TASKS, nativeLocalEmissionTasks, nativeLocalEmissionConfiguration,
  nativeLocalEmissionWireVerified } from "./omega/benchmarks/nativeLocalEmissionTasks";
import { FUNCTION_BODY_TRANSFER_TASKS, functionBodyTransferTasks, functionBodyTransferConfiguration,
  functionBodyWireVerified } from "./omega/benchmarks/functionBodyTransferTasks";
import { GUARDED_REPAIR_FRESH_TASKS, guardedRepairFreshTasks, guardedRepairFreshConfiguration,
  guardedRepairFreshWireVerified, guardedRepairPairAssessment } from "./omega/benchmarks/guardedRepairFreshTasks";
import { BEHAVIOR_REPAIR_TRANSFER_TASKS, behaviorRepairTransferConfiguration,
  behaviorRepairWireControlVerified } from "./omega/benchmarks/behaviorRepairTransferTasks";
import { LOCAL_REFACTOR_TRANSFER_TASKS, localRefactorTransferConfiguration,
  localRefactorWireControlVerified } from "./omega/benchmarks/localRefactorTransferTasks";
import { SOURCE_REPRESENTATION_TASKS, representationRepositoryFiles, scoreRepresentationArtifact,assessRepresentationCandidate,classifyRepresentationFailure,
  type RepresentationTask } from "./omega/benchmarks/sourceRepresentationTasks";
import {inspectDiagnosticArray,inspectSourceLiteral,sourceLiteralEnvelope,sourceLiteralStructureDigest,SOURCE_LITERAL_PROBES,SOURCE_LITERAL_DIAGNOSTIC} from "./omega/nyx-structured-array-diagnostic";
import {R3BoundedRepairLoop} from "../src/lib/codelab/engine/r3BoundedRepairLoop";
import { NvidiaCapacityCoordinator } from "../src/lib/codelab/model/nvidiaCapacity";
import { inspectNyxSourceEmission } from "./omega/nyx-source-emission-diagnostics";

let passed = 0, failed = 0;
const check = (value: unknown, label: string) => { if (value) passed++; else { failed++; console.error(`FAIL ${label}`); } };
const rejects = (body: () => unknown, label: string) => { try { body(); check(false, label); } catch { check(true, label); } };
{
  const fresh=guardedRepairFreshTasks();
  check(fresh.length===4&&new Set(fresh.map(task=>task.id)).size===4&&new Set(fresh.map(task=>task.domain)).size===2,
    "guarded fresh repair has two distinct unseeded domains and two declared repeats, not four independent objectives");
  for(const arm of ["GUARDED_SOURCE_CONTROL","GUARDED_SELECTION"]) {
    const {localRefactorGuidance,localRefactorSelection,...shared}=guardedRepairFreshConfiguration(arm);
    check(theoryDigest(shared)===theoryDigest(v3NativeReasoningConfiguration("NATIVE_BOUNDED_REASONING"))
      &&localRefactorGuidance==="EVALUATION_ORDER_PROPOSALS"&&localRefactorSelection===(arm==="GUARDED_SELECTION"?"SOURCE_BOUND_REFERENCES":undefined),
      "fresh repair arms expose the same guarded proposals and change only source-bound selection");
    const initial={initialCandidateState:true,originalBudgetPresented:true,originalBudgetVersion:"nyx-original-state-quality-budget/2",
      originalBudgetPolicyId:"omega-public-static-candidate/3",publicAdmissionPolicyId:"omega-public-static-candidate/3",legacyLineApplicabilityPresent:false,
      qualityRepairPhase:false,localProposalsPresented:false,localProposalCount:0,localProposalVersion:null,selectionBranchOffered:false,selectionBindingDigest:null};
    const repair={...initial,initialCandidateState:false,originalBudgetPresented:false,originalBudgetVersion:null,originalBudgetPolicyId:null,
      qualityRepairPhase:true,localProposalsPresented:true,localProposalCount:1,
      localProposalVersion:arm==="GUARDED_SELECTION"?"nyx-source-bound-refactor-selection/1":"nyx-local-refactor-proposals/3",
      selectionBranchOffered:arm==="GUARDED_SELECTION",selectionBindingDigest:arm==="GUARDED_SELECTION"?"a".repeat(64):null};
    check(guardedRepairFreshWireVerified(arm,[initial,repair]),"guarded fresh wire proves proposal phase and unchanged V3 policy");
    for(const wrong of [{...repair,initialCandidateState:true},{...repair,qualityRepairPhase:false},{...repair,localProposalCount:9},
      {...repair,selectionBranchOffered:!repair.selectionBranchOffered},{...repair,localProposalVersion:"unversioned"}])
      check(!guardedRepairFreshWireVerified(arm,[initial,wrong]),"selection, phase, policy and proposal bound drift fail closed");
  }
  rejects(()=>guardedRepairFreshConfiguration("BROAD_WRITE"),"guarded fresh arm cannot silently invent authority");
  const first={candidateSourceDigest:"a".repeat(64),functionalAccepted:true,quality:"REJECTED"};
  const control={accepted:false,perIteration:[first]},treatment={accepted:true,perIteration:[first],guardedSelectionReceipts:[{outcome:"RESOLVED"}]};
  check(guardedRepairPairAssessment(control,treatment,true).qualifyingQualityRepairGain,
    "causal credit requires same correct rejected candidate, actual selection and matched realized compute");
  for(const [baseline,next,matched] of [
    [control,treatment,false],[{...control,accepted:true},treatment,true],
    [control,{...treatment,perIteration:[{...first,candidateSourceDigest:"b".repeat(64)}]},true],
    [control,{...treatment,perIteration:[{...first,functionalAccepted:false}]},true],
    [control,{...treatment,perIteration:[{...first,quality:"ADMITTED"}]},true],
    [control,{...treatment,guardedSelectionReceipts:[{outcome:"REFUSED"}]},true],
    [undefined,treatment,true],[control,undefined,true],
  ] as const) check(!guardedRepairPairAssessment(baseline,next,matched).qualifyingQualityRepairGain,
    "unmatched compute, first-attempt differences, already accepted controls or missing selection cannot manufacture a repair gain");
}
{
  const fresh=functionBodyTransferTasks();
  check(fresh.length===8&&new Set(fresh.map(task=>task.id)).size===8
    &&new Set(FUNCTION_BODY_TRANSFER_TASKS.map(task=>task.domain)).size===4,
    "body transfer freezes four domains with two declared repeats, not eight independent tasks");
  for(const arm of ["COMPLETE_FILE_CONTROL","SOURCE_BOUND_BODY"]) {
    const {sourceEditScope,...shared}=functionBodyTransferConfiguration(arm);
    check(theoryDigest(shared)===theoryDigest(v3NativeReasoningConfiguration("NATIVE_BOUNDED_REASONING"))
      &&sourceEditScope===(arm==="SOURCE_BOUND_BODY"?"FUNCTION_BODY":undefined),
      "body transfer changes only edit serialization, not model inference or quality policy");
    const wire={initialCandidateState:true,originalBudgetPresented:true,originalBudgetVersion:"nyx-original-state-quality-budget/2",
      originalBudgetPolicyId:"omega-public-static-candidate/3",publicAdmissionPolicyId:"omega-public-static-candidate/3",legacyLineApplicabilityPresent:false,
      hostedSchemaPresent:true,bodyEmissionVersion:arm==="SOURCE_BOUND_BODY"?"nyx-source-bound-function-body/1":null,bodyEntryCount:arm==="SOURCE_BOUND_BODY"?1:0};
    check(functionBodyWireVerified(arm,[wire]),"body wire evidence proves actual mode with unchanged V3 policy");
    for(const wrong of [{...wire,bodyEntryCount:5},{...wire,hostedSchemaPresent:false},
      {...wire,bodyEmissionVersion:"unknown"},{...wire,originalBudgetPolicyId:"omega-public-static-candidate/2"}])
      check(!functionBodyWireVerified(arm,[wrong]),"body, delivery and policy drift cannot be silently admitted");
  }
  rejects(()=>functionBodyTransferConfiguration("UNKNOWN"),"unrecognized body comparison arm cannot broaden capabilities");
}
{
  const tasks=nativeLocalEmissionTasks();
  check(tasks.length===8&&new Set(tasks.map(task=>task.id)).size===8
    &&new Set(NATIVE_LOCAL_EMISSION_TASKS.map(task=>task.domain)).size===4,
    "native delivery comparison freezes four distinct domains and two declared repeats");
  const history=[...STRUCTURAL_CONTRIBUTION_TASKS,...V3_NATIVE_REASONING_TASKS,...NATIVE_REASONING_TRANSFER_TASKS];
  check(NATIVE_LOCAL_EMISSION_TASKS.every(task=>history.every(previous=>previous.id!==task.id)),
    "new delivery epoch cannot overwrite exposed task identities");
  for(const arm of ["HOSTED_NATIVE_CONTROL","STRICT_LOCAL_NATIVE"]) {
    const config=nativeLocalEmissionConfiguration(arm);
    const {structuredOutputMode,...common}=config;
    check(theoryDigest(common)===theoryDigest(v3NativeReasoningConfiguration("NATIVE_BOUNDED_REASONING")),
      "delivery experiment changes only existing hosted-output option, not reasoning or quality configuration");
    check(structuredOutputMode===(arm==="STRICT_LOCAL_NATIVE"?"STRICT_LOCAL":undefined),
      "local strict validation is not replaced by permissive extraction");
    const wire={initialCandidateState:true,originalBudgetPresented:true,
      originalBudgetVersion:"nyx-original-state-quality-budget/2",originalBudgetPolicyId:"omega-public-static-candidate/3",
      publicAdmissionPolicyId:"omega-public-static-candidate/3",legacyLineApplicabilityPresent:false,
      hostedSchemaPresent:arm==="HOSTED_NATIVE_CONTROL",promptDigest:"a".repeat(64)};
    check(nativeLocalEmissionWireVerified(arm,[wire]),"observed emission wire binds V3 and explicit hosted-schema presence");
    for(const invalid of [{...wire,hostedSchemaPresent:!wire.hostedSchemaPresent},{...wire,promptDigest:"invalid"},
      {...wire,originalBudgetPresented:false},{...wire,publicAdmissionPolicyId:"omega-public-static-candidate/2"}])
      check(!nativeLocalEmissionWireVerified(arm,[invalid]),"delivery, prompt and policy evidence cannot silently drift");
    check(!nativeLocalEmissionWireVerified(arm,[]),"unobserved delivery cannot be certified");
  }
  rejects(()=>nativeLocalEmissionConfiguration("RELAXED"),"unknown delivery arm cannot weaken local checks");
}
{
  const source = 'export function transform(input) {\n for (const item of input) {\n if (item.a && (item.b || item.c)) return item.values.some(value => value ? true : false);\n }\n return input.length ?? 0;\n}\n';
  const map = measureStructuralContributions("src/transform.mjs", source)!;
  check(map.complexity===7&&map.totalDecisionContributions===6&&map.maxNesting===3,
    "development reproduction: nested callbacks and short-circuits count toward whole-file complexity");
  check(map.complete&&map.sites.length===6&&map.sites.filter(site=>site.category==="SHORT_CIRCUIT").length===3,
    "complete control and short-circuit location map reconciles to unchanged detector");
  check(map.sites.every(site=>site.line>0&&site.column>0&&site.contribution===1)
    &&map.sites.find(site=>site.kind==="ConditionalExpression")?.functionLine===3,
    "source positions and nested function ownership are explicit, not indentation guesses");
  check(map.sourceDigest===contentHash(source)&&map.baseContribution===1,
    "structural explanation is digest-bound to current source and includes file base");
  check(Object.isFrozen(map)&&Object.isFrozen(map.sites)&&map.sites.every(Object.isFrozen),
    "contribution facts cannot be mutated after construction");
  const many=measureStructuralContributions("a.js",'function f(x) { '+Array.from({length:60},()=> 'if(x) x--;').join(' ')+'return x;}')!;
  check(!many.complete&&many.sites.length===48&&many.omittedContributions===12&&many.complexity===61,
    "bounded map reports omitted contributions rather than inventing complete coverage");
  check(measureStructuralContributions("a.js","export function { ")===null,
    "malformed source is not a complexity explanation");
  check(measureStructuralContributions("a.txt","if(a)b();")===null,
    "unsupported source type fails closed");
  check(measureStructuralContributions("a.js"," ".repeat(12001))===null,
    "source byte bound is independent of line count");
  check(measureStructuralContributions("a.js",'let x=['+'0,'.repeat(2600)+'0];')===null,
    "AST node bound rejects oversized explanations without executing source");
  check(measureStructuralContributions("a.ts","export function f(x: number) { return x > 0 ? 1 : 0; }")?.complexity===2,
    "typed source uses proper parser kind without filesystem or library access");
  check(measureStructuralContributions({toString(){throw Error("unsafe_path")}} as any,"return 1;")===null,
    "unsafe path objects are not coerced or invoked");
  check(structuralContributionGuidance({candidateQualityFeedback:null} as any)===null,
    "absence of a real quality rejection cannot trigger structural repair context");
}
{
  const tasks=structuralContributionTasks();
  check(tasks.length===8&&new Set(tasks.map(task=>task.id)).size===8
    &&new Set(STRUCTURAL_CONTRIBUTION_TASKS.map(task=>task.domain)).size===4,
    "structure-map transfer freezes four unique domains and two repeats, not eight independent tasks");
  check(!STRUCTURAL_CONTRIBUTION_TASKS.some(task=>[...V3_NATIVE_REASONING_TASKS,...V3_FRESH_BUDGET_TASKS,
    ...PUBLIC_FAILURE_REPAIR_TASKS,...SOURCE_REPRESENTATION_TASKS].some(previous=>previous.id===task.id)),
    "fresh transfer identities cannot regrade or overwrite frozen prior tasks");
  for(const variant of ["DECLARATION_SITES_CONTROL","ALL_STRUCTURE_SITES"]) {
    const config=structuralContributionConfiguration(variant);
    check(config.comparisonInferencePolicy==="REASONING_JSON"&&config.comparisonReasoningBudgetTokens===2048,
      "control and treatment share identical native reasoning compute caps");
    check(config.qualityRepairGuidance==="STRUCTURE_SITES"&&config.structuralBudgetGuidance==="PUBLIC_ORIGINAL_STATE"
      &&config.providerIntentShape==="DECISION_REQUIRED_FIELDS_AND_LENGTHS",
      "map does not replace existing strict grammar or original-state budget");
    const initial={initialCandidateState:true,originalBudgetPresented:true,
      originalBudgetVersion:"nyx-original-state-quality-budget/2",originalBudgetPolicyId:"omega-public-static-candidate/3",
      publicAdmissionPolicyId:"omega-public-static-candidate/3",legacyLineApplicabilityPresent:false,
      qualityRepairPhase:false,structuralMapVersion:null,structuralMapSources:0};
    const repair={...initial,initialCandidateState:false,originalBudgetPresented:false,originalBudgetVersion:null,
      originalBudgetPolicyId:null,qualityRepairPhase:true,
      structuralMapVersion:variant==="ALL_STRUCTURE_SITES"?"nyx-structural-contribution-guidance/1":null,
      structuralMapSources:variant==="ALL_STRUCTURE_SITES"?1:0};
    check(structuralContributionWireVerified(variant,[initial,repair]),"map wire is phase-bound under identical V3 policy");
    check(!structuralContributionWireVerified(variant,[{...initial,structuralMapVersion:"nyx-structural-contribution-guidance/1",
      structuralMapSources:1}]),"premature map cannot confound first-attempt comparison");
    check(!structuralContributionWireVerified(variant,[{...repair,qualityRepairPhase:undefined}]),
      "unknown repair phase is insufficient comparison evidence");
  }
  rejects(()=>structuralContributionConfiguration("RELAXED"),"unknown map arm cannot silently alter comparison");
}
{
  const tasks = v3NativeReasoningTasks();
  check(tasks.length===8&&new Set(tasks.map(task=>task.id)).size===8,
    "fresh V3 native reasoning epoch freezes four unique domains with two declared repeats");
  const historicalIds=new Set([...SOURCE_REPRESENTATION_TASKS,...LENGTH_GRAMMAR_TRANSFER_TASKS,
    ...NATIVE_REASONING_TRANSFER_TASKS,...ORIGINAL_BUDGET_TRANSFER_TASKS,...V3_FRESH_BUDGET_TASKS,
    ...PUBLIC_FAILURE_REPAIR_TASKS].map(task=>task.id));
  check(V3_NATIVE_REASONING_TASKS.every(task=>!historicalIds.has(task.id)),
    "fresh fixture identity cannot overwrite a historical task's test-only witness or outcomes");
  check(V3_NATIVE_REASONING_EPOCH.reasoningReservationTokens===2048
    &&V3_NATIVE_REASONING_EPOCH.sharedOutputCapTokens===8192,
    "native reasoning consumes the unchanged output cap rather than adding a hidden budget");
  for(const variant of ["NATIVE_NONE","NATIVE_BOUNDED_REASONING"]) {
    const config = v3NativeReasoningConfiguration(variant);
    check(config.qualityRepairGuidance==="STRUCTURE_SITES"&&config.structuralBudgetGuidance==="PUBLIC_ORIGINAL_STATE"
      &&config.providerIntentShape==="DECISION_REQUIRED_FIELDS_AND_LENGTHS",
      "native comparison preserves identical public feedback and strict source grammar");
    const initial = {initialCandidateState:true,originalBudgetPresented:true,
      originalBudgetVersion:"nyx-original-state-quality-budget/2",originalBudgetPolicyId:"omega-public-static-candidate/3",
      publicAdmissionPolicyId:"omega-public-static-candidate/3",legacyLineApplicabilityPresent:false};
    const after = {...initial,initialCandidateState:false,originalBudgetPresented:false,
      originalBudgetVersion:null,originalBudgetPolicyId:null};
    check(v3NativeWireVerified(variant,[initial,after]),"fresh native wire binds V3 before and after candidates");
    for(const invalid of [{...initial,publicAdmissionPolicyId:"omega-public-static-candidate/2"},
      {...initial,legacyLineApplicabilityPresent:true},{...initial,originalBudgetPresented:false},
      {...after,originalBudgetVersion:initial.originalBudgetVersion},{}])
      check(!v3NativeWireVerified(variant,[invalid]),"native policy, applicability and budget provenance drift fail closed");
    check(!v3NativeWireVerified(variant,[]),"empty native controls are not observed configuration evidence");
  }
  rejects(()=>v3NativeReasoningConfiguration("RELAXED_QUALITY"),"unknown native arm cannot expand authority");
  const witnesses = [
    ["DECIMAL-COEFFICIENT-QUANTIZATION-V3",0,"0"], ["DECIMAL-COEFFICIENT-QUANTIZATION-V3",1,"2"],
    ["DECIMAL-COEFFICIENT-QUANTIZATION-V3",5,"10.00"], ["PLANAR-RECTANGLE-AREA",5,21],
    ["MAXIMUM-INTERVAL-REWARD",2,12], ["FINITE-LANGUAGE-DISTINCTION",0,""],
    ["FINITE-LANGUAGE-DISTINCTION",3,"aa"],
  ] as const;
  for(const [id,index,expected] of witnesses) check(V3_NATIVE_REASONING_TASKS.find(task=>task.id===id)?.privateCases[index].expected===expected,
    "independent oracle agrees with a hand-computed boundary case");
}
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
for (const path of ["src/lib/codelab/assurance/candidateEngineeringAdmission.ts", "src/lib/codelab/cognition/nyxMeasuredQualityGuidance.ts"]) {
  const current = await readFile(path,"utf8");
  const baseline = execFileSync("git",["show",`7e53861513514a6a034ec542780441afd013a62c:${path}`],{encoding:"utf8"});
  check(arcCorePredecessorSource(path,current) === baseline, "V3 quality-policy refinement exactly reproduces the separately preserved V2 source");
  check(arcCorePredecessorSource(path,current+"// unrelated change\n") !== baseline, "V3 policy registration cannot hide unrelated source changes or inherit frozen scores");
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
{
  const source = '// Module documentation\nexport function evaluate(value) {\n  throw Error("pending");\n}\n// Preserve this trailer\n';
  const bodyRequest = (text=source) => ({cognitionRequestId:"DEV-BODY-BINDING",objective:"Implement evaluate without changing its public interface.",
    observation:{observationId:"DEV-OBSERVATION"},files:[{relativePath:"src/value.mjs",content:text,contentSha256:contentHash(text)}],
    allowedMutationPaths:["src/value.mjs"],maxChanges:1,maxPatchBytes:12000,sourceQualityConstraints:{maxLineLength:120}});
  const makeIntent = (catalog:NonNullable<ReturnType<typeof buildNyxFunctionBodyCatalog>>, lines:string[]) => ({decision:"PROPOSE_EDIT",
    changes:[{target:catalog.entries[0].target,replacement:{bodyRef:catalog.entries[0].bodyRef,lines,lineEnding:catalog.entries[0].lineEnding}}]});
  const req=bodyRequest(), catalog=buildNyxFunctionBodyCatalog(req as never)!;
  check(catalog.entries[0].functionName==="evaluate"&&catalog.authorityGranted===false&&Object.isFrozen(catalog.entries),
    "body emission observes the actual function identity without granting authority");
  const resolved=await resolveNyxFunctionBody(makeIntent(catalog,["  return value * 2;"]),catalog,req as never);
  const resultSource=(resolved?.value?.changes as {replacement:{lines:string[];lineEnding:string}}[])[0].replacement.lines.join("\n");
  check(resolved?.evidence.outcome==="RESOLVED"&&resultSource.startsWith(catalog.entries[0].prefix)
    &&resultSource.endsWith(catalog.entries[0].suffix)&&resultSource.includes("return value * 2"),
    "body expansion is literal and preserves exact signature, comments and trailer");
  check(resolved?.evidence.acceptanceGranted===false&&resolved.evidence.authorityGranted===false,
    "a syntax-valid body is an ordinary unapproved candidate, not self-certification");
  const content=JSON.stringify(makeIntent(catalog,["  return value * 2;"]));
  const diagnosticInput={content,finishReason:"stop",providerResponseDigest:contentHash(content),expectedTarget:"src/value.mjs",
    representation:"LINES" as const,functionBodyEmission:resolved!.evidence};
  const inspection=await inspectNyxSourceEmission(diagnosticInput);
  check(inspection.outcome==="SOURCE_BODY_RESOLVED"&&inspection.sourceDigest===contentHash(resultSource)
    &&inspection.sourceBytes===null&&inspection.authorityGranted===false,
    "body diagnostic reports bound expanded digest without inventing source metrics or authority");
  check((await inspectNyxSourceEmission({...diagnosticInput,functionBodyEmission:undefined})).outcome==="SOURCE_BODY_REFUSED",
    "unverified body text cannot appear as a resolved source merely because it carries a reference");
  check((await inspectNyxSourceEmission({...diagnosticInput,functionBodyEmission:{...resolved!.evidence,inputDigest:"a".repeat(64)}})).outcome==="SOURCE_BODY_REFUSED",
    "body diagnostics reject a receipt from another input without reclassifying it as a reasoning failure");
  check((await inspectNyxSourceEmission({...diagnosticInput,finishReason:"length"})).outcome==="TRUNCATED",
    "truncation takes precedence over a supplied body receipt");
  for(const lines of [["}"],["} export function injected() { return 1;"],["return {"],["return `unterminated"],
    ["export function renamed() {}"],["return 1;\nreturn 2;"],["return 1;\u2028"],["return 1;\u2029"],["x".repeat(12001)]]) {
    const invalid=await resolveNyxFunctionBody(makeIntent(catalog,lines),catalog,req as never);
    check(invalid?.value===null&&invalid.evidence.outcome==="REFUSED","body representation rejects syntax, delimiter escape, embedded terminators and volume excess");
  }
  for(const change of [{...req,objective:"Changed objective"},{...req,cognitionRequestId:"Changed request"},
    {...req,maxPatchBytes:11999},{...req,allowedMutationPaths:[]},bodyRequest(source.replace("evaluate","renamed"))])
    check((await resolveNyxFunctionBody(makeIntent(catalog,["return 1;"]),catalog,change as never))?.value===null,
      "body references bind source, request, objective, resource limits and current scope");
  const mutatedIntent=makeIntent(catalog,["return 1;"]);
  mutatedIntent.changes[0].replacement.bodyRef="BODY-"+"0".repeat(64);
  check((await resolveNyxFunctionBody(mutatedIntent,catalog,req as never))?.value===null,"invented body reference fails closed");
  const asynchronousRequest=bodyRequest();
  const pending=resolveNyxFunctionBody(makeIntent(catalog,["return value;"]),catalog,asynchronousRequest as never);
  asynchronousRequest.objective="Changed while parsing";
  check((await pending)?.value===null,"body request is rebound after asynchronous syntax validation");
  for(const unsupported of ["export const evaluate = value => value;","export function f() {}\nexport function g() {}",
    "function evaluate(value) { return value; }","export function evaluate( {",source.replace("\n", "\r\n")])
    check(buildNyxFunctionBodyCatalog(bodyRequest(unsupported) as never)===null,"unsupported module or mixed line endings cannot silently broaden body edits");
  const crlf=bodyRequest(source.replace(/\n/g,"\r\n")), crlfCatalog=buildNyxFunctionBodyCatalog(crlf as never)!;
  const crlfResult=await resolveNyxFunctionBody(makeIntent(crlfCatalog,["  return value;"]),crlfCatalog,crlf as never);
  check(crlfResult?.evidence.outcome==="RESOLVED"&&crlfResult.value?.changes[0].replacement.lineEnding==="CRLF",
    "body wire preserves CRLF without embedded carriage returns in individual lines");
  const schema={type:"object",additionalProperties:false,properties:{decision:{enum:["PROPOSE_EDIT"]},changes:{type:"array",items:{type:"object",
    properties:{target:{type:"string"},replacement:{type:"object",properties:{lines:{type:"array"},lineEnding:{enum:["LF","CRLF"]}},required:["lines","lineEnding"],additionalProperties:false}},required:["target","replacement"],additionalProperties:false}}},required:["decision","changes"]};
  const transformed=withNyxFunctionBodySchema(schema,catalog) as typeof schema;
  check(transformed.properties.changes.items.properties.replacement.required.includes("bodyRef")
    &&transformed.additionalProperties===false&&!schema.properties.changes.items.properties.replacement.required.includes("bodyRef"),
    "body schema replaces only wire shape without mutating original strict contract");
  check(withNyxFunctionBodySchema(schema,null)===schema,"default source schema is byte-for-byte unchanged when body emission is absent");
  rejects(()=>withNyxFunctionBodySchema({type:"object",properties:{decision:{enum:["NO_ACTION"]}}},catalog),
    "body schema cannot silently fall back when the edit contract is absent");
  rejects(()=>withNyxFunctionBodySchema({...schema,additionalProperties:true},catalog),
    "body schema refuses an open-ended root rather than weakening the protocol");
}
{
  const task:RepresentationTask={id:"DEV-BODY-END-TO-END",tier:"DEVELOPMENT",domain:"BOUND_SOURCE_EMISSION",
    objective:"Implement transform(input) for {values,scale}: return a new array of every value multiplied by scale, without input mutation. Preserve the export.",
    publicCases:[{input:{values:[2,3],scale:4},expected:[8,12]}],privateCases:[{input:{values:[],scale:-1},expected:[]},{input:{values:[-2,0],scale:0.5},expected:[-1,0]}]};
  const session=await R3BenchmarkRepositorySession.create(representationRepositoryFiles(task),"a".repeat(40),Date.now()+60000,12000);
  try {
    const baseline=await session.baseline();
    const cognition=NyxNemotronEngineeringCognition.create({cognitionId:"DEV-BODY-REAL-OMEGA",provider:provider(async(_url,init)=>{
      const prompt=JSON.parse(JSON.parse(String(init?.body)).messages[1].content),entry=prompt.functionBodyEmission.entries[0];
      check(entry.functionName==="transform"&&entry.target==="src/transform.mjs","cognition exposes current source binding, not a model-invented scaffold");
      return reply(JSON.stringify({decision:"PROPOSE_EDIT",diagnosis:"The observed function is an unimplemented stub.",
        causalHypothesis:"An elementwise scaling preserves order and covers empty arrays.",evidenceRefs:["OBJECTIVE","FILE:src/transform.mjs"],
        invariant:"Preserve all input values and return independently owned results.",expectedResult:"Public scaling examples pass.",
        counterexamples:["Empty arrays and fractional negative scales"],changes:[{target:entry.target,replacement:{bodyRef:entry.bodyRef,
          lines:["  return input.values.map(value => value * input.scale);"],lineEnding:entry.lineEnding}}]}));
    }),maxPromptBytes:48000,maxOutputTokens:8192,sourceRepresentation:"LINES",sourceEditScope:"FUNCTION_BODY",intentCompilationMode:"SAFE_CANONICALIZATION",
      providerIntentShape:"DECISION_REQUIRED_FIELDS_AND_LENGTHS"});
    const loop=R3BoundedRepairLoop.create({loopId:"DEV-BODY-REAL-OMEGA",evaluatorVersion:"DEV-BODY-1",observerIdentity:"DEV-BODY-OBSERVER",cognition,
      candidateAdmissionPolicyId:"omega-public-static-candidate/3",candidateBuilder:{builderIdentity:"DEV-BODY-EXISTING-R3",prepare:h=>session.prepare(h)},
      maxIterations:1,maxModelInteractions:1,maxWallClockMs:30000,maxChangesPerIteration:1,maxPatchBytesPerIteration:12000,maxDiagnosisCharacters:1500});
    const result=await loop.run({schemaVersion:1,repairRequestId:"DEV-BODY-REAL-OMEGA",objective:task.objective,initialObservation:baseline.observation,
      initialFiles:baseline.prepared.files,allowedMutationPaths:["src/transform.mjs"],availableEvidence:[],allowedVerificationToolIds:["TEST"],
      baselineExecutions:[{toolId:"TEST",result:baseline.result}],observedAtEpochMs:Date.now()});
    check(result.outcome==="FUNCTIONALLY_REPAIRED_VERIFIED"&&result.iterations[0].cognitionEvidence.functionBodyEmission?.outcome==="RESOLVED"
      &&scoreRepresentationArtifact(task,result.iterations[0].verifications[0].execution.evidence.stdout).accepted,
      "body emission composes with existing Omega real execution, V3 admission and private oracle");
  } finally {
    const cleanup=await session.close();
    check(cleanup.sourceUnchanged&&cleanup.cleanupVerified,"body emission end-to-end fixture preserves source and cleans existing owned lifecycle");
  }
}
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
  "DIRECTED-CAPACITY-FLOW": `export function transform(input) {
    const capacity=Array.from({length:input.nodes},()=>Array(input.nodes).fill(0));
    for(const [a,b,value] of input.edges) capacity[a][b]+=value;
    let total=0;
    while(true) {
      const parent=Array(input.nodes).fill(-1), queue=[0], volume=Array(input.nodes).fill(0);
      parent[0]=0; volume[0]=Infinity;
      for(let i=0;i<queue.length;i++) for(let v=0;v<input.nodes;v++) {
        if(capacity[queue[i]][v]>0 && parent[v]===-1) {
          parent[v]=queue[i]; volume[v]=Math.min(volume[queue[i]],capacity[queue[i]][v]); queue.push(v);
        }
      }
      if(parent[input.nodes-1]===-1) break;
      for(let v=input.nodes-1;v!==0;v=parent[v]) {
        capacity[parent[v]][v]-=volume[input.nodes-1]; capacity[v][parent[v]]+=volume[input.nodes-1];
      }
      total+=volume[input.nodes-1];
    }
    return total;
  }`,
  "SIGNED-POSTFIX-ARITHMETIC": `export function transform(input) {
    const stack=[], operations={'+':(a,b)=>a+b,'-':(a,b)=>a-b,'*':(a,b)=>a*b,'/':(a,b)=>a/b};
    for(const token of input) {
      if(/^-?(?:0|[1-9]\\d*)$/.test(token)) stack.push(BigInt(token));
      else {
        if(!Object.hasOwn(operations,token)||stack.length<2) return null;
        const right=stack.pop(),left=stack.pop();
        if(token==='/'&&right===0n) return null;
        stack.push(operations[token](left,right));
      }
    }
    return stack.length===1?stack[0].toString():null;
  }`,
  "ESCAPED-CHUNK-FIELDS": `export function transform(input) {
    const fields=['']; let escaped=false;
    for(const chunk of input) for(const symbol of chunk) {
      if(escaped) { fields[fields.length-1]+=symbol; escaped=false; continue; }
      if(symbol==='\\\\') { escaped=true; continue; }
      if(symbol==='|') fields.push(''); else fields[fields.length-1]+=symbol;
    }
    if(escaped) fields[fields.length-1]+='\\\\';
    return fields;
  }`,
  "NONCOPRIME-CONGRUENCE-SYSTEM": `export function transform(input) {
    let residue=0,modulus=1;
    for(const item of input) {
      let a=modulus,b=item.modulus;
      while(b) { const remainder=a%b; a=b; b=remainder; }
      const nextModulus=modulus/a*item.modulus;
      while(residue<nextModulus && residue%item.modulus!==(item.residue%item.modulus+item.modulus)%item.modulus) residue+=modulus;
      if(residue>=nextModulus) return null;
      modulus=nextModulus;
    }
    return {residue,modulus};
  }`,
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
for(const variant of ["EVALUATION_ORDER_SOURCE_CONTROL","SOURCE_BOUND_SELECTION"]) {
  const selected=variant==="SOURCE_BOUND_SELECTION";
  const active={qualityRepairPhase:true,localProposalsPresented:true,localProposalCount:1,
    localProposalVersion:selected?"nyx-source-bound-refactor-selection/1":"nyx-local-refactor-proposals/3",
    selectionBranchOffered:selected,selectionBindingDigest:selected?"a".repeat(64):null,
    selectionExampleDecision:selected?"SELECT_LOCAL_REFACTOR":"PROPOSE_EDIT"};
  const empty={qualityRepairPhase:true,localProposalsPresented:false,localProposalCount:0,localProposalVersion:null,
    selectionBranchOffered:false,selectionBindingDigest:null,selectionExampleDecision:"PROPOSE_EDIT"};
  check(sourceSelectionWireControlVerified(variant,[active,empty]),"recorded v3 reference or emission control is bound to its actual wire branch");
  for(const bad of [[],[{...active,qualityRepairPhase:false}],[{...active,localProposalCount:9}],
    [{...active,selectionBranchOffered:!selected}],[{...empty,selectionBindingDigest:"forged"}],
    [{...active,localProposalVersion:"future"}],[{...active,selectionExampleDecision:"NO_ACTION"}]])
    check(!sourceSelectionWireControlVerified(variant,bad),"missing, stale, out-of-scope and contradictory selection wire evidence fails closed");
}
check(!sourceSelectionWireControlVerified("AUTO_APPLY",[]),"unknown reference-control arm never verifies");
// This is not model discovery or a claim that those supplied solutions are NYX's.
check(lastConditionalModelCandidate([{iteration:1,functionalAccepted:true}])===undefined,
  "retaining a supplied passing candidate after rejected model output is not model functional acceptance");
for (const accepted of [true,false]) {
  const rows=[{iteration:1,functionalAccepted:true},{iteration:2,functionalAccepted:accepted}];
  check(lastConditionalModelCandidate(rows)===rows[1]&&lastConditionalModelCandidate(rows)?.functionalAccepted===accepted,
    "conditional model outcome follows its actual executed repair, not the supplied success");
}
check(lastConditionalModelCandidate([])===undefined,"no conditional execution is not graded success");
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
  for (const variant of ["GUARDED_V2_CONTROL","EVALUATION_ORDER_PROPOSALS","SOURCE_BOUND_SELECTION"]) {
    let realPhaseCalls=0,phaseBound=false,proposalBound=false;
    const live=NyxNemotronEngineeringCognition.create({cognitionId:"CONDITIONAL-REPAIR-TEST-ONLY",
      provider:provider(async (_url,init)=>{
        realPhaseCalls++;
        const body=JSON.parse(String(init.body)),prompt=JSON.parse(body.messages[1].content);
        phaseBound=prompt.activeRepairDriver.kind==="QUALITY_REJECTION"&&prompt.hypothesisHistory.length===1;
        proposalBound=variant==="GUARDED_V2_CONTROL"?(!prompt.localRefactorProposals||prompt.localRefactorProposals.version==="nyx-local-refactor-proposals/2")
          :proposeNyxLocalRefactors("src/transform.mjs",task.suppliedCandidate,true)
            ?prompt.localRefactorProposals?.version===(variant==="SOURCE_BOUND_SELECTION"?"nyx-source-bound-refactor-selection/1":"nyx-local-refactor-proposals/3"):!prompt.localRefactorProposals;
        const response=JSON.parse(intent(conditionalReferences[task.id]));
        response.causalHypothesis="Preserve the supplied algorithm while reducing redundant local structure.";
        response.invariant="Preserve every specified domain boundary and input.";
        response.counterexamples=["Empty inputs, signed values and boundary parameters"];
        if(variant==="SOURCE_BOUND_SELECTION"&&prompt.localRefactorProposals) {
          response.decision="SELECT_LOCAL_REFACTOR";
          response.selectedProposalRef=prompt.localRefactorProposals.proposals[0].proposalRef;
          response.evidenceRefs=[prompt.localRefactorProposals.evidenceRef,prompt.localRefactorProposals.passingObservationRef,"FILE:src/transform.mjs"];
          delete response.changes;
        }
        return reply(JSON.stringify(response));
      },"nvidia/nemotron-3-super-120b-a12b"),maxPromptBytes:48000,maxOutputTokens:8192,sourceRepresentation:"LINES",intentCompilationMode:"SAFE_CANONICALIZATION",
      repairFeedbackPolicy:"TRANSIENT_REJECTED_SOURCE_WINDOW",...evaluationOrderTransferConfiguration(variant==="SOURCE_BOUND_SELECTION"?"EVALUATION_ORDER_PROPOSALS":variant),
      ...(variant==="SOURCE_BOUND_SELECTION"?{localRefactorSelection:"SOURCE_BOUND_REFERENCES" as const}:{})});
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
representationReferences["SCC-PARTITION-V3-FRESH"] = `
function reachable(start, edges) {
  const seen = new Set([start]);
  for (const node of seen) for (const [from, to] of edges) {
    if (from === node) seen.add(to);
  }
  return seen;
}
export function transform(input) {
  const reaches = new Map(input.nodes.map(node => [node, reachable(node, input.edges)]));
  const remaining = new Set(input.nodes);
  const groups = [];
  for (const node of remaining) {
    const group = [...remaining].filter(other => reaches.get(node).has(other) && reaches.get(other).has(node)).sort();
    groups.push(group);
    for (const member of group) remaining.delete(member);
  }
  return groups.sort((a, b) => a[0] < b[0] ? -1 : 1);
}`;
representationReferences["RATIONAL-PREFIX-V3-FRESH"] = `
function gcd(a, b) {
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}
export function transform(input) {
  let numerator = 0n, denominator = 1n;
  const result = [];
  for (const term of input) {
    const nextDenominator = denominator * BigInt(term.d);
    const nextNumerator = numerator * BigInt(term.d) + BigInt(term.n) * denominator;
    const divisor = gcd(nextNumerator < 0n ? -nextNumerator : nextNumerator, nextDenominator);
    numerator = nextNumerator / divisor;
    denominator = nextDenominator / divisor;
    result.push([String(numerator), String(denominator)]);
  }
  return result;
}`;
representationReferences["TRANSACTION-VIEWS-V3-FRESH"] = `
export function transform(events) {
  let committed = new Map(), visible = committed;
  const views = [];
  for (const event of events) {
    switch (event.op) {
      case "begin": visible = new Map(committed); break;
      case "set": visible.set(event.key, event.value); break;
      case "delete": visible.delete(event.key); break;
      case "commit": committed = visible; break;
      case "rollback": visible = committed; break;
      case "read": views.push([...visible].sort((a, b) => a[0] < b[0] ? -1 : 1)); break;
    }
  }
  return views;
}`;
representationReferences["JSON-POINTER-V3-FRESH"] = `
export function transform(input) {
  let value = input.document;
  for (const token of input.pointer === "" ? [] : input.pointer.slice(1).split("/")) {
    const key = token.replace(/~1/g, "/").replace(/~0/g, "~");
    if (value === null || typeof value !== "object") return {found:false};
    if (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key)) return {found:false};
    if (!Object.hasOwn(value, key)) return {found:false};
    value = value[key];
  }
  return {found:true,value:JSON.parse(JSON.stringify(value))};
}`;
check(v3FreshBudgetTasks().length===8 && new Set(v3FreshBudgetTasks().map(t=>t.id)).size===8,
  "fresh V3 epoch freezes two uniquely identified repeats per four tasks before inference");
check(new Set(V3_FRESH_BUDGET_TASKS.map(t=>t.domain)).size===4 && V3_FRESH_BUDGET_EPOCH.uniqueTasks===4,
  "fresh V3 cohort has four bounded domains, not eight independent problems");
for (const variant of ["STRUCTURE_SITES_CONTROL","ORIGINAL_BUDGET"]) {
  const before = {initialCandidateState:true,originalBudgetPresented:variant==="ORIGINAL_BUDGET",
    originalBudgetVersion:variant==="ORIGINAL_BUDGET"?V3_FRESH_BUDGET_EPOCH.originalBudgetVersion:null,
    originalBudgetPolicyId:variant==="ORIGINAL_BUDGET"?V3_FRESH_BUDGET_EPOCH.admissionPolicyId:null};
  const after = {initialCandidateState:false,originalBudgetPresented:false,originalBudgetVersion:null,originalBudgetPolicyId:null};
  check(v3FreshBudgetWireVerified(variant,[before,after]),"V3 wire binds correct version/policy only before the initial candidate");
  check(!v3FreshBudgetWireVerified(variant,[{...before,originalBudgetPolicyId:"omega-public-static-candidate/2"}]),
    "V3 wire rejects legacy policy or unexpected control-arm guidance");
  check(!v3FreshBudgetWireVerified(variant,[{...after,originalBudgetVersion:V3_FRESH_BUDGET_EPOCH.originalBudgetVersion}]),
    "post-candidate request cannot present stale original-budget guidance");
}
rejects(()=>v3FreshBudgetWireVerified("RELAX_QUALITY",[]),"unknown fresh V3 arm cannot claim protocol validity");
check(observeV3AdmissionPolicy([]).state==="NOT_REACHED","no candidate cannot certify an observed admission");
check(observeV3AdmissionPolicy([{quality:null,staticPolicyId:null}]).state==="NOT_REACHED",
  "execution failure before admission is not provider failure or policy drift");
check(observeV3AdmissionPolicy([{quality:null}]).state==="MISMATCH",
  "missing policy-observation field is not silently coerced into an unreached stage");
check(observeV3AdmissionPolicy([{quality:null,staticPolicyId:null},{quality:"REJECTED",staticPolicyId:V3_FRESH_BUDGET_EPOCH.admissionPolicyId}]).state==="OBSERVED",
  "mixed reached and unreached iterations preserve the actually observed correct policy");
check(observeV3AdmissionPolicy([{quality:"ADMITTED",staticPolicyId:"omega-public-static-candidate/2"}]).state==="MISMATCH",
  "an actual legacy policy invocation remains a critical control mismatch");
check(observeV3AdmissionPolicy([{quality:null,staticPolicyId:V3_FRESH_BUDGET_EPOCH.admissionPolicyId}]).state==="MISMATCH",
  "a claimed policy invocation without a result fails observation integrity");
check(observeV3AdmissionPolicy([{quality:"FORGED_PASS",staticPolicyId:V3_FRESH_BUDGET_EPOCH.admissionPolicyId}]).state==="MISMATCH",
  "invented admission result cannot pass policy controls");
representationReferences["EXACT-INTEGER-PRODUCT"] = `export function transform(input) {
  return String(BigInt(input.left) * BigInt(input.right));
}`;
representationReferences["OVERLAPPING-LITERAL-COUNT"] = `export function transform(input) {
  let count = 0;
  if (!input.needle.length) return 0;
  for (let index = 0; index <= input.text.length - input.needle.length; index++) {
    if (input.text.startsWith(input.needle, index)) count++;
  }
  return count;
}`;
representationReferences["CLOSED-INTEGER-RANGE"] = `export function transform(input) {
  const values = [];
  for (let next = input.start; next <= input.end; next++) values.push(next);
  return values;
}`;
representationReferences["PRIORITY-STABLE-ROW-IDS"] = `export function transform(input) {
  const rank = new Map(input.order.map((key,index)=>[key,index]));
  return input.rows.slice().sort((a,b)=>(rank.get(a.key) ?? input.order.length) - (rank.get(b.key) ?? input.order.length)).map(row=>row.id);
}`;
// Test-only witnesses, never supplied to live cognition. Distinct oracle algorithms
// (digit arithmetic/cell enumeration/subsets/word enumeration) are in the fixture module.
representationReferences["DECIMAL-COEFFICIENT-QUANTIZATION-V3"] = `export function transform(input) {
  const coefficient = BigInt(input.coefficient);
  const negative = coefficient < 0n;
  let units = negative ? -coefficient : coefficient;
  if (input.places < input.scale) {
    const divisor = 10n ** BigInt(input.scale - input.places);
    const remainder = units % divisor;
    units /= divisor;
    if (remainder * 2n > divisor || (remainder * 2n === divisor && units % 2n === 1n)) units++;
  } else units *= 10n ** BigInt(input.places - input.scale);
  const digits = String(units).padStart(input.places + 1, '0');
  const fixed = input.places ? digits.slice(0, -input.places) + '.' + digits.slice(-input.places) : digits;
  return (negative && units !== 0n ? '-' : '') + fixed;
}`;
representationReferences["PLANAR-RECTANGLE-AREA"] = `export function transform(input) {
  const xs = [...new Set(input.flatMap(rectangle => [rectangle[0], rectangle[2]]))].sort((a,b)=>a-b);
  const ys = [...new Set(input.flatMap(rectangle => [rectangle[1], rectangle[3]]))].sort((a,b)=>a-b);
  let area = 0;
  for (let x = 1; x < xs.length; x++) {
    for (let y = 1; y < ys.length; y++) {
      if (input.some(rectangle => Math.min(rectangle[0],rectangle[2]) <= xs[x-1]
        && Math.max(rectangle[0],rectangle[2]) >= xs[x]
        && Math.min(rectangle[1],rectangle[3]) <= ys[y-1]
        && Math.max(rectangle[1],rectangle[3]) >= ys[y])) area += (xs[x]-xs[x-1])*(ys[y]-ys[y-1]);
    }
  }
  return area;
}`;
representationReferences["MAXIMUM-INTERVAL-REWARD"] = `export function transform(input) {
  const jobs = input.slice().sort((a,b)=>a.end-b.end);
  const best = [0];
  for (let index = 0; index < jobs.length; index++) {
    let previous = index - 1;
    while (previous >= 0 && jobs[previous].end > jobs[index].start) previous--;
    best.push(Math.max(best[index], jobs[index].reward + best[previous+1]));
  }
  return best[jobs.length];
}`;
representationReferences["FINITE-LANGUAGE-DISTINCTION"] = `export function transform(input) {
  const queue = [[0,0,'']];
  const seen = new Set(['0,0']);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const [left,right,word] = queue[cursor];
    if (input.left.accepting.includes(left) !== input.right.accepting.includes(right)) return word;
    for (let symbol = 0; symbol < 2; symbol++) {
      const next = [input.left.transitions[left][symbol],input.right.transitions[right][symbol]];
      const identity = next.join(',');
      if (!seen.has(identity)) {
        seen.add(identity);
        queue.push([...next, word + (symbol === 0 ? 'a' : 'b')]);
      }
    }
  }
  return null;
}`;
representationReferences["QUOTED-RECORD-FIELDS"] = String.raw`export function transform(input) {
  const output = [];
  let field = "", quoted = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      output.push(field);
      field = "";
    } else field += char;
  }
  output.push(field);
  return output;
}`;
representationReferences["UNICODE-LITERAL-GLOB"] = String.raw`export function transform(input) {
  const text = Array.from(input.text);
  const tokens = Array.from(input.pattern.matchAll(/\\[\s\S]|[\s\S]/gu), match => match[0]);
  let row = text.map(() => false);
  row.unshift(true);
  for (const token of tokens) {
    const next = [row[0] && token === "*"];
    const literal = token.replace(/^\\(?=[\s\S])/u, "");
    for (let index = 0; index < text.length; index++) {
      next.push(token === "*" ? row[index + 1] || next[index] : row[index] && (token === "?" || text[index] === literal));
    }
    row = next;
  }
  return row[text.length];
}`;
representationReferences["BOUNDED-COIN-COMBINATIONS"] = String.raw`export function transform(input) {
  let ways = Array(input.amount + 1).fill(0);
  ways[0] = 1;
  for (const coin of input.coins) {
    const next = ways.map(() => 0);
    for (let amount = 0; amount <= input.amount; amount++) {
      for (let used = 0; used <= coin.count && used * coin.value <= amount; used++) {
        next[amount] += ways[amount - used * coin.value];
      }
    }
    ways = next;
  }
  return ways[input.amount];
}`;
representationReferences["DEPENDENCY-FINISH-TIMES"] = `export function transform(input) {
  const jobs = new Map(input.map(job => [job.id, job]));
  const memo = new Map();
  function finish(id) {
    if (!memo.has(id)) {
      const job = jobs.get(id);
      memo.set(id, job.duration + Math.max(0, ...job.needs.map(finish)));
    }
    return memo.get(id);
  }
  return input.map(job => finish(job.id));
}`;
representationReferences["POLYGON-SIGNED-AREA"] = `export function transform(input) {
  let signed = 0;
  for (let i = 0; i < input.length; i++) {
    const a = input[i], b = input[(i + 1) % input.length];
    signed += a[0] * b[1] - a[1] * b[0];
  }
  return [signed, signed === 0 ? "DEGENERATE" : signed > 0 ? "CCW" : "CW"];
}`;
representationReferences["INTERNET-WORD-CHECKSUM"] = `export function transform(input) {
  let sum = 0;
  for (let i = 0; i < input.length; i += 2) sum += input[i] * 256 + (input[i + 1] ?? 0);
  while (sum > 65535) sum = (sum & 65535) + Math.floor(sum / 65536);
  return 65535 - sum;
}`;
representationReferences["STABLE-SEAT-APPORTIONMENT"] = `export function transform(input) {
  const total = input.weights.reduce((sum, value) => sum + value, 0);
  if (!total) return input.weights.map(() => 0);
  const result = input.weights.map(weight => Math.floor(input.seats * weight / total));
  const remainder = input.weights.map((weight, index) => input.seats * weight - result[index] * total);
  let left = input.seats - result.reduce((sum, value) => sum + value, 0);
  while (left--) {
    const index = remainder.indexOf(Math.max(...remainder));
    result[index]++;
    remainder[index] = -1;
  }
  return result;
}`;
representationReferences["AFFINE-POSE-ACCUMULATION"] = `export function transform(input) {
  let combined = [1, 0, 0, 1, 0, 0];
  for (const t of input.transforms) {
    const [a, b, c, d, x, y] = combined;
    combined = [t[0]*a+t[1]*c, t[0]*b+t[1]*d,
      t[2]*a+t[3]*c, t[2]*b+t[3]*d,
      t[0]*x+t[1]*y+t[4], t[2]*x+t[3]*y+t[5]];
  }
  return [combined, [combined[0]*input.point[0]+combined[1]*input.point[1]+combined[4],
    combined[2]*input.point[0]+combined[3]*input.point[1]+combined[5]]];
}`;
representationReferences["FINITE-CHAIN-ARRIVAL-REWARD"] = `export function transform(input) {
  let distribution = input.initial.slice(), reward = 0;
  for (let step = 0; step < input.steps; step++) {
    const next = input.initial.map((_, j) => distribution.reduce((sum, p, i) => sum+p*input.matrix[i][j], 0));
    reward += next.reduce((sum, p, i) => sum+p*input.rewards[i], 0);
    distribution = next;
  }
  return reward;
}`;
representationReferences["GRID-MINIMUM-ENERGY"] = String.raw`export function transform(input) {
  const width = input[0].length, cells = input.flat(), distance = cells.map(() => Infinity);
  if (cells[0] === null || cells.at(-1) === null) return null;
  const frontier = cells.map((value, index) => index);
  distance[0] = 0;
  while (frontier.length) {
    frontier.sort((a, b) => distance[a] - distance[b]);
    const node = frontier.shift();
    for (const next of frontier) {
      if (cells[next] === null) continue;
      if (Math.abs(Math.floor(node / width) - Math.floor(next / width)) + Math.abs(node % width - next % width) !== 1) continue;
      distance[next] = Math.min(distance[next], distance[node] + cells[next]);
    }
  }
  return Number.isFinite(distance.at(-1)) ? distance.at(-1) : null;
}`;
for (const task of [...SOURCE_REPRESENTATION_TASKS, ...ARRAY_BOUND_TRANSFER_TASKS,...SOURCE_LITERAL_TRANSFER_TASKS,...MEASURED_QUALITY_TRANSFER_TASKS,...QUALITY_SITE_TRANSFER_TASKS,...DECISION_CONTRACT_TRANSFER_TASKS,...BOUNDED_CONTRACT_TRANSFER_TASKS,...PATTERN_REPAIR_TRANSFER_TASKS,...LENGTH_GRAMMAR_TRANSFER_TASKS,...NATIVE_REASONING_TRANSFER_TASKS,...ORIGINAL_BUDGET_TRANSFER_TASKS,...BEHAVIOR_REPAIR_TRANSFER_TASKS,...LOCAL_REFACTOR_TRANSFER_TASKS,...EVALUATION_ORDER_TRANSFER_TASKS,...V3_FRESH_BUDGET_TASKS,...PUBLIC_FAILURE_REPAIR_TASKS,...V3_NATIVE_REASONING_TASKS,...STRUCTURAL_CONTRIBUTION_TASKS,...NATIVE_LOCAL_EMISSION_TASKS,...FUNCTION_BODY_TRANSFER_TASKS,...GUARDED_REPAIR_FRESH_TASKS]) {
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
  const publicFailureTask = PUBLIC_FAILURE_REPAIR_TASKS.find(fresh=>fresh.id===task.id);
  const files=representationRepositoryFiles(task,publicFailureTask?{publicExecutionDiagnostics:"BOUNDED_CLASS_ONLY"}:{});
  const session = await R3BenchmarkRepositorySession.create(publicFailureTask
    ?{...files,"src/transform.mjs":publicFailureTask.initialSource}:files, "a".repeat(40), Date.now() + 60000, 12000);
  const baseline = await session.baseline();
  check(baseline.observation.state === "TEST_FAIL", `${task.id} real existing Omega execution observes initial failure`);
  if(publicFailureTask) {
    const category={"EXACT-INTEGER-PRODUCT":"TYPE_ERROR","OVERLAPPING-LITERAL-COUNT":"SYNTAX_ERROR",
      "CLOSED-INTEGER-RANGE":"RANGE_ERROR","PRIORITY-STABLE-ROW-IDS":"REFERENCE_ERROR"}[task.id];
    check(baseline.observation.diagnostics.some(d=>d.message.includes(`error-class=${category}`)),
      `${task.id} supplied fault produces the predeclared public runtime class through existing execution`);
  }
  const source=representationReferences[task.id];
  if([...V3_NATIVE_REASONING_TASKS,...STRUCTURAL_CONTRIBUTION_TASKS,...NATIVE_LOCAL_EMISSION_TASKS,...FUNCTION_BODY_TRANSFER_TASKS,...GUARDED_REPAIR_FRESH_TASKS].some(fresh=>fresh.id===task.id)) {
    const transform = new Function(source.replace("export function","return function"))() as (input: unknown)=>unknown;
    for(const test of [...task.publicCases,...task.privateCases]) check(theoryDigest(transform(structuredClone(test.input)))===theoryDigest(test.expected),
      "new task independent oracle matches test-only reference without adapter canonicalization");
  }
  const referenceIntent=JSON.parse(intent(source));
  referenceIntent.causalHypothesis="The supplied test-only reference implements the stated domain rule.";
  referenceIntent.invariant="Preserve inputs and compute the stated result for all valid arguments.";
  referenceIntent.counterexamples=["Empty input and boundary values"];
  const bodyTask=FUNCTION_BODY_TRANSFER_TASKS.some(fresh=>fresh.id===task.id);
  const cognition=NyxNemotronEngineeringCognition.create({cognitionId:"REFERENCE-ONLY",provider:provider(async(_url,init)=>{
    if (!bodyTask) return reply(JSON.stringify(referenceIntent));
    const prompt=JSON.parse(JSON.parse(String(init?.body)).messages[1].content),entry=prompt.functionBodyEmission.entries[0];
    return reply(JSON.stringify({...referenceIntent,changes:[{target:entry.target,replacement:{bodyRef:entry.bodyRef,
      lines:source.slice(source.indexOf("{")+1,source.lastIndexOf("}")).trim().split("\n"),lineEnding:entry.lineEnding}}]}));
  }),maxPromptBytes:48000,maxOutputTokens:8192,sourceRepresentation:"LINES",intentCompilationMode:"SAFE_CANONICALIZATION",
    ...(bodyTask?{sourceEditScope:"FUNCTION_BODY" as const}:{})});
  const loop=R3BoundedRepairLoop.create({loopId:"REFERENCE-ONLY",evaluatorVersion:"REFERENCE-ONLY",observerIdentity:"REFERENCE-ONLY",
    ...(publicFailureTask||[...V3_FRESH_BUDGET_TASKS,...V3_NATIVE_REASONING_TASKS,...STRUCTURAL_CONTRIBUTION_TASKS,...NATIVE_LOCAL_EMISSION_TASKS,...FUNCTION_BODY_TRANSFER_TASKS,...GUARDED_REPAIR_FRESH_TASKS].some(fresh=>fresh.id===task.id)?{candidateAdmissionPolicyId:V3_FRESH_BUDGET_EPOCH.admissionPolicyId}:{}),
    cognition,candidateBuilder:{builderIdentity:"REFERENCE-ONLY",prepare:h=>session.prepare(h)},maxIterations:1,maxModelInteractions:1,
    maxWallClockMs:30000,maxChangesPerIteration:1,maxPatchBytesPerIteration:12000,maxDiagnosisCharacters:1500});
  const result=await loop.run({schemaVersion:1,repairRequestId:"REFERENCE-ONLY",objective:task.objective,
    initialObservation:baseline.observation,initialFiles:baseline.prepared.files,allowedMutationPaths:["src/transform.mjs"],
    availableEvidence:[],allowedVerificationToolIds:["TEST"],baselineExecutions:[{toolId:"TEST",result:baseline.result}],observedAtEpochMs:Date.now()});
  if(result.outcome!=="FUNCTIONALLY_REPAIRED_VERIFIED")console.error(JSON.stringify({task:task.id,
    referenceAdmission:result.iterations.at(-1)?.candidateAdmission?.findings,reason:result.reason,
    referenceDiagnostics:result.cognitionFailures.flatMap(item=>item.diagnostics.map(d=>({category:d.category,observed:d.observed}))),
    publicDiagnostics:result.iterations.at(-1)?.verifications[0]?.observation.diagnostics.filter(d=>!d.message.startsWith("ENGINEERING_PREDICTIONS"))}));
  check(result.outcome==="FUNCTIONALLY_REPAIRED_VERIFIED"
    && scoreRepresentationArtifact(task,result.iterations.at(-1)?.verifications[0].execution.evidence.stdout??"").accepted,
    `${task.id} test-only reference passes real bounded execution, unchanged quality admission and private scorer: ${result.reason}`);
  const cleanup = await session.close();
  check(cleanup.sourceUnchanged && cleanup.cleanupVerified && cleanup.lifecycleTerminations === cleanup.provisionedLifecycles,
    `${task.id} existing owned lifecycle closes without leaked capability or source mutation`);
}
// Separate E3 integration reproduction, never an implementation seed for the live tasks.
{
  const task: RepresentationTask = {id:"DEV-GUARDED-ADDITION",tier:"DEVELOPMENT",domain:"GUARDED_SOURCE_SELECTION",
    objective:"Return input.value plus thirteen without changing the input.",publicCases:[{input:{value:2},expected:15}],
    privateCases:[{input:{value:-20},expected:-7},{input:{value:0},expected:13}]};
  const first=`export function transform(input) { const a=input.value+1; ${Array.from({length:12},(_,i)=>
    `const ${String.fromCharCode(98+i)}=${String.fromCharCode(97+i)}+1;`).join("\n")} return m; }`;
  const session=await R3BenchmarkRepositorySession.create(representationRepositoryFiles(task),"a".repeat(40),Date.now()+60000,12000);
  let calls=0,selectionOffered=false;
  try {
    const baseline=await session.baseline();
    const cognition=NyxNemotronEngineeringCognition.create({cognitionId:"E3-GUARDED-FRESH-COMPOSITION",
      provider:provider(async(_url,init)=>{
        const wire=JSON.parse(String(init.body)),prompt=JSON.parse(wire.messages[1].content);
        const response=JSON.parse(intent(first));
        if(calls++===0) {
          check(!prompt.localRefactorProposals&&!(wire.response_format.json_schema.schema.anyOf??[]).some((branch:any)=>
            branch.properties?.decision?.enum?.includes("SELECT_LOCAL_REFACTOR")),
            "source-bound selection and proposals cannot guide the initial live engineering candidate");
        } else {
          const guidance=prompt.localRefactorProposals;
          selectionOffered=prompt.activeRepairDriver.kind==="QUALITY_REJECTION"
            &&guidance?.version==="nyx-source-bound-refactor-selection/1"&&guidance.proposals.length>0;
          check(selectionOffered,"existing guarded mechanism composes after actual V3 quality rejection");
          response.decision="SELECT_LOCAL_REFACTOR";
          response.selectedProposalRef=guidance?.proposals[0]?.proposalRef;
          response.evidenceRefs=["OBJECTIVE","FILE:src/transform.mjs",guidance?.evidenceRef,guidance?.passingObservationRef];
          delete response.changes;
        }
        response.causalHypothesis="Inlining a single-use ordered addition chain reduces declarations without changing arithmetic.";
        response.invariant="Preserve input ownership and add exactly thirteen for every numeric value.";
        response.counterexamples=["Zero and negative input"];
        return reply(JSON.stringify(response));
      },"nvidia/nemotron-3-super-120b-a12b"),maxPromptBytes:48000,maxOutputTokens:8192,sourceRepresentation:"LINES",
      intentCompilationMode:"SAFE_CANONICALIZATION",repairFeedbackPolicy:"TRANSIENT_REJECTED_SOURCE_WINDOW",
      ...guardedRepairFreshConfiguration("GUARDED_SELECTION")});
    const loop=R3BoundedRepairLoop.create({loopId:task.id,evaluatorVersion:"E3-GUARDED-COMPOSITION/1",observerIdentity:"E3-EXISTING-R3",
      candidateAdmissionPolicyId:V3_NATIVE_REASONING_EPOCH.admissionPolicyId,cognition,
      candidateBuilder:{builderIdentity:"EXISTING-OMEGA-R3",prepare:h=>session.prepare(h)},maxIterations:2,maxModelInteractions:2,
      maxWallClockMs:30000,maxChangesPerIteration:1,maxPatchBytesPerIteration:12000,maxDiagnosisCharacters:1500});
    const result=await loop.run({schemaVersion:1,repairRequestId:task.id,objective:task.objective,
      initialObservation:baseline.observation,initialFiles:baseline.prepared.files,allowedMutationPaths:["src/transform.mjs"],
      availableEvidence:[],allowedVerificationToolIds:["TEST"],baselineExecutions:[{toolId:"TEST",result:baseline.result}],observedAtEpochMs:Date.now()});
    const prior=result.iterations[0],last=result.iterations.at(-1);
    check(calls===2&&selectionOffered&&prior.functionallyPassed&&prior.candidateAdmission?.decision==="REJECTED"
      &&scoreRepresentationArtifact(task,prior.verifications[0].execution.evidence.stdout).accepted,
      "ordinary-loop test double begins with a real correct, cumulative-quality-rejected candidate");
    check(last?.cognitionEvidence.refactorSelection?.outcome==="RESOLVED"
      &&last.cognitionEvidence.refactorSelection.sourceOrigin==="HOST_PROPOSAL_MODEL_SELECTED"
      &&!last.cognitionEvidence.refactorSelection.authorityGranted&&!last.cognitionEvidence.refactorSelection.acceptanceGranted,
      "explicit source selection expands a host proposal, never authority or self-certification");
    check(result.outcome==="FUNCTIONALLY_REPAIRED_VERIFIED"&&last?.functionallyPassed&&last.candidateAdmission?.decision==="ADMITTED"
      &&scoreRepresentationArtifact(task,last.verifications[0].execution.evidence.stdout).accepted,
      "selected guarded source preserves independent private behavior while meeting original-state quality checks");
  } finally {
    const cleanup=await session.close();
    check(cleanup.sourceUnchanged&&cleanup.cleanupVerified,"guarded composition closes only its owned disposable lifecycle");
  }
}
// Separate, synthesized development reproductions. These are E3 test doubles,
// not recovered raw NYX source, not evidence of native reasoning efficacy, and
// never sent to either live arm. An incorrect quality refactor can pass public
// checks and admission while the independent private scorer still rejects it.
for(const development of [
  { task:{id:"DEV-CROSS-CHUNK-CARRY",tier:"DEVELOPMENT",domain:"ORDERED_STATE_PRESERVATION",
      objective:"Return cumulative sums across all integer chunks, in stream order. Preserve inputs.",
      publicCases:[{input:[[1,2]],expected:[1,3]}],privateCases:[{input:[[1],[2]],expected:[1,3]},{input:[[],[3],[-1]],expected:[3,2]}]} satisfies RepresentationTask,
    body:"let total=0; return data12.flat().map(value=>total+=value);",
    bad:"export function transform(input) { return input.flatMap(group=>{let total=0;return group.map(value=>total+=value);}); }" },
  { task:{id:"DEV-PER-STEP-SATURATION",tier:"DEVELOPMENT",domain:"NONLINEAR_UPDATE_ORDER",
      objective:"Add each value to initial in order and clamp to [-3,3] after EACH update. Empty values returns initial. Preserve inputs.",
      publicCases:[{input:{initial:0,values:[1,1]},expected:2}],privateCases:[{input:{initial:0,values:[10,-10]},expected:-3},{input:{initial:8,values:[]},expected:8}]} satisfies RepresentationTask,
    body:"let state=data12.initial; for(const value of data12.values) state=Math.max(-3,Math.min(3,state+value)); return state;",
    bad:"export function transform(input) { if(!input.values.length)return input.initial; return Math.max(-3,Math.min(3,input.values.reduce((sum,value)=>sum+value,input.initial))); }" },
]) {
  // Deliberately redundant identity chain produces a provenance-bound declaration rejection.
  const first = `export function transform(input) { const data0=input; ${Array.from({length:12},(_,i)=>`const data${i+1}=data${i};`).join("\n")} ${development.body} }`;
  const session=await R3BenchmarkRepositorySession.create(representationRepositoryFiles(development.task),"a".repeat(40),Date.now()+60000,12000);
  let calls=0,qualityDriverObserved=false;
  try {
    const baseline=await session.baseline();
    const cognition=NyxNemotronEngineeringCognition.create({cognitionId:"E3-SEMANTIC-REGRESSION-REPRODUCTION",
      provider:provider(async(_url,init)=>{
        const body=JSON.parse(String(init.body)); const prompt=JSON.parse(body.messages[1].content);
        qualityDriverObserved ||= prompt.activeRepairDriver.kind==="QUALITY_REJECTION";
        check(prompt.activeRepairDriver.kind==="QUALITY_REJECTION"
          ?prompt.structuralContributions?.version==="nyx-structural-contribution-guidance/1"
            &&prompt.structuralContributions.sources[0].sourceDigest===contentHash(prompt.admittedEvidence
              .find((e:any)=>e.kind==="FILE"&&e.target==="src/transform.mjs").content)
            &&prompt.structuralContributions.authorityGranted===false
          :!Object.hasOwn(prompt,"structuralContributions"),
          "opt-in map is absent initially and bound to the actually admitted source, not pre-canonicalization emission");
        const next=JSON.parse(intent(calls++===0?first:development.bad));
        next.causalHypothesis="Synthesized development refactor changes state placement or update ordering.";
        return reply(JSON.stringify(next));
      }),maxPromptBytes:48000,maxOutputTokens:8192,sourceRepresentation:"LINES",intentCompilationMode:"SAFE_CANONICALIZATION",
      structuralContributionGuidance:"CONTROL_SITES"});
    const loop=R3BoundedRepairLoop.create({loopId:development.task.id,evaluatorVersion:"E3-REPRODUCTION/1",observerIdentity:"E3-REPRODUCTION",
      candidateAdmissionPolicyId:V3_NATIVE_REASONING_EPOCH.admissionPolicyId,cognition,
      candidateBuilder:{builderIdentity:"EXISTING-OMEGA-R3",prepare:h=>session.prepare(h)},maxIterations:2,maxModelInteractions:2,
      maxWallClockMs:30000,maxChangesPerIteration:1,maxPatchBytesPerIteration:12000,maxDiagnosisCharacters:1500});
    const result=await loop.run({schemaVersion:1,repairRequestId:development.task.id,objective:development.task.objective,
      initialObservation:baseline.observation,initialFiles:baseline.prepared.files,allowedMutationPaths:["src/transform.mjs"],
      availableEvidence:[],allowedVerificationToolIds:["TEST"],baselineExecutions:[{toolId:"TEST",result:baseline.result}],observedAtEpochMs:Date.now()});
    const prior=result.iterations[0],last=result.iterations.at(-1);
    check(calls===2&&qualityDriverObserved&&prior.functionallyPassed&&prior.candidateAdmission?.decision==="REJECTED"
      &&scoreRepresentationArtifact(development.task,prior.verifications[0].execution.evidence.stdout).accepted,
      "separate development reproduction begins with correct but quality-rejected code and a real quality repair request");
    check(last?.functionallyPassed&&last.candidateAdmission?.decision==="ADMITTED"
      &&!scoreRepresentationArtifact(development.task,last.verifications[0].execution.evidence.stdout).accepted,
      "behavior-destroying quality refactor is a private semantic failure despite valid emission and public success");
    check(!assessRepresentationCandidate(development.task,{publicAccepted:last?.functionallyPassed===true,
      qualityAccepted:last?.candidateAdmission?.decision==="ADMITTED",verificationStdout:last?.verifications[0].execution.evidence.stdout??null,
      loopVerified:result.outcome==="FUNCTIONALLY_REPAIRED_VERIFIED"}).accepted,
      "independent final acceptance cannot be replaced by the repair loop's public-pass label");
  } finally {
    const cleanup=await session.close();
    check(cleanup.sourceUnchanged&&cleanup.cleanupVerified,"synthesized semantic reproduction preserves source and cleans lifecycle");
  }
}
{
  const base={accepted:false,infrastructureFailure:false,reason:"repair_iteration_budget_exhausted",
    qualityRejected:true,publicFailed:false,privateFailure:null};
  check(classifyRepresentationFailure(base)==="QUALITY_REJECTION","exhausted quality repairs classified by genuine defect rather than generic resource budget");
  check(classifyRepresentationFailure({...base,reason:"repair_wall_clock_budget_exhausted"})==="RESOURCE_EXHAUSTION",
    "actual wall-clock exhaustion remains a separate resource failure");
  check(classifyRepresentationFailure({...base,reason:"nvidia_provider_http_503"})==="PROVIDER_FAILURE",
    "failed provider repair is not concealed by a previous quality rejection");
  for(const category of ["PROVIDER_TIMEOUT","PROVIDER_RATE_LIMIT","PROVIDER_SERVER_ERROR","PROVIDER_TRANSPORT_ERROR"])
    check(classifyRepresentationFailure({...base,reason:"repair_cognition_nvidia_http_attempt_budget_exhausted",
      latestProviderFailure:category})==="PROVIDER_FAILURE",
      "structured terminal delivery failure outranks retained supplied-candidate quality rejection");
  check(classifyRepresentationFailure({...base,qualityRejected:false,latestProviderFailure:null})==="INSUFFICIENT_EVIDENCE",
    "an unrepaired supplied candidate does not manufacture a live-model quality failure");
  check(classifyRepresentationFailure({...base,accepted:true,latestProviderFailure:"PROVIDER_TIMEOUT"})===null,
    "a completed accepted result is not overridden by stale failure metadata");
  check(classifyRepresentationFailure({...base,infrastructureFailure:true,latestProviderFailure:"PROVIDER_TIMEOUT"})==="INFRASTRUCTURE_FAILURE",
    "an evaluator infrastructure failure remains separately attributable");
  const delivery={httpAttempts:1,rateLimitedResponses:0,transientUnavailableResponses:0,timedOutAttempts:0};
  for(const counter of ["rateLimitedResponses","transientUnavailableResponses","timedOutAttempts"])
    check(classifyRepresentationFailure({...base,reason:"repair_cognition_nvidia_http_attempt_budget_exhausted",
      latestProviderFailure:null,latestDelivery:{...delivery,[counter]:1}})==="PROVIDER_FAILURE",
      "null-category retry-budget refusal preserves structured failed-dispatch attribution");
  check(classifyRepresentationFailure({...base,reason:"repair_cognition_nvidia_http_attempt_budget_exhausted",
    latestDelivery:{...delivery,httpAttempts:0}})==="RESOURCE_EXHAUSTION",
    "zero-dispatch shared-budget denial is not a provider or quality failure");
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
{
  const sensitive = "PRIVATE_SENTINEL_DO_NOT_EMIT";
  check(publicFailureRepairTasks().length===8&&new Set(publicFailureRepairTasks().map(task=>task.id)).size===8,
    "public diagnostic epoch has four unique tasks and two predeclared distinct repeats, not eight independent tasks");
  check(theoryDigest(publicFailureRepairConfiguration("OPAQUE_EXCEPTION_CONTROL"))
    ===theoryDigest(publicFailureRepairConfiguration("PUBLIC_EXCEPTION_CLASS")),
    "public diagnostic arms have exactly identical cognition configuration");
  const wire={publicExceptionClassCount:0,privateExceptionClassCount:0,publicAdmissionPolicyId:PUBLIC_FAILURE_REPAIR_EPOCH.admissionPolicyId,
    contextPaths:["src/examples.mjs","src/inputs.mjs","src/transform.mjs"]};
  check(publicFailureContext([...wire.contextPaths,"tools/verify.mjs"].map(relativePath=>({relativePath}))).length===3
    &&!publicFailureRepairWireVerified("PUBLIC_EXCEPTION_CLASS",[{...wire,publicExceptionClassCount:1,
      contextPaths:[...wire.contextPaths,"tools/verify.mjs"]}]),
    "verifier implementation is excluded from both cognition contexts and treatment leakage disqualifies comparison");
  check(publicFailureRepairWireVerified("OPAQUE_EXCEPTION_CONTROL",[wire])
    &&publicFailureRepairWireVerified("PUBLIC_EXCEPTION_CLASS",[{...wire,publicExceptionClassCount:1},wire]),
    "public diagnostic treatment is witnessed on initial failure but need not appear on later non-exception repairs");
  for(const invalid of [{...wire,publicExceptionClassCount:-1},{...wire,privateExceptionClassCount:1},
    {...wire,publicAdmissionPolicyId:"omega-public-static-candidate/2"},{...wire,publicExceptionClassCount:undefined}]) {
    check(!publicFailureRepairWireVerified("PUBLIC_EXCEPTION_CLASS",[invalid]),
      "missing, private, unbounded or wrong-policy diagnostic observations cannot qualify a comparison");
  }
  check(!publicFailureRepairWireVerified("PUBLIC_EXCEPTION_CLASS",[wire])
    &&!publicFailureRepairWireVerified("OPAQUE_EXCEPTION_CONTROL",[{...wire,publicExceptionClassCount:1}]),
    "unexercised treatment and contaminated control remain invalid comparisons");
  for (const [error, label] of [[new ReferenceError(sensitive), "REFERENCE_ERROR"],
    [new TypeError(sensitive), "TYPE_ERROR"], [new RangeError(sensitive), "RANGE_ERROR"],
    [new SyntaxError(sensitive), "SYNTAX_ERROR"], [new Error(sensitive), "ERROR"],
    [sensitive, "UNKNOWN_THROW"], [null, "UNKNOWN_THROW"], [42, "UNKNOWN_THROW"]] as const) {
    const result = publicExecutionFailure(error, 0);
    check(result.includes(`error-class=${label}`) && !result.includes(sensitive),
      "public exception diagnostics expose bounded class, never raw message or thrown value");
  }
  const native = new TypeError(sensitive);
  Object.defineProperty(native, "stack", {value:`TypeError: ${sensitive}\n    at transform (file:///private-root/src/transform.mjs:7:11)\n    at other (file:///secrets/credentials.mjs:1:1)`, configurable:true});
  Object.defineProperty(native, "name", {get(){throw Error("name_getter_must_not_run");}});
  check(publicExecutionFailure(native, 1) === "FAIL public-example=1 execution-error error-class=TYPE_ERROR",
    "public exception coordinates exclude every absolute path and user-controlled name");
  let accessed = false;
  const accessor = new Error(sensitive);
  Object.defineProperty(accessor, "stack", {get(){accessed=true;return sensitive;},configurable:true});
  check(publicExecutionFailure(accessor, 0)==="FAIL public-example=0 execution-error error-class=ERROR" && !accessed,
    "diagnostic extractor does not invoke candidate stack accessors");
  const proxy = new Proxy({}, {getPrototypeOf(){throw Error(sensitive);}});
  check(publicExecutionFailure(proxy, 0).includes("UNKNOWN_THROW") && !publicExecutionFailure(proxy, 0).includes(sensitive),
    "hostile exception objects cannot inject diagnostics or stop the verifier");
  for (const stack of [`Error: /src/transform.mjs:2:3`, `Error\n    at other (/private/transform.mjs:2:3)`,
    `Error\n    at transform (/private/src/transform.mjs:0:3)`, `Error\n    at transform (/private/src/transform.mjs:10001:3)`,
    "x".repeat(8001)]) {
    const error = new Error(sensitive); Object.defineProperty(error,"stack",{value:stack,configurable:true});
    check(publicExecutionFailure(error, 0)==="FAIL public-example=0 execution-error error-class=ERROR",
      "message headers, unrelated files and out-of-bound stack locations remain unknown");
  }
  rejects(()=>publicExecutionFailure(native, -1), "public exception index cannot be arbitrary text or out of range");
  rejects(()=>publicExecutionFailure(native, 16), "public exception evidence has a finite example bound");
  const task = {id:"PUBLIC-FAILURE-DEVELOPMENT",tier:"DEVELOPMENT" as const,domain:"RUNTIME_DIAGNOSTICS",
    objective:"Return exact integer quotient as a string for decimal integer strings n,d where d is nonzero.",
    publicCases:[{input:{n:"15",d:"2"},expected:"7"}], privateCases:[{input:{n:"8",d:"3"},expected:"2"}]};
  const files = representationRepositoryFiles(task);
  const priorModule=execFileSync("git",["show","72942530005025df5ae40dc83ba7c7fc84432576:scripts/omega/benchmarks/sourceRepresentationTasks.ts"],{encoding:"utf8"});
  const priorFunction=priorModule.slice(priorModule.indexOf("export function representationRepositoryFiles"),
    priorModule.indexOf("export function scoreRepresentationArtifact"));
  const typescript=await import("typescript");
  const compiled=typescript.transpileModule(priorFunction,{compilerOptions:{target:typescript.ScriptTarget.ES2022,
    module:typescript.ModuleKind.ESNext}}).outputText.replace("export function","function");
  const previousFixture=new Function("observePublicRuntimeSample",compiled+"\nreturn representationRepositoryFiles;")(observePublicRuntimeSample);
  check([...SOURCE_REPRESENTATION_TASKS,...V3_FRESH_BUDGET_TASKS,...PUBLIC_FAILURE_REPAIR_TASKS].every(item=>
    theoryDigest(previousFixture(item))===theoryDigest(representationRepositoryFiles(item))),
    "omitted public diagnostic option preserves exact fixture bytes from frozen predecessor across old and new domains");
  const enriched = representationRepositoryFiles(task,{publicExecutionDiagnostics:"BOUNDED_CLASS_ONLY"});
  check(Object.keys(files).every(path=>path==="tools/verify.mjs"||files[path]===enriched[path]),
    "public diagnostic treatment leaves source, examples and withheld inputs byte-identical");
  check(enriched["tools/verify.mjs"].includes('catch {console.error("FAIL private-input execution-error"); failed++;}')
    && !files["tools/verify.mjs"].includes("error-class="),
    "withheld runtime failures remain opaque and omitted configuration preserves legacy feedback");
  rejects(()=>representationRepositoryFiles(task,{publicExecutionDiagnostics:"RAW" as any}),
    "raw exception diagnostics are not an admitted option");
  rejects(()=>representationRepositoryFiles(task,{other:true} as any), "unknown diagnostic options cannot silently select treatment");
  // Reproduce through the existing real R3 executor/observer, not a mocked log.
  const source = 'export function transform(input) {\n  return (BigInt(input.n) / Number(input.d)).toString();\n}\n';
  const observations: string[][] = [];
  for (const config of [{}, {publicExecutionDiagnostics:"BOUNDED_CLASS_ONLY" as const}]) {
    const session=await R3BenchmarkRepositorySession.create({...representationRepositoryFiles(task,config),
      "src/transform.mjs":source},"a".repeat(40),Date.now()+60000,12000);
    try {
      const baseline=await session.baseline();
      observations.push(baseline.observation.diagnostics.map(d=>d.message));
      check(baseline.result.outcome==="FAIL" && baseline.observation.state==="TEST_FAIL",
        "richer public runtime evidence cannot turn a failing execution into acceptance");
    } finally {
      const cleanup=await session.close();
      check(cleanup.sourceUnchanged&&cleanup.cleanupVerified,"public diagnostic development preserves source and verifies disposal");
    }
  }
  check(observations[0].some(message=>message==="FAIL public-example=0 execution-error")
    && !observations[0].some(message=>message.includes("TYPE_ERROR")),
    "existing pipeline reproduces native TypeError being erased before NYX feedback");
  check(observations[1].some(message=>message.includes("error-class=TYPE_ERROR"))
    && observations[1].some(message=>message==="FAIL private-input execution-error"),
    "existing observer carries sanitized public class while private failure stays opaque");
}
console.log(`passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;

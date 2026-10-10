import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NyxNemotronEngineeringCognition, type NyxRepairCognitionEvidence } from "../../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";
import { R3BoundedRepairLoop } from "../../src/lib/codelab/engine/r3BoundedRepairLoop";
import { NVIDIA_NIM_CHAT_COMPLETIONS_URL, NvidiaNimProvider, nvidiaNimCredentialFromEnvironment } from "../../src/lib/codelab/model/nvidiaNimProvider";
import { theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import { contentHash, R3BenchmarkRepositorySession } from "./benchmarks/r3RepositorySession";
import { SOURCE_REPRESENTATION_TASKS, representationRepositoryFiles, assessRepresentationCandidate, classifyRepresentationFailure } from "./benchmarks/sourceRepresentationTasks";
import { inferUsage } from "./benchmarks/nyxArcAdapter";
import { inspectNyxSourceEmission } from "./nyx-source-emission-diagnostics";
import { ARRAY_BOUND_TRANSFER_TASKS } from "./benchmarks/arrayBoundTransferTasks";
import { SOURCE_LITERAL_TRANSFER_TASKS } from "./benchmarks/sourceLiteralTransferTasks";
import { MEASURED_QUALITY_TRANSFER_TASKS } from "./benchmarks/measuredQualityTransferTasks";
import { QUALITY_SITE_TRANSFER_TASKS } from "./benchmarks/qualitySiteTransferTasks";
import { DECISION_CONTRACT_TRANSFER_TASKS } from "./benchmarks/decisionContractTransferTasks";
import { NYX_DECISION_REQUIRED_SCHEMA_POLICY, NYX_BOUNDED_DECISION_SCHEMA_POLICY,
  NYX_LENGTH_BOUNDED_DECISION_SCHEMA_POLICY } from "../../src/lib/codelab/cognition/nyxDecisionRequiredSchema";
import { BOUNDED_CONTRACT_TRANSFER_TASKS } from "./benchmarks/boundedContractTransferTasks";
import { PATTERN_REPAIR_TRANSFER_TASKS } from "./benchmarks/patternRepairTransferTasks";
import { LENGTH_GRAMMAR_TRANSFER_TASKS } from "./benchmarks/lengthGrammarTransferTasks";
import { NATIVE_REASONING_TRANSFER_TASKS, nativeReasoningTransferConfiguration } from "./benchmarks/nativeReasoningTransferTasks";
import { ORIGINAL_BUDGET_TRANSFER_TASKS, originalBudgetTransferConfiguration,
  originalBudgetWireControlVerified } from "./benchmarks/originalBudgetTransferTasks";
import { BEHAVIOR_REPAIR_TRANSFER_TASKS, behaviorRepairTransferConfiguration,
  behaviorRepairWireControlVerified } from "./benchmarks/behaviorRepairTransferTasks";
import { LOCAL_REFACTOR_TRANSFER_TASKS, localRefactorTransferConfiguration,
  localRefactorWireControlVerified } from "./benchmarks/localRefactorTransferTasks";

if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1" || !process.env.NVIDIA_API_KEY?.trim())
  throw Error("source_representation_cycle_requires_injected_secret_and_explicit_network");
const git = (...args: string[]) => execFileSync("git", args, {encoding: "utf8"}).trim();
const candidate = process.env.GITHUB_SHA || git("rev-parse", "HEAD");
if (!/^[a-f0-9]{40}$/.test(candidate) || candidate !== git("rev-parse", "HEAD") || git("status", "--porcelain"))
  throw Error("source_representation_cycle_clean_candidate_required");
const original = theoryDigest(git("ls-files", "-s"));
const nativeReasoningComparison = process.env.NYX_NATIVE_REASONING_TRANSFER === "1";
const originalBudgetComparison = process.env.NYX_ORIGINAL_BUDGET_TRANSFER === "1";
const behaviorRepairComparison = process.env.NYX_BEHAVIOR_REPAIR_TRANSFER === "1";
const localRefactorComparison = process.env.NYX_LOCAL_REFACTOR_TRANSFER === "1";
const qualityMechanismComparison = behaviorRepairComparison || localRefactorComparison;
const budgetGuidanceComparison = originalBudgetComparison || qualityMechanismComparison;
const decisionContractComparison = process.env.NYX_DECISION_CONTRACT_COMPARISON === "1";
const boundedContractComparison = process.env.NYX_BOUNDED_CONTRACT_COMPARISON === "1";
const patternTransfer = process.env.NYX_PATTERN_TRANSFER_TASKS === "1";
if(patternTransfer && !boundedContractComparison) throw Error("pattern_transfer_requires_bounded_comparison");
const lengthTransfer = process.env.NYX_LENGTH_TRANSFER_TASKS === "1";
if(lengthTransfer && (!boundedContractComparison || patternTransfer)) throw Error("length_transfer_requires_exclusive_bounded_comparison");
const boundedTreatment = lengthTransfer ? "DECISION_REQUIRED_FIELDS_AND_LENGTHS" : "DECISION_REQUIRED_FIELDS_AND_BOUNDS";
const decisionGenerationComparison = decisionContractComparison || boundedContractComparison || nativeReasoningComparison || budgetGuidanceComparison;
const model = decisionGenerationComparison ? "nvidia/nemotron-3-super-120b-a12b" : "nvidia/nemotron-3-ultra-550b-a55b";
const boundsComparison = process.env.NYX_ARRAY_BOUND_COMPARISON === "1";
const localDeliveryComparison=process.env.NYX_STRICT_LOCAL_COMPARISON==="1";
const qualityGuidanceComparison=process.env.NYX_MEASURED_QUALITY_COMPARISON==="1";
const qualitySiteComparison=process.env.NYX_QUALITY_SITE_COMPARISON==="1";
if([boundsComparison,localDeliveryComparison,qualityGuidanceComparison,qualitySiteComparison,decisionContractComparison,boundedContractComparison,nativeReasoningComparison,originalBudgetComparison,behaviorRepairComparison,localRefactorComparison].filter(Boolean).length>1)throw Error("comparison_variables_must_not_be_combined");
const variants=localRefactorComparison?["QUALITY_SITES_CONTROL","GUARDED_REFACTOR_PROPOSALS"]:behaviorRepairComparison?["QUALITY_SITES_CONTROL","BINDING_USES"]:originalBudgetComparison?["STRUCTURE_SITES_CONTROL","ORIGINAL_BUDGET"]:nativeReasoningComparison?["NATIVE_NONE","NATIVE_BOUNDED_REASONING"]:boundedContractComparison?["DECISION_REQUIRED_FIELDS",boundedTreatment]:decisionContractComparison?["LEGACY_OPTIONAL_FIELDS","DECISION_REQUIRED_FIELDS"]:qualitySiteComparison?["MEASURED_STRUCTURE","STRUCTURE_SITES"]:qualityGuidanceComparison?["PUBLIC_METRICS","MEASURED_STRUCTURE"]:localDeliveryComparison?["HOSTED_BOUNDED","STRICT_LOCAL"]:boundsComparison?["LEGACY_OMITTED","CORRECTED_BOUNDED"]:["LINES","TEXT"];
const selectedTasks = localRefactorComparison?LOCAL_REFACTOR_TRANSFER_TASKS:behaviorRepairComparison?BEHAVIOR_REPAIR_TRANSFER_TASKS:originalBudgetComparison?ORIGINAL_BUDGET_TRANSFER_TASKS:nativeReasoningComparison?NATIVE_REASONING_TRANSFER_TASKS:boundedContractComparison?(lengthTransfer?LENGTH_GRAMMAR_TRANSFER_TASKS:patternTransfer?PATTERN_REPAIR_TRANSFER_TASKS:BOUNDED_CONTRACT_TRANSFER_TASKS):decisionContractComparison?DECISION_CONTRACT_TRANSFER_TASKS:qualitySiteComparison?QUALITY_SITE_TRANSFER_TASKS:qualityGuidanceComparison?MEASURED_QUALITY_TRANSFER_TASKS:localDeliveryComparison?SOURCE_LITERAL_TRANSFER_TASKS:boundsComparison ? ARRAY_BOUND_TRANSFER_TASKS : SOURCE_REPRESENTATION_TASKS;
const frozen = {model, temperature: 0, inferencePolicy: nativeReasoningComparison?"PER_ARM_FROZEN_NATIVE":"CONSTRAINED_JSON", maxOutputTokens: localDeliveryComparison||qualityGuidanceComparison||qualitySiteComparison?4096:8192,
  taskCorpus:localRefactorComparison?"nyx-local-refactor-exposed-development/2":behaviorRepairComparison?"nyx-behavior-repair-fresh-transfer/1":originalBudgetComparison?"nyx-original-budget-fresh-transfer/1":nativeReasoningComparison?"nyx-native-reasoning-fresh-transfer/1":lengthTransfer?"nyx-length-grammar-transfer/1":patternTransfer?"nyx-pattern-repair-transfer/1":"HISTORICAL_SELECTED_CORPUS",
  providerTimeoutMs: 65000, logicalCallsPerTask: 2, candidateIterationsPerTask: 2, toolCallsPerTask: 3,
  wallClockMsPerTask: 155000, globalWallClockMs: 1350000, maxPatchBytes: 12000,
  maxPromptBytes: 48000, realizedTolerance: 0.1,
  ...(decisionGenerationComparison ? {physicalCallsPerTaskIncludingRetries: 2, reasoningControl: "SUPER_HOSTED_NATIVE",
    ...(nativeReasoningComparison?{reasoningPolicies:{NATIVE_NONE:{effort:"none",budget:null},
      NATIVE_BOUNDED_REASONING:{effort:"high",budget:2048}}}:{reasoningEffort:"none"}),
    generationPolicy: nativeReasoningComparison||budgetGuidanceComparison?NYX_LENGTH_BOUNDED_DECISION_SCHEMA_POLICY:boundedContractComparison?(lengthTransfer?NYX_LENGTH_BOUNDED_DECISION_SCHEMA_POLICY:NYX_BOUNDED_DECISION_SCHEMA_POLICY):NYX_DECISION_REQUIRED_SCHEMA_POLICY} : {}),
  changedVariable: localRefactorComparison?"OPTIONAL_GUARDED_CONCRETE_PROPOSALS_ON_QUALITY_ONLY_REPAIR":behaviorRepairComparison?"BOUND_CURRENT_SOURCE_BINDING_USES_ON_QUALITY_ONLY_REPAIR":originalBudgetComparison?"EXACT_ORIGINAL_STATE_PUBLIC_STRUCTURAL_BUDGET_BEFORE_FIRST_CANDIDATE_ONLY":nativeReasoningComparison?"EXISTING_NATIVE_REASONING_RESERVATION_WITHIN_SHARED_OUTPUT_CAP":boundedContractComparison?"REQUEST_DERIVED_GENERATION_BOUNDS_ONLY":decisionContractComparison?"DECISION_REQUIRED_PROVIDER_FIELDS_ONLY":qualitySiteComparison
    ?"AGGREGATE_MEASUREMENTS_VS_BOUNDED_AST_DECLARATION_SITES_ONLY":qualityGuidanceComparison
    ?"PUBLIC_STATIC_METRICS_VS_SOURCE_LINKED_DETECTOR_EXPLANATION_ONLY":localDeliveryComparison
    ?"EXISTING_HOSTED_VS_STRICT_LOCAL_DELIVERY_ONLY":boundsComparison
    ? "HOSTED_MAX_ITEMS_PRESERVED_VS_OMITTED_ONLY" : "EXISTING_TEXT_VS_LINES_SOURCE_REPRESENTATION_ONLY",
  publicFeedback: "IDENTICAL_PUBLIC_TEST_FAILURE_AND_STATIC_ADMISSION", authority: "EXISTING_R3_ISOLATED_ONLY",
  ...(originalBudgetComparison?{postQualityGuidance:"IDENTICAL_STRUCTURE_SITES",preCandidateGuidance:{
    STRUCTURE_SITES_CONTROL:"EXISTING_PUBLIC_POLICY_ONLY",ORIGINAL_BUDGET:"PUBLIC_ORIGINAL_STATE"}}:{}),
  ...(behaviorRepairComparison?{preCandidateGuidance:"IDENTICAL_PUBLIC_ORIGINAL_STATE",postQualityGuidance:{
    QUALITY_SITES_CONTROL:"STRUCTURE_SITES",BINDING_USES:"STRUCTURE_SITES_PLUS_LEXICAL_BINDING_USES"},
    firstAttemptDifferences:"NO_TREATMENT_PRESENT_BEFORE_QUALITY_REJECTION_NOT_CAUSAL_MECHANISM_GAINS"}:{}),
  ...(localRefactorComparison?{preCandidateGuidance:"IDENTICAL_PUBLIC_ORIGINAL_STATE",postQualityGuidance:{
    QUALITY_SITES_CONTROL:"STRUCTURE_SITES",GUARDED_REFACTOR_PROPOSALS:"STRUCTURE_SITES_PLUS_CONCRETE_LOCAL_PROPOSALS"},
    maximumLocalRefactorOperations:8,localRefactorCost:"BOUNDED_HOST_AST_NO_EXTRA_MODEL_OR_EXECUTION_CALLS",
    firstAttemptDifferences:"NO_TREATMENT_PRESENT_BEFORE_QUALITY_REJECTION_NOT_CAUSAL_MECHANISM_GAINS"}:{}),
  realizedMatchScope: "REPORTED_MODEL_CALLS_TOKENS_AND_VERIFIER_WORK_NOT_TOTAL_HOST_CPU",
  hostDiagnosticCost: "INCLUDED_IN_WALL_CLOCK_NOT_SEPARATELY_PROFILED",
  sourceMutations: false, generalShell: false, generalNetwork: false, production: false,
  hostileCodeSandbox: false, candidateNetworkIsolation: "NOT_PROVEN"};
const sourceDigests = Object.fromEntries(await Promise.all([
  "src/lib/codelab/cognition/nyxNemotronEngineeringCognition.ts", "src/lib/codelab/cognition/nyxRepairIntentCompiler.ts",
  "src/lib/codelab/engine/r3BoundedRepairLoop.ts", "scripts/omega/benchmarks/sourceRepresentationTasks.ts",
  "scripts/omega/benchmarks/arrayBoundTransferTasks.ts", "scripts/omega/benchmarks/sourceLiteralTransferTasks.ts",
  "scripts/omega/benchmarks/measuredQualityTransferTasks.ts", "src/lib/codelab/cognition/nyxMeasuredQualityGuidance.ts",
  "scripts/omega/benchmarks/qualitySiteTransferTasks.ts",
  "src/lib/codelab/assurance/engineeringQualityOracle.ts",
  ...(budgetGuidanceComparison ? ["src/lib/codelab/assurance/candidateEngineeringAdmission.ts"] : []),
  ...(localRefactorComparison ? ["src/lib/codelab/cognition/nyxLocalRefactorProposals.ts"] : []),
  ...(decisionGenerationComparison ? ["src/lib/codelab/cognition/nyxDecisionRequiredSchema.ts",
    localRefactorComparison?"scripts/omega/benchmarks/localRefactorTransferTasks.ts":behaviorRepairComparison?"scripts/omega/benchmarks/behaviorRepairTransferTasks.ts":originalBudgetComparison?"scripts/omega/benchmarks/originalBudgetTransferTasks.ts":nativeReasoningComparison?"scripts/omega/benchmarks/nativeReasoningTransferTasks.ts":boundedContractComparison?(lengthTransfer?"scripts/omega/benchmarks/lengthGrammarTransferTasks.ts":patternTransfer?"scripts/omega/benchmarks/patternRepairTransferTasks.ts":"scripts/omega/benchmarks/boundedContractTransferTasks.ts"):"scripts/omega/benchmarks/decisionContractTransferTasks.ts", "scripts/omega/nyx-source-representation-cycle.ts",
    "src/lib/codelab/model/nvidiaNimProvider.ts", "scripts/omega/benchmarks/r3RepositorySession.ts",
    "scripts/omega/benchmarks/nyxArcAdapter.ts"] : [])
].map(async path => [path, contentHash(await readFile(path, "utf8"))])));
const began = Date.now(); const globalDeadline = began + frozen.globalWallClockMs;
const tasks = selectedTasks.map(t => ({id: t.id, tier: t.tier, domain: t.domain,
  inputDigest: theoryDigest({objective: t.objective, publicCases: t.publicCases, privateInputs: t.privateCases.map(c => c.input)}),
  oracleDigest: theoryDigest(t.privateCases), fixtureDigest: theoryDigest(t)}));
console.log(`NYX_REPRESENTATION_FREEZE ${JSON.stringify({candidate, frozen, sourceDigests, tasks, freezeDigest: theoryDigest({candidate, frozen, sourceDigests, tasks})})}`);
const results: any[] = [];
for (const [index, task] of selectedTasks.entries()) {
  // Balanced order, not selected by the model or observed outcome.
  for (const variant of (index % 2 ? variants.slice().reverse() : variants)) {
    const representation = boundsComparison||localDeliveryComparison||qualityGuidanceComparison||qualitySiteComparison||decisionGenerationComparison ? "LINES" : variant as "TEXT" | "LINES";
    const preserveProviderArrayBounds = !boundsComparison || variant === "CORRECTED_BOUNDED";
    if (Date.now() >= globalDeadline) {results.push({id: task.id, variant, representation, state: "BLOCKED_GLOBAL_BUDGET"}); continue;}
    const started = Date.now(); const deadline = Math.min(globalDeadline, started + frozen.wallClockMsPerTask);
    const captures: {content: string | null; finishReason: string | null}[] = [];
    const observedInferenceControls: {model: unknown; maxTokens: unknown; temperature: unknown;
      effort: unknown; reasoningBudget: unknown; schemaDigest: string;
      initialCandidateState?: boolean; originalBudgetPresented?: boolean;
      qualityRepairPhase?: boolean; bindingUsesPresented?: boolean; localProposalsPresented?: boolean;
      localProposalCount?: number; localProposalIdentities?: readonly unknown[]}[] = [];
    const baseProvider = NvidiaNimProvider.create({providerId: `NYX-REPRESENTATION-${representation}`, model,
      authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM", credentialSource: nvidiaNimCredentialFromEnvironment(process.env),
      maxPromptBytes: 64000, maxOutputTokens: frozen.maxOutputTokens, timeoutMs: frozen.providerTimeoutMs,
      transport: async (url, init) => {
        if (String(url) !== NVIDIA_NIM_CHAT_COMPLETIONS_URL) throw Error("representation_endpoint_out_of_scope");
        if (nativeReasoningComparison || budgetGuidanceComparison) {
          // Only safe numeric/configuration fields: never persist messages, headers or reasoning.
          const body = JSON.parse(String(init.body));
          const prompt = budgetGuidanceComparison ? JSON.parse(body.messages[1].content) : null;
          observedInferenceControls.push({model:body.model,maxTokens:body.max_tokens,temperature:body.temperature,
            effort:body.reasoning_effort,reasoningBudget:body.reasoning_budget??null,
            schemaDigest:theoryDigest(body.response_format), ...(originalBudgetComparison?{
              initialCandidateState:prompt.hypothesisHistory.length===0
                && prompt.activeRepairDriver.kind==="EXECUTION_OBSERVATION",
              originalBudgetPresented:prompt.originalStructuralBudget?.version
                ==="nyx-original-state-quality-budget/1"}:{}), ...(behaviorRepairComparison?{
              qualityRepairPhase:prompt.activeRepairDriver.kind==="QUALITY_REJECTION",
              bindingUsesPresented:prompt.behaviorPreservingQualityRepair?.version
                ==="nyx-behavior-preserving-quality-repair/1"}:{}), ...(localRefactorComparison?{
              qualityRepairPhase:prompt.activeRepairDriver.kind==="QUALITY_REJECTION",
              localProposalsPresented:prompt.localRefactorProposals?.version==="nyx-local-refactor-proposals/2",
              localProposalCount:prompt.localRefactorProposals?.proposals?.length??0,
              localProposalIdentities:(prompt.localRefactorProposals?.proposals??[]).map((proposal:any)=>({
                baseSourceDigest:proposal.baseSourceDigest,proposedSourceDigest:proposal.proposedSourceDigest,
                operations:proposal.operations.map((operation:any)=>operation.kind),before:proposal.before,after:proposal.after}))}:{} )});
        }
        const response = await fetch(url, init);
        if (response.ok) try {
          const body = await response.clone().json(); const choice = body.choices?.[0];
          captures.push({content: typeof choice?.message?.content === "string" ? choice.message.content : null,
            finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null});
        } catch {captures.push({content: null, finishReason: null});}
        return response;
      }});
    // This new epoch counts retries inside the same task budget. Historical reports are not rewritten.
    const provider = decisionGenerationComparison ? baseProvider.withHttpAttemptBudget(2, "WITHIN_SHARED_BUDGET") : baseProvider;
    const session = await R3BenchmarkRepositorySession.create(representationRepositoryFiles(task), candidate, deadline, frozen.maxPatchBytes);
    let loopResult: Awaited<ReturnType<R3BoundedRepairLoop["run"]>> | null = null;
    let cleanup: Awaited<ReturnType<R3BenchmarkRepositorySession["close"]>> | null = null;
    let infrastructureFailure = false;
    let baselineExecutions = 0;
    try {
      const baseline = await session.baseline();
      baselineExecutions++;
      const cognition = NyxNemotronEngineeringCognition.create({cognitionId: "NYX-SOURCE-REPRESENTATION-EXISTING-COGNITION",
        provider, maxPromptBytes: frozen.maxPromptBytes, maxOutputTokens: frozen.maxOutputTokens, sourceRepresentation: representation,
        intentCompilationMode: "SAFE_CANONICALIZATION", repairFeedbackPolicy: "TRANSIENT_REJECTED_SOURCE_WINDOW",
        experimentVariant: "CURRENT", comparisonInferencePolicy: "CONSTRAINED_JSON", preserveProviderArrayBounds,
        ...(decisionGenerationComparison ? {comparisonReasoningControl: "SUPER_HOSTED_NATIVE" as const} : {}),
        ...(variant === "DECISION_REQUIRED_FIELDS" ? {providerIntentShape: "DECISION_REQUIRED_FIELDS" as const} : {}),
        ...(variant === "DECISION_REQUIRED_FIELDS_AND_BOUNDS" ? {providerIntentShape: "DECISION_REQUIRED_FIELDS_AND_BOUNDS" as const} : {}),
        ...(variant === "DECISION_REQUIRED_FIELDS_AND_LENGTHS" ? {providerIntentShape: "DECISION_REQUIRED_FIELDS_AND_LENGTHS" as const} : {}),
        ...(variant==="STRICT_LOCAL"?{structuredOutputMode:"STRICT_LOCAL" as const}:{}),
        ...(["MEASURED_STRUCTURE","STRUCTURE_SITES"].includes(variant)
          ?{qualityRepairGuidance:variant as "MEASURED_STRUCTURE"|"STRUCTURE_SITES"}:{}),
        ...(nativeReasoningComparison?nativeReasoningTransferConfiguration(variant):{}),
        ...(behaviorRepairComparison?behaviorRepairTransferConfiguration(variant):{}),
        ...(localRefactorComparison?localRefactorTransferConfiguration(variant):{}),
        ...(originalBudgetComparison?originalBudgetTransferConfiguration(variant):{})});
      const loop = R3BoundedRepairLoop.create({loopId: `REPRESENTATION-${task.id}-${representation}`, evaluatorVersion: "source-representation-cycle/1",
        observerIdentity: "OMEGA-REPRESENTATION-OBSERVER", cognition,
        candidateBuilder: {builderIdentity: "OMEGA-REPRESENTATION-EXISTING-R3", prepare: h => session.prepare(h)},
        maxIterations: frozen.candidateIterationsPerTask, maxModelInteractions: frozen.logicalCallsPerTask, maxCognitionCorrections: 1,
        maxWallClockMs: Math.max(100, deadline - Date.now() - 5000), maxChangesPerIteration: 1,
        maxPatchBytesPerIteration: frozen.maxPatchBytes, maxDiagnosisCharacters: 1500});
      loopResult = await loop.run({schemaVersion: 1, repairRequestId: `REPRESENTATION-${task.id}`, objective: task.objective,
        initialObservation: baseline.observation, initialFiles: baseline.prepared.files, allowedMutationPaths: ["src/transform.mjs"],
        availableEvidence: [], allowedVerificationToolIds: ["TEST"], baselineExecutions: [{toolId: "TEST", result: baseline.result}],
        observedAtEpochMs: Date.now(), signal: AbortSignal.timeout(Math.max(1, deadline - Date.now() - 5000))});
    } catch {infrastructureFailure = true;} finally {cleanup = await session.close();}
    const evidence = [...(loopResult?.iterations.map(i => i.cognitionEvidence) ?? []),
      ...(loopResult?.cognitionFailures.map(i => i.cognitionEvidence) ?? []),
      ...(loopResult?.evidenceAcquisitions.map(i => i.cognitionEvidence) ?? []),
      ...(loopResult?.lastCognitionEvidence ? [loopResult.lastCognitionEvidence] : [])]
      .filter((e, i, all) => e.modelEvidenceId !== "NOT_INVOKED" && all.findIndex(v => v.evidenceId === e.evidenceId) === i) as NyxRepairCognitionEvidence[];
    const usage = inferUsage(evidence);
    usage.toolCalls = baselineExecutions + (loopResult?.iterations.reduce((n, i) => n + i.verifications.length, 0) ?? 0);
    usage.toolWorkUnits = usage.toolCalls * (task.publicCases.length + task.privateCases.length);
    usage.wallClockMs = Date.now() - started;
    const inspections = [];
    for (const capture of captures) {
      // Correlate captured bytes with the provider's independently recorded response digest.
      // This is in-process diagnostic consistency, not independent transport authentication.
      const recorded = capture.content === null ? null : evidence.find(e => e.modelResponseDigest === contentHash(capture.content));
      inspections.push(await inspectNyxSourceEmission({content: capture.content, finishReason: capture.finishReason,
        providerResponseDigest: recorded?.modelResponseDigest ?? null, expectedTarget: "src/transform.mjs", representation}));
    }
    captures.length = 0; // No raw response/source persistence.
    const last = loopResult?.iterations.at(-1);
    const qualityAccepted = last?.candidateAdmission?.decision === "ADMITTED";
    const publicAccepted = last?.functionallyPassed === true;
    const perIteration=loopResult?.iterations.map(i=>({iteration:i.iteration,publicAccepted:i.functionallyPassed,
      ...(qualityMechanismComparison?{candidateSourceDigest:i.hypothesis.changes[0]?.replacementContentHash??null}:{}),
      quality:i.candidateAdmission?.decision??null,qualityFindings:i.candidateAdmission?.findings??[],
      ...assessRepresentationCandidate(task,{publicAccepted:i.functionallyPassed===true,
        qualityAccepted:i.candidateAdmission?.decision==="ADMITTED",
        verificationStdout:i.verifications[0]?.execution.evidence.stdout??null,
        loopVerified:i===last&&loopResult.outcome==="FUNCTIONALLY_REPAIRED_VERIFIED"})}))??[];
    const assessment=perIteration.at(-1)??assessRepresentationCandidate(task,{publicAccepted:false,qualityAccepted:false,
      verificationStdout:null,loopVerified:false});
    const {score,accepted,functionalAccepted}=assessment;
    const priorFailure = loopResult?.cognitionFailures.at(-1);
    const lastFailure = priorFailure?.cognitionEvidence.evidenceId === loopResult?.lastCognitionEvidence?.evidenceId ? priorFailure : undefined;
    const failureClass = classifyRepresentationFailure({accepted,infrastructureFailure,
      reason:loopResult?.reason??"infrastructure_failure",latestSchemaFailure:lastFailure,
      qualityRejected:last?.candidateAdmission?.decision==="REJECTED",publicFailed:last?.functionallyPassed===false,
      privateFailure:score?.failure??null});
    const result = {id: task.id, tier: task.tier, domain: task.domain, variant, preserveProviderArrayBounds,
      ...(decisionGenerationComparison ? {providerIntentShape: nativeReasoningComparison||budgetGuidanceComparison?"DECISION_REQUIRED_FIELDS_AND_LENGTHS":["DECISION_REQUIRED_FIELDS","DECISION_REQUIRED_FIELDS_AND_BOUNDS","DECISION_REQUIRED_FIELDS_AND_LENGTHS"].includes(variant) ? variant : "LEGACY_OPTIONAL_FIELDS",
        schemaRejectedInteractions: loopResult?.cognitionFailures.length ?? 0} : {}),
      ...(nativeReasoningComparison||budgetGuidanceComparison?{observedInferenceControls,
        inferenceControlVerified:observedInferenceControls.length===usage.physicalCalls&&observedInferenceControls.length>0
          &&observedInferenceControls.every(c=>c.model===model&&c.maxTokens===frozen.maxOutputTokens&&c.temperature===0
            &&c.effort===(variant==="NATIVE_BOUNDED_REASONING"?"high":"none")
            &&c.reasoningBudget===(variant==="NATIVE_BOUNDED_REASONING"?2048:null)),
        ...(originalBudgetComparison?{originalBudgetControlVerified:
          originalBudgetWireControlVerified(variant,observedInferenceControls)}:{}),
        ...(behaviorRepairComparison?{behaviorRepairControlVerified:
          behaviorRepairWireControlVerified(variant,observedInferenceControls),
          qualityRepairPromptCount:observedInferenceControls.filter(control=>control.qualityRepairPhase).length,
          bindingUsePromptCount:observedInferenceControls.filter(control=>control.bindingUsesPresented).length}:{}),
        ...(localRefactorComparison?{localRefactorControlVerified:
          localRefactorWireControlVerified(variant,observedInferenceControls),
          qualityRepairPromptCount:observedInferenceControls.filter(control=>control.qualityRepairPhase).length,
          localRefactorPromptCount:observedInferenceControls.filter(control=>control.localProposalsPresented).length,
          actionableProposalPromptCount:observedInferenceControls.filter(control=>(control.localProposalCount??0)>0).length}:{}),
      }:{}),
      representation, accepted, functionalAccepted, qualityAccepted, publicAccepted, score,
      firstCallAccepted: accepted && usage.logicalCalls === 1 && loopResult?.iterations.length === 1,
      repairedAccepted: accepted && (usage.logicalCalls > 1 || (loopResult?.iterations.length ?? 0) > 1),
      loopOutcome: loopResult?.outcome ?? "INFRASTRUCTURE_FAILURE", loopReason: loopResult?.reason ?? "INTEGRATION_THROW",
      failureClass,
      infrastructureFailure, inspections, usage, candidateIterations: loopResult?.iterations.length ?? 0,
      toolUsageComplete: !infrastructureFailure,
      perIteration,
      failureCodes: loopResult?.cognitionFailures.flatMap(f => f.diagnostics.map(d => ({category: d.category,
        path: /^\$[a-zA-Z0-9_.\[\]]{0,120}$/.test(d.path) ? d.path : "REDACTED_NON_PATH",
        observed: /^[a-zA-Z0-9_]{1,120}$/.test(d.observed) ? d.observed : "REDACTED_NON_CODE", digest: theoryDigest(d)}))) ?? [],
      requestDigests: evidence.flatMap(e => e.modelRequestDigest ? [e.modelRequestDigest] : []),
      responseDigests: evidence.flatMap(e => e.modelResponseDigest ? [e.modelResponseDigest] : []), cleanup,
      privateScorerWorkUnits: perIteration.reduce((n,i)=>n+i.privateScorerWorkUnits,0)};
    results.push(result); console.log(`NYX_REPRESENTATION_TASK ${JSON.stringify(result)}`);
  }
}
const pairs = tasks.map(task => {
  const rows = results.filter(r => r.id === task.id); const stable = rows.length === 2 && rows.every(r => r.usage && !r.infrastructureFailure
    && r.toolUsageComplete
    && (!originalBudgetComparison || r.inferenceControlVerified === true && r.originalBudgetControlVerified === true)
    && (!behaviorRepairComparison || r.inferenceControlVerified === true && r.behaviorRepairControlVerified === true)
    && (!localRefactorComparison || r.inferenceControlVerified === true && r.localRefactorControlVerified === true)
    && r.usage.unknownUsageCalls === 0 && r.usage.providerFailures === 0 && r.usage.retries === 0);
  const matched = stable && ["physicalCalls", "reportedTokens", "toolWorkUnits"].every(key => {
    const values = rows.map(r => r.usage[key] + (key === "toolWorkUnits" ? r.privateScorerWorkUnits : 0));
    return Math.max(...values) - Math.min(...values) <= Math.max(1, ...values) * frozen.realizedTolerance;
  });
  const baseline = rows.find(r => r.variant === (qualityMechanismComparison?"QUALITY_SITES_CONTROL":originalBudgetComparison?"STRUCTURE_SITES_CONTROL":nativeReasoningComparison?"NATIVE_NONE":boundedContractComparison?"DECISION_REQUIRED_FIELDS":"LEGACY_OPTIONAL_FIELDS"));
  const treatment = rows.find(r => r.variant === (localRefactorComparison?"GUARDED_REFACTOR_PROPOSALS":behaviorRepairComparison?"BINDING_USES":originalBudgetComparison?"ORIGINAL_BUDGET":nativeReasoningComparison?"NATIVE_BOUNDED_REASONING":boundedContractComparison?boundedTreatment:"DECISION_REQUIRED_FIELDS"));
  const noMoreMeasuredCompute = decisionGenerationComparison && stable && baseline && treatment
    && ["physicalCalls", "reportedTokens", "toolWorkUnits"].every(key =>
      treatment.usage[key] + (key === "toolWorkUnits" ? treatment.privateScorerWorkUnits : 0)
      <= baseline.usage[key] + (key === "toolWorkUnits" ? baseline.privateScorerWorkUnits : 0));
  return {id: task.id, tier: task.tier, providerStable: stable, matchedRealizedCompute: matched,
    ...(qualityMechanismComparison?{
      treatmentExercised:(localRefactorComparison?treatment?.localRefactorPromptCount:treatment?.bindingUsePromptCount??0)>0,
      ...(localRefactorComparison?{actionableTreatmentExercised:(treatment?.actionableProposalPromptCount??0)>0}:{}),
      pairedQualityRepairOpportunity:[baseline,treatment].every(row=>row?.perIteration?.[0]?.publicAccepted
        &&row.perIteration[0].quality==="REJECTED"),
      sameFirstCandidate:typeof baseline?.perIteration?.[0]?.candidateSourceDigest==="string"
        &&baseline.perIteration[0].candidateSourceDigest===treatment?.perIteration?.[0]?.candidateSourceDigest,
    }:{}),
    ...(decisionGenerationComparison ? {treatmentNoMoreMeasuredCompute: !!noMoreMeasuredCompute,
      qualityAcceptanceGainWithoutMoreMeasuredCompute: !!(noMoreMeasuredCompute && treatment.accepted && !baseline.accepted)} : {}),
    outcomes: rows.map(r => ({variant: r.variant, accepted: r.accepted, failureClass: r.failureClass}))};
});
const sourceUnchanged = original === theoryDigest(git("ls-files", "-s")) && !git("status", "--porcelain");
const report = {schemaVersion: 1, candidate, frozen, sourceDigests, tasks, results, pairs, sourceUnchanged,
  hypothesis: localRefactorComparison
    ? "Optional guarded concrete local refactor proposals reduce unnecessary structure without functional regressions and increase fresh full acceptance under unchanged first-candidate prompt, model, parser, quality oracle, authority and shared budgets."
    : behaviorRepairComparison
    ? "Bounded lexical binding-use facts reduce behavior-destroying quality repairs and increase fresh full acceptance under unchanged first-candidate prompt, parser, oracle, authority and shared model budgets."
    : originalBudgetComparison
    ? "Exact public original-state structural totals before the first edit improve fresh quality-accepted engineering without extra calls, relaxed gates, task-specific solutions or changed post-rejection feedback."
    : nativeReasoningComparison
    ? "Existing bounded native reasoning improves coherent, behavior-preserving engineering and quality repairs on fresh tasks under unchanged grammar, feedback, acceptance, authority and total output/call limits."
    : boundedContractComparison
    ? "Request-derived string and decision-specific array constraints reduce source-interface failure and improve fresh engineering acceptance under unchanged parser, quality, authority and compute limits."
    :decisionContractComparison
    ? "Decision-specific required generation fields reduce interface rejection and improve fresh engineering acceptance under unchanged local validation, authority and compute limits."
    :qualitySiteComparison
    ? "Bounded, source-linked declaration sites make structural repair actionable and improve fresh quality admission compared with aggregate guidance alone."
    :qualityGuidanceComparison
    ? "Source-linked explanations of existing static measurements improve fresh quality repairs without changing first-attempt prompts, acceptance or model-call limits."
    :localDeliveryComparison
    ? "Existing strict-local delivery preserves source semantics and improves fresh engineering outcomes while all local authority, syntax and quality gates remain unchanged."
    :boundsComparison
    ? "Preserving explicit hosted array bounds removes the reproduced 32-line source ceiling and improves fresh transfer without changing local acceptance."
    : "Using existing TEXT rather than LINES reduces interface/source failures across fresh engineering tasks without weakening acceptance or increasing realized compute.",
  falsification: budgetGuidanceComparison||nativeReasoningComparison||qualityGuidanceComparison||qualitySiteComparison
    ? "No reproducible gain in quality-accepted repairs or reduced repair cost on fresh tasks at matched realized compute, or any weakened gate."
    : "No reproducible syntax/correctness improvement across development and fresh transfer at matched realized compute.",
  summaries: variants.map(variant => {
    const rows = results.filter(r => r.variant === variant);
    return {variant, accepted: rows.filter(r => r.accepted).length,
      functionallyAccepted:rows.filter(r=>r.functionalAccepted).length,qualityAccepted:rows.filter(r=>r.qualityAccepted).length,
      firstCallAccepted: rows.filter(r => r.firstCallAccepted).length,
      ...(qualityMechanismComparison?{qualityRepairPrompts:rows.reduce((n,r)=>n+(r.qualityRepairPromptCount??0),0),
        treatmentPrompts:rows.reduce((n,r)=>n+(localRefactorComparison?r.localRefactorPromptCount??0:r.bindingUsePromptCount??0),0),
        ...(localRefactorComparison?{actionableProposalPrompts:rows.reduce((n,r)=>n+(r.actionableProposalPromptCount??0),0),
          privateRegressionsAfterQualityRejection:rows.filter(r=>r.perIteration?.[0]?.functionalAccepted
            &&r.perIteration[0].quality==="REJECTED"&&r.perIteration.length>1&&!r.perIteration.at(-1).functionalAccepted).length}:{}),
        publicRegressionsAfterQualityRejection:rows.filter(r=>r.perIteration?.[0]?.publicAccepted
          &&r.perIteration[0].quality==="REJECTED" &&r.perIteration.length>1 &&!r.perIteration.at(-1).publicAccepted).length}:{}),
      repairedAccepted: rows.filter(r => r.repairedAccepted).length, reportedTokens: rows.reduce((n, r) => n + (r.usage?.reportedTokens ?? 0), 0),
      unknownUsageCalls: rows.reduce((n, r) => n + (r.usage?.unknownUsageCalls ?? 0), 0)};}),
  evidence: "E4_LIVE_MODEL_AND_E3_LOCAL_OMEGA_AND_PRIVATE_EXACT_SCORER",
  authorship: "SAME_SESSION_NOT_INDEPENDENTLY_AUTHORED", benchmarkTasksUsed: false,
  staticAdmissionAndParserUnchanged: true, rawSourcePersisted: false, grantsAuthority: false, broadPromotion: false};
await writeFile(join(process.env.RUNNER_TEMP || tmpdir(), `nyx-source-representation-${candidate}.json`), JSON.stringify(report, null, 2));
console.log(`NYX_REPRESENTATION_CYCLE ${JSON.stringify(report)}`);
if (!sourceUnchanged || results.some(r => r.cleanup && (!r.cleanup.sourceUnchanged || !r.cleanup.cleanupVerified))) process.exitCode = 1;

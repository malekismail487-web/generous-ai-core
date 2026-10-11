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
import { V3_FRESH_BUDGET_EPOCH, v3FreshBudgetTasks,
  v3FreshBudgetWireVerified, observeV3AdmissionPolicy } from "./benchmarks/v3FreshBudgetTransferTasks";
import { V3_NATIVE_REASONING_EPOCH, v3NativeReasoningTasks, v3NativeReasoningConfiguration,
  v3NativeWireVerified } from "./benchmarks/v3NativeReasoningTransferTasks";
import { STRUCTURAL_CONTRIBUTION_EPOCH, structuralContributionTasks,
  structuralContributionConfiguration, structuralContributionWireVerified } from "./benchmarks/structuralContributionTransferTasks";
import { NATIVE_LOCAL_EMISSION_EPOCH, nativeLocalEmissionTasks,
  nativeLocalEmissionConfiguration, nativeLocalEmissionWireVerified } from "./benchmarks/nativeLocalEmissionTasks";
import { FUNCTION_BODY_TRANSFER_EPOCH, functionBodyTransferTasks, functionBodyTransferConfiguration,
  functionBodyWireVerified } from "./benchmarks/functionBodyTransferTasks";
import { GUARDED_REPAIR_FRESH_EPOCH, guardedRepairFreshTasks, guardedRepairFreshConfiguration,
  guardedRepairFreshWireVerified, guardedRepairPairAssessment } from "./benchmarks/guardedRepairFreshTasks";
import { BEHAVIOR_REPAIR_TRANSFER_TASKS, behaviorRepairTransferConfiguration,
  behaviorRepairWireControlVerified } from "./benchmarks/behaviorRepairTransferTasks";
import { PUBLIC_FAILURE_REPAIR_EPOCH, publicFailureRepairTasks, publicFailureRepairConfiguration,
  publicFailureRepairWireVerified, publicFailureContext, type PublicFailureRepairTask } from "./benchmarks/publicFailureRepairTasks";
import { LOCAL_REFACTOR_TRANSFER_TASKS, localRefactorTransferConfiguration,
  localRefactorWireControlVerified } from "./benchmarks/localRefactorTransferTasks";
import { RUNTIME_REVIEW_TRANSFER_TASKS, runtimeReviewTransferConfiguration } from "./benchmarks/runtimeReviewTransferTasks";
import { EVALUATION_ORDER_TRANSFER_TASKS, evaluationOrderTransferConfiguration,
  evaluationOrderWireControlVerified } from "./benchmarks/evaluationOrderTransferTasks";
import { CONDITIONAL_REFACTOR_REPAIR_TASKS, suppliedCandidateThenLive, lastConditionalModelCandidate, sourceSelectionWireControlVerified,
  type ConditionalRepairTask } from "./benchmarks/conditionalRefactorRepairTasks";

if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1" || !process.env.NVIDIA_API_KEY?.trim())
  throw Error("source_representation_cycle_requires_injected_secret_and_explicit_network");
const git = (...args: string[]) => execFileSync("git", args, {encoding: "utf8"}).trim();
const candidate = process.env.GITHUB_SHA || git("rev-parse", "HEAD");
if (!/^[a-f0-9]{40}$/.test(candidate) || candidate !== git("rev-parse", "HEAD") || git("status", "--porcelain"))
  throw Error("source_representation_cycle_clean_candidate_required");
const original = theoryDigest(git("ls-files", "-s"));
const nativeReasoningComparison = process.env.NYX_NATIVE_REASONING_TRANSFER === "1";
const v3NativeReasoningComparison = process.env.NYX_V3_NATIVE_REASONING_TRANSFER === "1";
if (v3NativeReasoningComparison && !nativeReasoningComparison) throw Error("v3_native_epoch_requires_native_comparison_only");
const structuralContributionComparison = process.env.NYX_STRUCTURAL_CONTRIBUTION_TRANSFER === "1";
if (structuralContributionComparison && !v3NativeReasoningComparison) throw Error("structural_map_requires_v3_native_profile");
const nativeLocalEmissionComparison = process.env.NYX_NATIVE_LOCAL_EMISSION_TRANSFER === "1";
if (nativeLocalEmissionComparison && (!v3NativeReasoningComparison || structuralContributionComparison))
  throw Error("native_local_emission_requires_exclusive_v3_native_profile");
const functionBodyComparison = process.env.NYX_FUNCTION_BODY_TRANSFER === "1";
if (functionBodyComparison && (!v3NativeReasoningComparison || structuralContributionComparison || nativeLocalEmissionComparison))
  throw Error("function_body_requires_exclusive_v3_native_profile");
const freshGuardedComparison = process.env.NYX_FRESH_GUARDED_REPAIR === "1";
if (freshGuardedComparison && (!v3NativeReasoningComparison || structuralContributionComparison || nativeLocalEmissionComparison || functionBodyComparison))
  throw Error("fresh_guarded_requires_exclusive_v3_native_profile");
const fixedNativeProfile = structuralContributionComparison || nativeLocalEmissionComparison || functionBodyComparison || freshGuardedComparison;
const originalBudgetComparison = process.env.NYX_ORIGINAL_BUDGET_TRANSFER === "1";
const v3FreshBudgetComparison = process.env.NYX_V3_FRESH_BUDGET_TRANSFER === "1";
const publicFailureComparison = process.env.NYX_PUBLIC_FAILURE_REPAIR_COMPARISON === "1";
const versionedAdmissionComparison = v3FreshBudgetComparison || publicFailureComparison || v3NativeReasoningComparison;
if (v3FreshBudgetComparison && !originalBudgetComparison) throw Error("v3_fresh_epoch_requires_original_budget_only");
const behaviorRepairComparison = process.env.NYX_BEHAVIOR_REPAIR_TRANSFER === "1";
const localRefactorComparison = process.env.NYX_LOCAL_REFACTOR_TRANSFER === "1";
const runtimeReviewComparison = process.env.NYX_RUNTIME_REVIEW_TRANSFER === "1";
const evaluationOrderComparison = process.env.NYX_EVALUATION_ORDER_TRANSFER === "1";
const conditionalRepair = process.env.NYX_CONDITIONAL_REFACTOR_REPAIR === "1";
const sourceSelectionComparison = process.env.NYX_SOURCE_BOUND_REFACTOR_SELECTION === "1";
if(sourceSelectionComparison&&!conditionalRepair) throw Error("source_selection_requires_exposed_conditional_comparison");
if (conditionalRepair && !evaluationOrderComparison) throw Error("conditional_repair_requires_v2_v3_comparison");
const concreteRefactorComparison = localRefactorComparison || evaluationOrderComparison;
const qualityMechanismComparison = behaviorRepairComparison || concreteRefactorComparison;
const budgetGuidanceComparison = originalBudgetComparison || qualityMechanismComparison || runtimeReviewComparison || publicFailureComparison || v3NativeReasoningComparison;
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
if([boundsComparison,localDeliveryComparison,qualityGuidanceComparison,qualitySiteComparison,decisionContractComparison,boundedContractComparison,nativeReasoningComparison,originalBudgetComparison,behaviorRepairComparison,localRefactorComparison,runtimeReviewComparison,evaluationOrderComparison,publicFailureComparison].filter(Boolean).length>1)throw Error("comparison_variables_must_not_be_combined");
const historicalVariants=publicFailureComparison?["OPAQUE_EXCEPTION_CONTROL","PUBLIC_EXCEPTION_CLASS"]:sourceSelectionComparison?["EVALUATION_ORDER_SOURCE_CONTROL","SOURCE_BOUND_SELECTION"]:evaluationOrderComparison?["GUARDED_V2_CONTROL","EVALUATION_ORDER_PROPOSALS"]:runtimeReviewComparison?["SCOPED_REVIEW_CONTROL","RUNTIME_OBSERVATION_REVIEW"]:localRefactorComparison?["QUALITY_SITES_CONTROL","GUARDED_REFACTOR_PROPOSALS"]:behaviorRepairComparison?["QUALITY_SITES_CONTROL","BINDING_USES"]:originalBudgetComparison?["STRUCTURE_SITES_CONTROL","ORIGINAL_BUDGET"]:nativeReasoningComparison?["NATIVE_NONE","NATIVE_BOUNDED_REASONING"]:boundedContractComparison?["DECISION_REQUIRED_FIELDS",boundedTreatment]:decisionContractComparison?["LEGACY_OPTIONAL_FIELDS","DECISION_REQUIRED_FIELDS"]:qualitySiteComparison?["MEASURED_STRUCTURE","STRUCTURE_SITES"]:qualityGuidanceComparison?["PUBLIC_METRICS","MEASURED_STRUCTURE"]:localDeliveryComparison?["HOSTED_BOUNDED","STRICT_LOCAL"]:boundsComparison?["LEGACY_OMITTED","CORRECTED_BOUNDED"]:["LINES","TEXT"];
const variants = freshGuardedComparison ? ["GUARDED_SOURCE_CONTROL", "GUARDED_SELECTION"] : functionBodyComparison ? ["COMPLETE_FILE_CONTROL", "SOURCE_BOUND_BODY"] : nativeLocalEmissionComparison ? ["HOSTED_NATIVE_CONTROL", "STRICT_LOCAL_NATIVE"]
  : structuralContributionComparison ? ["DECLARATION_SITES_CONTROL", "ALL_STRUCTURE_SITES"] : historicalVariants;
const selectedTasks = conditionalRepair?CONDITIONAL_REFACTOR_REPAIR_TASKS.flatMap(task=>[1,2].map(repeat=>({...task,id:`${task.id}-REPEAT-${repeat}`}))):evaluationOrderComparison?EVALUATION_ORDER_TRANSFER_TASKS:runtimeReviewComparison?RUNTIME_REVIEW_TRANSFER_TASKS:localRefactorComparison?LOCAL_REFACTOR_TRANSFER_TASKS:behaviorRepairComparison?BEHAVIOR_REPAIR_TRANSFER_TASKS:originalBudgetComparison?ORIGINAL_BUDGET_TRANSFER_TASKS:nativeReasoningComparison?NATIVE_REASONING_TRANSFER_TASKS:boundedContractComparison?(lengthTransfer?LENGTH_GRAMMAR_TRANSFER_TASKS:patternTransfer?PATTERN_REPAIR_TRANSFER_TASKS:BOUNDED_CONTRACT_TRANSFER_TASKS):decisionContractComparison?DECISION_CONTRACT_TRANSFER_TASKS:qualitySiteComparison?QUALITY_SITE_TRANSFER_TASKS:qualityGuidanceComparison?MEASURED_QUALITY_TRANSFER_TASKS:localDeliveryComparison?SOURCE_LITERAL_TRANSFER_TASKS:boundsComparison ? ARRAY_BOUND_TRANSFER_TASKS : SOURCE_REPRESENTATION_TASKS;
const epochTasks = freshGuardedComparison ? guardedRepairFreshTasks() : functionBodyComparison ? functionBodyTransferTasks() : nativeLocalEmissionComparison ? nativeLocalEmissionTasks() : structuralContributionComparison ? structuralContributionTasks() : v3NativeReasoningComparison ? v3NativeReasoningTasks() : publicFailureComparison ? publicFailureRepairTasks() : v3FreshBudgetComparison ? v3FreshBudgetTasks() : selectedTasks;
const frozen = {model, temperature: 0, inferencePolicy: nativeReasoningComparison?"PER_ARM_FROZEN_NATIVE":"CONSTRAINED_JSON", maxOutputTokens: localDeliveryComparison||qualityGuidanceComparison||qualitySiteComparison?4096:8192,
  taskCorpus:v3NativeReasoningComparison?V3_NATIVE_REASONING_EPOCH.version:publicFailureComparison?PUBLIC_FAILURE_REPAIR_EPOCH.version:v3FreshBudgetComparison?V3_FRESH_BUDGET_EPOCH.version:conditionalRepair?"nyx-exposed-supplied-candidate-conditional-repair/2":evaluationOrderComparison?"nyx-evaluation-order-exposed-development/2":runtimeReviewComparison?"nyx-runtime-observation-exposed-development/2":localRefactorComparison?"nyx-local-refactor-exposed-development/2":behaviorRepairComparison?"nyx-behavior-repair-fresh-transfer/1":originalBudgetComparison?"nyx-original-budget-fresh-transfer/1":nativeReasoningComparison?"nyx-native-reasoning-fresh-transfer/1":lengthTransfer?"nyx-length-grammar-transfer/1":patternTransfer?"nyx-pattern-repair-transfer/1":"HISTORICAL_SELECTED_CORPUS",
  providerTimeoutMs: 65000, logicalCallsPerTask: conditionalRepair?1:2, candidateIterationsPerTask: 2, toolCallsPerTask: 3,
  wallClockMsPerTask: 155000, globalWallClockMs: versionedAdmissionComparison?2700000:1350000, maxPatchBytes: 12000,
  maxPromptBytes: 48000, realizedTolerance: 0.1,
  ...(decisionGenerationComparison ? {physicalCallsPerTaskIncludingRetries: conditionalRepair?1:2, reasoningControl: "SUPER_HOSTED_NATIVE",
    ...(nativeReasoningComparison?{reasoningPolicies:{NATIVE_NONE:{effort:"none",budget:null},
      NATIVE_BOUNDED_REASONING:{effort:"high",budget:2048}}}:{reasoningEffort:"none"}),
    generationPolicy: nativeReasoningComparison||budgetGuidanceComparison?NYX_LENGTH_BOUNDED_DECISION_SCHEMA_POLICY:boundedContractComparison?(lengthTransfer?NYX_LENGTH_BOUNDED_DECISION_SCHEMA_POLICY:NYX_BOUNDED_DECISION_SCHEMA_POLICY):NYX_DECISION_REQUIRED_SCHEMA_POLICY} : {}),
  changedVariable: publicFailureComparison?"PUBLIC_NATIVE_EXCEPTION_CLASS_WITHOUT_MESSAGE_STACK_OR_PRIVATE_DIAGNOSTICS_ONLY":sourceSelectionComparison?"SAME_V3_HOST_PROPOSALS_OPTIONAL_SOURCE_BOUND_REFERENCE_VS_MODEL_SOURCE_RESERIALIZATION":evaluationOrderComparison?"OPTIONAL_FIRST_EVALUATED_USE_PROPOSALS_V3_VS_EXISTING_V2_ONLY":runtimeReviewComparison?"BOUNDED_PUBLIC_RUNTIME_OBSERVATIONS_IN_IDENTICAL_POST_VERIFICATION_CADENCE":localRefactorComparison?"OPTIONAL_GUARDED_CONCRETE_PROPOSALS_ON_QUALITY_ONLY_REPAIR":behaviorRepairComparison?"BOUND_CURRENT_SOURCE_BINDING_USES_ON_QUALITY_ONLY_REPAIR":originalBudgetComparison?"EXACT_ORIGINAL_STATE_PUBLIC_STRUCTURAL_BUDGET_BEFORE_FIRST_CANDIDATE_ONLY":nativeReasoningComparison?"EXISTING_NATIVE_REASONING_RESERVATION_WITHIN_SHARED_OUTPUT_CAP":boundedContractComparison?"REQUEST_DERIVED_GENERATION_BOUNDS_ONLY":decisionContractComparison?"DECISION_REQUIRED_PROVIDER_FIELDS_ONLY":qualitySiteComparison
    ?"AGGREGATE_MEASUREMENTS_VS_BOUNDED_AST_DECLARATION_SITES_ONLY":qualityGuidanceComparison
    ?"PUBLIC_STATIC_METRICS_VS_SOURCE_LINKED_DETECTOR_EXPLANATION_ONLY":localDeliveryComparison
    ?"EXISTING_HOSTED_VS_STRICT_LOCAL_DELIVERY_ONLY":boundsComparison
    ? "HOSTED_MAX_ITEMS_PRESERVED_VS_OMITTED_ONLY" : "EXISTING_TEXT_VS_LINES_SOURCE_REPRESENTATION_ONLY",
  publicFeedback: runtimeReviewComparison?"IDENTICAL_TESTS_AND_ADMISSION_PLUS_OPTIONAL_UNTRUSTED_PUBLIC_SAMPLES":"IDENTICAL_PUBLIC_TEST_FAILURE_AND_STATIC_ADMISSION", authority: "EXISTING_R3_ISOLATED_ONLY",
  ...(originalBudgetComparison?{postQualityGuidance:"IDENTICAL_STRUCTURE_SITES",preCandidateGuidance:{
    STRUCTURE_SITES_CONTROL:"EXISTING_PUBLIC_POLICY_ONLY",ORIGINAL_BUDGET:"PUBLIC_ORIGINAL_STATE"}}:{}),
  ...(v3FreshBudgetComparison?{qualityPolicy:V3_FRESH_BUDGET_EPOCH.admissionPolicyId,
    evaluationAccountingVersion:"nyx-v3-admission-observation/1",
    epoch:V3_FRESH_BUDGET_EPOCH, suppliedCandidates:false, modelCallsMaximum:32,
    comparisonAgainstV2:"NOT_COMPARABLE_NOT_REGRADED", broadPromotion:"NONE"}:{}),
  ...(v3NativeReasoningComparison?{epoch:V3_NATIVE_REASONING_EPOCH,qualityPolicy:V3_NATIVE_REASONING_EPOCH.admissionPolicyId,
    evaluationAccountingVersion:"nyx-v3-admission-observation/1",modelCallsMaximum:32,
    suppliedCandidates:false,preCandidateGuidance:"IDENTICAL_PUBLIC_ORIGINAL_STATE_V2",
    postQualityGuidance:"IDENTICAL_STRUCTURE_SITES",defaultChanged:false,broadPromotion:"NONE",
    wireSettingEvidence:"REQUEST_CONFIGURATION_NOT_PROOF_OF_INTERNAL_REASONING_OR_EFFICACY"}:{}),
  ...(publicFailureComparison?{epoch:PUBLIC_FAILURE_REPAIR_EPOCH,qualityPolicy:PUBLIC_FAILURE_REPAIR_EPOCH.admissionPolicyId,
    evaluationAccountingVersion:"nyx-v3-admission-observation/1",modelCallsMaximum:32,
    initialRepository:"IDENTICAL_SUPPLIED_FAULTY_IMPLEMENTATION_NOT_NYX_GENERATED",
    publicFeedback:"OPAQUE_VS_BOUNDED_NATIVE_CLASS_ONLY_NO_MESSAGE_OR_STACK_OR_PRIVATE_DIAGNOSTIC",
    verifierEquivalence:"ONLY_PUBLIC_EXCEPTION_LOGGING_DIFFERS_ACCEPTANCE_AND_PRIVATE_CATCH_UNCHANGED",
    context:"BOTH_ARMS_THREE_IDENTICAL_PUBLIC_SOURCE_FILES_NO_VERIFIER_IMPLEMENTATION_HINTS",
    broadPromotion:"NONE",defaultChanged:false}:{}),
  ...(behaviorRepairComparison?{preCandidateGuidance:"IDENTICAL_PUBLIC_ORIGINAL_STATE",postQualityGuidance:{
    QUALITY_SITES_CONTROL:"STRUCTURE_SITES",BINDING_USES:"STRUCTURE_SITES_PLUS_LEXICAL_BINDING_USES"},
    firstAttemptDifferences:"NO_TREATMENT_PRESENT_BEFORE_QUALITY_REJECTION_NOT_CAUSAL_MECHANISM_GAINS"}:{}),
  ...(evaluationOrderComparison?{preCandidateGuidance:"IDENTICAL_PUBLIC_ORIGINAL_STATE",postQualityGuidance:{
    GUARDED_V2_CONTROL:"EXISTING_CONCRETE_PROPOSALS_V2",EVALUATION_ORDER_PROPOSALS:"EXISTING_PROPOSALS_PLUS_FIRST_EVALUATED_USE"},
    maximumLocalRefactorOperations:8,localRefactorCost:"BOUNDED_HOST_AST_NO_EXTRA_MODEL_OR_EXECUTION_CALLS",
    firstAttemptDifferences:"NO_TREATMENT_PRESENT_BEFORE_QUALITY_REJECTION_NOT_CAUSAL_MECHANISM_GAINS",
    implementationHintsOrSeedsProvided:conditionalRepair,
    ...(conditionalRepair?{suppliedCandidatesPerTask:1,suppliedCandidateEvidence:"E3_TEST_DOUBLE_NOT_INFERENCE",
      liveRepairCallsPerTask:1,predeclaredRepeats:2,uniqueTasks:4,
      comparisonScope:"CONDITIONAL_QUALITY_REPAIR_NOT_FIRST_ATTEMPT_CODING_OR_FRONTIER_BENCHMARK",
      efficacyCriterion:"BOTH_PREDECLARED_REPEATS_WIN_IN_AT_LEAST_TWO_DISTINCT_TASK_FAMILIES_AT_MATCHED_REALIZED_COMPUTE_WITHOUT_REGRESSION",
      defaultOrBroadPromotion:"NONE_REQUIRES_NEW_UNSEEDED_REPLICATION"}:{} )}:{}),
  ...(localRefactorComparison?{preCandidateGuidance:"IDENTICAL_PUBLIC_ORIGINAL_STATE",postQualityGuidance:{
    QUALITY_SITES_CONTROL:"STRUCTURE_SITES",GUARDED_REFACTOR_PROPOSALS:"STRUCTURE_SITES_PLUS_CONCRETE_LOCAL_PROPOSALS"},
    maximumLocalRefactorOperations:8,localRefactorCost:"BOUNDED_HOST_AST_NO_EXTRA_MODEL_OR_EXECUTION_CALLS",
    firstAttemptDifferences:"NO_TREATMENT_PRESENT_BEFORE_QUALITY_REJECTION_NOT_CAUSAL_MECHANISM_GAINS"}:{}),
  ...(sourceSelectionComparison?{sourceSelectionPolicy:"nyx-source-bound-refactor-selection/1",
    sourceSelectionPromptPolicy:"nyx-source-selection-contract/2",
    postQualityGuidance:{EVALUATION_ORDER_SOURCE_CONTROL:"V3_PROPOSALS_MODEL_EMITS_SOURCE",SOURCE_BOUND_SELECTION:"SAME_V3_PROPOSALS_EXPLICIT_REQUEST_BOUND_SELECTION_OPTION"},
    sourceOrigin:"HOST_PROPOSAL_IF_SELECTED_NOT_MODEL_GENERATED",
    claimScope:"EXPOSED_CONDITIONAL_EMISSION_DIAGNOSTIC_NOT_COGNITIVE_GAIN_OR_FRESH_GENERALIZATION"}:{}),
  ...(runtimeReviewComparison?{reviewCadence:"BOTH_ARMS_ONCE_WITHIN_EXISTING_BUDGET",runtimeInputs:"PREDECLARED_PUBLIC_SYNTHETIC_NOT_REFERENCE_ANSWERS",
    runtimeExecution:"IDENTICAL_PINNED_TEST_ENTRYPOINT_BOTH_ARMS",maximumRuntimeSamples:4,
    firstAttemptDifferences:"NO_OBSERVATION_TREATMENT_BEFORE_FIRST_CANDIDATE_NOT_CAUSAL_GAINS",
    observationProvenance:"UNTRUSTED_CANDIDATE_OUTPUT_NOT_AUTHENTICATED_ORACLE"}:{}),
  realizedMatchScope: "REPORTED_MODEL_CALLS_TOKENS_AND_VERIFIER_WORK_NOT_TOTAL_HOST_CPU",
  ...(runtimeReviewComparison?{verifierWorkPolicy:"SCHEDULED_CASE_INVOCATION_PROXY_NOT_BRANCH_STEPS_OR_HOST_CPU"}:{}),
  hostDiagnosticCost: "INCLUDED_IN_WALL_CLOCK_NOT_SEPARATELY_PROFILED",
  sourceMutations: false, generalShell: false, generalNetwork: false, production: false,
  ...(freshGuardedComparison?{epoch:GUARDED_REPAIR_FRESH_EPOCH,taskCorpus:GUARDED_REPAIR_FRESH_EPOCH.version,
    changedVariable:GUARDED_REPAIR_FRESH_EPOCH.changedVariable,
    reasoningPolicies:{GUARDED_SOURCE_CONTROL:{effort:"high",budget:2048},GUARDED_SELECTION:{effort:"high",budget:2048}},
    suppliedCandidates:false,modelCallsMaximum:epochTasks.length*variants.length*2,
    sourceEditScope:"COMPLETE_FILE_BOTH_ARMS",proposalOrigin:"EXISTING_GUARDED_HOST_REFACTOR_NOT_NEW_MODEL_ALGORITHM",
    postQualityGuidance:{GUARDED_SOURCE_CONTROL:"SAME_V3_PROPOSALS_MODEL_EMITS_SOURCE",GUARDED_SELECTION:"SAME_V3_PROPOSALS_EXPLICIT_BOUND_SELECTION_OPTION"},
    firstAttemptDifferences:"NO_SELECTION_OR_PROPOSAL_PRESENT_BEFORE_QUALITY_REJECTION_NOT_CAUSAL_GAINS",
    broadPromotion:"NONE_WITHOUT_FRESH_MATCHED_POST_REJECTION_EVIDENCE"}:{}),
  ...(functionBodyComparison?{epoch:FUNCTION_BODY_TRANSFER_EPOCH,taskCorpus:FUNCTION_BODY_TRANSFER_EPOCH.version,
    changedVariable:FUNCTION_BODY_TRANSFER_EPOCH.changedVariable,
    reasoningPolicies:{COMPLETE_FILE_CONTROL:{effort:"high",budget:2048},SOURCE_BOUND_BODY:{effort:"high",budget:2048}},
    hostedSchema:"PRESENT_BOTH_ARMS",sourceEditScope:{COMPLETE_FILE_CONTROL:"COMPLETE_FILES",SOURCE_BOUND_BODY:"FUNCTION_BODY"},
    bodyBoundary:"SINGLE_OBSERVED_EXPORTED_FUNCTION_NO_SCAFFOLD_REWRITE_OR_OUTER_HELPER_INSERTION",
    broadPromotion:"NONE_RELIABILITY_IS_NOT_COGNITIVE_GAIN"}:{}),
  ...(nativeLocalEmissionComparison?{epoch:NATIVE_LOCAL_EMISSION_EPOCH,
    taskCorpus:NATIVE_LOCAL_EMISSION_EPOCH.version,changedVariable:NATIVE_LOCAL_EMISSION_EPOCH.changedVariable,
    reasoningPolicies:{HOSTED_NATIVE_CONTROL:{effort:"high",budget:2048},STRICT_LOCAL_NATIVE:{effort:"high",budget:2048}},
    hostedSchema:{HOSTED_NATIVE_CONTROL:"PRESENT",STRICT_LOCAL_NATIVE:"OMITTED_LOCAL_STRICT_VALIDATION_UNCHANGED"},
    promptConstruction:"IDENTICAL_TASK_CONTEXT_AND_BUILDER_WITH_INDEPENDENT_RUN_IDENTITIES",
    broadPromotion:"NONE_RELIABILITY_IS_NOT_COGNITIVE_GAIN"}:{}),
  ...(structuralContributionComparison?{epoch:STRUCTURAL_CONTRIBUTION_EPOCH,
    taskCorpus:STRUCTURAL_CONTRIBUTION_EPOCH.version,changedVariable:STRUCTURAL_CONTRIBUTION_EPOCH.changedVariable,
    reasoningPolicies:{DECLARATION_SITES_CONTROL:{effort:"high",budget:2048},ALL_STRUCTURE_SITES:{effort:"high",budget:2048}},
    postQualityGuidance:"SAME_EXISTING_STRUCTURE_SITES_PLUS_OPTIONAL_CONTROL_CONTRIBUTIONS",
    firstAttemptDifferences:"NO_TREATMENT_PRESENT_BEFORE_QUALITY_REJECTION_NOT_CAUSAL_MECHANISM_GAINS"}:{}),
  hostileCodeSandbox: false, candidateNetworkIsolation: "NOT_PROVEN"};
const sourceDigests = Object.fromEntries(await Promise.all([
  ...(freshGuardedComparison?["scripts/omega/benchmarks/guardedRepairFreshTasks.ts",
    "src/lib/codelab/cognition/nyxLocalRefactorProposals.ts","src/lib/codelab/cognition/nyxSourceBoundRefactorSelection.ts"]:[]),
  ...(functionBodyComparison ? ["scripts/omega/benchmarks/functionBodyTransferTasks.ts",
    "src/lib/codelab/cognition/nyxFunctionBodyEmission.ts"] : []),
  ...(nativeLocalEmissionComparison ? ["scripts/omega/benchmarks/nativeLocalEmissionTasks.ts"] : []),
  ...(structuralContributionComparison ? ["src/lib/codelab/cognition/nyxStructuralContributionGuidance.ts",
    "scripts/omega/benchmarks/structuralContributionTransferTasks.ts"] : []),
  "src/lib/codelab/cognition/nyxNemotronEngineeringCognition.ts", "src/lib/codelab/cognition/nyxRepairIntentCompiler.ts",
  "src/lib/codelab/engine/r3BoundedRepairLoop.ts", "scripts/omega/benchmarks/sourceRepresentationTasks.ts",
  "scripts/omega/benchmarks/arrayBoundTransferTasks.ts", "scripts/omega/benchmarks/sourceLiteralTransferTasks.ts",
  "scripts/omega/benchmarks/measuredQualityTransferTasks.ts", "src/lib/codelab/cognition/nyxMeasuredQualityGuidance.ts",
  "scripts/omega/benchmarks/qualitySiteTransferTasks.ts",
  "src/lib/codelab/assurance/engineeringQualityOracle.ts",
  ...(budgetGuidanceComparison ? ["src/lib/codelab/assurance/candidateEngineeringAdmission.ts"] : []),
  ...(v3FreshBudgetComparison?["src/lib/codelab/assurance/candidateQualityApplicability.ts",
    "scripts/omega/benchmarks/v3FreshBudgetTransferTasks.ts"]:[]),
  ...(v3NativeReasoningComparison?["src/lib/codelab/assurance/candidateQualityApplicability.ts",
    "scripts/omega/benchmarks/v3NativeReasoningTransferTasks.ts","scripts/omega/benchmarks/v3FreshBudgetTransferTasks.ts"]:[]),
  ...(publicFailureComparison?["src/lib/codelab/assurance/candidateQualityApplicability.ts",
    "scripts/omega/benchmarks/publicFailureRepairTasks.ts","scripts/omega/benchmarks/publicExecutionFailures.ts",
    "src/lib/codelab/observation/r3EngineeringObservation.ts"]:[]),
  ...(concreteRefactorComparison ? ["src/lib/codelab/cognition/nyxLocalRefactorProposals.ts"] : []),
  ...(conditionalRepair?["scripts/omega/benchmarks/conditionalRefactorRepairTasks.ts"]:[]),
  ...(sourceSelectionComparison?["src/lib/codelab/cognition/nyxSourceBoundRefactorSelection.ts"]:[]),
  ...(runtimeReviewComparison?["scripts/omega/benchmarks/publicRuntimeSamples.ts","src/lib/codelab/observation/r3EngineeringObservation.ts"]:[]),
  ...(decisionGenerationComparison ? ["src/lib/codelab/cognition/nyxDecisionRequiredSchema.ts",
    evaluationOrderComparison?"scripts/omega/benchmarks/evaluationOrderTransferTasks.ts":runtimeReviewComparison?"scripts/omega/benchmarks/runtimeReviewTransferTasks.ts":localRefactorComparison?"scripts/omega/benchmarks/localRefactorTransferTasks.ts":behaviorRepairComparison?"scripts/omega/benchmarks/behaviorRepairTransferTasks.ts":originalBudgetComparison?"scripts/omega/benchmarks/originalBudgetTransferTasks.ts":nativeReasoningComparison?"scripts/omega/benchmarks/nativeReasoningTransferTasks.ts":boundedContractComparison?(lengthTransfer?"scripts/omega/benchmarks/lengthGrammarTransferTasks.ts":patternTransfer?"scripts/omega/benchmarks/patternRepairTransferTasks.ts":"scripts/omega/benchmarks/boundedContractTransferTasks.ts"):"scripts/omega/benchmarks/decisionContractTransferTasks.ts", "scripts/omega/nyx-source-representation-cycle.ts",
    "src/lib/codelab/model/nvidiaNimProvider.ts", "scripts/omega/benchmarks/r3RepositorySession.ts",
    "scripts/omega/benchmarks/nyxArcAdapter.ts"] : [])
].map(async path => [path, contentHash(await readFile(path, "utf8"))])));
const began = Date.now(); const globalDeadline = began + frozen.globalWallClockMs;
const tasks = epochTasks.map(t => ({id: t.id, tier: t.tier, domain: t.domain,
  inputDigest: theoryDigest({objective: t.objective, publicCases: t.publicCases, privateInputs: t.privateCases.map(c => c.input),
    ...(conditionalRepair?{suppliedCandidateDigest:contentHash((t as ConditionalRepairTask).suppliedCandidate)}:{}),
    ...(publicFailureComparison?{initialSourceDigest:contentHash((t as PublicFailureRepairTask).initialSource)}:{}),
    ...(runtimeReviewComparison?{publicRuntimeInputs:t.publicRuntimeInputs}:{})}),
  oracleDigest: theoryDigest(t.privateCases), fixtureDigest: theoryDigest(t)}));
console.log(`NYX_REPRESENTATION_FREEZE ${JSON.stringify({candidate, frozen, sourceDigests, tasks, freezeDigest: theoryDigest({candidate, frozen, sourceDigests, tasks})})}`);
const results: any[] = [];
for (const [index, task] of epochTasks.entries()) {
  // Balanced order, not selected by the model or observed outcome.
  for (const variant of (index % 2 ? variants.slice().reverse() : variants)) {
    const representation = boundsComparison||localDeliveryComparison||qualityGuidanceComparison||qualitySiteComparison||decisionGenerationComparison ? "LINES" : variant as "TEXT" | "LINES";
    const preserveProviderArrayBounds = !boundsComparison || variant === "CORRECTED_BOUNDED";
    if (Date.now() >= globalDeadline) {results.push({id: task.id, variant, representation, state: "BLOCKED_GLOBAL_BUDGET"}); continue;}
    const started = Date.now(); const deadline = Math.min(globalDeadline, started + frozen.wallClockMsPerTask);
    const captures: {content: string | null; finishReason: string | null}[] = [];
    const observedInferenceControls: {model: unknown; maxTokens: unknown; temperature: unknown;
      effort: unknown; reasoningBudget: unknown; schemaDigest: string;
      hostedSchemaPresent?: boolean;
      initialCandidateState?: boolean; originalBudgetPresented?: boolean;
      structuralMapVersion?: unknown; structuralMapSources?: unknown; structuralMapSourceDigests?: readonly string[];
      originalBudgetVersion?:unknown; originalBudgetPolicyId?:unknown;
      publicAdmissionPolicyId?:unknown; legacyLineApplicabilityPresent?:boolean;
      postCandidatePhase?:boolean; passReviewPhase?:boolean; publicRuntimeSampleCount?:number; promptDigest?:string;
      qualityRepairPhase?: boolean; bindingUsesPresented?: boolean; localProposalsPresented?: boolean;
      localProposalCount?: number; localProposalVersion?: string | null; localProposalIdentities?: readonly unknown[];
      selectionBranchOffered?:boolean;selectionBindingDigest?:string|null;selectionExampleDecision?:string;publicExceptionClassCount?:number;privateExceptionClassCount?:number}[] = [];
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
            schemaDigest:theoryDigest(body.response_format), ...(functionBodyComparison?{
              hostedSchemaPresent:Object.hasOwn(body,"response_format"),promptDigest:theoryDigest(body.messages),
              bodyEmissionVersion:prompt.functionBodyEmission?.version??null,
              bodyEntryCount:prompt.functionBodyEmission?.entries?.length??0}:{}), ...(nativeLocalEmissionComparison?{
              hostedSchemaPresent:Object.hasOwn(body,"response_format"),promptDigest:theoryDigest(body.messages)}:{}), ...(runtimeReviewComparison?{
              postCandidatePhase:prompt.hypothesisHistory.length>0,passReviewPhase:prompt.activeRepairDriver.kind==="SCOPED_PASS_REVIEW",
              publicRuntimeSampleCount:prompt.observation.diagnostics.filter((d:any)=>d.code==="PUBLIC_RUNTIME_SAMPLE").length,
              promptDigest:theoryDigest(body.messages)}:{}), ...(originalBudgetComparison||v3NativeReasoningComparison?{
              initialCandidateState:prompt.hypothesisHistory.length===0
                && prompt.activeRepairDriver.kind==="EXECUTION_OBSERVATION",
              originalBudgetPresented:prompt.originalStructuralBudget?.version
                ===(v3FreshBudgetComparison||v3NativeReasoningComparison?V3_FRESH_BUDGET_EPOCH.originalBudgetVersion:"nyx-original-state-quality-budget/1"),
              ...(structuralContributionComparison?{qualityRepairPhase:prompt.activeRepairDriver.kind==="QUALITY_REJECTION",
                structuralMapVersion:prompt.structuralContributions?.version??null,
                structuralMapSources:prompt.structuralContributions?.sources?.length??0,
                structuralMapSourceDigests:(prompt.structuralContributions?.sources??[]).map((source:any)=>source.sourceDigest)}:{}),
              ...(v3FreshBudgetComparison||v3NativeReasoningComparison?{originalBudgetVersion:prompt.originalStructuralBudget?.version??null,
                originalBudgetPolicyId:prompt.originalStructuralBudget?.staticPolicyId??null,
                publicAdmissionPolicyId:prompt.constraints.publicStaticAdmission.policyId,
                legacyLineApplicabilityPresent:Object.hasOwn(prompt.constraints.publicStaticAdmission.tinySingleChangedFileRule,"atMostNonblankOriginalLines")}: {})}:{}), ...(behaviorRepairComparison?{
              qualityRepairPhase:prompt.activeRepairDriver.kind==="QUALITY_REJECTION",
              bindingUsesPresented:prompt.behaviorPreservingQualityRepair?.version
                ==="nyx-behavior-preserving-quality-repair/1"}:{}), ...(publicFailureComparison?{
              publicAdmissionPolicyId:prompt.constraints.publicStaticAdmission.policyId,
              contextPaths:prompt.admittedEvidence.filter((e:any)=>e.kind==="FILE").map((e:any)=>e.target),
              publicExceptionClassCount:prompt.observation.diagnostics.filter((d:any)=>/^FAIL public-example=\d+ execution-error error-class=(REFERENCE_ERROR|TYPE_ERROR|RANGE_ERROR|SYNTAX_ERROR|ERROR|UNKNOWN_THROW)$/.test(d.message)).length,
              privateExceptionClassCount:prompt.observation.diagnostics.filter((d:any)=>d.message.startsWith("FAIL private-input")&&d.message.includes("error-class=")).length}:{}), ...(concreteRefactorComparison||freshGuardedComparison?{
              qualityRepairPhase:prompt.activeRepairDriver.kind==="QUALITY_REJECTION",
              localProposalsPresented:["nyx-local-refactor-proposals/2","nyx-local-refactor-proposals/3","nyx-source-bound-refactor-selection/1"].includes(prompt.localRefactorProposals?.version),
              localProposalVersion:prompt.localRefactorProposals?.version??null,
              localProposalCount:prompt.localRefactorProposals?.proposals?.length??0,
              localProposalIdentities:(prompt.localRefactorProposals?.proposals??[]).map((proposal:any)=>({
                baseSourceDigest:proposal.baseSourceDigest,proposedSourceDigest:proposal.proposedSourceDigest,
                operations:proposal.operations.map((operation:any)=>operation.kind),before:proposal.before,after:proposal.after})),
              ...(sourceSelectionComparison||freshGuardedComparison?{...(freshGuardedComparison?{promptDigest:theoryDigest(body.messages)}:{}),selectionBranchOffered:(body.response_format.json_schema.schema.anyOf??[])
                .some((branch:any)=>branch.properties?.decision?.enum?.includes("SELECT_LOCAL_REFACTOR")),
                selectionBindingDigest:prompt.localRefactorProposals?.bindingDigest??null,
                selectionExampleDecision:prompt.minimalExample?.decision}:{} )}:{} )});
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
    const provider = decisionGenerationComparison ? baseProvider.withHttpAttemptBudget(conditionalRepair?1:2, "WITHIN_SHARED_BUDGET") : baseProvider;
    const repositoryFiles=representationRepositoryFiles(task,publicFailureComparison&&variant==="PUBLIC_EXCEPTION_CLASS"
      ?{publicExecutionDiagnostics:"BOUNDED_CLASS_ONLY"}:{});
    const session = await R3BenchmarkRepositorySession.create(publicFailureComparison
      ?{...repositoryFiles,"src/transform.mjs":(task as PublicFailureRepairTask).initialSource}:repositoryFiles,
      candidate, deadline, frozen.maxPatchBytes);
    let loopResult: Awaited<ReturnType<R3BoundedRepairLoop["run"]>> | null = null;
    let cleanup: Awaited<ReturnType<R3BenchmarkRepositorySession["close"]>> | null = null;
    let infrastructureFailure = false;
    let baselineExecutions = 0;
    let fixtureEvidence: readonly NyxRepairCognitionEvidence[] = [];
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
        ...(nativeReasoningComparison&&!fixedNativeProfile?nativeReasoningTransferConfiguration(variant):{}),
        ...(v3NativeReasoningComparison&&!fixedNativeProfile?v3NativeReasoningConfiguration(variant):{}),
        ...(structuralContributionComparison?structuralContributionConfiguration(variant):{}),
        ...(nativeLocalEmissionComparison?nativeLocalEmissionConfiguration(variant):{}),
        ...(functionBodyComparison?functionBodyTransferConfiguration(variant):{}),
        ...(freshGuardedComparison?guardedRepairFreshConfiguration(variant):{}),
        ...(behaviorRepairComparison?behaviorRepairTransferConfiguration(variant):{}),
        ...(publicFailureComparison?publicFailureRepairConfiguration(variant):{}),
        ...(localRefactorComparison?localRefactorTransferConfiguration(variant):{}),
        ...(evaluationOrderComparison?evaluationOrderTransferConfiguration(sourceSelectionComparison?"EVALUATION_ORDER_PROPOSALS":variant):{}),
        ...(sourceSelectionComparison&&variant==="SOURCE_BOUND_SELECTION"?{localRefactorSelection:"SOURCE_BOUND_REFERENCES" as const}:{}),
        ...(runtimeReviewComparison?runtimeReviewTransferConfiguration(variant):{}),
        ...(originalBudgetComparison?originalBudgetTransferConfiguration(variant):{})});
      const composition=conditionalRepair?suppliedCandidateThenLive(cognition,(task as ConditionalRepairTask).suppliedCandidate):null;
      fixtureEvidence=composition?.fixtureEvidence??[];
      const loop = R3BoundedRepairLoop.create({loopId: `REPRESENTATION-${task.id}-${representation}`, evaluatorVersion: "source-representation-cycle/1",
        observerIdentity: "OMEGA-REPRESENTATION-OBSERVER", cognition:composition?.cognition??cognition,
        ...(versionedAdmissionComparison?{candidateAdmissionPolicyId:V3_FRESH_BUDGET_EPOCH.admissionPolicyId}:{}),
        candidateBuilder: {builderIdentity: "OMEGA-REPRESENTATION-EXISTING-R3", prepare: async h => {
          const prepared=await session.prepare(h);
          return publicFailureComparison?{...prepared,files:publicFailureContext(prepared.files)}:prepared;
        }},
        ...(runtimeReviewComparison?{passedCandidateReview:"ONCE_WITHIN_EXISTING_BUDGET" as const,
          ...(variant==="RUNTIME_OBSERVATION_REVIEW"?{publicRuntimeSamples:"BOUNDED_OBSERVATIONS" as const}:{})}:{}),
        maxIterations: frozen.candidateIterationsPerTask, maxModelInteractions: frozen.logicalCallsPerTask+(conditionalRepair?1:0), maxCognitionCorrections: conditionalRepair?0:1,
        maxWallClockMs: Math.max(100, deadline - Date.now() - 5000), maxChangesPerIteration: 1,
        maxPatchBytesPerIteration: frozen.maxPatchBytes, maxDiagnosisCharacters: 1500});
      loopResult = await loop.run({schemaVersion: 1, repairRequestId: `REPRESENTATION-${task.id}`, objective: task.objective,
        initialObservation: baseline.observation, initialFiles: publicFailureComparison?publicFailureContext(baseline.prepared.files):baseline.prepared.files, allowedMutationPaths: ["src/transform.mjs"],
        availableEvidence: [], allowedVerificationToolIds: ["TEST"], baselineExecutions: [{toolId: "TEST", result: baseline.result}],
        observedAtEpochMs: Date.now(), signal: AbortSignal.timeout(Math.max(1, deadline - Date.now() - 5000))});
    } catch {infrastructureFailure = true;} finally {cleanup = await session.close();}
    const evidence = [...(loopResult?.iterations.map(i => i.cognitionEvidence) ?? []),
      ...(loopResult?.cognitionFailures.map(i => i.cognitionEvidence) ?? []),
      ...(loopResult?.evidenceAcquisitions.map(i => i.cognitionEvidence) ?? []),
      ...(loopResult?.lastCognitionEvidence ? [loopResult.lastCognitionEvidence] : [])]
      .filter((e, i, all) => e.modelEvidenceId !== "NOT_INVOKED" && all.findIndex(v => v.evidenceId === e.evidenceId) === i
        && !fixtureEvidence.some(fixture=>fixture.evidenceId===e.evidenceId)) as NyxRepairCognitionEvidence[];
    const usage = inferUsage(evidence);
    usage.toolCalls = baselineExecutions + (loopResult?.iterations.reduce((n, i) => n + i.verifications.length, 0) ?? 0);
    usage.toolWorkUnits = usage.toolCalls * (task.publicCases.length + task.privateCases.length + (task.publicRuntimeInputs?.length??0));
    usage.wallClockMs = Date.now() - started;
    const inspections = [];
    for (const capture of captures) {
      // Correlate captured bytes with the provider's independently recorded response digest.
      // This is in-process diagnostic consistency, not independent transport authentication.
      const recorded = capture.content === null ? null : evidence.find(e => e.modelResponseDigest === contentHash(capture.content));
      inspections.push(await inspectNyxSourceEmission({content: capture.content, finishReason: capture.finishReason,
        providerResponseDigest: recorded?.modelResponseDigest ?? null, expectedTarget: "src/transform.mjs", representation,
        refactorSelection:recorded?.refactorSelection,functionBodyEmission:recorded?.functionBodyEmission}));
    }
    captures.length = 0; // No raw response/source persistence.
    const last = loopResult?.iterations.at(-1);
    const lastModel=conditionalRepair?lastConditionalModelCandidate(loopResult?.iterations??[]):last;
    const qualityAccepted = lastModel?.candidateAdmission?.decision === "ADMITTED";
    const publicAccepted = lastModel?.functionallyPassed === true;
    const perIteration=loopResult?.iterations.map(i=>({iteration:i.iteration,publicAccepted:i.functionallyPassed,
      ...(qualityMechanismComparison||runtimeReviewComparison||publicFailureComparison||v3NativeReasoningComparison?{candidateSourceDigest:i.hypothesis.changes[0]?.replacementContentHash??null}:{}),
      quality:i.candidateAdmission?.decision??null,qualityFindings:i.candidateAdmission?.findings??[],
      ...(versionedAdmissionComparison?{staticPolicyId:i.candidateAdmission?.staticPolicyId??null,
        applicability:i.candidateAdmission?.applicability??null}:{}),
      ...assessRepresentationCandidate(task,{publicAccepted:i.functionallyPassed===true,
        qualityAccepted:i.candidateAdmission?.decision==="ADMITTED",
        verificationStdout:i.verifications[0]?.execution.evidence.stdout??null,
        loopVerified:i===last&&loopResult.outcome==="FUNCTIONALLY_REPAIRED_VERIFIED"})}))??[];
    const assessment=(conditionalRepair?lastConditionalModelCandidate(perIteration):perIteration.at(-1))??assessRepresentationCandidate(task,{publicAccepted:false,qualityAccepted:false,
      verificationStdout:null,loopVerified:false});
    const {score,accepted,functionalAccepted}=assessment;
    const priorFailure = loopResult?.cognitionFailures.at(-1);
    const lastFailure = priorFailure?.cognitionEvidence.evidenceId === loopResult?.lastCognitionEvidence?.evidenceId ? priorFailure : undefined;
    const failureClass = classifyRepresentationFailure({accepted,infrastructureFailure,
      reason:loopResult?.reason??"infrastructure_failure",latestSchemaFailure:lastFailure,
      latestProviderFailure:loopResult?.lastCognitionEvidence?.providerFailureCategory,
      latestDelivery:loopResult?.lastCognitionEvidence?.delivery,
      qualityRejected:lastModel?.candidateAdmission?.decision==="REJECTED",publicFailed:lastModel?.functionallyPassed===false,
      privateFailure:score?.failure??null});
    const result = {id: task.id, tier: task.tier, domain: task.domain, variant, preserveProviderArrayBounds,
      ...(conditionalRepair?{conditionalRepair:true,suppliedCandidateDigest:contentHash((task as ConditionalRepairTask).suppliedCandidate),
        fixtureInteractions:fixtureEvidence.length,fixtureEvidence:fixtureEvidence.map(e=>({evidenceId:e.evidenceId,evidenceClass:e.evidenceClass,
          providerRequestDigest:e.modelRequestDigest,responseDigest:e.modelResponseDigest,authorityGranted:e.authorityGranted})),
        fixtureReady:perIteration[0]?.functionalAccepted===true&&perIteration[0]?.quality==="REJECTED"
          &&perIteration[0]?.candidateSourceDigest===contentHash((task as ConditionalRepairTask).suppliedCandidate),
        modelCandidateProduced:lastModel!==undefined,retainedSuppliedCandidate:!lastModel&&perIteration[0]?.iteration===1,
        suppliedFunctionalAcceptance:perIteration[0]?.functionalAccepted===true,
        nominalLoopInteractions:loopResult?.modelCallCount??0,
        firstLiveRepairAccepted:accepted&&usage.logicalCalls===1&&loopResult?.iterations.length===2}:{}),
      ...(sourceSelectionComparison?{refactorSelections:evidence.flatMap(e=>e.refactorSelection?[e.refactorSelection]:[]),
        sourceOrigin:evidence.some(e=>e.refactorSelection?.outcome==="RESOLVED")?"HOST_PROPOSAL_MODEL_SELECTED":"MODEL_EMITTED_OR_NO_REPAIR"}:{}),
      ...(decisionGenerationComparison ? {providerIntentShape: nativeReasoningComparison||budgetGuidanceComparison?"DECISION_REQUIRED_FIELDS_AND_LENGTHS":["DECISION_REQUIRED_FIELDS","DECISION_REQUIRED_FIELDS_AND_BOUNDS","DECISION_REQUIRED_FIELDS_AND_LENGTHS"].includes(variant) ? variant : "LEGACY_OPTIONAL_FIELDS",
        schemaRejectedInteractions: loopResult?.cognitionFailures.length ?? 0} : {}),
      ...(nativeReasoningComparison||budgetGuidanceComparison?{observedInferenceControls,
        inferenceControlVerified:observedInferenceControls.length===usage.physicalCalls&&observedInferenceControls.length>0
          &&observedInferenceControls.every(c=>c.model===model&&c.maxTokens===frozen.maxOutputTokens&&c.temperature===0
            &&c.effort===(fixedNativeProfile||variant==="NATIVE_BOUNDED_REASONING"?"high":"none")
            &&c.reasoningBudget===(fixedNativeProfile||variant==="NATIVE_BOUNDED_REASONING"?2048:null)),
        ...(v3NativeReasoningComparison?{v3NativeControlVerified:freshGuardedComparison
          ?guardedRepairFreshWireVerified(variant,observedInferenceControls):functionBodyComparison
          ?functionBodyWireVerified(variant,observedInferenceControls):nativeLocalEmissionComparison
          ?nativeLocalEmissionWireVerified(variant,observedInferenceControls):structuralContributionComparison
          ?structuralContributionWireVerified(variant,observedInferenceControls):v3NativeWireVerified(variant,observedInferenceControls),
          admissionPolicyObservation:observeV3AdmissionPolicy(perIteration),
          publicPolicyControlVerified:observedInferenceControls.every(control=>control.publicAdmissionPolicyId===V3_NATIVE_REASONING_EPOCH.admissionPolicyId
            &&control.legacyLineApplicabilityPresent===false),
          initialCandidateMeetsFunctionalAndQuality:perIteration[0]?.functionalAccepted===true&&perIteration[0]?.quality==="ADMITTED",
          functionalRegressionsAfterQualityRejection:perIteration[0]?.functionalAccepted===true&&perIteration[0]?.quality==="REJECTED"
            &&perIteration.length>1&&!perIteration.at(-1)?.functionalAccepted}:{}),
        ...(runtimeReviewComparison?{runtimeReviewControlVerified:observedInferenceControls.length>0&&observedInferenceControls.every(c=>
          typeof c.postCandidatePhase==="boolean"&&typeof c.passReviewPhase==="boolean"
          &&Number.isSafeInteger(c.publicRuntimeSampleCount)&&c.publicRuntimeSampleCount!>=0&&c.publicRuntimeSampleCount!<=4
          &&(variant==="RUNTIME_OBSERVATION_REVIEW"||c.publicRuntimeSampleCount===0)
          &&(c.postCandidatePhase||c.publicRuntimeSampleCount===0)),
          passReviewPrompts:observedInferenceControls.filter(c=>c.passReviewPhase).length,
          sampleObservationPrompts:observedInferenceControls.filter(c=>(c.publicRuntimeSampleCount??0)>0).length,
          retainedWithoutMutation:loopResult?.reason==="bounded_review_retained_independently_admitted_candidate"}:{}),
        ...(originalBudgetComparison?{originalBudgetControlVerified:
          (v3FreshBudgetComparison?v3FreshBudgetWireVerified:originalBudgetWireControlVerified)(variant,observedInferenceControls),
          ...(v3FreshBudgetComparison?{admissionPolicyObservation:observeV3AdmissionPolicy(perIteration),
            admissionPolicyControlVerified:observeV3AdmissionPolicy(perIteration).state==="OBSERVED",
            publicPolicyControlVerified:observedInferenceControls.every(control=>control.publicAdmissionPolicyId===V3_FRESH_BUDGET_EPOCH.admissionPolicyId
              &&control.legacyLineApplicabilityPresent===false),
            initialCandidateMeetsFunctionalAndQuality:perIteration[0]?.functionalAccepted===true&&perIteration[0]?.quality==="ADMITTED"}: {})}:{}),
        ...(behaviorRepairComparison?{behaviorRepairControlVerified:
          behaviorRepairWireControlVerified(variant,observedInferenceControls),
          qualityRepairPromptCount:observedInferenceControls.filter(control=>control.qualityRepairPhase).length,
          bindingUsePromptCount:observedInferenceControls.filter(control=>control.bindingUsesPresented).length}:{}),
        ...(publicFailureComparison?{publicFailureControlVerified:publicFailureRepairWireVerified(variant,observedInferenceControls),
          publicPolicyControlVerified:observedInferenceControls.every(control=>control.publicAdmissionPolicyId===PUBLIC_FAILURE_REPAIR_EPOCH.admissionPolicyId),
          admissionPolicyObservation:observeV3AdmissionPolicy(perIteration),
          publicExceptionClassPrompts:observedInferenceControls.filter(control=>(control.publicExceptionClassCount??0)>0).length,
          initialSourceDigest:contentHash((task as PublicFailureRepairTask).initialSource),
          firstLiveBugRepairAccepted:accepted&&usage.logicalCalls===1&&loopResult?.iterations.length===1}:{}),
        ...(concreteRefactorComparison?{localRefactorControlVerified:
          sourceSelectionComparison?sourceSelectionWireControlVerified(variant,observedInferenceControls):evaluationOrderComparison?evaluationOrderWireControlVerified(variant,observedInferenceControls)
            :localRefactorWireControlVerified(variant,observedInferenceControls),
          qualityRepairPromptCount:observedInferenceControls.filter(control=>control.qualityRepairPhase).length,
          localRefactorPromptCount:observedInferenceControls.filter(control=>control.localProposalsPresented).length,
          actionableProposalPromptCount:observedInferenceControls.filter(control=>(control.localProposalCount??0)>0).length}:{}),
      }:{}),
      representation, accepted, functionalAccepted, qualityAccepted, publicAccepted, score,
      firstCallAccepted: !conditionalRepair && accepted && usage.logicalCalls === 1 && loopResult?.iterations.length === 1,
      ...(runtimeReviewComparison?{firstCandidateMeetsChecks:perIteration[0]?.functionalAccepted===true&&perIteration[0]?.quality==="ADMITTED",
        mutationRepairCount:Math.max(0,(loopResult?.iterations.length??0)-1)}:{}),
      repairedAccepted: accepted && (usage.logicalCalls > 1 || (loopResult?.iterations.length ?? 0) > 1),
      loopOutcome: loopResult?.outcome ?? "INFRASTRUCTURE_FAILURE", loopReason: loopResult?.reason ?? "INTEGRATION_THROW",
      terminalProviderFailure:loopResult?.lastCognitionEvidence?.providerFailureCategory??null,
      terminalProviderDelivery:loopResult?.lastCognitionEvidence?.delivery??null,
      failureClass,
      infrastructureFailure, inspections, usage, candidateIterations: loopResult?.iterations.length ?? 0,
      toolUsageComplete: !infrastructureFailure,
      perIteration,
      failureCodes: loopResult?.cognitionFailures.flatMap(f => f.diagnostics.map(d => ({category: d.category,
        path: /^\$[a-zA-Z0-9_.\[\]]{0,120}$/.test(d.path) ? d.path : "REDACTED_NON_PATH",
        observed: /^[a-zA-Z0-9_]{1,120}$/.test(d.observed) ? d.observed : "REDACTED_NON_CODE", digest: theoryDigest(d)}))) ?? [],
      ...(functionBodyComparison?{bodyEmissionReceipts:evidence.flatMap(item=>item.functionBodyEmission?[item.functionBodyEmission]:[]),
        artifactFailureObservation:score?.failure!=="ARTIFACT_SCHEMA"?"NOT_APPLICABLE"
          :lastModel?.verifications[0]?.execution.evidence.stderr.includes("FAIL private-input execution-error")
            ?"CANDIDATE_EXECUTION_OR_RESULT_SERIALIZATION_EXCEPTION":"ARTIFACT_MARKER_OR_SCHEMA_FAILURE_UNKNOWN_ORIGIN"}:{}),
      requestDigests: evidence.flatMap(e => e.modelRequestDigest ? [e.modelRequestDigest] : []),
      ...(freshGuardedComparison?{guardedSelectionReceipts:evidence.flatMap(e=>e.refactorSelection?[e.refactorSelection]:[]),
        guardedProposalPrompts:observedInferenceControls.filter(control=>(control.localProposalCount??0)>0).length}:{}),
      responseDigests: evidence.flatMap(e => e.modelResponseDigest ? [e.modelResponseDigest] : []), cleanup,
      privateScorerWorkUnits: perIteration.reduce((n,i)=>n+i.privateScorerWorkUnits,0)};
    results.push(result); console.log(`NYX_REPRESENTATION_TASK ${JSON.stringify(result)}`);
  }
}
const pairs = tasks.map(task => {
  const rows = results.filter(r => r.id === task.id); const stable = rows.length === 2 && rows.every(r => r.usage && !r.infrastructureFailure
    && r.toolUsageComplete
    && (!runtimeReviewComparison || r.inferenceControlVerified===true&&r.runtimeReviewControlVerified===true)
    && (!originalBudgetComparison || r.inferenceControlVerified === true && r.originalBudgetControlVerified === true)
    && (!versionedAdmissionComparison || ["OBSERVED","NOT_REACHED"].includes(r.admissionPolicyObservation?.state)&&r.publicPolicyControlVerified===true)
    && (!publicFailureComparison || r.inferenceControlVerified===true&&r.publicFailureControlVerified===true)
    && (!v3NativeReasoningComparison || r.inferenceControlVerified===true&&r.v3NativeControlVerified===true)
    && (!behaviorRepairComparison || r.inferenceControlVerified === true && r.behaviorRepairControlVerified === true)
    && (!concreteRefactorComparison || r.inferenceControlVerified === true && r.localRefactorControlVerified === true)
    && (!conditionalRepair || r.fixtureReady===true&&r.fixtureInteractions===1&&r.fixtureEvidence[0]?.evidenceClass==="E3")
    && r.usage.unknownUsageCalls === 0 && r.usage.providerFailures === 0 && r.usage.retries === 0);
  const matched = stable && ["physicalCalls", "reportedTokens", "toolWorkUnits"].every(key => {
    const values = rows.map(r => r.usage[key] + (key === "toolWorkUnits" ? r.privateScorerWorkUnits : 0));
    return Math.max(...values) - Math.min(...values) <= Math.max(1, ...values) * frozen.realizedTolerance;
  });
  const baseline = rows.find(r => r.variant === (functionBodyComparison?"COMPLETE_FILE_CONTROL":nativeLocalEmissionComparison?"HOSTED_NATIVE_CONTROL":structuralContributionComparison?"DECLARATION_SITES_CONTROL":publicFailureComparison?"OPAQUE_EXCEPTION_CONTROL":sourceSelectionComparison?"EVALUATION_ORDER_SOURCE_CONTROL":evaluationOrderComparison?"GUARDED_V2_CONTROL":runtimeReviewComparison?"SCOPED_REVIEW_CONTROL":qualityMechanismComparison?"QUALITY_SITES_CONTROL":originalBudgetComparison?"STRUCTURE_SITES_CONTROL":nativeReasoningComparison?"NATIVE_NONE":boundedContractComparison?"DECISION_REQUIRED_FIELDS":"LEGACY_OPTIONAL_FIELDS"));
  const treatment = rows.find(r => r.variant === (functionBodyComparison?"SOURCE_BOUND_BODY":nativeLocalEmissionComparison?"STRICT_LOCAL_NATIVE":structuralContributionComparison?"ALL_STRUCTURE_SITES":publicFailureComparison?"PUBLIC_EXCEPTION_CLASS":sourceSelectionComparison?"SOURCE_BOUND_SELECTION":evaluationOrderComparison?"EVALUATION_ORDER_PROPOSALS":runtimeReviewComparison?"RUNTIME_OBSERVATION_REVIEW":localRefactorComparison?"GUARDED_REFACTOR_PROPOSALS":behaviorRepairComparison?"BINDING_USES":originalBudgetComparison?"ORIGINAL_BUDGET":nativeReasoningComparison?"NATIVE_BOUNDED_REASONING":boundedContractComparison?boundedTreatment:"DECISION_REQUIRED_FIELDS"));
  const noMoreMeasuredCompute = decisionGenerationComparison && stable && baseline && treatment
    && ["physicalCalls", "reportedTokens", "toolWorkUnits"].every(key =>
      treatment.usage[key] + (key === "toolWorkUnits" ? treatment.privateScorerWorkUnits : 0)
      <= baseline.usage[key] + (key === "toolWorkUnits" ? baseline.privateScorerWorkUnits : 0));
  const structuralRepairEligible = structuralContributionComparison && matched
    && typeof baseline?.perIteration?.[0]?.candidateSourceDigest === "string"
    && baseline.perIteration[0].candidateSourceDigest === treatment?.perIteration?.[0]?.candidateSourceDigest
    && [baseline,treatment].every(row=>row?.perIteration?.[0]?.publicAccepted&&row.perIteration[0].quality==="REJECTED")
    && treatment?.observedInferenceControls?.some((control:any)=>control.structuralMapSources>0) === true;
  const freshControl=rows.find(row=>row.variant==="GUARDED_SOURCE_CONTROL"),freshTreatment=rows.find(row=>row.variant==="GUARDED_SELECTION");
  const freshAssessment=freshGuardedComparison?guardedRepairPairAssessment(freshControl,freshTreatment,matched):null;
  return {id: task.id, tier: task.tier, providerStable: stable, matchedRealizedCompute: matched,
    ...(freshGuardedComparison?{...freshAssessment,
      sameFirstPrompt:typeof freshControl?.observedInferenceControls?.[0]?.promptDigest==="string"
        &&freshControl.observedInferenceControls[0].promptDigest===freshTreatment?.observedInferenceControls?.[0]?.promptDigest}:{}),
    ...(nativeLocalEmissionComparison||functionBodyComparison?{sameFirstPrompt:typeof baseline?.observedInferenceControls?.[0]?.promptDigest==="string"
      &&baseline.observedInferenceControls[0].promptDigest===treatment?.observedInferenceControls?.[0]?.promptDigest,
      qualifyingFullAcceptanceGain:matched&&treatment?.accepted===true&&baseline?.accepted===false}:{}),
    ...(structuralContributionComparison?{structuralRepairEligible,
      qualifyingRepairAcceptanceGain:structuralRepairEligible&&treatment.accepted&&!baseline.accepted,
      treatmentExercised:treatment?.observedInferenceControls?.some((control:any)=>control.structuralMapSources>0)??false,
      sameFirstCandidate:typeof baseline?.perIteration?.[0]?.candidateSourceDigest==="string"
        &&baseline.perIteration[0].candidateSourceDigest===treatment?.perIteration?.[0]?.candidateSourceDigest,
      pairedQualityRepairOpportunity:[baseline,treatment].every(row=>row?.perIteration?.[0]?.publicAccepted&&row.perIteration[0].quality==="REJECTED")}:{}),
    ...(versionedAdmissionComparison?{comparisonControlsVerified:stable,
      providerDeliveryStable:rows.length===2&&rows.every(r=>!r.infrastructureFailure&&r.usage
        &&r.usage.providerFailures===0&&r.usage.unknownUsageCalls===0&&r.usage.retries===0)}:{}),
    ...(runtimeReviewComparison?{treatmentExercised:(treatment?.sampleObservationPrompts??0)>0,
      sameFirstCandidate:typeof baseline?.perIteration?.[0]?.candidateSourceDigest==="string"
        &&baseline.perIteration[0].candidateSourceDigest===treatment?.perIteration?.[0]?.candidateSourceDigest,
      sameFirstPrompt:typeof baseline?.observedInferenceControls?.[0]?.promptDigest==="string"
        &&baseline.observedInferenceControls[0].promptDigest===treatment?.observedInferenceControls?.[0]?.promptDigest}:{}),
    ...(qualityMechanismComparison?{
      treatmentExercised:(concreteRefactorComparison?treatment?.localRefactorPromptCount:treatment?.bindingUsePromptCount??0)>0,
      ...(concreteRefactorComparison?{actionableTreatmentExercised:(treatment?.actionableProposalPromptCount??0)>0}:{}),
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
  hypothesis: functionBodyComparison ? "Source-bound function-body serialization preserves observed interfaces and reduces emission failure or improves fresh full acceptance under unchanged downstream parser, native model, V3 quality, verifier, authority and shared caps. The body arm has a narrower scaffold-preserving edit surface; actual compute and prompt differences are reported. No broad cognition or default promotion follows from implementation tests." : nativeLocalEmissionComparison ? "Omitting only the hosted response format under bounded native reasoning reduces interface failures and improves fresh full engineering acceptance under identical prompt construction, V3 admission, strict local parser, verifier, authority and shared caps. Reliability and cognitive efficacy are judged separately; independent run identities and realized compute are reported, not assumed matched." : structuralContributionComparison ? "Source-bound control and short-circuit contribution maps improve coherent quality-only repair on fresh unseeded tasks over declaration-site feedback with identical model, native reasoning, V3 acceptance, authority and compute caps. Realized compute and first-candidate identity must be checked; no default or broad promotion follows from configuration or local tests." : v3NativeReasoningComparison ? "Existing bounded native reasoning improves full acceptance or prevents behavior-destroying quality repair on fresh unseeded tasks under identical corrected V3 policy, grammar, feedback, authority and shared caps. Realized extra compute must be reported, not called compute-matched merely because caps match. Previous exposed/V2 results are not regraded." : publicFailureComparison ? "Bounded public native exception classes improve repair of fresh supplied faulty repositories over opaque exceptions under identical model, V3 policy, private oracle, authority and shared caps. This is not unseeded implementation, an official benchmark, or a frontier-capability claim." : sourceSelectionComparison
    ? "Explicit selection of the same current v3 host proposal reduces reserialization failure and improves one-call conditional quality repair over source emission. This exposed supplied-algorithm diagnostic cannot establish model-generated source, independent reasoning or fresh generalization."
    : conditionalRepair
    ? "Optional v3 proposals improve one-call behavior-preserving cumulative-quality repair over v2, conditioned on an identical predeclared supplied algorithm that passes functional checks but fails unchanged quality admission. This is not first-attempt coding or fresh unseeded generalization."
    : evaluationOrderComparison
    ? "Adding guarded single-use first-evaluated-expression proposals improves fresh cumulative-quality repair over existing v2 proposals without extra model calls, changed original state, oracle, authority or shared resource caps."
    : runtimeReviewComparison
    ? "Actual bounded public runtime observations improve scoped candidate review or repair on fresh tasks over the identical review cadence without observations, under unchanged models, calls, verifier, private oracle and quality gates."
    : localRefactorComparison
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
      ...(runtimeReviewComparison?{passReviewPrompts:rows.reduce((n,r)=>n+(r.passReviewPrompts??0),0),
        sampleObservationPrompts:rows.reduce((n,r)=>n+(r.sampleObservationPrompts??0),0),
        retainedWithoutMutation:rows.filter(r=>r.retainedWithoutMutation).length,
        reviewRegressions:rows.filter(r=>r.perIteration?.[0]?.functionalAccepted&&r.perIteration.length>1&&!r.perIteration.at(-1).functionalAccepted).length}:{}),
      ...(qualityMechanismComparison?{qualityRepairPrompts:rows.reduce((n,r)=>n+(r.qualityRepairPromptCount??0),0),
        treatmentPrompts:rows.reduce((n,r)=>n+(concreteRefactorComparison?r.localRefactorPromptCount??0:r.bindingUsePromptCount??0),0),
        ...(concreteRefactorComparison?{actionableProposalPrompts:rows.reduce((n,r)=>n+(r.actionableProposalPromptCount??0),0),
          privateRegressionsAfterQualityRejection:rows.filter(r=>r.perIteration?.[0]?.functionalAccepted
            &&r.perIteration[0].quality==="REJECTED"&&r.perIteration.length>1&&!r.perIteration.at(-1).functionalAccepted).length,
          ...(conditionalRepair?{modelCandidatesProduced:rows.filter(r=>r.modelCandidateProduced).length,
            retainedSuppliedCandidates:rows.filter(r=>r.retainedSuppliedCandidate).length,
            suppliedFunctionalAcceptance:rows.filter(r=>r.suppliedFunctionalAcceptance).length}:{} )}:{}),
        publicRegressionsAfterQualityRejection:rows.filter(r=>r.perIteration?.[0]?.publicAccepted
          &&r.perIteration[0].quality==="REJECTED" &&r.perIteration.length>1 &&!r.perIteration.at(-1).publicAccepted).length}:{}),
      repairedAccepted: rows.filter(r => r.repairedAccepted).length, reportedTokens: rows.reduce((n, r) => n + (r.usage?.reportedTokens ?? 0), 0),
      unknownUsageCalls: rows.reduce((n, r) => n + (r.usage?.unknownUsageCalls ?? 0), 0)};}),
  evidence: "E4_LIVE_MODEL_AND_E3_LOCAL_OMEGA_AND_PRIVATE_EXACT_SCORER",
  authorship: "SAME_SESSION_NOT_INDEPENDENTLY_AUTHORED", benchmarkTasksUsed: false,
  staticAdmissionAndParserUnchanged: !v3FreshBudgetComparison&&!v3NativeReasoningComparison,
  ...(v3NativeReasoningComparison?{staticAdmissionWithinEpochIdentical:true,historicalV2EvidenceUnchanged:true,
    diagnosisScope:"NATIVE_REASONING_EFFICACY_UNDER_AUTHORIZED_V3_NOT_V3_COGNITIVE_GAIN"}:{}),
  ...(structuralContributionComparison?{diagnosisScope:"STRUCTURAL_REPAIR_FEEDBACK_EFFICACY_NOT_NATIVE_REASONING_OR_POLICY_PROMOTION",
    treatmentPromptCount:results.reduce((sum,row)=>sum+(row.observedInferenceControls??[]).filter((control:any)=>control.structuralMapSources>0).length,0)}:{}),
  ...(nativeLocalEmissionComparison?{diagnosisScope:"SOURCE_EMISSION_RELIABILITY_SEPARATE_FROM_VALID_CODE_REASONING_AND_QUALITY",
    localParserAndOracleIdentical:true,defaultChanged:false}:{}),
  ...(functionBodyComparison?{diagnosisScope:"SOURCE_BOUND_EMISSION_RELIABILITY_AND_FRESH_FULL_ACCEPTANCE_NOT_BROAD_COGNITION",
    downstreamParserAndOracleIdentical:true,defaultChanged:false,sourceBodyOracleUsed:false,
    originalFunctionScaffoldPreserved:true}:{}),
  ...(v3FreshBudgetComparison?{staticAdmissionWithinEpochIdentical:true, historicalV2EvidenceUnchanged:true,
    diagnosisScope:"QUALITY_GUIDANCE_EFFICACY_UNDER_AUTHORIZED_V3_NOT_V3_COGNITIVE_GAIN"}:{}),
  rawSourcePersisted: false, grantsAuthority: false, broadPromotion: false};
if(freshGuardedComparison)Object.assign(report,{diagnosisScope:"GUARDED_QUALITY_REPAIR_AFTER_LIVE_GENERATION_NOT_SEEDED_ALGORITHM_OR_BROAD_COGNITION",
  hypothesis:"Selecting the same source-bound guarded refactor, rather than re-emitting its source, reduces behavior-destroying quality repairs at matched realized compute. No causal credit before quality rejection or without the same initial candidate.",
  promotionCriterion:GUARDED_REPAIR_FRESH_EPOCH.criterion,
  falsification:"Any acceptance regression, no repeated qualifying post-rejection gain in both domains, unmatched compute or missing candidate identity: no promotion.",
  defaultChanged:false,suppliedCandidates:false});
await writeFile(join(process.env.RUNNER_TEMP || tmpdir(), `nyx-source-representation-${candidate}.json`), JSON.stringify(report, null, 2));
console.log(`NYX_REPRESENTATION_CYCLE ${JSON.stringify(report)}`);
if (!sourceUnchanged || results.some(r => r.cleanup && (!r.cleanup.sourceUnchanged || !r.cleanup.cleanupVerified))) process.exitCode = 1;

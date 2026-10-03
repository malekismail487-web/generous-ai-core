import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {NvidiaNimProvider,nvidiaNimCredentialFromEnvironment} from "../../src/lib/codelab/model/nvidiaNimProvider";
import {runNyxQuantitativeTask,type QuantitativeArm,type QuantitativeRun} from "../../src/lib/codelab/research/nyxQuantitativeReasoning";
import {theoryDigest} from "../../src/lib/codelab/research/theoryContracts";
import {QUANTITATIVE_EPOCH,QUANTITATIVE_TASKS,QUANTITATIVE_CORPUS_DIGEST,verifyQuantitativeSubmission} from "./nyx-quantitative-transfer-fixtures";
import {FRESH_QUANTITATIVE_EPOCH,FRESH_QUANTITATIVE_TASKS,FRESH_QUANTITATIVE_CORPUS_DIGEST,verifyFreshQuantitativeSubmission} from "./nyx-quantitative-fresh-fixtures";
import {SLOT_TRANSFER_EPOCH,SLOT_TRANSFER_TASKS,SLOT_TRANSFER_CORPUS_DIGEST,verifySlotTransferSubmission} from "./nyx-quantitative-slot-transfer-fixtures";
import {EQUATION_TRANSFER_EPOCH,EQUATION_TRANSFER_TASKS,EQUATION_TRANSFER_CORPUS_DIGEST,verifyEquationTransferSubmission} from "./nyx-quantitative-equation-transfer-fixtures";
import {COMPOSED_TRANSFER_EPOCH,COMPOSED_TRANSFER_TASKS,COMPOSED_TRANSFER_CORPUS_DIGEST,verifyComposedTransferSubmission} from "./nyx-quantitative-composed-transfer-fixtures";
import {COMMAND_TRANSFER_EPOCH,COMMAND_TRANSFER_TASKS,COMMAND_TRANSFER_CORPUS_DIGEST,verifyCommandTransferSubmission} from "./nyx-quantitative-command-transfer-fixtures";
import {CONSTRAINT_TRANSFER_EPOCH,CONSTRAINT_TRANSFER_TASKS,CONSTRAINT_TRANSFER_CORPUS_DIGEST,verifyConstraintTransferSubmission,type ConstraintTransferTask} from "./nyx-quantitative-constraint-transfer-fixtures";
import {COUPLED_TRANSFER_EPOCH,COUPLED_TRANSFER_TASKS,COUPLED_TRANSFER_CORPUS_DIGEST,verifyCoupledTransferSubmission,
  createSharedFirstProposal,assessConstraintFeedbackComparison,type SharedProposalReceipt} from "./nyx-quantitative-coupled-transfer-fixtures";
import {PROTOCOL_REPAIR_EPOCH,PROTOCOL_REPAIR_TASKS,PROTOCOL_REPAIR_CORPUS_DIGEST,verifyProtocolRepairSubmission} from "./nyx-quantitative-protocol-repair-fixtures";
import {REPAIR_CONTEXT_EPOCH,REPAIR_CONTEXT_TASKS,REPAIR_CONTEXT_CORPUS_DIGEST,verifyRepairContextSubmission} from "./nyx-quantitative-repair-context-fixtures";
import {PROVIDER_DIAGNOSTIC_EPOCH,PROVIDER_DIAGNOSTIC_TASKS,PROVIDER_DIAGNOSTIC_CORPUS_DIGEST,verifyProviderDiagnosticSubmission,
  PROVIDER_DIAGNOSTIC_MODES,providerDiagnosticRequest,type ProviderDiagnosticMode} from "./nyx-quantitative-provider-diagnostic-fixtures";
import {MODEL_REPAIR_EPOCH,MODEL_REPAIR_TASKS,MODEL_REPAIR_CORPUS_DIGEST,verifyModelRepairSubmission,
  MODEL_REPAIR_REPLICATION_EPOCH,MODEL_REPAIR_REPLICATION_TASKS,MODEL_REPAIR_REPLICATION_CORPUS_DIGEST,verifyModelRepairReplicationSubmission} from "./nyx-quantitative-model-repair-fixtures";
import {createQuantitativeConstraintFeedback,type QuantitativeConstraintAssessment} from "../../src/lib/codelab/research/quantitativeConstraintFeedback";
import type {QuantitativeTask} from "./nyx-quantitative-transfer-fixtures";

const fresh=process.env.NYX_QUANTITATIVE_FRESH==="1";
const slotTransfer=process.env.NYX_QUANTITATIVE_SLOT_TRANSFER==="1";
const equationTransfer=process.env.NYX_QUANTITATIVE_EQUATION_TRANSFER==="1";
const composedTransfer=process.env.NYX_QUANTITATIVE_COMPOSED_TRANSFER==="1";
const commandTransfer=process.env.NYX_QUANTITATIVE_COMMAND_TRANSFER==="1";
const modelRepairReplication=process.env.NYX_QUANTITATIVE_MODEL_REPAIR_REPLICATION==="1";
const modelRepair=modelRepairReplication||process.env.NYX_QUANTITATIVE_MODEL_REPAIR==="1";
const providerDiagnostic=!modelRepair&&process.env.NYX_QUANTITATIVE_PROVIDER_DIAGNOSTIC==="1";
const repairContext=!modelRepair&&!providerDiagnostic&&process.env.NYX_QUANTITATIVE_REPAIR_CONTEXT==="1";
const protocolRepair=repairContext||process.env.NYX_QUANTITATIVE_PROTOCOL_REPAIR==="1";
const coupledFeedback=modelRepair||!providerDiagnostic&&(protocolRepair||process.env.NYX_QUANTITATIVE_COUPLED_FEEDBACK==="1");
const constraintFeedback=providerDiagnostic||coupledFeedback||process.env.NYX_QUANTITATIVE_CONSTRAINT_FEEDBACK==="1";
const EPOCH=modelRepairReplication?MODEL_REPAIR_REPLICATION_EPOCH:modelRepair?MODEL_REPAIR_EPOCH:providerDiagnostic?PROVIDER_DIAGNOSTIC_EPOCH:repairContext?REPAIR_CONTEXT_EPOCH:protocolRepair?PROTOCOL_REPAIR_EPOCH:coupledFeedback?COUPLED_TRANSFER_EPOCH:constraintFeedback?CONSTRAINT_TRANSFER_EPOCH:commandTransfer?COMMAND_TRANSFER_EPOCH:composedTransfer?COMPOSED_TRANSFER_EPOCH:equationTransfer?EQUATION_TRANSFER_EPOCH:slotTransfer?SLOT_TRANSFER_EPOCH:fresh?FRESH_QUANTITATIVE_EPOCH:QUANTITATIVE_EPOCH;
const TASKS=modelRepairReplication?MODEL_REPAIR_REPLICATION_TASKS:modelRepair?MODEL_REPAIR_TASKS:providerDiagnostic?PROVIDER_DIAGNOSTIC_TASKS:repairContext?REPAIR_CONTEXT_TASKS:protocolRepair?PROTOCOL_REPAIR_TASKS:coupledFeedback?COUPLED_TRANSFER_TASKS:constraintFeedback?CONSTRAINT_TRANSFER_TASKS:commandTransfer?COMMAND_TRANSFER_TASKS:composedTransfer?COMPOSED_TRANSFER_TASKS:equationTransfer?EQUATION_TRANSFER_TASKS:slotTransfer?SLOT_TRANSFER_TASKS:fresh?FRESH_QUANTITATIVE_TASKS:QUANTITATIVE_TASKS;
const CORPUS_DIGEST=modelRepairReplication?MODEL_REPAIR_REPLICATION_CORPUS_DIGEST:modelRepair?MODEL_REPAIR_CORPUS_DIGEST:providerDiagnostic?PROVIDER_DIAGNOSTIC_CORPUS_DIGEST:repairContext?REPAIR_CONTEXT_CORPUS_DIGEST:protocolRepair?PROTOCOL_REPAIR_CORPUS_DIGEST:coupledFeedback?COUPLED_TRANSFER_CORPUS_DIGEST:constraintFeedback?CONSTRAINT_TRANSFER_CORPUS_DIGEST:commandTransfer?COMMAND_TRANSFER_CORPUS_DIGEST:composedTransfer?COMPOSED_TRANSFER_CORPUS_DIGEST:equationTransfer?EQUATION_TRANSFER_CORPUS_DIGEST:slotTransfer?SLOT_TRANSFER_CORPUS_DIGEST:fresh?FRESH_QUANTITATIVE_CORPUS_DIGEST:QUANTITATIVE_CORPUS_DIGEST;
const originalVerify=commandTransfer?verifyCommandTransferSubmission:composedTransfer?verifyComposedTransferSubmission:equationTransfer?verifyEquationTransferSubmission:slotTransfer?verifySlotTransferSubmission:fresh?verifyFreshQuantitativeSubmission:verifyQuantitativeSubmission;
const verify=(task:QuantitativeTask,certificate:unknown)=>modelRepairReplication?verifyModelRepairReplicationSubmission(task as ConstraintTransferTask,certificate):modelRepair?verifyModelRepairSubmission(task as ConstraintTransferTask,certificate):providerDiagnostic?verifyProviderDiagnosticSubmission(task as ConstraintTransferTask,certificate):repairContext?verifyRepairContextSubmission(task as ConstraintTransferTask,certificate):protocolRepair?verifyProtocolRepairSubmission(task as ConstraintTransferTask,certificate):coupledFeedback?verifyCoupledTransferSubmission(task as ConstraintTransferTask,certificate)
  :constraintFeedback?verifyConstraintTransferSubmission(task as ConstraintTransferTask,certificate):originalVerify(task,certificate);

if(process.env.OMEGA_ALLOW_NVIDIA_NETWORK!=="1"||!process.env.NVIDIA_API_KEY?.trim()) {
  console.error("NYX_QUANTITATIVE_TRANSFER: BLOCKED_AUTHORITY_OR_MISSING_INJECTED_SECRET");process.exit(2);
}
const git=(...args:string[])=>execFileSync("git",args,{encoding:"utf8"}).trim();
const candidate=process.env.GITHUB_SHA?.trim()||git("rev-parse","HEAD");
if(!/^[a-f0-9]{40}$/.test(candidate)||candidate!==git("rev-parse","HEAD")||git("status","--porcelain"))throw Error("clean_candidate_checkout_required");
const sourceBefore=theoryDigest({index:git("ls-files","-s"),status:git("status","--porcelain")});
const model=process.env.NVIDIA_NIM_MODEL?.trim()||"nvidia/nemotron-3-ultra-550b-a55b";
const provider=NvidiaNimProvider.create({providerId:"NYX-QUANTITATIVE-TRANSFER",model,authorityMode:"EXPLICIT_LIVE_NVIDIA_NIM",
  credentialSource:nvidiaNimCredentialFromEnvironment(process.env),maxPromptBytes:32000,
  maxOutputTokens:EPOCH.maxOutputTokensPerCall,timeoutMs:120000});
const began=Date.now();const expires=began+EPOCH.maxWallClockMs;
type ComparisonArm=QuantitativeArm|ProviderDiagnosticMode|"GENERIC_FEEDBACK"|"CONSTRAINT_FEEDBACK"|"PUBLIC_FEEDBACK_NO_CONTEXT"|"PUBLIC_FEEDBACK_WITH_CONTEXT"|"PUBLIC_FEEDBACK_DIRECT_IR"|"PUBLIC_FEEDBACK_MODEL_REPAIR";
const ARMS:readonly ComparisonArm[]=modelRepair?["PUBLIC_FEEDBACK_DIRECT_IR","PUBLIC_FEEDBACK_MODEL_REPAIR"]:providerDiagnostic?PROVIDER_DIAGNOSTIC_MODES:repairContext?["PUBLIC_FEEDBACK_NO_CONTEXT","PUBLIC_FEEDBACK_WITH_CONTEXT"]:
  constraintFeedback?["GENERIC_FEEDBACK","CONSTRAINT_FEEDBACK"]:["CURRENT_DIRECT","REASONING_MEDIUM","REASONING_WITH_WORKBENCH"];
const results:(QuantitativeRun&{comparisonArm:ComparisonArm;constraintAssessments:readonly QuantitativeConstraintAssessment[];
  verificationElapsedMs:number;sharedProposal:SharedProposalReceipt|null;allocatedElapsedMs:number;
  physicalInference:{calls:number;reportedTokens:number;unknownUsageCalls:number;httpAttempts:number}})[]=[];
// Rotate order across tasks; no parallel dispatch or selective task omission after failures.
for(let index=0;index<TASKS.length;index++) {
 const shared=coupledFeedback?createSharedFirstProposal(request=>provider.complete(request)):null;
 for(let offset=0;offset<ARMS.length;offset++) {
  const task=TASKS[index];const arm=ARMS[(offset+index)%ARMS.length];
  if(Date.now()>=expires) break;
  const constraintAssessments:QuantitativeConstraintAssessment[]=[];let verificationElapsedMs=0;
  const diagnostic=constraintFeedback?createQuantitativeConstraintFeedback(theoryDigest(task),task.outputLabels,(task as ConstraintTransferTask).publicConditions):null;
  const evaluator=diagnostic?diagnostic.decorate(certificate=>verify(task,certificate),modelRepair||providerDiagnostic||repairContext||arm==="CONSTRAINT_FEEDBACK",assessment=>constraintAssessments.push(assessment))
    :(certificate:unknown)=>verify(task,certificate);
  const branch=shared?.branch();const sharedPrefixElapsedMs=offset>0?shared?.prefixElapsedMs()??0:0;
  const remainingTaskMs=EPOCH.maxTaskMs-sharedPrefixElapsedMs;
  let physicalCalls=0,physicalTokens=0,unknownUsageCalls=0,httpAttempts=0;
  const result:QuantitativeRun=remainingTaskMs<=0?{arm:"REASONING_WITH_WORKBENCH",taskId:task.taskId,accepted:false,
    outcome:"SHARED_PREFIX_TASK_BUDGET_EXHAUSTED",attempts:[],elapsedMs:0,calls:0,toolRequests:0,toolWorkUnits:0,
    toolElapsedMs:0,acceptedCertificate:null,authorityIncrease:false}:await runNyxQuantitativeTask({arm:constraintFeedback?"REASONING_WITH_WORKBENCH":arm as QuantitativeArm,...task,
    retainAdmittedDerivation:repairContext&&arm==="PUBLIC_FEEDBACK_WITH_CONTEXT",
    reformulateAfterRejection:modelRepair&&arm==="PUBLIC_FEEDBACK_MODEL_REPAIR",
    limits:{maxCalls:EPOCH.maxCallsPerTask,maxOutputTokens:EPOCH.maxOutputTokensPerCall,maxTaskMs:remainingTaskMs,
      expiresAtEpochMs:expires,maxToolRequests:EPOCH.maxToolRequests,maxToolWorkUnits:EPOCH.maxToolWorkUnits,maxToolElapsedMs:EPOCH.maxToolElapsedMs},
    complete:branch?request=>branch.complete(request):async request=>{const response=await provider.complete(providerDiagnostic?providerDiagnosticRequest(request,arm as ProviderDiagnosticMode):request);physicalCalls++;
      physicalTokens+=response.evidence.usage.totalTokens??0;unknownUsageCalls+=Number(response.evidence.usage.totalTokens===null);
      httpAttempts+=response.evidence.delivery?.httpAttempts??Number(response.evidence.networkAttempted);return response;},verify:certificate=>{const started=performance.now();
      try{return evaluator(certificate);}finally{verificationElapsedMs+=performance.now()-started;}}});
  const accounting=branch?.accounting();
  results.push({...result,comparisonArm:arm,constraintAssessments,verificationElapsedMs,sharedProposal:accounting?.receipt??null,
    allocatedElapsedMs:result.elapsedMs+sharedPrefixElapsedMs,physicalInference:accounting?{
      calls:accounting.physicalCalls,reportedTokens:accounting.physicalTokens,unknownUsageCalls:accounting.unknownUsageCalls,httpAttempts:accounting.httpAttempts}
      :{calls:physicalCalls,reportedTokens:physicalTokens,unknownUsageCalls,httpAttempts}});
  console.log(`NYX_QUANTITATIVE_TASK ${JSON.stringify({taskId:task.taskId,arm,outcome:result.outcome,calls:result.calls,
    reportedTokens:result.attempts.reduce((n,a)=>n+(a.modelEvidence.usage.totalTokens??0),0),toolWorkUnits:result.toolWorkUnits,elapsedMs:result.elapsedMs})}`);
}
}
const summaries=ARMS.map(arm=>{
  const selected=results.filter(r=>r.comparisonArm===arm);const attempts=selected.flatMap(r=>r.attempts);
  const submitted=attempts.filter(a=>a.confidence!==null);
  return {arm,executed:selected.length,accepted:selected.filter(r=>r.accepted).length,
    firstCallAccepted:selected.filter(r=>r.attempts[0]?.outcome==="ACCEPTED").length,
    firstSubmissionAccepted:selected.filter(r=>r.attempts.find(a=>a.confidence!==null)?.outcome==="ACCEPTED").length,
    calls:attempts.length,reportedTokens:attempts.reduce((n,a)=>n+(a.modelEvidence.usage.totalTokens??0),0),
    unknownUsageCalls:attempts.filter(a=>a.modelEvidence.usage.totalTokens===null).length,
    providerFailures:attempts.filter(a=>a.outcome==="PROVIDER_FAILURE").length,
    recoveredProviderDisruptions:attempts.reduce((n,a)=>n+(a.modelEvidence.delivery?.rateLimitedResponses??0)
      +(a.modelEvidence.delivery?.transientUnavailableResponses??0)+(a.modelEvidence.delivery?.timedOutAttempts??0),0),
    truncations:attempts.filter(a=>a.outcome==="TRUNCATION").length,
    jsonSyntaxRejections:attempts.filter(a=>a.outcome==="JSON_SYNTAX_REJECTION").length,
    observedReasoningFieldCalls:attempts.filter(a=>typeof a.modelEvidence.reasoningOutputBytes==="number").length,
    publicModelFormulationCalls:attempts.filter(a=>a.cognitiveStage==="MODEL_FORMULATION").length,
    admittedPublicModelProposals:attempts.filter(a=>a.outcome==="MODEL_FORMULATION_READY_NOT_EXECUTED").length,
    observedReasoningBytes:attempts.reduce((n,a)=>n+(a.modelEvidence.reasoningOutputBytes??0),0),
    protocolOrAuthorizationFailures:attempts.filter(a=>/REJECTION/.test(a.outcome)&&!["FUNCTIONAL_REJECTION","CERTIFICATE_SCHEMA_REJECTION"].includes(a.outcome)).length,
    certificateSchemaRejections:attempts.filter(a=>a.outcome==="CERTIFICATE_SCHEMA_REJECTION").length,
    functionalRejections:attempts.filter(a=>a.outcome==="FUNCTIONAL_REJECTION").length,
    verifierTriggeredRevisions:selected.reduce((n,r)=>n+r.attempts.filter((a,i)=>i>0&&["FUNCTIONAL_REJECTION","CERTIFICATE_SCHEMA_REJECTION"].includes(r.attempts[i-1].outcome)).length,0),
    repairDepth:selected.map(r=>({taskId:r.taskId,rejectedSubmissions:r.attempts.filter(a=>["FUNCTIONAL_REJECTION","CERTIFICATE_SCHEMA_REJECTION"].includes(a.outcome)).length})),
    toolRequests:selected.reduce((n,r)=>n+r.toolRequests,0),toolWorkUnits:selected.reduce((n,r)=>n+r.toolWorkUnits,0),
    toolElapsedMs:selected.reduce((n,r)=>n+r.toolElapsedMs,0),elapsedMs:selected.reduce((n,r)=>n+r.elapsedMs,0),
    allocatedElapsedMs:selected.reduce((n,r)=>n+r.allocatedElapsedMs,0),
    physicalInference:selected.reduce((total,r)=>({calls:total.calls+r.physicalInference.calls,
      reportedTokens:total.reportedTokens+r.physicalInference.reportedTokens,
      unknownUsageCalls:total.unknownUsageCalls+r.physicalInference.unknownUsageCalls,httpAttempts:total.httpAttempts+r.physicalInference.httpAttempts}),
      {calls:0,reportedTokens:0,unknownUsageCalls:0,httpAttempts:0}),
    constraintWorkUnits:selected.reduce((n,r)=>n+r.constraintAssessments.reduce((m,a)=>m+a.workUnits,0),0),
    constraintViolations:selected.reduce((n,r)=>n+r.constraintAssessments.filter(a=>a.status==="VIOLATED").length,0),
    verificationElapsedMs:selected.reduce((n,r)=>n+r.verificationElapsedMs,0),
    submittedCandidateBrierScore:submitted.length?submitted.reduce((n,a)=>n+(a.confidence!-Number(a.outcome==="ACCEPTED"))**2,0)/submitted.length:null};
});
const reasoning=summaries[constraintFeedback?0:1];const workbench=summaries[constraintFeedback?1:2];
const complete=results.length===TASKS.length*ARMS.length;
const stable=summaries.every(s=>s.providerFailures===0&&s.recoveredProviderDisruptions===0&&s.unknownUsageCalls===0);
const nativeAdvantage=complete&&stable&&(workbench.accepted>reasoning.accepted&&workbench.reportedTokens<=reasoning.reportedTokens
  ||constraintFeedback&&workbench.accepted>0&&workbench.accepted===reasoning.accepted&&workbench.reportedTokens<reasoning.reportedTokens&&workbench.calls<=reasoning.calls);
const feedbackAssessment=constraintFeedback&&!providerDiagnostic?assessConstraintFeedbackComparison(results,TASKS.map(t=>t.taskId),stable,
  modelRepair?"PUBLIC_MODEL_REPAIR":repairContext?"ADMITTED_DERIVATION_CONTEXT":"PUBLIC_CONSTRAINT_FEEDBACK"):null;
const sourceAfter=theoryDigest({index:git("ls-files","-s"),status:git("status","--porcelain")});
if(sourceAfter!==sourceBefore) throw Error("source_repository_changed_during_evaluation");
const sources=["src/lib/codelab/research/analysisArtifactReference.ts","src/lib/codelab/research/boundedReasoningWorkbench.ts","src/lib/codelab/research/exactQuantitativeDerivation.ts",
  "src/lib/codelab/research/quantitativeConstraintFeedback.ts","scripts/omega/nyx-quantitative-constraint-transfer-fixtures.ts",
  "scripts/omega/nyx-quantitative-coupled-transfer-fixtures.ts",
  "scripts/omega/nyx-quantitative-protocol-repair-fixtures.ts",
  "scripts/omega/nyx-quantitative-repair-context-fixtures.ts",
  "scripts/omega/nyx-quantitative-provider-diagnostic-fixtures.ts",
  "scripts/omega/nyx-quantitative-model-repair-fixtures.ts",
  "src/lib/codelab/research/quantitativeEquationCompiler.ts",
  "src/lib/codelab/research/nyxQuantitativeReasoning.ts","src/lib/codelab/model/nvidiaNimProvider.ts",
  "src/lib/codelab/model/nvidiaCapacity.ts","src/lib/codelab/research/theoryContracts.ts",
  "scripts/omega/nyx-quantitative-transfer-fixtures.ts","scripts/omega/nyx-quantitative-fresh-fixtures.ts","scripts/omega/nyx-quantitative-slot-transfer-fixtures.ts",
  "scripts/omega/nyx-quantitative-equation-transfer-fixtures.ts","scripts/omega/nyx-quantitative-composed-transfer-fixtures.ts",
  "scripts/omega/nyx-quantitative-command-transfer-fixtures.ts","scripts/omega/nyx-quantitative-transfer-live-eval.ts"];
const report={schemaVersion:1,chunkId:EPOCH.chunkId,candidate,model,epoch:EPOCH,corpusDigest:CORPUS_DIGEST,
  sourceDigests:Object.fromEntries(sources.map(path=>[path,theoryDigest(readFileSync(path,"utf8"))])),
  executionIdentity:process.env.GITHUB_RUN_ID??"LOCAL_AUTHORIZED_RUN",environment:{platform:process.platform,node:process.version},
  startedAtEpochMs:began,finishedAtEpochMs:Date.now(),complete,providerStable:stable,summaries,results,
  verdict:providerDiagnostic?(!complete||!stable?"INCONCLUSIVE_PROVIDER_OR_BUDGET":"CONFIGURATION_DIAGNOSTIC_COMPLETE_REPLICATION_REQUIRED"):feedbackAssessment?.verdict??(!complete||!stable?"INCONCLUSIVE_PROVIDER_OR_BUDGET":nativeAdvantage?
    "NARROW_EXACT_DERIVATION_ADVANTAGE_REPLICATION_REQUIRED":"NO_COMPUTE_DEFENSIBLE_ACCEPTANCE_ADVANTAGE"),feedbackAssessment,
  pairs:TASKS.map(task=>({taskId:task.taskId,outcomes:ARMS.map(arm=>({arm,
    result:results.find(r=>r.taskId===task.taskId&&r.comparisonArm===arm)?.outcome??"NOT_EXECUTED"}))})),
  identicalModel:true,identicalTaskSet:true,identicalOracle:true,matchedCallAndOutputTokenCeilings:true,
  matchedRealizedCompute:false,nativeWorkMustBeAccountedSeparately:true,
  sharedFirstProposal:coupledFeedback,physicalInferenceTotals:summaries.reduce((n,s)=>({calls:n.calls+s.physicalInference.calls,
    reportedTokens:n.reportedTokens+s.physicalInference.reportedTokens,httpAttempts:n.httpAttempts+s.physicalInference.httpAttempts}),
    {calls:0,reportedTokens:0,httpAttempts:0}),
  computeAccounting:coupledFeedback?"SHARED_PREFIX_ALLOCATED_TO_EACH_ARM_PHYSICAL_INFERENCE_COUNTED_ONCE_EACH_ARM_RUNS_OMEGA_INDEPENDENTLY":null,
  toolAblation:constraintFeedback?"NONE_BOTH_ARMS_HAVE_IDENTICAL_EXACT_IR":"MEDIUM_REASONING_WITH_VS_WITHOUT_EXACT_IR",
  feedbackAblation:modelRepair?"NONE_IDENTICAL_PUBLIC_CONSTRAINT_FEEDBACK_BOTH_ARMS":providerDiagnostic?"NONE_IDENTICAL_PUBLIC_REQUIREMENTS_AND_ORACLE_ALL_CONFIGURATIONS":repairContext?"NONE_IDENTICAL_PUBLIC_CONSTRAINT_FEEDBACK_BOTH_ARMS":constraintFeedback?"IDENTICAL_PUBLIC_REQUIREMENTS_AND_ORACLE_DIFFERENT_COUNTEREXAMPLE_DELIVERY_ONLY":null,
  contextAblation:repairContext?"SAME_FIRST_PROPOSAL_AND_FEEDBACK_WITH_VS_WITHOUT_LAST_ADMITTED_EQUATIONS_AND_VERDICT":null,
  modelRepairAblation:modelRepair?"SAME_FIRST_PROPOSAL_DIRECT_IR_REPAIR_VS_PUBLIC_MODEL_THEN_IR_WITHIN_SAME_FOUR_CALL_LIMIT":null,
  reasoningConfigurationAblation:providerDiagnostic?"FOUR_CONFIGURATIONS_MEDIUM_REASONING_TEMPLATE_VS_NATIVE_GUIDED_VS_STRICT_LOCAL":constraintFeedback?"NONE_BOTH_ARMS_MEDIUM":"CURRENT_DIRECT_VS_MEDIUM_REASONING",frozenBeforeLive:true,
  independentEvidenceClass:"E3_INDEPENDENT_DOMAIN_ALGORITHMS_NOT_EXTERNAL_INSTITUTION",liveEvidenceClass:"E4",
  calibrationScope:"DESCRIPTIVE_DEPENDENT_SUBMISSIONS_FOUR_TASKS_NOT_GENERAL_CALIBRATION",
  falseAcceptanceEvidence:"NEGATIVE_ORACLE_CONTROLS_LOCAL_ONLY_NOT_EXTERNALLY_MEASURED",
  sourceBefore,sourceAfter,sourceRepositoryUnchanged:true,
  populationScope:providerDiagnostic?"FOUR_FRESH_PARAMETERS_EXISTING_FAMILIES_CONFIGURATION_DIAGNOSTIC_NOT_OFFICIAL_OR_EXTERNAL_HOLDOUT":coupledFeedback?"FRESH_PARAMETERS_EXISTING_FOUR_DOMAIN_FAMILIES_COMMON_LIVE_PROPOSAL_NOT_OFFICIAL_OR_EXTERNAL_HOLDOUT":constraintFeedback?"FRESH_MODEL_UNSEEN_SENSOR_SAMPLING_ENERGY_LEDGER_OBJECTIVES_NOT_OFFICIAL_OR_PRIVATE_INSTITUTIONAL_HOLDOUT":fresh?"FRESH_MODEL_UNSEEN_PARAMETERS_EXISTING_FAMILIES_AFTER_PROTOCOL_REPAIR_NOT_PRIVATE_INSTITUTIONAL_HOLDOUT"
    :"FRESH_MODEL_UNSEEN_PUBLIC_DEVELOPER_AUTHORED_FINITE_TASKS_NOT_PRIVATE_INSTITUTIONAL_HOLDOUT",
  security:{credentialPersisted:false,rawReasoningPersisted:false,generalNetworkAuthority:false,
    shellAuthority:false,repositoryMutation:false,productionAuthority:false},broadPromotion:false};
await writeFile(join(process.env.RUNNER_TEMP??tmpdir(),`nyx-quantitative-transfer-${candidate.slice(0,12)}.json`),`${JSON.stringify(report,null,2)}\n`,{encoding:"utf8",mode:0o600});
console.log(`NYX_QUANTITATIVE_TRANSFER_REPORT ${JSON.stringify(report)}`);
console.log(`NYX_QUANTITATIVE_TRANSFER_SUMMARY verdict=${report.verdict}`);

import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {pathToFileURL} from "node:url";
import {NvidiaNimProvider,nvidiaNimCredentialFromEnvironment,type NvidiaNimCompletionRequest,type NvidiaNimCompletionResult} from "../../src/lib/codelab/model/nvidiaNimProvider";
import {runNyxQuantitativeTask} from "../../src/lib/codelab/research/nyxQuantitativeReasoning";
import {theoryDigest} from "../../src/lib/codelab/research/theoryContracts";
import {procedureInferenceRequest,publicRun,sumUsage} from "./nyx-procedure-reuse-live-eval";
import {NATIVE_GENERATION_CASES,NATIVE_GENERATION_EPOCH,NATIVE_GENERATION_CORPUS_DIGEST,
  EXPRESSION_TRANSFER_CASES,EXPRESSION_TRANSFER_EPOCH,EXPRESSION_TRANSFER_CORPUS_DIGEST,
  REPAIR_CONTEXT_CASES,REPAIR_CONTEXT_EPOCH,REPAIR_CONTEXT_CORPUS_DIGEST,
  DIRECT_NATIVE_CASES,DIRECT_NATIVE_EPOCH,DIRECT_NATIVE_CORPUS_DIGEST,
  DIRECT_REFORMULATION_CASES,DIRECT_REFORMULATION_EPOCH,DIRECT_REFORMULATION_CORPUS_DIGEST,
  QUANTITATIVE_DIAGNOSIS_CASES,QUANTITATIVE_DIAGNOSIS_EPOCH,QUANTITATIVE_DIAGNOSIS_CORPUS_DIGEST,
  FORMULATION_BOUNDS_CASES,FORMULATION_BOUNDS_EPOCH,FORMULATION_BOUNDS_CORPUS_DIGEST,
  ALGEBRAIC_TRANSFER_CASES,ALGEBRAIC_TRANSFER_EPOCH,ALGEBRAIC_TRANSFER_CORPUS_DIGEST,
  ALGEBRAIC_EMISSION_CASES,ALGEBRAIC_EMISSION_EPOCH,ALGEBRAIC_EMISSION_CORPUS_DIGEST,
  diagnoseProcedureCertificate,type ProcedureCertificateDiagnosis,verifyProcedureOutputs} from "./nyx-procedure-reuse-fixtures";
import {createSharedFirstProposal,assessConstraintFeedbackComparison,type FeedbackComparisonRun,type SharedProposalReceipt} from "./nyx-quantitative-coupled-transfer-fixtures";

type Arm="ORIGINAL_GENERATION"|"NATIVE_BOUNDS"|"EXPRESSION_GRAPH"|"GRAPH_WITH_OUTPUT_CONTRACT"|"GRAPH_WITH_ADMITTED_CONTEXT"|"DIRECT_REASONED"|"NATIVE_GRAPH"|"DIRECT_REPAIR"|"DIRECT_MODEL_REPAIR"|"LEGACY_FORMULATION_GUIDANCE"|"BOUNDED_FORMULATION_GUIDANCE"|"ALGEBRAIC_FORM_WITH_ADMITTED_CONTEXT"|"ALGEBRAIC_LEGACY_EMISSION"|"ALGEBRAIC_GUIDED_EMISSION";
type Experiment="GENERATION_BOUNDS"|"EXPRESSION_GRAPH"|"REPAIR_CONTEXT"|"DIRECT_NATIVE"|"DIRECT_REFORMULATION"|"FAILURE_DIAGNOSIS"|"FORMULATION_BOUNDS"|"ALGEBRAIC_FORM"|"ALGEBRAIC_EMISSION";
const STUDIES={GENERATION_BOUNDS:{tasks:NATIVE_GENERATION_CASES,epoch:NATIVE_GENERATION_EPOCH,digest:NATIVE_GENERATION_CORPUS_DIGEST,file:"native-generation"},
  EXPRESSION_GRAPH:{tasks:EXPRESSION_TRANSFER_CASES,epoch:EXPRESSION_TRANSFER_EPOCH,digest:EXPRESSION_TRANSFER_CORPUS_DIGEST,file:"expression-transfer"},
  REPAIR_CONTEXT:{tasks:REPAIR_CONTEXT_CASES,epoch:REPAIR_CONTEXT_EPOCH,digest:REPAIR_CONTEXT_CORPUS_DIGEST,file:"repair-context"},
  DIRECT_NATIVE:{tasks:DIRECT_NATIVE_CASES,epoch:DIRECT_NATIVE_EPOCH,digest:DIRECT_NATIVE_CORPUS_DIGEST,file:"direct-native"},
  DIRECT_REFORMULATION:{tasks:DIRECT_REFORMULATION_CASES,epoch:DIRECT_REFORMULATION_EPOCH,digest:DIRECT_REFORMULATION_CORPUS_DIGEST,file:"direct-model-repair"},
  FAILURE_DIAGNOSIS:{tasks:QUANTITATIVE_DIAGNOSIS_CASES,epoch:QUANTITATIVE_DIAGNOSIS_EPOCH,digest:QUANTITATIVE_DIAGNOSIS_CORPUS_DIGEST,file:"quantitative-diagnosis"},
  FORMULATION_BOUNDS:{tasks:FORMULATION_BOUNDS_CASES,epoch:FORMULATION_BOUNDS_EPOCH,digest:FORMULATION_BOUNDS_CORPUS_DIGEST,file:"formulation-bounds"},
  ALGEBRAIC_FORM:{tasks:ALGEBRAIC_TRANSFER_CASES,epoch:ALGEBRAIC_TRANSFER_EPOCH,digest:ALGEBRAIC_TRANSFER_CORPUS_DIGEST,file:"algebraic-transfer"},
  ALGEBRAIC_EMISSION:{tasks:ALGEBRAIC_EMISSION_CASES,epoch:ALGEBRAIC_EMISSION_EPOCH,digest:ALGEBRAIC_EMISSION_CORPUS_DIGEST,file:"algebraic-emission"}};
type Row={taskId:string;family:string;arm:Arm;run:ReturnType<typeof publicRun>|null;blocked:string|null;
  sharedProposal?:SharedProposalReceipt|null;sharedPrefixChargedMs?:number;allocatedElapsedMs?:number;
  physicalInference?:{calls:number;reportedTokens:number;unknownUsageCalls:number;httpAttempts:number};
  certificateValueDiagnostics?:readonly{call:number;value:ProcedureCertificateDiagnosis}[]};
/** Same cognition, typed exchange, native engine, independent oracle and evidence
 * projection as the existing procedure study. No new executor or auto-repair.
 * New values and a direct ablation isolate the generation correction itself.
 */
export async function runNativeGenerationEpoch(complete:(request:NvidiaNimCompletionRequest,stage:string)=>Promise<NvidiaNimCompletionResult>,
  binding:{candidate:string;sourceDigests:Record<string,string>},now=Date.now,checkpoint:(r:unknown)=>Promise<void>=async()=>{},
  experiment:Experiment="GENERATION_BOUNDS") {
  if(!Object.prototype.hasOwnProperty.call(STUDIES,experiment))throw Error("representation_experiment_invalid");
  const {tasks:TASKS,epoch:EPOCH,digest:corpusDigest}=STUDIES[experiment];
  const diagnosticOnly=experiment==="FAILURE_DIAGNOSIS",formulationBounds=experiment==="FORMULATION_BOUNDS";
  const observeFailures=diagnosticOnly||formulationBounds,sharedRepair=observeFailures||experiment==="DIRECT_REFORMULATION";
  const physicalCallLimit=formulationBounds?FORMULATION_BOUNDS_EPOCH.maxPhysicalLogicalCalls:
    diagnosticOnly?QUANTITATIVE_DIAGNOSIS_EPOCH.maxPhysicalLogicalCalls:DIRECT_REFORMULATION_EPOCH.maxPhysicalLogicalCalls;
  const began=now(),expires=began+EPOCH.maxEpochMs,rows:Row[]=[],repairRuns:FeedbackComparisonRun[]=[];let logicalCalls=0,physicalLogicalCalls=0;
  const freeze={...binding,configuration:EPOCH,corpusDigest,
    tasks:TASKS.map(t=>({taskId:t.taskId,family:t.family,digest:theoryDigest(t)}))};
  function report() {
    const all=rows.flatMap(r=>r.run?[r.run]:[]),totals=sumUsage(all);
    const stable=totals.providerFailures===0&&totals.localDeliveryBlocks===0&&totals.recoveredDisruptions===0&&totals.unknownUsageCalls===0&&totals.unknownUsageHttpAttempts===0;
    const summaries=EPOCH.arms.map(arm=>{const selected=rows.filter(r=>r.arm===arm),runs=selected.flatMap(r=>r.run?[r.run]:[]),attempts=runs.flatMap(r=>r.attempts);
      return {arm,selected:TASKS.length,attempted:runs.filter(r=>r.usage.calls>0).length,
        graded:runs.filter(r=>r.attempts.some(a=>["ACCEPTED","FUNCTIONAL_REJECTION","CERTIFICATE_SCHEMA_REJECTION"].includes(a.outcome))).length,
        accepted:runs.filter(r=>r.accepted).length,firstAttemptAccepted:runs.filter(r=>r.firstAttemptAccepted).length,
        mathematicallyGraded:runs.filter(r=>r.attempts.some(a=>["ACCEPTED","FUNCTIONAL_REJECTION"].includes(a.outcome))).length,
        repairedAccepted:runs.filter(r=>r.accepted&&!r.firstAttemptAccepted).length,
        unexecuted:TASKS.length-runs.filter(r=>r.usage.calls>0).length,usage:sumUsage(runs),nativeExecutions:attempts.filter(a=>a.nativeExecution!==null).length,
        constructedNativeProposals:attempts.filter(a=>a.nativeExecution?.status==="CONSTRUCTED").length,
        irRejections:attempts.filter(a=>a.outcome==="AUTHORIZATION_OR_IR_REJECTION"
          &&a.findings.some(f=>/^quantitative_(?:equations|program|expressions|algebraic)_invalid:/.test(f))).length,
        nativeAuthorizationRejections:attempts.filter(a=>a.outcome==="AUTHORIZATION_REJECTION"
          ||a.outcome==="AUTHORIZATION_OR_IR_REJECTION"&&!a.findings.some(f=>/^quantitative_(?:equations|program|expressions|algebraic)_invalid:/.test(f))).length,
        functionalRejections:attempts.filter(a=>a.outcome==="FUNCTIONAL_REJECTION").length,
        outputContractRejections:attempts.filter(a=>a.outcome==="OUTPUT_CONTRACT_REJECTION").length,
        admittedContextAttempts:attempts.filter(a=>a.repairContextProgramDigest).length,
        outcomes:Object.fromEntries([...new Set(attempts.map(a=>a.outcome))].sort().map(state=>[state,attempts.filter(a=>a.outcome===state).length])),
        ...(experiment==="ALGEBRAIC_EMISSION"?{emissionFailureCategories:Object.fromEntries(
          [...new Set(attempts.flatMap(a=>a.algebraicEmissionDiagnostic?[a.algebraicEmissionDiagnostic.category]:[]))].sort()
            .map(category=>[category,attempts.filter(a=>a.algebraicEmissionDiagnostic?.category===category).length]))}:{}),
        secondAttempts:runs.filter(r=>r.repairDepth>0).length,
        ...(experiment==="DIRECT_NATIVE"||sharedRepair?{manualGradedProposals:attempts.filter(a=>a.nativeExecution===null&&["ACCEPTED","FUNCTIONAL_REJECTION"].includes(a.outcome)).length}:{} ),
        ...(sharedRepair?{formulationCalls:attempts.filter(a=>a.cognitiveStage==="MODEL_FORMULATION").length,
          admittedFormulations:attempts.filter(a=>a.outcome==="MODEL_FORMULATION_READY_NOT_EXECUTED").length,
          allocatedElapsedMs:selected.reduce((n,r)=>n+(r.allocatedElapsedMs??0),0)}:{})};});
    const pairs=TASKS.map(t=>{const a=rows.find(r=>r.taskId===t.taskId&&r.arm===EPOCH.arms[0])?.run??null,
      b=rows.find(r=>r.taskId===t.taskId&&r.arm===EPOCH.arms[1])?.run??null;
      const known=!!a&&!!b&&a.usage.unknownUsageCalls===0&&b.usage.unknownUsageCalls===0
        &&a.usage.unknownUsageHttpAttempts===0&&b.usage.unknownUsageHttpAttempts===0;
      return {taskId:t.taskId,originalAccepted:a?.accepted??null,boundedAccepted:b?.accepted??null,
        originalCalls:a?.usage.calls??null,boundedCalls:b?.usage.calls??null,originalTokens:a?.usage.reportedTokens??null,boundedTokens:b?.usage.reportedTokens??null,
        ...(experiment==="REPAIR_CONTEXT"?{originalFirstOutcome:a?.attempts[0]?.outcome??null,boundedFirstOutcome:b?.attempts[0]?.outcome??null,
          boundedAdmittedContextUsed:b?.attempts.some(t=>!!t.repairContextProgramDigest)??false,
          addedAcceptedRepairAgainstGradedFailure:!!a&&!!b&&!a.accepted&&b.accepted&&!b.firstAttemptAccepted
            &&a.attempts[0]?.outcome==="FUNCTIONAL_REJECTION"&&b.attempts[0]?.outcome==="FUNCTIONAL_REJECTION"
            &&b.attempts.some(t=>t.outcome==="ACCEPTED"&&!!t.repairContextProgramDigest)}:{}),
        realizedComputeMatched:known&&a!.usage.calls===b!.usage.calls&&a!.usage.httpAttempts===b!.usage.httpAttempts
          &&Math.abs(a!.usage.reportedTokens-b!.usage.reportedTokens)<=EPOCH.realizedTokenMatchTolerance*Math.max(1,a!.usage.reportedTokens,b!.usage.reportedTokens),
        boundedNoMoreModelCompute:known&&b!.usage.calls<=a!.usage.calls&&b!.usage.httpAttempts<=a!.usage.httpAttempts&&b!.usage.reportedTokens<=a!.usage.reportedTokens,
        ...(sharedRepair?{repairComputeMatched:known&&a!.usage.calls===b!.usage.calls&&a!.usage.httpAttempts===b!.usage.httpAttempts
          &&Math.abs(a!.usage.reportedTokens-b!.usage.reportedTokens)<=EPOCH.realizedTokenMatchTolerance*Math.max(1,
            a!.usage.reportedTokens-(a!.attempts[0]?.modelEvidence.usage.totalTokens??0),b!.usage.reportedTokens-(b!.attempts[0]?.modelEvidence.usage.totalTokens??0)),
          originalFirstOutcome:a?.attempts[0]?.outcome??null,boundedFirstOutcome:b?.attempts[0]?.outcome??null}:{}),
        ...(experiment==="DIRECT_NATIVE"?{directHttpAttempts:a?.usage.httpAttempts??null,nativeHttpAttempts:b?.usage.httpAttempts??null,
          originalNoMoreModelCompute:known&&a!.usage.calls<=b!.usage.calls&&a!.usage.httpAttempts<=b!.usage.httpAttempts
            &&a!.usage.reportedTokens<=b!.usage.reportedTokens}:{} )};});
    const complete=rows.length===TASKS.length*2&&rows.every(r=>r.run!==null&&r.run.usage.calls>0);
    const diagnosticContrasts=experiment==="DIRECT_NATIVE"?TASKS.map(t=>{
      const direct=rows.find(r=>r.taskId===t.taskId&&r.arm==="DIRECT_REASONED")?.run??null,
        native=rows.find(r=>r.taskId===t.taskId&&r.arm==="NATIVE_GRAPH")?.run??null;
      const grade=(r:typeof direct)=>!!r?.attempts.some(a=>["ACCEPTED","FUNCTIONAL_REJECTION"].includes(a.outcome));
      return {taskId:t.taskId,directFirst:direct?.attempts[0]?.outcome??"UNEXECUTED",nativeFirst:native?.attempts[0]?.outcome??"UNEXECUTED",
        directFinal:direct?.outcome??"UNEXECUTED",nativeFinal:native?.outcome??"UNEXECUTED",
        directMathematicallyGraded:grade(direct),nativeMathematicallyGraded:grade(native),
        contrast:direct?.accepted&&native?.accepted?"BOTH_ACCEPTED":direct?.accepted?"DIRECT_ONLY_ACCEPTED":
          native?.accepted?"NATIVE_ONLY_ACCEPTED":grade(direct)&&grade(native)?"BOTH_REJECTED_MATHEMATICS":
          "NEITHER_ACCEPTED_WITH_UNGRADED_BOUNDARY"}; }):null;
    const observedAssessment=sharedRepair&&!formulationBounds?assessConstraintFeedbackComparison(repairRuns,TASKS.map(t=>t.taskId),stable,"PUBLIC_MODEL_REPAIR"):null;
    const repairAssessment=diagnosticOnly&&observedAssessment?{...observedAssessment,
      diagnosticOnly:true,observedComparisonVerdict:observedAssessment.verdict,
      verdict:"DIAGNOSTIC_ONLY_NOT_A_PROMOTION_EPOCH",causalPromotionEligible:false}:observedAssessment;
    return {schemaVersion:1,candidate:binding.candidate,freeze,freezeDigest:theoryDigest(freeze),rows,summaries,pairs,totals,logicalCalls,complete,providerStable:stable,
      ...(repairAssessment?{repairAssessment}:{}),
      ...(sharedRepair?{physicalLogicalCalls,physicalInferenceTotals:rows.reduce((n,r)=>({
        calls:n.calls+(r.physicalInference?.calls??0),reportedTokens:n.reportedTokens+(r.physicalInference?.reportedTokens??0),
        unknownUsageCalls:n.unknownUsageCalls+(r.physicalInference?.unknownUsageCalls??0),httpAttempts:n.httpAttempts+(r.physicalInference?.httpAttempts??0)}),
        {calls:0,reportedTokens:0,unknownUsageCalls:0,httpAttempts:0}),computeAccounting:"COMMON_PREFIX_FULLY_ALLOCATED_BOTH_ARMS_PHYSICAL_USAGE_COUNTED_ONCE"}:{}),
      elapsedMs:Math.max(0,now()-began),stopReason:now()>=expires?"GLOBAL_BUDGET":complete?"PREDECLARED_PAIRS_COMPLETE":"INCOMPLETE",
      ...(diagnosticOnly?{diagnosticOnly:true}:{}),
      ...(formulationBounds?{formulationGenerationSignal:complete&&stable&&summaries[1].admittedFormulations!>summaries[0].admittedFormulations!
        &&summaries[0].formulationCalls===summaries[1].formulationCalls&&pairs.every(p=>p.boundedNoMoreModelCompute
          &&Number(p.boundedAccepted)>=Number(p.originalAccepted)),
        formulationAssessmentScope:"STRUCTURAL_ADMISSION_ONLY_NOT_FORMULA_CORRECTNESS_OR_COGNITIVE_PROMOTION"}:{}),
      scopedFunctionalSignal:!diagnosticOnly&&complete&&stable&&summaries[1].accepted>summaries[0].accepted
        &&(experiment!=="DIRECT_REFORMULATION"||!!repairAssessment?.causalPromotionEligible)
        &&pairs.every(p=>Number(p.boundedAccepted)>=Number(p.originalAccepted)&&p.boundedNoMoreModelCompute),
      scopedRepairSignal:!diagnosticOnly&&complete&&stable&&(experiment==="REPAIR_CONTEXT"&&pairs.some(p=>p.addedAcceptedRepairAgainstGradedFailure)
        ||experiment==="DIRECT_REFORMULATION"&&!!repairAssessment?.causalPromotionEligible)
        &&pairs.every(p=>Number(p.boundedAccepted)>=Number(p.originalAccepted)&&p.boundedNoMoreModelCompute),
      emissionSignal:complete&&stable&&summaries[1].irRejections<summaries[0].irRejections&&summaries[1].accepted>=summaries[0].accepted,
      ...(diagnosticContrasts===null?{}:{diagnosticContrasts,
        directCertificateSignal:complete&&stable&&summaries[0].accepted>summaries[1].accepted&&pairs.every(p=>
          Number(p.originalAccepted)>=Number(p.boundedAccepted)&&p.originalNoMoreModelCompute)}),
      promotion:"NONE_REQUIRES_REPLICATION_FRESH_OUTCOMES_AND_REALIZED_COMPUTE_ASSESSMENT",
      safety:{defaultUltraChanged:false,authorityIncrease:false,generalShell:false,generalNetwork:false,productionAuthority:false,
        acceptanceWeakened:false,rawReasoningPersisted:false,programPersisted:false,independentOracle:true},limitations:EPOCH.limitations};
  }
  for(const [index,task] of TASKS.entries()){
   let activeArm:Arm|null=null;
   const shared=sharedRepair?createSharedFirstProposal(request=>{
     if(++physicalLogicalCalls>physicalCallLimit)throw Error("model_repair_physical_call_cap");
     return complete(request,`${task.taskId}/${activeArm}`);
   },now):null;
   for(let offset=0;offset<2;offset++) {
    const arm=EPOCH.arms[(index+offset)%2] as Arm;
    activeArm=arm;
    if(now()>=expires){rows.push({taskId:task.taskId,family:task.family,arm,run:null,blocked:"GLOBAL_BUDGET"});await checkpoint(report());continue;}
    const prefix=offset>0?shared?.prefixElapsedMs()??0:0,remainingStageMs=EPOCH.maxStageMs-prefix;
    if(remainingStageMs<=0){rows.push({taskId:task.taskId,family:task.family,arm,run:null,blocked:"SHARED_PREFIX_TASK_BUDGET_EXHAUSTED"});await checkpoint(report());continue;}
    const branch=shared?.branch();
    let stageCalls=0;const certificateValueDiagnostics:{call:number;value:ProcedureCertificateDiagnosis}[]=[];
    const result=await runNyxQuantitativeTask({...task,arm:arm==="DIRECT_REASONED"||sharedRepair?"REASONING_MEDIUM":"REASONING_WITH_WORKBENCH",nativeGenerationBounds:arm==="NATIVE_BOUNDS",
      nativeExpressionGraph:arm==="EXPRESSION_GRAPH"||experiment==="REPAIR_CONTEXT"||arm==="NATIVE_GRAPH"||experiment==="ALGEBRAIC_FORM"&&arm==="GRAPH_WITH_ADMITTED_CONTEXT",
      ...(experiment==="ALGEBRAIC_FORM"?{nativeAlgebraicForm:arm==="ALGEBRAIC_FORM_WITH_ADMITTED_CONTEXT"}:{}),
      ...(experiment==="ALGEBRAIC_EMISSION"?{nativeAlgebraicForm:true,observeAlgebraicEmission:true,
        algebraicEmissionGuide:arm==="ALGEBRAIC_GUIDED_EMISSION"}:{}),
      reformulateAfterRejection:formulationBounds||arm==="DIRECT_MODEL_REPAIR",
      ...(formulationBounds?{boundedModelFormulation:arm==="BOUNDED_FORMULATION_GUIDANCE"}:{}),
      ...(observeFailures?{observeModelFormulation:true}:{}),
      ...(experiment==="REPAIR_CONTEXT"||experiment==="DIRECT_NATIVE"||sharedRepair||experiment==="ALGEBRAIC_FORM"||experiment==="ALGEBRAIC_EMISSION"?{objectiveOutputContract:"ENFORCE" as const,
        retainAdmittedDerivation:arm==="GRAPH_WITH_ADMITTED_CONTEXT"||arm==="ALGEBRAIC_FORM_WITH_ADMITTED_CONTEXT"||experiment==="ALGEBRAIC_EMISSION"}:{}),now,
      limits:{maxCalls:EPOCH.maxCallsPerStage,maxOutputTokens:EPOCH.maxOutputTokensPerCall,maxTaskMs:remainingStageMs,expiresAtEpochMs:expires,
        maxToolRequests:EPOCH.maxToolRequestsPerStage,maxToolWorkUnits:EPOCH.maxToolWorkUnitsPerStage,maxToolElapsedMs:EPOCH.maxToolElapsedMsPerStage},
      complete:request=>{stageCalls++;if(++logicalCalls>EPOCH.maxLogicalCalls)throw Error("native_generation_logical_call_cap");
        const wire=procedureInferenceRequest(request);return branch?branch.complete(wire):complete(wire,`${task.taskId}/${arm}`);},
      verify:certificate=>{const checked=verifyProcedureOutputs(task,certificate);
        if(observeFailures)certificateValueDiagnostics.push({call:stageCalls,value:diagnoseProcedureCertificate(task,certificate)});
        return checked;}});
    const physical=branch?.accounting();
    if(shared&&!formulationBounds)repairRuns.push({...result,comparisonArm:arm==="DIRECT_MODEL_REPAIR"?"PUBLIC_FEEDBACK_MODEL_REPAIR":"PUBLIC_FEEDBACK_DIRECT_IR",sharedProposal:physical?.receipt??null});
    rows.push({taskId:task.taskId,family:task.family,arm,run:publicRun(result),blocked:null,...(physical?{
      sharedProposal:physical.receipt,sharedPrefixChargedMs:prefix,allocatedElapsedMs:result.elapsedMs+prefix,
      physicalInference:{calls:physical.physicalCalls,reportedTokens:physical.physicalTokens,unknownUsageCalls:physical.unknownUsageCalls,httpAttempts:physical.httpAttempts}}:{}),
      ...(observeFailures?{certificateValueDiagnostics}:{} )});await checkpoint(report());
    console.log(`NYX_NATIVE_GENERATION_STAGE ${JSON.stringify({taskId:task.taskId,arm,outcome:result.outcome,accepted:result.accepted,calls:result.calls})}`);
  }
  }
  return report();
}
async function main() {
  const experiment=process.env.NYX_QUANTITATIVE_EXPERIMENT??"GENERATION_BOUNDS";
  if(!Object.prototype.hasOwnProperty.call(STUDIES,experiment))throw Error("representation_experiment_invalid");
  const study=STUDIES[experiment as Experiment],EPOCH=study.epoch;
  if(process.env.OMEGA_ALLOW_NVIDIA_NETWORK!=="1"||!process.env.NVIDIA_API_KEY?.trim())throw Error("explicit_network_and_injected_secret_required");
  const git=(...a:string[])=>execFileSync("git",a,{encoding:"utf8"}).trim(),candidate=process.env.GITHUB_SHA??git("rev-parse","HEAD");
  if(!/^[a-f0-9]{40}$/.test(candidate)||candidate!==git("rev-parse","HEAD")||git("status","--porcelain"))throw Error("clean_candidate_required");
  const before=theoryDigest(git("ls-files","-s"));
  const paths=["scripts/omega/nyx-native-generation-live-eval.ts","scripts/omega/nyx-procedure-reuse-live-eval.ts","scripts/omega/nyx-procedure-reuse-fixtures.ts",
    "src/lib/codelab/research/nyxQuantitativeReasoning.ts","src/lib/codelab/research/boundedReasoningWorkbench.ts","src/lib/codelab/research/exactQuantitativeDerivation.ts",
    "src/lib/codelab/research/quantitativeEquationCompiler.ts","src/lib/codelab/research/quantitativeProcedureReuse.ts","src/lib/codelab/research/analysisArtifactReference.ts",
    "src/lib/codelab/research/theoryContracts.ts","src/lib/codelab/model/nvidiaNimProvider.ts","src/lib/codelab/model/nvidiaCapacity.ts",
    "src/lib/codelab/research/quantitativeExpressionCompiler.ts",
    "src/lib/codelab/research/quantitativeAlgebraicCompiler.ts",
    ...(experiment==="DIRECT_REFORMULATION"||experiment==="FAILURE_DIAGNOSIS"||experiment==="FORMULATION_BOUNDS"?["scripts/omega/nyx-quantitative-coupled-transfer-fixtures.ts"]:[])];
  const sourceDigests=Object.fromEntries(paths.map(path=>[path,theoryDigest(readFileSync(path,"utf8"))]));
  const provider=NvidiaNimProvider.create({providerId:"NYX-NATIVE-GENERATION-TRANSFER",model:EPOCH.model,authorityMode:"EXPLICIT_LIVE_NVIDIA_NIM",
    credentialSource:nvidiaNimCredentialFromEnvironment(process.env),maxPromptBytes:32000,maxOutputTokens:EPOCH.maxOutputTokensPerCall,timeoutMs:120000})
    .withHttpAttemptBudget(EPOCH.maxHttpAttemptsPerEpoch,"WITHIN_SHARED_BUDGET");
  const stages=new Map<string,NvidiaNimProvider>(),path=join(process.env.RUNNER_TEMP??tmpdir(),`nyx-${study.file}-${candidate}.json`);
  const persist=(r:unknown)=>writeFile(path,JSON.stringify(r,null,2)+"\n");
  const report=await runNativeGenerationEpoch((request,stage)=>{
    if(!stages.has(stage))stages.set(stage,provider.withHttpAttemptBudget(EPOCH.maxHttpAttemptsPerStage,"WITHIN_SHARED_BUDGET"));
    return stages.get(stage)!.complete(request);
  },{candidate,sourceDigests},Date.now,persist,experiment as Experiment);
  const sourceUnchanged=theoryDigest(git("ls-files","-s"))===before&&git("rev-parse","HEAD")===candidate&&!git("status","--porcelain"),final={...report,sourceUnchanged};
  await persist(final);console.log(`NYX_NATIVE_GENERATION_REPORT ${JSON.stringify(final)}`);if(!sourceUnchanged)throw Error("source_repository_changed");
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1]??"")).href)await main();

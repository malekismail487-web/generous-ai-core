import {execFileSync} from "node:child_process";
import {writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {NyxChatSession,type NyxChatTurnResult} from "../../src/lib/codelab/cli/nyxChatSession";
import {parseNyxChatAction} from "../../src/lib/codelab/cli/nyxChatProtocol";
import {ReadOnlyRepositoryExecutor} from "../../src/lib/codelab/executor/readOnlyExecutor";
import {BoundedReasoningSession} from "../../src/lib/codelab/research/boundedReasoningWorkbench";
import {theoryDigest} from "../../src/lib/codelab/research/theoryContracts";
import {NvidiaNimProvider,nvidiaNimCredentialFromEnvironment,type NvidiaNimEvidence} from "../../src/lib/codelab/model/nvidiaNimProvider";
import {liveNvidiaCapacity} from "../../src/lib/codelab/model/nvidiaCapacity";
import {createSharedFirstProposal} from "./nyx-quantitative-coupled-transfer-fixtures";
import {textConfiguredRequest,textBoundedTaskRequest,textInferenceUsage,aimeFinalInteger} from "./benchmarks/nyxTextBenchmark";
import {computationTasks,COMPUTATION_TRANSFER_POLICY as POLICY,type ComputationTask} from "./benchmarks/computationTransferTasks";

export type ComputationArm="PROPOSAL_ONLY"|"EXACT_EXECUTION";
export function computationOutcome(result:NyxChatTurnResult|null,evidence:readonly NvidiaNimEvidence[],answer:string){
  if(!result)return {state:"INFRASTRUCTURE_FAILURE",correct:null};
  if(evidence.some(e=>e.finishReason==="length"))return {state:"TRUNCATION",correct:null};
  if(evidence.some(e=>e.failureCategory!==null))return {state:"PROVIDER_FAILURE",correct:null};
  const denials=result.events.filter(e=>e.eventType==="DENIAL");
  if(denials.some(e=>["derivation_scope_unavailable","derivation_capability_unavailable","derivation_output_scope_invalid"].includes(e.outcome)))
    return {state:"AUTHORIZATION_FAILURE",correct:null};
  if(denials.some(e=>e.outcome==="derivation_resource_exhausted"))return {state:"RESOURCE_EXHAUSTION",correct:null};
  if(denials.length)return {state:"SCHEMA_OR_NATIVE_IR_FAILURE",correct:null};
  if(result.outcome==="BUDGET_EXHAUSTED")return {state:"RESOURCE_EXHAUSTION",correct:null};
  if(result.outcome!=="REPLIED")return {state:"INTEGRATION_FAILURE",correct:null};
  const choice=aimeFinalInteger(result.message);
  if(choice===null||choice<1||choice>4)return {state:"ANSWER_FORMAT_FAILURE",correct:null};
  const correct=String(choice)===answer;
  return {state:correct?"PASS":"WRONG_VALID_CHOICE",correct};
}
export function computationPairMatched(rows:readonly {allocatedTokens:number;allocatedHttpAttempts:number;unknownUsageCalls:number;
  providerFailures:number;logicalCalls:number;toolWorkUnits:number}[]){
  const stable=rows.length===2&&rows.every(r=>r.unknownUsageCalls===0&&r.providerFailures===0&&r.logicalCalls===2
    &&Number.isFinite(r.allocatedTokens)&&r.allocatedTokens>0&&Number.isFinite(r.allocatedHttpAttempts)&&r.allocatedHttpAttempts>0
    &&Number.isSafeInteger(r.toolWorkUnits)&&r.toolWorkUnits>=0);
  const matchedModelCompute=stable&&["allocatedTokens","allocatedHttpAttempts"].every(k=>{
    const values=rows.map(r=>r[k as "allocatedTokens"|"allocatedHttpAttempts"]);
    return Math.max(...values)-Math.min(...values)<=Math.max(1,...values)*POLICY.matchedModelComputeTolerance;});
  return {providerStable:stable,matchedModelCompute,totalComputeMatched:false,
    toolWorkUnits:rows.map(r=>r.toolWorkUnits),interpretation:"TOOL_COMPUTE_IS_THE_TREATMENT_NOT_FREE_OR_MATCHED"};
}
export async function runComputationTransfer(){
  if(process.env.OMEGA_ALLOW_NVIDIA_NETWORK!=="1"||!process.env.NVIDIA_API_KEY?.trim())
    throw Error("computation_transfer_requires_authorized_network_and_injected_secret");
  const git=(...args:string[])=>execFileSync("git",args,{encoding:"utf8"}).trim();
  const candidate=process.env.GITHUB_SHA||git("rev-parse","HEAD");
  if(candidate!==git("rev-parse","HEAD")||!/^[a-f0-9]{40}$/.test(candidate)||git("status","--porcelain"))throw Error("clean_candidate_required");
  const sourceBefore=git("ls-files","-s");const started=Date.now();const epochDeadline=started+12*2*POLICY.maxTaskMs+60000;
  const tasks=[...computationTasks("DEVELOPMENT"),...computationTasks("TRANSFER")];
  const provider=NvidiaNimProvider.create({providerId:"NYX-SHARED-COMPUTATION-TRANSFER",model:POLICY.model,
    authorityMode:"EXPLICIT_LIVE_NVIDIA_NIM",credentialSource:nvidiaNimCredentialFromEnvironment(process.env),
    maxPromptBytes:64000,maxOutputTokens:POLICY.maxOutputTokens,timeoutMs:120000,finalAttemptTimeoutMs:POLICY.maxTaskMs,
    finalAttemptSelection:"LAST_ATTEMPT_OR_NO_RETRY_WINDOW"});
  type Row={taskId:string;stage:string;domain:string;arm:ComputationArm;state:string;correct:boolean|null;
    logicalCalls:number;allocatedTokens:number;allocatedHttpAttempts:number;unknownUsageCalls:number;providerFailures:number;
    toolWorkUnits:number;toolElapsedMs:number;elapsedMs:number;allocatedElapsedMs:number;prefixReplayed:boolean;
    inputDigest:string;programDigest:string|null;computedModelCorrect:boolean|null;sharedIntentDigest:string|null;
    logicalUsage:ReturnType<typeof textInferenceUsage>;physicalAccounting:unknown;events:unknown;
    evidence:unknown;sourceRepositoryMutated:false;broaderAuthorityGranted:false};
  const rows:Row[]=[],blocked:{taskId:string;reason:string}[]=[],uniqueEvidence=new Map<string,NvidiaNimEvidence>();
  const publicTask=(task:ComputationTask)=>({taskId:task.taskId,stage:task.stage,domain:task.domain,
    problem:task.problem,question:task.question});
  const checkpoint=async(final=false)=>{
    const pairs=tasks.map(t=>{const pair=rows.filter(r=>r.taskId===t.taskId);return {taskId:t.taskId,stage:t.stage,domain:t.domain,
      ...computationPairMatched(pair),sharedProposalMatched:pair.length===2&&pair[0].programDigest===pair[1].programDigest
        &&pair[0].sharedIntentDigest===pair[1].sharedIntentDigest&&pair[0].sharedIntentDigest!==null&&pair[0].programDigest!==null,
      executionTreatmentDelivered:pair.some(r=>r.arm==="EXACT_EXECUTION"&&r.computedModelCorrect!==null),
      outcomes:pair.map(r=>({arm:r.arm,state:r.state,correct:r.correct}))};});
    const sourceUnchanged=sourceBefore===git("ls-files","-s")&&!git("status","--porcelain");
    const report={schemaVersion:1,identity:"NYX-COMPUTATION-TRANSFER-001",candidate,executionIdentity:process.env.GITHUB_RUN_ID?`github-actions-${process.env.GITHUB_RUN_ID}`:"LOCAL",
      environment:`${process.platform}-${process.arch}-${process.version}`,policy:POLICY,populationDigest:POLICY.corpusDigest,
      selectedTasks:tasks.map(t=>({taskId:t.taskId,stage:t.stage,domain:t.domain,inputDigest:theoryDigest(publicTask(t))})),
      selectedTaskArms:tasks.length*2,attempted:rows.length,graded:rows.filter(r=>r.correct!==null).length,
      correct:rows.filter(r=>r.correct===true).length,ungraded:rows.filter(r=>r.correct===null).length,unexecuted:tasks.length*2-rows.length,
      actualUniqueModelUsage:textInferenceUsage([...uniqueEvidence.values()],Date.now()-started),rows,pairs,blocked,
      sourceUnchanged,firstAttemptsOnly:true,semanticRepairs:0,feedbackFromGraderToCognition:false,officialBenchmark:false,
      modelDefaultChanged:false,productionAuthority:false,networkScope:"CONFIGURED_NVIDIA_ENDPOINT_ONLY",
      toolScope:"PREBOUND_FINITE_EXACT_ARITHMETIC_ONLY_NO_FILES_SHELL_OR_NETWORK",
      priorGpqaScorePreserved:true,gpqaQuestionsOrAnswersLoaded:false,rawPrivateReasoningStored:false,
      oracleIndependence:"E3_IMPLEMENTER_AUTHORED_WITH_SEPARATE_PYTHON_FRACTION_CROSSCHECK_NOT_INDEPENDENT_REPLICATION",
      inferenceEvidence:"E4_LIVE_NVIDIA_PLUS_EXPLICITLY_LABELED_SHARED_PROPOSAL_REPLAY",
      interpretation:"SHARED_DERIVATION_CAUSAL_ABLATION_NOT_REPLACEMENT_FOR_CURRENT_NYX_OR_GPQA_SCORE",
      computeAccounting:"PREFIX_EXECUTED_ONCE_ALLOCATED_HALF_TO_EACH_ARM_ACTUAL_USAGE_DEDUPLICATED_BY_EVIDENCE_ID_TOOL_COST_ADDITIONAL",
      calibration:"NOT_SUPPORTED_BY_FINAL_CHOICE_PROTOCOL",broadPromotion:false,automaticPromotion:false,
      stopReason:rows.length===tasks.length*2?"SELECTION_EXHAUSTED":blocked.at(-1)?.reason??"FROZEN_EPOCH_BUDGET",
      epochElapsedMs:Date.now()-started};
    await writeFile(join(process.env.RUNNER_TEMP||tmpdir(),`nyx-computation-${final?"report":"progress"}-${candidate}.json`),JSON.stringify(report,null,2));
    if(final)console.log(`NYX_COMPUTATION_EPOCH ${JSON.stringify(report)}`);return report;
  };
  outer:for(const [index,task] of tasks.entries()){
    // Two transfer replicates per domain: each domain has both arm orders. No domain/order confounding.
    const order:ComputationArm[]=(task.stage==="TRANSFER"?task.replicate%2===0:index%2===1)?["EXACT_EXECUTION","PROPOSAL_ONLY"]:["PROPOSAL_ONLY","EXACT_EXECUTION"];
    const pairProvider=provider.withHttpAttemptBudget(POLICY.maxHttpAttemptsPerPair,"WITHIN_SHARED_BUDGET");
    let activeDeadline=0;let prefixEvidence:NvidiaNimEvidence|null=null,programDigest:string|null=null,computedModelCorrect:boolean|null=null;
    const shared=createSharedFirstProposal(async request=>{
      const response=await pairProvider.complete(textBoundedTaskRequest(textConfiguredRequest(request,"SESSION_SUPER_PHASE_CONTRACT","DIRECT"),activeDeadline));
      uniqueEvidence.set(response.evidence.evidenceId,response.evidence);return response;});
    for(const arm of order){
      const ready=await liveNvidiaCapacity.waitUntilReady(Math.min(epochDeadline,Date.now()+180000),new AbortController().signal);
      if(ready.state!=="READY"||Date.now()>=epochDeadline){blocked.push({taskId:task.taskId,reason:"CAPACITY_OR_EPOCH_UNAVAILABLE"});break outer;}
      const prefixMs=shared.prefixElapsedMs(),began=Date.now(),remaining=POLICY.maxTaskMs-prefixMs;
      if(remaining<1000){blocked.push({taskId:task.taskId,reason:"SHARED_PREFIX_EXHAUSTED_ORIGINAL_LEASE"});break outer;}
      activeDeadline=Math.min(epochDeadline,began+remaining);
      const reader=await ReadOnlyRepositoryExecutor.create({executorId:`COMPUTE-${task.taskId}`,tokenId:`COMPUTE-TOKEN-${task.taskId}`,
        repositoryRoot:resolve("."),resourceScopes:["scripts/omega/benchmarks"],issuedAtEpochMs:began-1,expiresAtEpochMs:activeDeadline,
        constraints:{maxFileBytes:1,maxDirectoryEntries:1,allowedExtensions:[".txt"]},issuer:"NYX-COMPUTATION-TRANSFER",auditIdentity:task.taskId});
      reader.terminate(began,"NO_REPOSITORY_AUTHORITY_IN_COMPUTATION_PILOT");
      const tool=arm==="EXACT_EXECUTION"?BoundedReasoningSession.create(task.problem,{maxWorkUnits:POLICY.maxWorkUnits,
        maxElapsedMs:POLICY.maxToolMs,maxRequests:1,expiresAtEpochMs:activeDeadline}):undefined;
      const branch=shared.branch(),evidence:NvidiaNimEvidence[]=[];let toolWorkUnits=0,toolElapsedMs=0;
      let result:NyxChatTurnResult|null=null,session:NyxChatSession|null=null;
      try{
        session=NyxChatSession.create({sessionId:task.taskId,reader,candidateWriter:null,editablePaths:[],maxCandidatesPerTurn:0,
          maxModelCallsPerTurn:POLICY.maxCallsPerArm,maxTurnMs:activeDeadline-Date.now(),maxOutputTokens:POLICY.maxOutputTokens,
          actionContract:{kind:"DERIVE_THEN_REPLY",problem:task.problem,outputLabels:["quantity"]},derivationSession:tool,
          model:{complete:async request=>{
            // Observe only admitted public tool output, never hidden model reasoning or verifier answers.
            const last=request.messages.at(-1)?.content;
            if(arm==="EXACT_EXECUTION"&&last){try{const observation=JSON.parse(last);
              if(observation.omegaObservation==="CONSTRUCTED"){
                toolWorkUnits=observation.analysis.workUnits;toolElapsedMs=observation.analysis.elapsedMs;
                const quantities=observation.analysis.payload?.outputs;
                computedModelCorrect=Array.isArray(quantities)&&quantities.length===1&&quantities[0].label==="quantity"&&quantities[0].value===task.expectedQuantity;
              }
            }catch{/* Bounded task text is not a tool observation. */}}
            const response=await branch.complete(request);evidence.push(response.evidence);
            if(evidence.length===1){prefixEvidence=response.evidence;
              const parsed=response.content===null?null:parseNyxChatAction(response.content).action;
              programDigest=parsed?.kind==="DERIVE_QUANTITIES"?theoryDigest(parsed.program):null;}
            return response;
          }}});
        result=await session.turn(task.question);
      }catch{/* Sanitized infrastructure outcome only; do not persist a raw exception or response. */}
      finally{session?.dispose();tool?.revoke();reader.terminate(Date.now(),"COMPUTATION_TASK_FINISHED");}
      const usage=textInferenceUsage(evidence,Date.now()-began),prefix=prefixEvidence?textInferenceUsage([prefixEvidence],prefixMs):null;
      const {state,correct}=computationOutcome(result,evidence,task.answer);
      const row:Row={taskId:task.taskId,stage:task.stage,domain:task.domain,arm,state,correct,logicalCalls:evidence.length,
        allocatedTokens:usage.reportedTokens-(prefix?.reportedTokens??0)/2,
        allocatedHttpAttempts:usage.httpAttempts-(prefix?.httpAttempts??0)/2,unknownUsageCalls:usage.unknownUsageCalls,providerFailures:usage.providerFailures,
        elapsedMs:Date.now()-began,allocatedElapsedMs:Date.now()-began+prefixMs,
        toolWorkUnits,toolElapsedMs,prefixReplayed:branch.accounting().receipt?.replayed??false,
        inputDigest:theoryDigest(publicTask(task)),programDigest,computedModelCorrect:arm==="EXACT_EXECUTION"?computedModelCorrect:null,
        sharedIntentDigest:branch.accounting().receipt?.intentDigest??null,logicalUsage:usage,
        physicalAccounting:{...branch.accounting(),receipt:undefined},
        events:result?.events.map(e=>({sequence:e.sequence,eventType:e.eventType,outcome:e.outcome,evidenceClass:e.evidenceClass}))??[],
        evidence:evidence.map(e=>({evidenceId:e.evidenceId,requestDigest:e.requestDigest,statusCode:e.statusCode,finishReason:e.finishReason,
          failureCategory:e.failureCategory,usage:e.usage,reasoningOutputBytes:e.reasoningOutputBytes??null,
          delivery:e.delivery??null})),sourceRepositoryMutated:false,broaderAuthorityGranted:false};
      rows.push(row);console.log(`NYX_COMPUTATION_TASK ${JSON.stringify(row)}`);await checkpoint();
    }
  }
  const report=await checkpoint(true);
  if(!report.sourceUnchanged||report.unexecuted||report.ungraded)process.exitCode=1;
  return report;
}
if(process.argv[1]?.replace(/\\/g,"/").endsWith("/nyx-computation-transfer.ts"))await runComputationTransfer();

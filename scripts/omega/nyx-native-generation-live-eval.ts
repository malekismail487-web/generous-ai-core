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
  REPAIR_CONTEXT_CASES,REPAIR_CONTEXT_EPOCH,REPAIR_CONTEXT_CORPUS_DIGEST,verifyProcedureOutputs} from "./nyx-procedure-reuse-fixtures";

type Arm="ORIGINAL_GENERATION"|"NATIVE_BOUNDS"|"EXPRESSION_GRAPH"|"GRAPH_WITH_OUTPUT_CONTRACT"|"GRAPH_WITH_ADMITTED_CONTEXT";
type Experiment="GENERATION_BOUNDS"|"EXPRESSION_GRAPH"|"REPAIR_CONTEXT";
const STUDIES={GENERATION_BOUNDS:{tasks:NATIVE_GENERATION_CASES,epoch:NATIVE_GENERATION_EPOCH,digest:NATIVE_GENERATION_CORPUS_DIGEST,file:"native-generation"},
  EXPRESSION_GRAPH:{tasks:EXPRESSION_TRANSFER_CASES,epoch:EXPRESSION_TRANSFER_EPOCH,digest:EXPRESSION_TRANSFER_CORPUS_DIGEST,file:"expression-transfer"},
  REPAIR_CONTEXT:{tasks:REPAIR_CONTEXT_CASES,epoch:REPAIR_CONTEXT_EPOCH,digest:REPAIR_CONTEXT_CORPUS_DIGEST,file:"repair-context"}};
type Row={taskId:string;family:string;arm:Arm;run:ReturnType<typeof publicRun>|null;blocked:string|null};
/** Same cognition, typed exchange, native engine, independent oracle and evidence
 * projection as the existing procedure study. No new executor or auto-repair.
 * New values and a direct ablation isolate the generation correction itself.
 */
export async function runNativeGenerationEpoch(complete:(request:NvidiaNimCompletionRequest,stage:string)=>Promise<NvidiaNimCompletionResult>,
  binding:{candidate:string;sourceDigests:Record<string,string>},now=Date.now,checkpoint:(r:unknown)=>Promise<void>=async()=>{},
  experiment:Experiment="GENERATION_BOUNDS") {
  if(!Object.prototype.hasOwnProperty.call(STUDIES,experiment))throw Error("representation_experiment_invalid");
  const {tasks:TASKS,epoch:EPOCH,digest:corpusDigest}=STUDIES[experiment];
  const began=now(),expires=began+EPOCH.maxEpochMs,rows:Row[]=[];let logicalCalls=0;
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
          &&a.findings.some(f=>/^quantitative_(?:equations|program|expressions)_invalid:/.test(f))).length,
        nativeAuthorizationRejections:attempts.filter(a=>a.outcome==="AUTHORIZATION_REJECTION"
          ||a.outcome==="AUTHORIZATION_OR_IR_REJECTION"&&!a.findings.some(f=>/^quantitative_(?:equations|program|expressions)_invalid:/.test(f))).length,
        functionalRejections:attempts.filter(a=>a.outcome==="FUNCTIONAL_REJECTION").length,
        outputContractRejections:attempts.filter(a=>a.outcome==="OUTPUT_CONTRACT_REJECTION").length,
        admittedContextAttempts:attempts.filter(a=>a.repairContextProgramDigest).length,
        outcomes:Object.fromEntries([...new Set(attempts.map(a=>a.outcome))].sort().map(state=>[state,attempts.filter(a=>a.outcome===state).length])),
        secondAttempts:runs.filter(r=>r.repairDepth>0).length};});
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
        boundedNoMoreModelCompute:known&&b!.usage.calls<=a!.usage.calls&&b!.usage.httpAttempts<=a!.usage.httpAttempts&&b!.usage.reportedTokens<=a!.usage.reportedTokens};});
    const complete=rows.length===TASKS.length*2&&rows.every(r=>r.run!==null&&r.run.usage.calls>0);
    return {schemaVersion:1,candidate:binding.candidate,freeze,freezeDigest:theoryDigest(freeze),rows,summaries,pairs,totals,logicalCalls,complete,providerStable:stable,
      elapsedMs:Math.max(0,now()-began),stopReason:now()>=expires?"GLOBAL_BUDGET":complete?"PREDECLARED_PAIRS_COMPLETE":"INCOMPLETE",
      scopedFunctionalSignal:complete&&stable&&summaries[1].accepted>summaries[0].accepted
        &&pairs.every(p=>Number(p.boundedAccepted)>=Number(p.originalAccepted)&&p.boundedNoMoreModelCompute),
      scopedRepairSignal:experiment==="REPAIR_CONTEXT"&&complete&&stable
        &&pairs.some(p=>p.addedAcceptedRepairAgainstGradedFailure)
        &&pairs.every(p=>Number(p.boundedAccepted)>=Number(p.originalAccepted)&&p.boundedNoMoreModelCompute),
      emissionSignal:complete&&stable&&summaries[1].irRejections<summaries[0].irRejections&&summaries[1].accepted>=summaries[0].accepted,
      promotion:"NONE_REQUIRES_REPLICATION_FRESH_OUTCOMES_AND_REALIZED_COMPUTE_ASSESSMENT",
      safety:{defaultUltraChanged:false,authorityIncrease:false,generalShell:false,generalNetwork:false,productionAuthority:false,
        acceptanceWeakened:false,rawReasoningPersisted:false,programPersisted:false,independentOracle:true},limitations:EPOCH.limitations};
  }
  for(const [index,task] of TASKS.entries())for(let offset=0;offset<2;offset++) {
    const arm=EPOCH.arms[(index+offset)%2] as Arm;
    if(now()>=expires){rows.push({taskId:task.taskId,family:task.family,arm,run:null,blocked:"GLOBAL_BUDGET"});await checkpoint(report());continue;}
    const result=await runNyxQuantitativeTask({...task,arm:"REASONING_WITH_WORKBENCH",nativeGenerationBounds:arm==="NATIVE_BOUNDS",
      nativeExpressionGraph:arm==="EXPRESSION_GRAPH"||experiment==="REPAIR_CONTEXT",
      ...(experiment==="REPAIR_CONTEXT"?{objectiveOutputContract:"ENFORCE" as const,retainAdmittedDerivation:arm==="GRAPH_WITH_ADMITTED_CONTEXT"}:{}),now,
      limits:{maxCalls:EPOCH.maxCallsPerStage,maxOutputTokens:EPOCH.maxOutputTokensPerCall,maxTaskMs:EPOCH.maxStageMs,expiresAtEpochMs:expires,
        maxToolRequests:EPOCH.maxToolRequestsPerStage,maxToolWorkUnits:EPOCH.maxToolWorkUnitsPerStage,maxToolElapsedMs:EPOCH.maxToolElapsedMsPerStage},
      complete:request=>{if(++logicalCalls>EPOCH.maxLogicalCalls)throw Error("native_generation_logical_call_cap");return complete(procedureInferenceRequest(request),`${task.taskId}/${arm}`);},
      verify:certificate=>verifyProcedureOutputs(task,certificate)});
    rows.push({taskId:task.taskId,family:task.family,arm,run:publicRun(result),blocked:null});await checkpoint(report());
    console.log(`NYX_NATIVE_GENERATION_STAGE ${JSON.stringify({taskId:task.taskId,arm,outcome:result.outcome,accepted:result.accepted,calls:result.calls})}`);
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
    "src/lib/codelab/research/quantitativeExpressionCompiler.ts"];
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

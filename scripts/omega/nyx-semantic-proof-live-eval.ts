import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NvidiaNimProvider, nvidiaNimCredentialFromEnvironment, type NvidiaNimCompletionRequest, type NvidiaNimCompletionResult } from "../../src/lib/codelab/model/nvidiaNimProvider";
import { runNyxSemanticProofTask, type QuantitativeAcceptance } from "../../src/lib/codelab/research/nyxQuantitativeReasoning";
import type { SemanticPolynomialTask } from "../../src/lib/codelab/research/semanticPolynomialProof";
import type { QuantitativeAlgebraicForm } from "../../src/lib/codelab/research/quantitativeAlgebraicCompiler";
import { theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import { polynomialReplayInput } from "./benchmarks/semantic-polynomial-crosscheck";
import { procedureInferenceRequest, usage, sumUsage } from "./nyx-procedure-reuse-live-eval";
import { SEMANTIC_PROOF_CASES as CASES, SEMANTIC_PROOF_EPOCH as EPOCH, SEMANTIC_PROOF_CORPUS_DIGEST } from "./nyx-semantic-proof-fixtures";

type Arm = typeof EPOCH.arms[number];
type Run = Awaited<ReturnType<typeof runNyxSemanticProofTask>>;
type Complete = (request:NvidiaNimCompletionRequest,stageIdentity:string)=>Promise<NvidiaNimCompletionResult>;
export type IndependentCheck = QuantitativeAcceptance & {measurement:{state:string;projectionWorkUnits:number;
  elapsedMs:number;cpuMs:number|null;exactGridPoints:number;obligations:number;proved:number;refuted:number}};
type Verify = (task:SemanticPolynomialTask,candidate:QuantitativeAlgebraicForm,stage:string)=>IndependentCheck;

/** Fixed trusted evaluator subprocess. Model text is parsed as bounded data by
 * two frontends; it never becomes a command, Python program, eval or shell.
 * This is developer verification authority, not NYX general shell authority.
 */
export function independentPolynomialVerification(task:SemanticPolynomialTask,candidate:QuantitativeAlgebraicForm,
  python = "python", replayPath = resolve("scripts/omega/benchmarks/replay-polynomial-identities.py")):IndependentCheck {
  const start=performance.now();let projectionWorkUnits=0;
  const finish=(state:string,accepted=false,stats:{cpuMs:number;exactGridPoints:number;observations:{id:string;state:string}[]}|null=null):IndependentCheck=>{
    const measurement={state,projectionWorkUnits,elapsedMs:Math.max(0,performance.now()-start),cpuMs:stats?.cpuMs??null,
      exactGridPoints:stats?.exactGridPoints??0,obligations:stats?.observations.length??0,
      proved:stats?.observations.filter(o=>o.state==="PROVED_IDENTITY").length??0,
      refuted:stats?.observations.filter(o=>o.state==="REFUTED_IDENTITY").length??0};
    return {accepted,findings:accepted?[]:[state],verificationDigest:theoryDigest({taskDigest:theoryDigest(task),candidateDigest:theoryDigest(candidate),measurement}),measurement};
  };
  let input:ReturnType<typeof polynomialReplayInput>;
  try{input=polynomialReplayInput(task,candidate,undefined,()=>{if(++projectionWorkUnits>100000)throw Error("projection_budget");});}
  catch{return finish("INDEPENDENT_PROJECTION_INSUFFICIENT");}
  const process=spawnSync(python,["-B",replayPath,"--verify-one"],{input:JSON.stringify(input),encoding:"utf8",
    timeout:EPOCH.independentVerifierTimeoutMs,maxBuffer:262144,windowsHide:true});
  if(process.error)return finish("INDEPENDENT_INFRASTRUCTURE_FAILURE");
  if(process.status!==0)return finish("INDEPENDENT_VERIFICATION_INSUFFICIENT");
  try{
    const r:unknown=JSON.parse(process.stdout);
    if(!r||typeof r!=="object"||Array.isArray(r))throw Error("schema");
    const v=r as Record<string,unknown>,observations=v.observations;
    if(Object.keys(v).sort().join("|")!==["schemaVersion","accepted","observations","exactGridPoints","elapsedMs","cpuMs","method"].sort().join("|")
      ||v.schemaVersion!==1||typeof v.accepted!=="boolean"||v.method!=="INDEPENDENT_ORIGINAL_PARSE_DEGREE_BOUNDS_EXACT_GRID"
      ||!Array.isArray(observations)||observations.length!==task.obligations.length
      ||observations.some((o,i)=>!o||typeof o!=="object"||Object.keys(o).sort().join("|")!=="id|state"
        ||o.id!==task.obligations[i].obligationId||!["PROVED_IDENTITY","REFUTED_IDENTITY"].includes(o.state))
      ||v.accepted!==observations.every(o=>o.state==="PROVED_IDENTITY")
      ||!Number.isSafeInteger(v.exactGridPoints)||Number(v.exactGridPoints)<1||Number(v.exactGridPoints)>8748
      ||![v.elapsedMs,v.cpuMs].every(n=>typeof n==="number"&&Number.isFinite(n)&&n>=0))throw Error("schema");
    return finish(v.accepted?"INDEPENDENT_PROVED":"INDEPENDENT_REFUTED",v.accepted,{cpuMs:Number(v.cpuMs),exactGridPoints:Number(v.exactGridPoints),observations});
  }catch{return finish("INDEPENDENT_VERIFIER_SCHEMA_FAILURE");}
}

function publicSemanticRun(run:Run) {
  const costs=usage({calls:run.calls,attempts:run.attempts,elapsedMs:run.elapsedMs,toolRequests:run.nativeUsage.requests,
    toolWorkUnits:run.nativeUsage.workUnits,toolElapsedMs:run.nativeUsage.elapsedMs});
  const outcome=run.attempts.at(-1)?.outcome??"NO_ADMITTED_ATTEMPT";
  return {taskDigest:run.taskDigest,accepted:run.accepted,firstAttemptAccepted:run.firstAttemptAccepted,outcome,
    usage:costs,repairAttempts:Math.max(0,run.calls-1),attempts:run.attempts,independentFailures:run.independentFailures,
    deadlineEpochMs:run.deadlineEpochMs,confidenceCalibration:"NOT_COLLECTED_NOT_INVENTED"};
}
type Row={taskId:string;family:string;arm:Arm;run:ReturnType<typeof publicSemanticRun>|null;blocked:string|null;
  independentChecks:IndependentCheck[]};
export async function runSemanticProofEpoch(complete:Complete,verify:Verify,binding:{candidate:string;sourceDigests:Record<string,string>},
  now=Date.now,checkpoint:(report:unknown)=>Promise<void>=async()=>{}) {
  const start=now(),expires=start+EPOCH.maxEpochMs,rows:Row[]=[];let logicalCalls=0;
  const freeze={...binding,configuration:EPOCH,corpusDigest:SEMANTIC_PROOF_CORPUS_DIGEST,
    taskBindings:CASES.map(c=>({taskId:c.taskId,family:c.family,digest:theoryDigest(c.task)}))};
  function report(){
    const arms=EPOCH.arms.map(arm=>{const selected=rows.filter(r=>r.arm===arm),runs=selected.flatMap(r=>r.run?[r.run]:[]),attempts=runs.flatMap(r=>r.attempts);
      const checks=selected.flatMap(r=>r.independentChecks);
      const graded=runs.filter(r=>r.attempts.some(a=>a.independentVerificationDigest!==null)
        &&selected.find(s=>s.run===r)!.independentChecks.some(c=>["INDEPENDENT_PROVED","INDEPENDENT_REFUTED"].includes(c.measurement.state))).length;
      return {arm,selected:CASES.length,attempted:runs.filter(r=>r.usage.calls>0).length,accepted:runs.filter(r=>r.accepted).length,
        firstAttemptAccepted:runs.filter(r=>r.firstAttemptAccepted).length,repairedAccepted:runs.filter(r=>r.accepted&&!r.firstAttemptAccepted).length,
        independentlyGraded:graded,independentlyUngraded:runs.filter(r=>r.usage.calls>0).length-graded,
        nativeFalseAcceptanceDetections:checks.filter(c=>c.measurement.state==="INDEPENDENT_REFUTED").length,
        nativeMathematicallyAssessed:runs.filter(r=>r.attempts.some(a=>["SEMANTIC_REFUTATION","ACCEPTED","INDEPENDENT_VERIFICATION_REJECTION","INDEPENDENT_VERIFIER_CONFLICT"].includes(a.outcome))).length,
        unexecuted:CASES.length-runs.filter(r=>r.usage.calls>0).length,repairAttempts:runs.reduce((n,r)=>n+r.repairAttempts,0),
        usage:sumUsage(runs),reportedPromptTokens:attempts.reduce((n,a)=>n+(a.modelEvidence.usage.promptTokens??0),0),
        reportedCompletionTokens:attempts.reduce((n,a)=>n+(a.modelEvidence.usage.completionTokens??0),0),
        outcomes:Object.fromEntries([...new Set(attempts.map(a=>a.outcome))].sort().map(k=>[k,attempts.filter(a=>a.outcome===k).length])),
        independent:{requests:checks.length,projectionWorkUnits:checks.reduce((n,c)=>n+c.measurement.projectionWorkUnits,0),
          exactGridPoints:checks.reduce((n,c)=>n+c.measurement.exactGridPoints,0),elapsedMs:checks.reduce((n,c)=>n+c.measurement.elapsedMs,0),
          knownCpuMs:checks.reduce((n,c)=>n+(c.measurement.cpuMs??0),0),unknownCpuChecks:checks.filter(c=>c.measurement.cpuMs===null).length,
          states:Object.fromEntries([...new Set(checks.map(c=>c.measurement.state))].sort().map(k=>[k,checks.filter(c=>c.measurement.state===k).length]))}};
    });
    const pairs=CASES.map(c=>{const [a,b]=EPOCH.arms.map(arm=>rows.find(r=>r.taskId===c.taskId&&r.arm===arm)?.run??null);
      const known=!!a&&!!b&&[a,b].every(r=>r.usage.unknownUsageCalls===0&&r.usage.unknownUsageHttpAttempts===0);
      return {taskId:c.taskId,serialAccepted:a?.accepted??null,guidedAccepted:b?.accepted??null,
        realizedInferenceMatched:known&&a!.usage.calls===b!.usage.calls&&a!.usage.httpAttempts===b!.usage.httpAttempts
          &&Math.abs(a!.usage.reportedTokens-b!.usage.reportedTokens)<=EPOCH.realizedTokenMatchTolerance*Math.max(1,a!.usage.reportedTokens,b!.usage.reportedTokens),
        guidedNoMoreInference:known&&b!.usage.calls<=a!.usage.calls&&b!.usage.httpAttempts<=a!.usage.httpAttempts&&b!.usage.reportedTokens<=a!.usage.reportedTokens};});
    const allRuns=rows.flatMap(r=>r.run?[r.run]:[]),physicalUsage=sumUsage(allRuns);
    const complete=rows.length===CASES.length*2&&allRuns.length===CASES.length*2&&allRuns.every(r=>r.usage.calls>0);
    const stable=complete&&physicalUsage.providerFailures===0&&physicalUsage.localDeliveryBlocks===0&&physicalUsage.recoveredDisruptions===0
      &&physicalUsage.unknownUsageCalls===0&&physicalUsage.unknownUsageHttpAttempts===0
      &&rows.every(r=>r.independentChecks.every(c=>["INDEPENDENT_PROVED","INDEPENDENT_REFUTED"].includes(c.measurement.state)));
    return {schemaVersion:1,candidate:binding.candidate,freeze,freezeDigest:theoryDigest(freeze),rows,arms,pairs,complete,providerStable:stable,
      physicalLogicalCalls:logicalCalls,physicalUsage,elapsedMs:Math.max(0,now()-start),
      stopReason:now()>=expires?"GLOBAL_BUDGET":complete?"PREDECLARED_PAIRS_COMPLETE":"INCOMPLETE",
      scopedOutcomeSignal:stable&&arms[1].accepted>arms[0].accepted&&pairs.every(p=>Number(p.guidedAccepted)>=Number(p.serialAccepted)&&p.guidedNoMoreInference),
      promotion:"NONE_FOUR_CASE_PILOT_REQUIRES_FRESH_REPLICATION_AND_ABLATION",
      safety:{defaultUltraChanged:false,authorityIncrease:false,generalShell:false,generalNetwork:false,productionAuthority:false,
        rawReasoningPersisted:false,candidateProgramsPersisted:false,acceptanceWeakened:false},
      limitations:["FORMAL_POLYNOMIAL_CONSTRUCTION_NOT_GENERAL_THEOREM_PROVING_OR_ORIGINAL_DISCOVERY","NATURAL_LANGUAGE_FORMALIZATION_NOT_ESTABLISHED",
        "SERIAL_TOOL_REPAIR_IS_NOT_AN_UNTOOLED_MODEL_ONLY_CONTROL","REALIZED_COMPUTE_MAY_DIFFER_REPORT_NOT_PAD_OR_CONCEAL",
        "FOUR_CASES_UNDERPOWERED_NO_VENDOR_SUPERIORITY_OR_OFFICIAL_BENCHMARK_CLAIM","PUBLIC_PRETRAINING_EXPOSURE_UNKNOWN",
        "NATIVE_WORK_UNITS_NOT_CPU_TIME_NO_TOTAL_COMPUTE_EQUIVALENCE_CLAIM","CONFIDENCE_NOT_COLLECTED"]};
  }
  for(const [i,c] of CASES.entries())for(let offset=0;offset<2;offset++){
    const arm=EPOCH.arms[(i+offset)%2],stage=`${c.taskId}/${arm}`,checks:IndependentCheck[]=[];
    if(now()>=expires){rows.push({taskId:c.taskId,family:c.family,arm,run:null,blocked:"GLOBAL_BUDGET",independentChecks:checks});await checkpoint(report());continue;}
    const run=await runNyxSemanticProofTask({task:c.task,obligationGuidance:arm==="OBLIGATION_GUIDED_REPAIR",now,
      limits:{maxCalls:EPOCH.maxCallsPerStage,maxOutputTokens:EPOCH.maxOutputTokensPerCall,maxTaskMs:EPOCH.maxStageMs,expiresAtEpochMs:expires,
        maxToolRequests:EPOCH.maxToolRequestsPerStage,maxToolWorkUnits:EPOCH.maxToolWorkUnitsPerStage,maxToolElapsedMs:EPOCH.maxToolElapsedMsPerStage},
      complete:request=>{if(++logicalCalls>EPOCH.maxLogicalCalls)throw Error("semantic_epoch_call_cap");
        const wire=procedureInferenceRequest(request);return complete({...wire,requestId:`${stage}/${request.requestId}`},stage);},
      verify:(task,candidate)=>{const result=verify(task,candidate,stage);checks.push(result);return{accepted:result.accepted,findings:result.findings,verificationDigest:result.verificationDigest};}});
    rows.push({taskId:c.taskId,family:c.family,arm,run:publicSemanticRun(run),blocked:null,independentChecks:checks});await checkpoint(report());
  }
  return report();
}

async function main(){
  if(process.env.OMEGA_ALLOW_NVIDIA_NETWORK!=="1"||!process.env.NVIDIA_API_KEY?.trim())throw Error("explicit_network_and_injected_secret_required");
  const git=(...args:string[])=>execFileSync("git",args,{encoding:"utf8"}).trim(),candidate=process.env.GITHUB_SHA??git("rev-parse","HEAD");
  if(!/^[a-f0-9]{40}$/.test(candidate)||candidate!==git("rev-parse","HEAD")||git("status","--porcelain"))throw Error("clean_frozen_candidate_required");
  const before=theoryDigest(git("ls-files","-s"));
  const paths=["scripts/omega/nyx-semantic-proof-live-eval.ts","scripts/omega/nyx-semantic-proof-fixtures.ts",
    "scripts/omega/benchmarks/semantic-polynomial-crosscheck.ts","scripts/omega/benchmarks/replay-polynomial-identities.py",
    "scripts/omega/nyx-procedure-reuse-live-eval.ts","scripts/omega/nyx-procedure-reuse-fixtures.ts",
    "src/lib/codelab/research/nyxQuantitativeReasoning.ts","src/lib/codelab/research/semanticPolynomialProof.ts",
    "src/lib/codelab/research/reasoningObligationGraph.ts","src/lib/codelab/research/boundedReasoningWorkbench.ts",
    "src/lib/codelab/research/exactQuantitativeDerivation.ts","src/lib/codelab/research/quantitativeEquationCompiler.ts",
    "src/lib/codelab/research/quantitativeExpressionCompiler.ts","src/lib/codelab/research/quantitativeAlgebraicCompiler.ts",
    "src/lib/codelab/research/quantitativeProcedureReuse.ts","src/lib/codelab/research/analysisArtifactReference.ts",
    "src/lib/codelab/research/theoryContracts.ts","src/lib/codelab/model/nvidiaNimProvider.ts","src/lib/codelab/model/nvidiaCapacity.ts",
    ".github/workflows/omega-nyx-procedure-reuse-one-shot.yml"];
  const sourceDigests=Object.fromEntries(paths.map(p=>[p,theoryDigest(readFileSync(p,"utf8"))]));
  const provider=NvidiaNimProvider.create({providerId:"NYX-SEMANTIC-CONSTRUCTION-TRANSFER",model:EPOCH.model,
    authorityMode:"EXPLICIT_LIVE_NVIDIA_NIM",credentialSource:nvidiaNimCredentialFromEnvironment(process.env),
    maxPromptBytes:32000,maxOutputTokens:EPOCH.maxOutputTokensPerCall,timeoutMs:120000}).withHttpAttemptBudget(EPOCH.maxHttpAttemptsPerEpoch,"WITHIN_SHARED_BUDGET");
  const stages=new Map<string,NvidiaNimProvider>(),path=join(process.env.RUNNER_TEMP??tmpdir(),`nyx-semantic-proof-${candidate}.json`);
  const persist=(r:unknown)=>writeFile(path,JSON.stringify(r,null,2)+"\n");
  const report=await runSemanticProofEpoch((request,stage)=>{if(!stages.has(stage))stages.set(stage,provider.withHttpAttemptBudget(EPOCH.maxHttpAttemptsPerStage,"WITHIN_SHARED_BUDGET"));
    return stages.get(stage)!.complete(request);},(task,p)=>independentPolynomialVerification(task,p),{candidate,sourceDigests},Date.now,persist);
  const sourceUnchanged=theoryDigest(git("ls-files","-s"))===before&&git("rev-parse","HEAD")===candidate&&!git("status","--porcelain");
  const final={...report,sourceUnchanged,runtime:{node:process.version,platform:process.platform,arch:process.arch,
    python:execFileSync("python",["--version"],{encoding:"utf8"}).trim()}};
  await persist(final);console.log(`NYX_SEMANTIC_PROOF_REPORT ${JSON.stringify(final)}`);if(!sourceUnchanged)throw Error("source_repository_changed");
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1]??"")).href)await main();

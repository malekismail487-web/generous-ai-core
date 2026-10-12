import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NvidiaNimProvider, nvidiaNimCredentialFromEnvironment, type NvidiaNimCompletionRequest, type NvidiaNimCompletionResult } from "../../src/lib/codelab/model/nvidiaNimProvider";
import { runNyxQuantitativeTask, type QuantitativeRun } from "../../src/lib/codelab/research/nyxQuantitativeReasoning";
import { BoundQuantitativeProcedure } from "../../src/lib/codelab/research/quantitativeProcedureReuse";
import { theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import { PROCEDURE_FAMILIES, PROCEDURE_REUSE_EPOCH as EPOCH, PROCEDURE_CORPUS_DIGEST, verifyProcedureOutputs, type ProcedureCase } from "./nyx-procedure-reuse-fixtures";

type Arm = "CURRENT_RECOMPUTE" | "CONTEXT_ONLY" | "BOUND_INVOCATION";
type Complete = (request: NvidiaNimCompletionRequest, stageIdentity: string) => Promise<NvidiaNimCompletionResult>;
export function procedureInferenceRequest(request: NvidiaNimCompletionRequest): NvidiaNimCompletionRequest {
  // The existing quantitative task's MEDIUM field is Ultra-specific. This
  // separately labeled experiment uses the already supported Super native path;
  // identical wire controls in all arms, no default-provider change or fallback.
  const { reasoningEffort: _ultraOnly, ...rest } = request;
  return { ...rest, reasoningControl: EPOCH.reasoningControl, reasoningBudgetTokens: EPOCH.reasoningBudgetTokens };
}
export function usage(run: QuantitativeRun) {
  const attempts = run.attempts, disruptive = (a: typeof attempts[number]) =>
    (a.modelEvidence.delivery?.rateLimitedResponses ?? 0) + (a.modelEvidence.delivery?.transientUnavailableResponses ?? 0) + (a.modelEvidence.delivery?.timedOutAttempts ?? 0);
  return { calls: run.calls, reportedTokens: attempts.reduce((n, a) => n + (a.modelEvidence.usage.totalTokens ?? 0), 0),
    unknownUsageCalls: attempts.filter(a => a.modelEvidence.usage.totalTokens === null).length,
    httpAttempts: attempts.reduce((n,a) => n + (a.modelEvidence.delivery?.httpAttempts ?? Number(a.modelEvidence.networkAttempted)), 0),
    knownUsageHttpAttempts: attempts.reduce((n,a)=>n+Number(a.modelEvidence.networkAttempted&&a.modelEvidence.usage.totalTokens!==null),0),
    unknownUsageHttpAttempts: attempts.reduce((n,a)=>n+Math.max(0,(a.modelEvidence.delivery?.httpAttempts??Number(a.modelEvidence.networkAttempted))
      -Number(a.modelEvidence.networkAttempted&&a.modelEvidence.usage.totalTokens!==null)),0),
    providerFailures: attempts.filter(a => a.outcome === "PROVIDER_FAILURE" && a.modelEvidence.networkAttempted).length,
    localDeliveryBlocks: attempts.filter(a => a.outcome === "PROVIDER_FAILURE" && !a.modelEvidence.networkAttempted).length,
    recoveredDisruptions: attempts.reduce((n,a) => n + disruptive(a), 0), toolRequests: run.toolRequests,
    toolWorkUnits: run.toolWorkUnits, toolElapsedMs: run.toolElapsedMs, elapsedMs: run.elapsedMs };
}
export function publicRun(run: QuantitativeRun) {
  return { taskId: run.taskId, accepted: run.accepted, outcome: run.outcome, usage: usage(run),
    firstAttemptAccepted: run.attempts[0]?.outcome === "ACCEPTED", repairDepth: Math.max(0, run.calls - 1),
    attempts: run.attempts.map(a => ({ call: a.call, outcome: a.outcome, findings: a.findings, confidence: a.confidence,
      proposalDigest: a.proposalDigest, verificationDigest: a.resultDigest, programDigest: a.executedProgram ? theoryDigest(a.executedProgram) : null,
      procedureReference: a.procedureReference ?? null,
      ...(a.cognitiveStage==="MODEL_FORMULATION"||a.formulationArtifactDigest?{
        cognitiveStage:a.cognitiveStage,formulationArtifactDigest:a.formulationArtifactDigest??null}:{}),
      ...(a.nativeRejectionStructure?{nativeRejectionStructure:a.nativeRejectionStructure}:{}),
      ...(a.outputStructure?{outputStructure:a.outputStructure}:{}),
      ...(a.formulationStructure?{formulationStructure:a.formulationStructure}:{}),
      ...(a.repairContextDigest?{repairContextDigest:a.repairContextDigest,repairContextProgramDigest:a.repairContextProgramDigest??null}:{}),
      nativeExecution: a.computation ? { status: a.computation.status, resultDigest: a.computation.resultDigest,
        requestDigest: a.computation.requestDigest, workUnits: a.computation.workUnits, elapsedMs: a.computation.elapsedMs,
        executedProgramDigest: a.computation.executedProgramDigest, loweringVersion: a.computation.loweringVersion } : null,
      modelEvidence: a.modelEvidence })) };
}
type Row = { family: string; taskId: string; arm: Arm; run: ReturnType<typeof publicRun> | null; blocked: string | null };
type Seed = { family: string; run: ReturnType<typeof publicRun>; admission: string;
  descriptor: ReturnType<BoundQuantitativeProcedure["descriptor"]> | null;
  admissionReplay: { status: string; workUnits: number; elapsedMs: number; resultDigest: string } | null; constructionElapsedMs: number };
const SUM_KEYS = ["calls", "reportedTokens", "unknownUsageCalls", "httpAttempts", "knownUsageHttpAttempts", "unknownUsageHttpAttempts", "providerFailures", "localDeliveryBlocks", "recoveredDisruptions", "toolRequests", "toolWorkUnits", "toolElapsedMs", "elapsedMs"] as const;
export function sumUsage(runs: ReturnType<typeof publicRun>[]) {
  return Object.fromEntries(SUM_KEYS.map(key => [key, runs.reduce((n, r) => n + r.usage[key], 0)])) as Record<typeof SUM_KEYS[number], number>;
}
/** Pure orchestrator composes existing cognition, native leases and independently
 * owned oracle. IR stays process-local. Each seed is generated once physically;
 * BOTH reuse arms are charged full construction/replay cost. Recompute baseline
 * is NOT charged for creating a tool it never receives. No free setup benefit.
 */
export async function runProcedureReuseEpoch(complete: Complete, binding: { candidate: string; sourceDigests: Record<string,string> },
  now = Date.now, checkpoint: (report: unknown) => Promise<void> = async () => {}) {
  const began = now(), expires = began + EPOCH.maxEpochMs;
  const freeze = { ...binding, configuration: EPOCH, corpusDigest: PROCEDURE_CORPUS_DIGEST,
    taskBindings: PROCEDURE_FAMILIES.flatMap(f => [f.seed,...f.fresh]).map(t => ({ taskId: t.taskId, digest: theoryDigest(t) })) };
  const seeds: Seed[] = [], results: Row[] = []; let physicalLogicalCalls = 0;
  const run = async (task: ProcedureCase, procedure?: { artifact: BoundQuantitativeProcedure; mode: "CONTEXT_ONLY"|"BOUND_INVOCATION" }, create = false) =>
    runNyxQuantitativeTask({ ...task, arm: "REASONING_WITH_WORKBENCH", procedure, createReusableProcedure: create,
      limits: { maxCalls: EPOCH.maxCallsPerStage, maxOutputTokens: EPOCH.maxOutputTokensPerCall, maxTaskMs: EPOCH.maxStageMs,
        expiresAtEpochMs: expires, maxToolRequests: EPOCH.maxToolRequestsPerStage, maxToolWorkUnits: EPOCH.maxToolWorkUnitsPerStage,
        maxToolElapsedMs: EPOCH.maxToolElapsedMsPerStage }, now,
      complete: async request => { if (++physicalLogicalCalls > EPOCH.maxPhysicalLogicalCalls) throw Error("procedure_epoch_call_cap");
        return complete(procedureInferenceRequest(request), `${task.taskId}/${create?"SEED":procedure?.mode??"CURRENT_RECOMPUTE"}`); },
      verify: certificate => verifyProcedureOutputs(task, certificate) });
  function report() {
    const arms = (EPOCH.arms as readonly Arm[]).map(arm => {
      const rows = results.filter(r => r.arm === arm), runs = rows.flatMap(r => r.run ? [r.run] : []), transferUsage = sumUsage(runs);
      const seedRuns = arm === "CURRENT_RECOMPUTE" ? [] : seeds.map(s => s.run);
      const charged = sumUsage([...runs,...seedRuns]);
      if (arm !== "CURRENT_RECOMPUTE") {
        charged.toolWorkUnits += seeds.reduce((n,s) => n + (s.admissionReplay?.workUnits ?? 0), 0);
        charged.toolElapsedMs += seeds.reduce((n,s) => n + (s.admissionReplay?.elapsedMs ?? 0), 0);
        charged.elapsedMs += seeds.reduce((n,s) => n + Math.max(0,s.constructionElapsedMs - s.run.usage.elapsedMs), 0);
        charged.toolRequests += seeds.filter(s => s.admissionReplay !== null).length;
      }
      const attempts = runs.flatMap(r => r.attempts), confidences = attempts.filter(a => a.confidence !== null);
      return { arm, selected: 4, attempted: runs.filter(r => r.usage.calls > 0).length,
        graded: runs.filter(r => r.attempts.some(a => ["ACCEPTED","FUNCTIONAL_REJECTION","CERTIFICATE_SCHEMA_REJECTION"].includes(a.outcome))).length,
        correct: runs.filter(r => r.accepted).length, firstAttemptCorrect: runs.filter(r => r.firstAttemptAccepted).length,
        blocked: rows.filter(r => r.blocked !== null).length, unexecuted: 4-runs.length, transferUsage, fullyChargedUsage: charged,
        procedureSelections: attempts.filter(a => a.procedureReference !== null).length,
        procedureExecutions: attempts.filter(a => a.procedureReference !== null && a.nativeExecution !== null).length,
        procedureAccepted: attempts.filter(a => a.procedureReference !== null && a.outcome === "ACCEPTED").length,
        outcomes: Object.fromEntries([...new Set(attempts.map(a=>a.outcome))].sort().map(outcome=>[outcome,attempts.filter(a=>a.outcome===outcome).length])),
        repairAttempts: runs.reduce((n,r)=>n+r.repairDepth,0),
        brierScoreSubmittedCandidates: confidences.length ? confidences.reduce((n,a)=>n+(a.confidence!-Number(a.outcome==="ACCEPTED"))**2,0)/confidences.length : null };
    });
    const [control,context,bound] = arms;
    const complete = seeds.length === 2 && results.length === 12 && results.every(r=>r.run!==null&&r.run.usage.calls>0);
    const physicalUsage = sumUsage([...seeds.map(s=>s.run),...results.flatMap(r=>r.run?[r.run]:[])]);
    const providerStable = physicalUsage.providerFailures===0 && physicalUsage.localDeliveryBlocks===0 && physicalUsage.recoveredDisruptions===0 && physicalUsage.unknownUsageCalls===0 && physicalUsage.unknownUsageHttpAttempts===0;
    const pairs = PROCEDURE_FAMILIES.flatMap(f=>f.fresh).map(task => {
      const rows = EPOCH.arms.map(arm=>results.find(r=>r.arm===arm&&r.taskId===task.taskId)?.run??null);
      return { taskId: task.taskId, outcomes: rows.map((r,i)=>({arm:EPOCH.arms[i],accepted:r?.accepted??null,outcome:r?.outcome??"UNEXECUTED"})),
        realizedComputeMatched: rows.every(r=>r!==null) && rows.every(r=>r!.usage.calls===rows[0]!.usage.calls
          &&r!.usage.reportedTokens===rows[0]!.usage.reportedTokens&&r!.usage.toolWorkUnits===rows[0]!.usage.toolWorkUnits) };
    });
    const nonRegression = pairs.every(p=>p.outcomes.every(o=>o.accepted!==null)
      && Number(p.outcomes[2].accepted)>=Number(p.outcomes[0].accepted) && Number(p.outcomes[2].accepted)>=Number(p.outcomes[1].accepted));
    const lowerChargedCost = bound.fullyChargedUsage.calls<=control.fullyChargedUsage.calls && bound.fullyChargedUsage.calls<=context.fullyChargedUsage.calls
      && bound.fullyChargedUsage.reportedTokens<control.fullyChargedUsage.reportedTokens && bound.fullyChargedUsage.reportedTokens<context.fullyChargedUsage.reportedTokens
      && bound.fullyChargedUsage.toolWorkUnits<=control.fullyChargedUsage.toolWorkUnits && bound.fullyChargedUsage.toolWorkUnits<=context.fullyChargedUsage.toolWorkUnits;
    return { schemaVersion: 1, candidate: binding.candidate, freeze, freezeDigest: theoryDigest(freeze), seeds, results, arms, pairs,
      complete, providerStable, physicalLogicalCalls, physicalUsage, elapsedMs: Math.max(0,now()-began),
      physicalAdmissionReplay: { requests: seeds.filter(s=>s.admissionReplay!==null).length,
        workUnits: seeds.reduce((n,s)=>n+(s.admissionReplay?.workUnits??0),0), elapsedMs: seeds.reduce((n,s)=>n+(s.admissionReplay?.elapsedMs??0),0) },
      stopReason: now()>=expires ? "GLOBAL_BUDGET" : complete ? "PREDECLARED_TASKS_COMPLETE" : "INCOMPLETE_OR_SEED_NOT_ADMITTED",
      scopedEfficiencySignal: complete&&providerStable&&nonRegression&&bound.correct>0&&bound.procedureAccepted>0&&lowerChargedCost,
      promotion: "NONE_SINGLE_SMALL_PARAMETER_TRANSFER_EPOCH_REQUIRES_REPLICATION",
      limitations: ["TWO_FORMAL_FAMILIES_NOT_FAMILY_DISJOINT_TRANSFER", "CONSTRUCTION_COST_FULLY_CHARGED_TO_REUSE_ARMS",
        "EQUAL_PER_STAGE_CAPS_NOT_GUARANTEED_MATCHED_REALIZED_COMPUTE", "SEED_PASS_NOT_FUTURE_SEMANTIC_CERTIFICATION",
        "NOT_OFFICIAL_BENCHMARK_OR_BROAD_TOOL_INVENTION_OR_RECURSION_OR_AGI"],
      safety: { authorityIncrease: false, generalShell: false, generalNetwork: false, productionAuthority: false,
        defaultUltraChanged: false, rawReasoningPersisted: false, programPersisted: false, independentAcceptance: true } };
  }
  for (const [familyIndex,family] of PROCEDURE_FAMILIES.entries()) {
    if (now()>=expires) break;
    const start=now(), seed=await run(family.seed,undefined,true);
    const authored=seed.accepted?[...seed.attempts].reverse().find(a=>a.outcome==="ACCEPTED"&&a.executedProgram!==null):undefined;
    if(authored?.executedProgram?.schemaVersion===4)throw Error("expression_graph_reuse_not_enabled");
    const admissionExpiry=Math.min(expires,start+EPOCH.maxStageMs);
    const admitted=authored?.executedProgram&&now()<admissionExpiry?BoundQuantitativeProcedure.admit({ task: family.seed, program: authored.executedProgram,
      parameterIds: family.seed.problem.constants.filter(c=>!["zero","one","two"].includes(c.id)).map(c=>c.id),
      modelEvidenceDigest: theoryDigest(authored.modelEvidence),
      limits: { maxRequests: 1, maxWorkUnits: EPOCH.maxToolWorkUnitsPerStage, maxElapsedMs: EPOCH.maxToolElapsedMsPerStage,
        expiresAtEpochMs: admissionExpiry }, now,
      verify: certificate=>verifyProcedureOutputs(family.seed,certificate) }):null;
    const artifact=admitted?.procedure??null;
    seeds.push({ family: family.family, run: publicRun(seed), admission: admitted?.decision??(authored?"SEED_REPLAY_EXPIRY":seed.accepted?"NO_REPLAYABLE_ACCEPTED_PROCEDURE":"SEED_NOT_ACCEPTED"),
      descriptor: artifact?.descriptor()??null, admissionReplay: admitted?{ status: admitted.result.status, workUnits: admitted.result.workUnits,
        elapsedMs: admitted.result.elapsedMs, resultDigest: admitted.result.resultDigest }:null, constructionElapsedMs: Math.max(0,now()-start) });
    await checkpoint(report());
    try {
      for (const [caseIndex,task] of family.fresh.entries()) for (let offset=0;offset<3;offset++) {
        const arm=EPOCH.arms[(offset+caseIndex+familyIndex)%3] as Arm;
        const blocked=now()>=expires?"GLOBAL_BUDGET":arm!=="CURRENT_RECOMPUTE"&&!artifact?"NO_ADMITTED_MODEL_AUTHORED_PROCEDURE":null;
        const result=blocked?null:await run(task,arm==="CURRENT_RECOMPUTE"?undefined:{artifact:artifact!,mode:arm});
        const row={family:family.family,taskId:task.taskId,arm,run:result?publicRun(result):null,blocked};results.push(row);
        console.log(`NYX_PROCEDURE_STAGE ${JSON.stringify({family:row.family,taskId:row.taskId,arm,blocked,outcome:row.run?.outcome,
          accepted:row.run?.accepted,usage:row.run?.usage})}`); await checkpoint(report());
      }
    } finally { artifact?.revoke(); }
  }
  return report();
}
async function main() {
  if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK!=="1"||!process.env.NVIDIA_API_KEY?.trim()) throw Error("explicit_model_network_and_injected_secret_required");
  const git=(...args:string[])=>execFileSync("git",args,{encoding:"utf8"}).trim(), candidate=process.env.GITHUB_SHA??git("rev-parse","HEAD");
  if (!/^[a-f0-9]{40}$/.test(candidate)||candidate!==git("rev-parse","HEAD")||git("status","--porcelain")) throw Error("clean_candidate_required");
  const before=theoryDigest(git("ls-files","-s"));
  const paths=["scripts/omega/nyx-procedure-reuse-fixtures.ts","scripts/omega/nyx-procedure-reuse-live-eval.ts","src/lib/codelab/research/quantitativeProcedureReuse.ts",
    "src/lib/codelab/research/boundedReasoningWorkbench.ts","src/lib/codelab/research/exactQuantitativeDerivation.ts","src/lib/codelab/research/quantitativeEquationCompiler.ts",
    "src/lib/codelab/research/nyxQuantitativeReasoning.ts","src/lib/codelab/research/analysisArtifactReference.ts","src/lib/codelab/research/theoryContracts.ts",
    "src/lib/codelab/model/nvidiaNimProvider.ts","src/lib/codelab/model/nvidiaCapacity.ts"];
  const sourceDigests=Object.fromEntries(paths.map(path=>[path,theoryDigest(readFileSync(path,"utf8"))]));
  const provider=NvidiaNimProvider.create({providerId:"NYX-PROCEDURE-REUSE",model:EPOCH.model,authorityMode:"EXPLICIT_LIVE_NVIDIA_NIM",
    credentialSource:nvidiaNimCredentialFromEnvironment(process.env),maxPromptBytes:32000,maxOutputTokens:EPOCH.maxOutputTokensPerCall,timeoutMs:120000})
    .withHttpAttemptBudget(EPOCH.maxHttpAttemptsPerEpoch,"WITHIN_SHARED_BUDGET");
  const stages=new Map<string,NvidiaNimProvider>();
  const path=join(process.env.RUNNER_TEMP??tmpdir(),`nyx-procedure-reuse-${candidate}.json`);
  const persist=(report:unknown)=>writeFile(path,JSON.stringify(report,null,2)+"\n");
  const report=await runProcedureReuseEpoch((request,stage)=>{
    if(!stages.has(stage))stages.set(stage,provider.withHttpAttemptBudget(EPOCH.maxHttpAttemptsPerStage,"WITHIN_SHARED_BUDGET"));
    return stages.get(stage)!.complete(request);
  },{candidate,sourceDigests},Date.now,persist);
  const sourceUnchanged=theoryDigest(git("ls-files","-s"))===before&&git("rev-parse","HEAD")===candidate&&!git("status","--porcelain");
  const final={...report,sourceUnchanged};await persist(final);
  console.log(`NYX_PROCEDURE_REPORT ${JSON.stringify(final)}`);
  if (!sourceUnchanged) throw Error("source_repository_changed");
}
if (import.meta.url===pathToFileURL(resolve(process.argv[1]??"")).href) await main();

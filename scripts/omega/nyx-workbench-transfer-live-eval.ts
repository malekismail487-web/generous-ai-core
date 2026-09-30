import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NvidiaNimProvider, nvidiaNimCredentialFromEnvironment, type NvidiaNimEvidence } from
  "../../src/lib/codelab/model/nvidiaNimProvider";
import { BoundedReasoningSession } from "../../src/lib/codelab/research/boundedReasoningWorkbench";
import { immutableTheoryValue, theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import { frontierExchangeSchema, parseFrontierExchange, frontierArtifactReviewPrompt,
  materializeFrontierArtifact, parseArtifactDecline, type ArtifactDeclineDiagnostic } from "./nyx-frontier-workbench";
import { frontierProviderSchema } from "./nyx-frontier-reasoning-fixtures";
import { WORKBENCH_TRANSFER_EPOCH as EPOCH, WORKBENCH_TRANSFER_TASKS as TASKS,
  WORKBENCH_TRANSFER_CORPUS_DIGEST, transferCertificateSchema, transferPayload, verifyTransferCertificate,
  type TransferTask } from "./nyx-workbench-transfer-fixtures";

if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1" || !process.env.NVIDIA_API_KEY?.trim()) {
  console.error("NYX_WORKBENCH_TRANSFER: BLOCKED_AUTHORITY_OR_MISSING_INJECTED_SECRET"); process.exit(2);
}
const git = (...args: string[]) => execFileSync("git", args, {encoding: "utf8"});
const CANDIDATE = process.env.GITHUB_SHA?.trim() || git("rev-parse", "HEAD").trim();
if (!/^[a-f0-9]{40}$/.test(CANDIDATE) || CANDIDATE !== git("rev-parse", "HEAD").trim()) throw new Error("candidate_identity_mismatch");
const MODEL = process.env.NVIDIA_NIM_MODEL?.trim() || "nvidia/nemotron-3-ultra-550b-a55b";
const startedAt = Date.now(); const deadline = startedAt + EPOCH.maxWallClockMs;
const sourceBefore = theoryDigest({ index: git("ls-files", "-s"), status: git("status", "--porcelain=v1") });
if (git("status", "--porcelain=v1").trim()) throw new Error("clean_evaluation_checkout_required");
const provider = NvidiaNimProvider.create({ providerId: "NYX-WORKBENCH-TRANSFER", model: MODEL,
  authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM", credentialSource: nvidiaNimCredentialFromEnvironment(process.env),
  maxPromptBytes: 128_000, maxOutputTokens: EPOCH.maxOutputTokensPerCall, timeoutMs: 120_000 });
type Arm = "BASELINE" | "WORKBENCH";
interface Attempt {
  call: number; outcome: string; findings: readonly string[]; candidateDigest: string | null;
  verificationDigest: string | null; confidence: number | null; decline: ArtifactDeclineDiagnostic | null;
}
interface TaskResult {
  arm: Arm; taskId: string; accepted: boolean; outcome: string; calls: number; submissions: number;
  repairAttempts: number; elapsedMs: number; attempts: readonly Attempt[];
  evidence: readonly ReturnType<typeof sanitized>[]; toolWorkUnits: number; toolElapsedMs: number;
  toolRequests: number; toolResultDigest: string | null; declinedArtifactAcceptedByOfflineOracle: boolean | null;
}
const calls: Record<Arm, number> = {BASELINE: 0, WORKBENCH: 0};
function sanitized(e: NvidiaNimEvidence) {
  return { evidenceId: e.evidenceId, evidenceClass: e.evidenceClass, requestDigest: e.requestDigest,
    responseDigest: e.responseDigest, statusCode: e.statusCode, providerRequestId: e.providerRequestId,
    failureCategory: e.failureCategory, finishReason: e.finishReason, usage: e.usage,
    delivery: e.delivery ?? null, reasoningOutputBytes: e.reasoningOutputBytes ?? null,
    credentialPersisted: false, grantsAuthority: false };
}
function payloadContract(task: TransferTask) {
  return task.problem.kind === "COLORING" ? "CONSTRUCTED payload={coloring:[{vertex,color}],clique:[vertex,...]}."
    : task.problem.kind === "REACHABILITY" ? "CONSTRUCTED payload={trace:[action,...],stateTrace:[state,...]}; trace must be shortest."
    : task.problem.kind === "EXPERIMENT_SELECTION" ? "CONSTRUCTED payload={experimentIds:[id,...],minimumCardinality:integer,forecasts:[{mechanismId,experimentId,expectedOutcome},...]}. All chosen predictions required."
    : "payload={mechanismId:unique survivor or null,survivors:[id,...],ruledOutMechanismIds:[id,...],evidenceRefs:[all admitted refs],conflict:boolean}. Status CONSTRUCTED iff one survivor, otherwise INSUFFICIENT_EVIDENCE.";
}
async function run(task: TransferTask, arm: Arm): Promise<TaskResult> {
  const began = Date.now(); const taskDeadline = Math.min(deadline, began + EPOCH.maxTaskMs);
  if (began >= deadline) return {arm, taskId: task.taskId, accepted: false, outcome: "BUDGET_UNEXECUTED", calls: 0,
    submissions: 0, repairAttempts: 0, elapsedMs: 0, attempts: [], evidence: [], toolWorkUnits: 0, toolElapsedMs: 0,
    toolRequests: 0, toolResultDigest: null, declinedArtifactAcceptedByOfflineOracle: null};
  const session = arm === "WORKBENCH" ? BoundedReasoningSession.create(task.problem,
    {maxWorkUnits: EPOCH.maxToolWorkUnits, maxElapsedMs: EPOCH.maxToolElapsedMs,
      maxRequests: EPOCH.maxToolRequestsPerTask, expiresAtEpochMs: taskDeadline}) : null;
  const attempts: Attempt[] = []; const evidence: ReturnType<typeof sanitized>[] = [];
  let observation: Readonly<Record<string, unknown>> | null = null;
  let feedback: readonly string[] = []; let previous: unknown = null;
  let toolRequests = 0; let toolWorkUnits = 0; let toolElapsedMs = 0; let toolResultDigest: string | null = null;
  let offlineAccepted: boolean | null = null; let submissions = 0; let accepted = false;
  let outcome = "BUDGET_UNEXECUTED";
  const base = { taskId: task.taskId, objective: task.objective, problem: task.problem,
    certificateContract: { schemaVersion: 1, decision: "SUBMIT", status: "CONSTRUCTED / EXHAUSTIVE_NO_WITNESS / INSUFFICIENT_EVIDENCE",
      payload: payloadContract(task), confidence: "number 0..1", uncertainties: "0..8 bounded strings" },
    absenceContract: "Only after exhaustive finite analysis, absent coloring/clique or unsafe trace uses EXHAUSTIVE_NO_WITNESS with payload={finiteDomainExhausted:true}. Budget exhaustion is not absence.",
    acceptance: "Submission is a proposal checked by a separate deterministic oracle. Valid uncertainty is acceptable; invented certainty is not.",
    authority: "NO_EXECUTION_OR_NETWORK_OR_REPOSITORY_AUTHORITY" };
  try {
    for (let at = 1; at <= EPOCH.maxCallsPerTask; at++) {
      if (Date.now() >= taskDeadline || calls[arm] >= EPOCH.maxCallsPerArm) break;
      const toolAvailable = session !== null && toolRequests === 0;
      const artifactAvailable = observation?.decision === "CANDIDATE_CONSTRUCTED_NOT_ACCEPTED";
      const prompt = artifactAvailable ? frontierArtifactReviewPrompt(base, observation!, feedback, true)
        : { ...base, feedback, previousRejectedCandidate: previous,
          availableTool: toolAvailable ? {schemaVersion: 1, operation: "ANALYZE_FINITE_PROBLEM", problemDigest: session!.problemDigest,
            maxRequests: 1, grantsAuthority: false} : null,
          computationalObservation: observation,
          exchangeContract: "Return {action,analysisRequest,certificate}. To SUBMIT_CERTIFICATE, analysisRequest=null and certificate has precisely the specified fields. If an availableTool exists, you may REQUEST_ANALYSIS with certificate=null and exactly its schemaVersion,operation,problemDigest; this performs bounded native computation on the supplied problem only. Its result is not accepted until independently verified. Unknown tools are forbidden." };
      calls[arm]++;
      const completion = await provider.complete({schemaVersion: 1,
        requestId: `TRANSFER-${arm}-${task.taskId}-${at}-${CANDIDATE.slice(0,12)}`,
        messages: [{role: "system", content: "You are Νύξ performing a bounded finite reasoning transfer evaluation. Output exactly one strict JSON exchange. Confidence is not evidence; analysis is not authority; every proposed certificate is independently checked."},
          {role: "user", content: JSON.stringify(prompt)}], maxTokens: EPOCH.maxOutputTokensPerCall, temperature: 0,
        responseFormat: {type: "JSON_SCHEMA", name: "nyx_workbench_transfer",
          schema: frontierProviderSchema(frontierExchangeSchema(transferCertificateSchema(), toolAvailable, artifactAvailable, true))},
        inferencePolicy: "REASONING_JSON", observedAtEpochMs: Date.now(), deadlineEpochMs: taskDeadline});
      evidence.push(sanitized(completion.evidence));
      const record = (state: string, findings: readonly string[], candidateDigest: string | null = null,
        verificationDigest: string | null = null, confidence: number | null = null, decline: ArtifactDeclineDiagnostic | null = null) => {
        outcome = state; feedback = findings;
        attempts.push({call: at, outcome: state, findings, candidateDigest, verificationDigest, confidence, decline});
      };
      if (completion.decision !== "COMPLETED" || completion.content === null) {
        record("PROVIDER_FAILURE", [completion.evidence.failureCategory ?? completion.decision]); continue;
      }
      if (completion.finishReason !== "stop") { record("TRUNCATION_OR_NONSTOP", ["A complete strict JSON object is required."]); continue; }
      let parsed: unknown;
      try { parsed = JSON.parse(completion.content); }
      catch { record("SYNTAX_REJECTION", ["Return strict JSON without Markdown."]); continue; }
      try {
        const exchange = parseFrontierExchange(parsed, toolAvailable, artifactAvailable, true);
        if (exchange.action === "REQUEST_ANALYSIS") {
          toolRequests++;
          const result = session!.analyze(exchange.request);
          toolWorkUnits += result.workUnits; toolElapsedMs += result.elapsedMs; toolResultDigest = result.resultDigest;
          observation = immutableTheoryValue({problemDigest: session!.problemDigest,
            decision: result.status === "BUDGET_EXHAUSTED" ? "INSUFFICIENT_EVIDENCE" : "CANDIDATE_CONSTRUCTED_NOT_ACCEPTED",
            certificateFields: result.status === "BUDGET_EXHAUSTED" ? null : {status: result.status, payload: transferPayload(task.problem, result.payload)},
            assumptions: ["Conditional result for the supplied finite domain and admitted observations; independent verification required."],
            evidenceDigests: [result.resultDigest], workUnits: result.workUnits, elapsedMs: result.elapsedMs, grantsAuthority: false});
          record("ANALYSIS_RETURNED_NOT_ACCEPTED", ["Review the bound proposed result, or state a specific obstruction."]); continue;
        }
        if (exchange.action === "DECLINE_ANALYSIS_ARTIFACT") {
          const diagnostic = parseArtifactDecline(observation!, exchange.request);
          const proposal = materializeFrontierArtifact(observation!, transferCertificateSchema(), {schemaVersion: 1,
            operation: "SUBMIT_ANALYSIS_ARTIFACT", problemDigest: observation!.problemDigest,
            resultDigest: theoryDigest(observation), confidence: diagnostic.confidence});
          const checked = verifyTransferCertificate(task, proposal); offlineAccepted = checked.accepted;
          record(checked.accepted ? "UNWARRANTED_ABSTENTION" : "JUSTIFIED_DECLINE", ["MODEL_DECLINED_BOUND_ARTIFACT"],
            theoryDigest(proposal), checked.evidenceDigest, diagnostic.confidence, diagnostic);
          // One bounded reconsideration uses the SAME oracle available to both arms.
          // This is feedback, never automatic submission; an explicit refusal remains legal.
          feedback = checked.accepted ? ["Independent finite-domain oracle: the proposed structured report satisfies this task's contract.",
            "Reporting uncertainty or contradictory observations is distinct from asserting a surviving hypothesis is true.",
            "Reconsider once, or maintain your refusal with the specific unmet objective/evidence requirement."]
            : [...checked.findings, "The independent oracle rejected the proposal. Do not submit unsupported claims."];
          if (attempts.filter(a => a.decline !== null).length <= EPOCH.maxDeclineReconsiderationsPerTask
            && at < EPOCH.maxCallsPerTask) continue;
          break;
        }
        const candidate = exchange.action === "SUBMIT_CERTIFICATE" ? exchange.certificate
          : materializeFrontierArtifact(observation!, transferCertificateSchema(), exchange.request);
        submissions++;
        const checked = verifyTransferCertificate(task, candidate);
        const confidence = typeof (candidate as Record<string, unknown>).confidence === "number"
          && Number.isFinite((candidate as Record<string, unknown>).confidence)
          ? Number((candidate as Record<string, unknown>).confidence) : null;
        record(checked.accepted ? "ACCEPTED" : checked.findings.includes("CERTIFICATE_SCHEMA_INVALID")
          ? "CERTIFICATE_SCHEMA_REJECTION" : "FUNCTIONAL_FAILURE", checked.findings,
          theoryDigest(candidate), checked.evidenceDigest, confidence);
        if (checked.accepted) { accepted = true; break; }
        previous = candidate;
      } catch {
        // Do not persist arbitrary exception text supplied by model output or transport.
        record("PROTOCOL_OR_AUTHORIZATION_REJECTION", ["The typed request, exact digest, phase, or argument contract was invalid."]);
      }
    }
  } finally { session?.revoke(); }
  const result = immutableTheoryValue({arm, taskId: task.taskId, accepted, outcome, calls: evidence.length, submissions,
    repairAttempts: Math.max(0, submissions - 1), elapsedMs: Date.now() - began, attempts, evidence,
    toolWorkUnits, toolElapsedMs, toolRequests, toolResultDigest, declinedArtifactAcceptedByOfflineOracle: offlineAccepted});
  console.log(`TRANSFER_TASK arm=${arm} task=${task.taskId} outcome=${outcome} calls=${result.calls}`);
  return result;
}

const results: TaskResult[] = [];
for (const [at, task] of TASKS.entries()) {
  // Precommitted alternating order; fresh model context per arm, no answer sharing.
  const order: Arm[] = at % 2 === 0 ? ["BASELINE", "WORKBENCH"] : ["WORKBENCH", "BASELINE"];
  for (const arm of order) results.push(await run(task, arm));
}
function metrics(arm: Arm) {
  const selected = results.filter(r => r.arm === arm); const observations = selected.flatMap(r => r.evidence);
  const attempts = selected.flatMap(r => r.attempts);
  const knownUsage = observations.flatMap(e => e.usage.totalTokens === null ? [] : [e.usage.totalTokens]);
  const scored = attempts.filter(a => a.confidence !== null && a.candidateDigest !== null
    && !["UNWARRANTED_ABSTENTION", "JUSTIFIED_DECLINE"].includes(a.outcome));
  return {arm, accepted: selected.filter(r => r.accepted).length, tasks: selected.length,
    modelCalls: observations.length, reportedTokens: knownUsage.reduce((a,b) => a+b,0), unknownUsageCalls: observations.length - knownUsage.length,
    httpAttempts: observations.reduce((n,e) => n + (e.delivery?.httpAttempts ?? 0),0),
    unknownDeliveryCalls: observations.filter(e => e.delivery === null).length,
    providerFailures: attempts.filter(a => a.outcome === "PROVIDER_FAILURE").length,
    recoveredProviderDisruptions: observations.reduce((n,e) => n + (e.delivery?.rateLimitedResponses ?? 0)
      + (e.delivery?.transientUnavailableResponses ?? 0) + (e.delivery?.timedOutAttempts ?? 0),0),
    truncations: attempts.filter(a => a.outcome === "TRUNCATION_OR_NONSTOP").length,
    schemaFailures: attempts.filter(a => ["SYNTAX_REJECTION", "CERTIFICATE_SCHEMA_REJECTION", "PROTOCOL_OR_AUTHORIZATION_REJECTION"].includes(a.outcome)).length,
    functionalFailures: attempts.filter(a => a.outcome === "FUNCTIONAL_FAILURE").length,
    unwarrantedAbstentions: attempts.filter(a => a.outcome === "UNWARRANTED_ABSTENTION").length,
    declineReconsiderationCalls: selected.reduce((n,r) => n + r.attempts.filter((a,i) => i > 0 && r.attempts[i-1].decline !== null).length,0),
    repairAttempts: selected.reduce((n,r) => n+r.repairAttempts,0),
    elapsedMs: selected.reduce((n,r) => n+r.elapsedMs,0), toolRequests: selected.reduce((n,r) => n+r.toolRequests,0),
    toolWorkUnits: selected.reduce((n,r) => n+r.toolWorkUnits,0), toolElapsedMs: selected.reduce((n,r) => n+r.toolElapsedMs,0),
    submittedCandidateBrierScore: scored.length ? scored.reduce((n,a) => n + (a.confidence! - Number(a.outcome === "ACCEPTED")) ** 2,0) / scored.length : null,
    calibrationScope: "DESCRIPTIVE_DEPENDENT_SUBMISSIONS_NOT_GENERAL_CALIBRATION_CERTIFICATION",
    acceptedPerReportedMillionTokens: knownUsage.length === observations.length && knownUsage.reduce((a,b)=>a+b,0) > 0
      ? selected.filter(r=>r.accepted).length / knownUsage.reduce((a,b)=>a+b,0) * 1_000_000 : null};
}
const sourceAfter = theoryDigest({index: git("ls-files", "-s"), status: git("status", "--porcelain=v1")});
if (sourceAfter !== sourceBefore) throw new Error("source_repository_changed_during_evaluation");
const arms = [metrics("BASELINE"), metrics("WORKBENCH")];
const pairs = TASKS.map(task => ({taskId: task.taskId, baseline: results.find(r=>r.taskId === task.taskId && r.arm === "BASELINE")!.outcome,
  workbench: results.find(r=>r.taskId === task.taskId && r.arm === "WORKBENCH")!.outcome}));
const contaminated = arms.some(a => a.providerFailures > 0 || a.recoveredProviderDisruptions > 0);
const unexecuted = results.some(r => r.calls === 0);
const verdict = contaminated || unexecuted ? "INCONCLUSIVE_PROVIDER_OR_BUDGET_CONTAMINATED"
  : arms[1].accepted > arms[0].accepted ? "FRESH_TASK_ADVANTAGE_OBSERVED_REPLICATION_REQUIRED" : "NO_ACCEPTANCE_ADVANTAGE_OBSERVED";
const report = {schemaVersion: 1, chunkId: EPOCH.chunkId, candidate: CANDIDATE, model: MODEL, epoch: EPOCH,
  corpusDigest: WORKBENCH_TRANSFER_CORPUS_DIGEST,
  evaluatorSourceDigest: theoryDigest(readFileSync("scripts/omega/nyx-workbench-transfer-fixtures.ts", "utf8")),
  executionIdentity: process.env.GITHUB_RUN_ID ?? "LOCAL_AUTHORIZED_RUN", environment: {platform: process.platform, node: process.version},
  startedAtEpochMs: startedAt, finishedAtEpochMs: Date.now(), verdict, arms, pairs, results,
  sourceStateBefore: sourceBefore, sourceStateAfter: sourceAfter, sourceRepositoryUnchanged: true,
  matchedModelAndCallTokenLimits: true, matchedRealizedModelCompute: false, matchedToolCompute: false,
  realizedComputeMustBeCompared: true, independentInstitutionalReplication: false, broadPromotion: false,
  falseAcceptanceRate: "NOT_EXTERNALLY_MEASURED_NEGATIVE_CONTROLS_VERIFIED_LOCALLY",
  evidenceClasses: {liveProvider: "E4", finiteAcceptanceOracle: "E3_LESS_CORRELATED_ALGORITHM_NOT_EXTERNAL_INSTITUTION"},
  security: {secretPersisted: false, rawModelReasoningPersisted: false, authorityIncrease: false,
    generalNetworkAuthority: false, sourceMutationAuthority: false, productionAuthority: false},
  supportCriterion: "Fresh accepted-task advantage without increasing reported model compute; repeat on a new frozen set before broader adoption.",
  falsificationCriterion: "No acceptance advantage or worse capability-per-compute; never weaken oracle or exclude failed tasks."};
const reportRoot = process.env.RUNNER_TEMP?.trim() || tmpdir();
await writeFile(join(reportRoot, `nyx-workbench-transfer-${CANDIDATE.slice(0,12)}.json`), `${JSON.stringify(report,null,2)}\n`, {encoding: "utf8", mode: 0o600});
console.log(`NYX_WORKBENCH_TRANSFER_REPORT ${JSON.stringify(report)}`);
// A completed comparison is not equivalent to every task passing or the hypothesis being supported.
console.log(`NYX_WORKBENCH_TRANSFER verdict=${verdict} accepted=${arms[0].accepted}/${TASKS.length},${arms[1].accepted}/${TASKS.length}`);

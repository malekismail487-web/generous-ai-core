import { readFileSync } from "node:fs";
import { BoundedReasoningSession } from "../src/lib/codelab/research/boundedReasoningWorkbench";
import { theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import { WORKBENCH_TRANSFER_TASKS, WORKBENCH_TRANSFER_EPOCH, WORKBENCH_TRANSFER_CORPUS_DIGEST,
  transferPayload, verifyTransferCertificate, transferCertificateSchema, type TransferTask } from "./omega/nyx-workbench-transfer-fixtures";
import { parseArtifactDecline, parseFrontierExchange, materializeFrontierArtifact,
  frontierArtifactReviewPrompt, frontierExchangeSchema } from "./omega/nyx-frontier-workbench";

let passed = 0; let failed = 0;
function check(condition: unknown, label: string) {
  if (condition) passed++; else { failed++; console.error(`x ${label}`); }
}
function throws(action: () => unknown) { try { action(); return false; } catch { return true; } }
function solution(task: TransferTask) {
  const session = BoundedReasoningSession.create(task.problem, { maxWorkUnits: 50_000, maxElapsedMs: 2000,
    maxRequests: 1, expiresAtEpochMs: Date.now() + 10_000 });
  try {
    const result = session.analyze({ schemaVersion: 1, operation: "ANALYZE_FINITE_PROBLEM", problemDigest: session.problemDigest });
    return { schemaVersion: 1, decision: "SUBMIT", status: result.status, payload: transferPayload(task.problem, result.payload),
      confidence: 0.8, uncertainties: ["Conditional on the supplied finite domain."] };
  } finally { session.revoke(); }
}
check(WORKBENCH_TRANSFER_TASKS.length === 8 && Object.isFrozen(WORKBENCH_TRANSFER_TASKS), "eight fresh frozen tasks");
check(theoryDigest(WORKBENCH_TRANSFER_TASKS) === WORKBENCH_TRANSFER_CORPUS_DIGEST, "corpus digest binds every objective and problem");
check(WORKBENCH_TRANSFER_EPOCH.maxCallsPerArm === 8 * WORKBENCH_TRANSFER_EPOCH.maxCallsPerTask, "paired model-call envelopes match");
const solutions = WORKBENCH_TRANSFER_TASKS.map(solution);
for (const [at, task] of WORKBENCH_TRANSFER_TASKS.entries()) {
  const candidate = solutions[at]; const verified = verifyTransferCertificate(task, candidate);
  check(verified.accepted, `${task.taskId} solver agrees with separately implemented oracle`);
  check(verified.evidenceClass === "E3" && !verified.grantsAuthority, `${task.taskId} external deterministic acceptance not authority`);
  check(verifyTransferCertificate(task, { ...candidate, payload: { ...candidate.payload, confidenceOverride: true } }).accepted === false,
    `${task.taskId} extra payload fields cannot override acceptance`);
  check(!verifyTransferCertificate(task, { ...candidate, status: "BUDGET_EXHAUSTED" }).accepted,
    `${task.taskId} resource exhaustion never constitutes proof`);
  check(!verifyTransferCertificate(task, { ...candidate, confidence: 1.1 }).accepted, `${task.taskId} confidence bounds preserved`);
}
check(solutions[1].status === "EXHAUSTIVE_NO_WITNESS" && solutions[3].status === "EXHAUSTIVE_NO_WITNESS", "genuine finite absence is supported");
check(solutions[6].status === "INSUFFICIENT_EVIDENCE" && solutions[7].status === "INSUFFICIENT_EVIDENCE", "ambiguity and conflict are not forced into certainty");
for (const at of [5, 6, 7]) {
  const candidate = solutions[at];
  check(!verifyTransferCertificate(WORKBENCH_TRANSFER_TASKS[at], { ...candidate,
    payload: { ...candidate.payload, evidenceRefs: ["INVENTED"] } }).accepted, "invented evidence rejected");
  check(!verifyTransferCertificate(WORKBENCH_TRANSFER_TASKS[at], { ...candidate,
    payload: { ...candidate.payload, conflict: !candidate.payload.conflict } }).accepted, "conflict flag checked independently");
}
check(!verifyTransferCertificate(WORKBENCH_TRANSFER_TASKS[6], { ...solutions[6], status: "CONSTRUCTED",
  payload: { ...solutions[6].payload, mechanismId: "theory-830024-4" } }).accepted, "ambiguous theory cannot be promoted by confidence");
const badColor = structuredClone(solutions[0]);
(badColor.payload.coloring as {color: number}[]).forEach(row => row.color = 3);
check(!verifyTransferCertificate(WORKBENCH_TRANSFER_TASKS[0], badColor).accepted, "deceptive coloring rejected");
check(!verifyTransferCertificate(WORKBENCH_TRANSFER_TASKS[2], { ...solutions[2],
  payload: { ...solutions[2].payload, trace: ["teleport"] } }).accepted, "invalid trace rejected");
check(!verifyTransferCertificate(WORKBENCH_TRANSFER_TASKS[4], { ...solutions[4],
  payload: { ...solutions[4].payload, minimumCardinality: 1 } }).accepted, "nonminimum experiment claim rejected");
check(!verifyTransferCertificate(WORKBENCH_TRANSFER_TASKS[4], { ...solutions[4],
  payload: { ...solutions[4].payload, forecasts: [] } }).accepted, "incomplete forecasts rejected");
const unsafeInitially: TransferTask = { taskId: "ORACLE-SELF-LOOP", objective: "Shortest trace", problem: {
  kind: "REACHABILITY", initialState: "s", states: ["s"], unsafeStates: ["s"], transitions: [{from: "s", to: "s", action: "wait"}] } };
check(verifyTransferCertificate(unsafeInitially, solution(unsafeInitially)).accepted, "Floyd-Warshall oracle preserves zero-length trace despite self loop");
const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
let getterCalls = 0; const accessor = Object.defineProperty({}, "schemaVersion", {enumerable: true, get() { getterCalls++; return 1; }});
for (const malformed of [null, [], "text", cyclic, accessor, new Date(), { ...solutions[0], payload: undefined }])
  check(!verifyTransferCertificate(WORKBENCH_TRANSFER_TASKS[0], malformed).accepted, "non-JSON/malformed output rejected without oracle crash");
check(getterCalls === 0, "oracle does not execute candidate accessors");
const observation = { problemDigest: "frozen-problem", decision: "CANDIDATE_CONSTRUCTED_NOT_ACCEPTED",
  certificateFields: { status: solutions[5].status, payload: solutions[5].payload }, assumptions: ["Finite prediction catalog only."] };
const artifact = { schemaVersion: 1, operation: "SUBMIT_ANALYSIS_ARTIFACT", problemDigest: observation.problemDigest,
  resultDigest: theoryDigest(observation), confidence: 0.8 };
const materialized = materializeFrontierArtifact(observation, transferCertificateSchema(), artifact);
check(verifyTransferCertificate(WORKBENCH_TRANSFER_TASKS[5], materialized).accepted, "generic immutable reference is independently verified");
const deceptive = { ...observation, certificateFields: { status: "CONSTRUCTED", payload: { ...solutions[5].payload, mechanismId: "wrong" } } };
check(!verifyTransferCertificate(WORKBENCH_TRANSFER_TASKS[5], materializeFrontierArtifact(deceptive, transferCertificateSchema(),
  { ...artifact, resultDigest: theoryDigest(deceptive) })).accepted, "valid digest of a false artifact cannot self-certify");
const decline = { ...artifact, operation: "DECLINE_ANALYSIS_ARTIFACT", reasonCode: "UNVERIFIED_TOOL_RESULT",
  blockingFacts: ["I cannot establish this artifact is correct."], evidenceRefs: [], confidence: 0.6 };
check(parseArtifactDecline(observation, decline).reasonCode === "UNVERIFIED_TOOL_RESULT", "explicit refusal remains legal and attributable");
for (const mutation of [{resultDigest: "wrong"}, {problemDigest: "wrong"}, {reasonCode: "FORCE_ACCEPT"}, {blockingFacts: []},
  {blockingFacts: ["x".repeat(241)]}, {evidenceRefs: ["same", "same"]}, {confidence: NaN}, {secret: "not-allowed"}])
  check(throws(() => parseArtifactDecline(observation, { ...decline, ...mutation })), "malformed/unbound diagnostic rejected");
check(throws(() => parseArtifactDecline(observation, accessor)) && getterCalls === 0, "decline cannot execute accessors");
check(parseFrontierExchange({action: "DECLINE_ANALYSIS_ARTIFACT", analysisRequest: decline, certificate: null}, false, true, true).action
  === "DECLINE_ANALYSIS_ARTIFACT", "diagnostic refusal passes only review phase");
check(throws(() => parseFrontierExchange({action: "DECLINE_ANALYSIS_ARTIFACT", analysisRequest: null, certificate: null}, false, true, true)),
  "diagnostic mode requires an inspectable reason");
check(parseFrontierExchange({action: "DECLINE_ANALYSIS_ARTIFACT", analysisRequest: null, certificate: null}, false, true).action
  === "DECLINE_ANALYSIS_ARTIFACT", "previous frozen protocol remains unchanged by default");
check(throws(() => parseFrontierExchange({action: "SUBMIT_CERTIFICATE", analysisRequest: null, certificate: solutions[5]}, false, true, true)),
  "review phase cannot regenerate/override the bound artifact");
check(JSON.stringify(frontierArtifactReviewPrompt({}, observation, [], true)).includes("conditional finite-domain"), "review does not demand universal certainty");
check(JSON.stringify(frontierExchangeSchema(transferCertificateSchema(), false, true, true)).includes("blockingFacts"), "diagnostic schema exposes bounded reasons");
const fixturesSource = readFileSync("scripts/omega/nyx-workbench-transfer-fixtures.ts", "utf8");
check(!/import\s*\{[^}]*BoundedReasoningSession/.test(fixturesSource), "evaluator never uses solver as its acceptance oracle");
console.log(`OMEGA_NYX_WORKBENCH_TRANSFER_TESTS passed: ${passed}, failed: ${failed}`);
process.exitCode = failed ? 1 : 0;

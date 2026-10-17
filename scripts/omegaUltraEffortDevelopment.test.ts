import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {ULTRA_EFFORT_DEVELOPMENT_POLICY as P, ultraEffortDevelopmentTasks,
  ultraResearchMode, ultraEffortOrder, summarizeUltraEffortDevelopment} from "./omega/benchmarks/ultraEffortDevelopment";
import {ultraNativeEffortRequest, standaloneUltraRequest, runUltraResearchArm, summarizeUltraResearchPairs,
  type UltraNativeEffort, type UltraResearchRow} from "./omega/benchmarks/ultraResearchPair";
import type {NvidiaNimCompletionRequest, NvidiaNimCompletionResult} from "../src/lib/codelab/model/nvidiaNimProvider";

let passed = 0, failed = 0;
async function check(name: string, action: () => unknown | Promise<unknown>) {
  try {await action(); passed++;} catch {failed++; console.error(`FAILED ${name}`);}
}
const tasks = ultraEffortDevelopmentTasks();
await check("only explicit development mode changes the campaign family", () => {
  assert.equal(ultraResearchMode(undefined), "BENCHMARK_PAIR");
  assert.equal(ultraResearchMode("DEVELOPMENT_EFFORT"), "DEVELOPMENT_EFFORT");
  assert.equal(ultraResearchMode("BENCHMARK_MEDIUM_PAIR"), "BENCHMARK_MEDIUM_PAIR");
  for (const value of ["", "AUTO", "SUPER", "development_effort"]) assert.throws(() => ultraResearchMode(value));
});
await check("native effort varies only the supported field within the reviewed Ultra request", () => {
  const base = standaloneUltraRequest("Synthetic problem", "DEVELOPMENT", Date.now() + 10000);
  const high = ultraNativeEffortRequest(base, "HIGH"), medium = ultraNativeEffortRequest(base, "MEDIUM");
  assert.equal(high.reasoningEffort, undefined); assert.equal(medium.reasoningEffort, "MEDIUM");
  assert.equal(high.reasoningBudgetTokens, undefined); assert.equal(medium.reasoningBudgetTokens, undefined);
  const {reasoningEffort: _h, ...restHigh} = high, {reasoningEffort: _m, ...restMedium} = medium;
  assert.deepEqual(restHigh, restMedium); assert.deepEqual(high.messages, base.messages);
  assert.throws(() => ultraNativeEffortRequest(base, "LOW" as UltraNativeEffort));
});
await check("both profiles retain fixed original budgets and NYX-only stack", () => {
  assert.deepEqual(P.arms, ["CURRENT_NYX_CLOSED_BOOK"]); assert.equal(P.maxEpochLogicalCalls, 10);
  assert.equal(P.maxEpochPhysicalCalls, 40); assert.equal(P.maxRequestLifetimeMs, 300000);
  assert.equal(P.maxOutputTokens, 16384); assert.equal(P.automaticProfilePromotion, false);
});
await check("all development objectives are distinct and oracle format is admitted", () => {
  assert.equal(tasks.length, 4); assert.equal(new Set(tasks.map(t => t.taskId)).size, 4);
  assert(tasks.every(t => t.family === "DEVELOPMENT_DIAGNOSTIC" && /^\d{1,3}$/.test(t.answer)));
  assert.equal(new Set(tasks.map(t => t.question)).size, 4);
  assert(Object.isFrozen(tasks) && tasks.every(Object.isFrozen));
});
await check("each domain counterbalances the effort-order confound", () => {
  assert.deepEqual([ultraEffortOrder(0), ultraEffortOrder(1)], [["HIGH", "MEDIUM"], ["MEDIUM", "HIGH"]]);
  assert.deepEqual([ultraEffortOrder(2), ultraEffortOrder(3)], [["HIGH", "MEDIUM"], ["MEDIUM", "HIGH"]]);
  for (const index of [-1, 0.5, NaN]) assert.throws(() => ultraEffortOrder(index));
});
await check("separate exact Python algorithms confirm all four host oracles without printing answers", () => {
  const python = process.env.OMEGA_POLYNOMIAL_PYTHON || "python";
  const code = `import json, sys
from fractions import Fraction as F
count=0
def visit(pos,last,total):
 global count
 if pos==18:
  count += total%11==5
  return
 for d in range(3):
  if d!=last: visit(pos+1,d,total+d)
visit(0,-1,0)
# Algebraic power-sum identity, independent of the host recurrence.
power=(9**5-5*9**3+5*9)%997
# Solve the balance equations and normalization by exact row elimination.
matrix=[[F(1,2),-F(1,4),-F(1,5),F(0)],[-F(1,3),F(1,2),-F(1,5),F(0)],[F(1),F(1),F(1),F(1)]]
for i in range(3):
 pivot=next(j for j in range(i,3) if matrix[j][i])
 matrix[i],matrix[pivot]=matrix[pivot],matrix[i]
 divisor=matrix[i][i];matrix[i]=[x/divisor for x in matrix[i]]
 for j in range(3):
  if j!=i:
   scale=matrix[j][i];matrix[j]=[x-scale*y for x,y in zip(matrix[j],matrix[i])]
stationary=matrix[2][-1]
# Substitute the first heat-balance equation into the second, no determinant formula.
node_b=(F(160)+F(200,2))/F(15,2)
node_a=F(200,6)+node_b/F(2)
assert 6*node_a-3*node_b==200 and -3*node_a+9*node_b==160
expected=[str(count%997),str(power),str(stationary.denominator),str(node_a.numerator)]
assert json.loads(sys.stdin.read())==expected
print('INDEPENDENT_FOUR_DEVELOPMENT_ORACLES_PASS')`;
  const result = spawnSync(python, ["-B", "-c", code], {input: JSON.stringify(tasks.map(t => t.answer)), encoding: "utf8", timeout: 15000});
  assert.equal(result.status, 0); assert.equal(result.stdout.trim(), "INDEPENDENT_FOUR_DEVELOPMENT_ORACLES_PASS");
});
const rows: UltraResearchRow[] = [], captured: NvidiaNimCompletionRequest[] = [];
for (const nativeEffort of P.profiles) {
  const task = tasks[1];
  const row = await runUltraResearchArm(task, "CURRENT_NYX_CLOSED_BOOK", {complete: async request => {
    captured.push(request);
    return {decision: "COMPLETED", reason: "SYNTHETIC_DEVELOPMENT_NOT_LIVE", content: JSON.stringify({kind: "REPLY", message: `The answer is: ${task.answer}`}),
      finishReason: "stop", executorAuthorityGranted: false,
      evidence: {evidenceId: `SYNTHETIC-${nativeEffort}`, evidenceClass: "E3", providerId: "DEVELOPMENT",
        endpointOrigin: "https://integrate.api.nvidia.com", model: P.model, requestDigest: "a".repeat(64), responseDigest: "b".repeat(64),
        credentialSourceIdentity: "DEVELOPMENT_NO_SECRET", credentialPersisted: false, promptPersisted: false, networkAttempted: false,
        statusCode: 200, failureCategory: null, retryability: null, providerRequestId: null, finishReason: "stop",
        usage: {promptTokens: 100, completionTokens: nativeEffort === "HIGH" ? 200 : 100, totalTokens: nativeEffort === "HIGH" ? 300 : 200},
        delivery: {policy: "nvidia-capacity/1", requestsPerMinute: 40, scope: "PROCESS_LOCAL_FIXED_NVIDIA_ENDPOINT",
          httpAttempts: 1, rateLimitedResponses: 0, transientUnavailableResponses: 0, timedOutAttempts: 0,
          capacityWaitMs: 0, state: "DELIVERED", notBeforeEpochMs: null, authorityRenewed: false}}} satisfies NvidiaNimCompletionResult;
  }}, "c".repeat(40), Date.now() + 10000, [], nativeEffort);
  rows.push(row);
}
await check("both profiles use real existing NYX session fixture paths without granting tools", () => {
  assert(rows.every(r => r.correct === true && r.cleanup.cleanupVerified && r.cleanup.sourceUnchanged
    && r.authorization.toolsExecuted === 0 && r.authorization.repositoryReadsExecuted === 0));
  assert.equal(captured[0].reasoningEffort, undefined); assert.equal(captured[1].reasoningEffort, "MEDIUM");
  assert.notEqual(captured[0].requestId, captured[1].requestId);
  assert(captured.every(r => r.maxTokens === 16384 && r.reasoningControl === "ULTRA_HOSTED_NATIVE" && r.reasoningBudgetTokens === undefined));
});
await check("same question receives same NYX instructions rather than a new model controller", () => {
  assert.deepEqual(captured[0].messages, captured[1].messages);
});
await check("public evidence omits enumerable answer and envelope hashes for either effort", () => {
  assert(rows.every(r => !('predictionDigest' in r) && !('privateOracleDigest' in r) && !('eventDigests' in r)
    && r.modelEvidence.every(e => e.responseDigest === null)));
});
await check("development summary measures a configuration trade-off without promotion", () => {
  const summary = summarizeUltraEffortDevelopment([tasks[1].taskId], rows);
  assert.equal(summary.bothCorrect, 1); assert.equal(summary.pairs[0].mediumMinusHighReportedTokens, -100);
  assert.equal(summary.cognitivePromotion, false); assert.equal(summary.configurationPromotion, false);
  assert.equal(summary.freshGeneralizationClaim, false);
});
await check("incomplete or unknown usage cannot imply complete development accuracy or known compute", () => {
  const summary = summarizeUltraEffortDevelopment(tasks.map(t => t.taskId), rows);
  assert(summary.profiles.every(p => p.developmentAccuracy === null));
  assert.equal(summary.ungradedOrUnexecutedPairs, 3);
  const unknown = rows.map(r => ({...r, usage: {...r.usage, unknownUsageCalls: 1}}));
  assert.equal(summarizeUltraEffortDevelopment([tasks[1].taskId], unknown).pairs[0].mediumMinusHighReportedTokens, null);
});
await check("wrong completed answers and ungraded truncation remain separate trade-off outcomes", () => {
  const wrongHigh = {...rows[0], state: "REASONING_FAILURE", correct: false};
  const summary = summarizeUltraEffortDevelopment([tasks[1].taskId], [wrongHigh, rows[1]]);
  assert.equal(summary.mediumOnlyCorrect, 1); assert.equal(summary.profiles[0].wrong, 1);
  const truncated = {...rows[1], state: "TRUNCATION", correct: null};
  const partial = summarizeUltraEffortDevelopment([tasks[1].taskId], [rows[0], truncated]);
  assert.equal(partial.mediumOnlyCorrect, 0); assert.equal(partial.highOnlyCorrect, 0);
  assert.equal(partial.profiles[1].developmentAccuracy, null); assert.equal(partial.profiles[1].wrong, 0);
  assert.equal(partial.cognitivePromotion, false); assert.equal(partial.configurationPromotion, false);
});
await check("duplicate profiles mismatched inputs or false acceptance bits fail closed", () => {
  const selected = [tasks[1].taskId];
  assert.throws(() => summarizeUltraEffortDevelopment(selected, [rows[0], rows[0]]));
  assert.throws(() => summarizeUltraEffortDevelopment(selected, [rows[0], {...rows[1], inputDigest: "d".repeat(64)}]));
  assert.throws(() => summarizeUltraEffortDevelopment(selected, [{...rows[0], correct: null}]));
  assert.throws(() => summarizeUltraEffortDevelopment(selected, [{...rows[0], arm: "STANDALONE_ULTRA"}]));
  assert.throws(() => summarizeUltraEffortDevelopment(selected, [{...rows[0], model: "other"} as unknown as UltraResearchRow]));
});
await check("a mixed effort row cannot masquerade as the unchanged architecture comparison", () => {
  assert.throws(() => summarizeUltraResearchPairs([tasks[1].taskId], [rows[1]]));
  assert.equal(summarizeUltraResearchPairs([tasks[1].taskId], [rows[0]]).arms[1].attempted, 1);
});
await check("unsupported effort rejects before any model invocation", async () => {
  let calls = 0;
  await assert.rejects(() => runUltraResearchArm(tasks[0], "CURRENT_NYX_CLOSED_BOOK", {complete: async () => {calls++; throw Error("unreachable");}},
    "c".repeat(40), Date.now() + 10000, [], "LOW" as UltraNativeEffort), /effort_not_authorized/);
  assert.equal(calls, 0);
});
await check("the shared runner distinguishes development costs and does not load benchmark data in development mode", () => {
  const source = readFileSync("scripts/omega/nyx-ultra-research-pair.ts", "utf8");
  assert(source.includes('if (development) selected = ultraEffortDevelopmentTasks();'));
  assert(source.includes('developmentComparison: usage(rows)'));
  assert(source.includes('summarizeUltraEffortDevelopment(selected.map(t => t.taskId), rows)'));
});
console.log(`OMEGA_ULTRA_EFFORT_DEVELOPMENT_TEST_SUMMARY passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;

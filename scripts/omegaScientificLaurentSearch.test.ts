import assert from "node:assert/strict";
import {ScientificModelSession, type ScientificModelTask} from "../src/lib/codelab/research/scientificModelGeneration";
import {SCIENTIFIC_SEARCH_POLICY, snapshotScientificSearchSpec, type ScientificSearchSpec} from "../src/lib/codelab/research/scientificModelSearch";
import {exactScalar} from "../src/lib/codelab/research/exactLinearFit";
import {scientificFitReplay, scientificModelReplay, type ScientificReplayCost} from "./omega/benchmarks/scientific-model-replay";
import {theoryDigest} from "../src/lib/codelab/research/theoryContracts";
import {runNyxScientificModelGeneration} from "../src/lib/codelab/research/nyxQuantitativeReasoning";
import type {NvidiaNimCompletionResult} from "../src/lib/codelab/model/nvidiaNimProvider";

let passed = 0, failed = 0;
function check(label: string, fn: () => void) {
  try {fn(); passed++;} catch (e) {failed++; console.error(`FAIL ${label}: ${e instanceof Error ? e.message : "UNKNOWN"}`);}
}
const q = (op: "ADD" | "SUB" | "MUL" | "DIV", a: string, b: string) => exactScalar(op, a, b, () => {});
const at = Date.now(), candidate = "a".repeat(40);
const policy = Object.freeze({maxWorkUnits: 300000, maxNativeElapsedMs: 3000, maxRequests: 8, expiresAtEpochMs: at + 120000});
const spec: ScientificSearchSpec = {schemaVersion: 1, nonzeroConstantId: "one", maxDegree: 3,
  includeReciprocals: true, allowDenominatorTerms: true, maxCoefficients: 4,
  maxCandidates: 256, maxModels: 3, strategy: "EVIDENCE_LAURENT_MODULAR"};
type Law = (values: readonly string[]) => string;
function task(law: Law, calibration: readonly (readonly string[])[], prospective: readonly (readonly string[])[], variables = ["u", "v"]): ScientificModelTask {
  const observations = calibration.map((values, i) => ({pointId: `P${i}`, inputs: variables.map((id, j) => ({id, value: values[j]})),
    output: law(values), evidenceRef: `E${i}`}));
  return {schemaVersion: 1, variables, constants: [{id: "one", value: "1"}], observations,
    objective: {schemaVersion: 1, researchId: "LAURENT-DEVELOPMENT", objective: "Infer competing bounded rational response hypotheses.",
      domain: "SCIENCE", candidateBinding: candidate, scope: ["lab/isolated"], admittedEvidence: observations.map(o => ({
        evidenceId: o.evidenceRef, evidenceClass: "E3", kind: "OBSERVATION", summary: "Synthetic exact calibration, not a physical observation.",
        contentDigest: theoryDigest({pointId: o.pointId, inputs: o.inputs, output: o.output}), provenanceRoot: o.evidenceRef, freshnessDependencies: [`CANDIDATE:${candidate}`],
        observedAtEpochMs: at, candidateBinding: candidate, grantsAuthority: false})),
      successCriteria: ["Retain original independent fitting and admission; do not claim scientific truth."], expiryEpochMs: at + 120000},
    experiments: prospective.map((values, i) => ({experimentId: `Next${i}`, toolId: `MEASURE-next${i}`,
      question: "Unknown prospective response.", inputs: variables.map((id, j) => ({id, value: values[j]})),
      costUnits: 1, authority: "RUN_TEST_IN_SANDBOX", scope: ["lab/isolated"], mutatesCandidate: false}))};
}
const session = (t: ScientificModelTask, overrides: {maxWorkUnits?: number} = {}) =>
  ScientificModelSession.create(t, {...policy, ...overrides}, () => at, {structureSearch: true});
const search = (s: ScientificModelSession, overrides: Partial<ScientificSearchSpec> = {}) =>
  s.search({schemaVersion: 1, operation: "SEARCH_SCIENTIFIC_MODELS", taskDigest: s.taskDigest, spec: {...spec, ...overrides}});
function exercise(t: ScientificModelTask, law: Law, strategy: ScientificSearchSpec["strategy"], maxModels = 3) {
  const s = session(t), replay: ScientificReplayCost[] = [], started = performance.now();
  const found = search(s, {strategy, maxModels}), searchUsage = s.usage();
  const admissions: {rank: number; prospectiveCorrect: boolean}[] = [];
  if (found.state === "CANDIDATES_NOT_ADMITTED") for (const c of found.candidates) {
    if (s.usage().remainingRequests < 2) break;
    const fitted = s.fit({schemaVersion: 1, operation: "FIT_SCIENTIFIC_MODEL", taskDigest: s.taskDigest, structure: c.structure},
      scientificFitReplay(process.env.OMEGA_POLYNOMIAL_PYTHON ?? "python", 5000, c => replay.push(c)));
    if (fitted.state !== "FITTED_CANDIDATE_NOT_ADMITTED") continue;
    const admitted = s.propose({schemaVersion: 1, operation: "PROPOSE_SCIENTIFIC_MODEL", taskDigest: s.taskDigest, draft: fitted.fit.draft},
      scientificModelReplay(process.env.OMEGA_POLYNOMIAL_PYTHON ?? "python", 5000, c => replay.push(c)));
    if (admitted.state === "ADMITTED_PREDICTIONS_NOT_SCIENTIFIC_TRUTH") admissions.push({rank: c.fit.linear.rank,
      prospectiveCorrect: s.inspect(admitted.model).predictions.filter(p => p.pointId.startsWith("Next"))
        .every(p => p.value === law(t.variables.map(id => p.inputs.find(v => v.id === id)!.value)))});
  }
  const usage = s.usage(); s.revoke();
  check("All strategies preserve original native work/time/request bounds", () => {
    assert(usage.workUnits <= policy.maxWorkUnits); assert(usage.requests <= policy.maxRequests);
    assert(usage.nativeElapsedMs <= policy.maxNativeElapsedMs);
  });
  return {strategy, maxModels, taskDigest: s.taskDigest, state: found.state, reason: "reason" in found ? found.reason : null,
    searchWork: searchUsage.workUnits, totalWork: usage.workUnits, supports: usage.searchSupports,
    requests: usage.requests, nativeMs: usage.nativeElapsedMs, admissions,
    grammar: "grammar" in found ? found.grammar : null, independentCalls: replay.length,
    independentMs: replay.reduce((n, c) => n + c.elapsedMs, 0),
    independentCpuMs: replay.reduce((n, c) => n + (c.childCpuMs ?? 0), 0),
    unknownIndependentCpu: replay.filter(c => c.childCpuMs === null).length,
    elapsedMs: performance.now() - started};
}

check("New strategy remains an explicitly parsed opt-in", () => {
  assert.equal(snapshotScientificSearchSpec(spec).strategy, "EVIDENCE_LAURENT_MODULAR");
  assert.throws(() => snapshotScientificSearchSpec({...spec, strategy: "UNBOUNDED_LAURENT"}));
});
const calibration = [["2/3", "5/4"], ["7/5", "3/2"], ["11/7", "9/5"], ["13/9", "17/6"]];
const prospective = [["19/11", "23/13"], ["29/17", "31/19"], ["37/23", "41/29"]];
const development = [
  ["forward_ratio_offset", ([u, v]: readonly string[]) => q("ADD", q("MUL", "2/19", q("DIV", u, v)), "3/31")],
  ["reverse_ratio_offset", ([u, v]: readonly string[]) => q("SUB", q("MUL", "5/23", q("DIV", v, u)), "7/37")],
] as const;
const rows = [];
for (const [name, law] of development) for (const strategy of ["EVIDENCE_MODULAR", "EVIDENCE_LAURENT_MODULAR"] as const)
  rows.push({name, ...exercise(task(law, calibration, prospective), law, strategy)});
for (const [name, law] of development)
  rows.push({name, ...exercise(task(law, calibration, prospective), law, "EVIDENCE_LAURENT_MODULAR", 1)});
console.log("OMEGA_LAURENT_SEARCH_DEVELOPMENT " + JSON.stringify({scope: "DEVELOPMENT_ONLY", liveModelCalls: 0, rows}));
check("Distinct-model search retains the two reproduced development repairs without reducing its target", () => {
  const corrected = rows.filter(r => r.strategy === "EVIDENCE_LAURENT_MODULAR" && r.maxModels === 3);
  assert.equal(corrected.length, 2);
  assert(corrected.every(r => r.admissions.length === 3 && r.admissions[0].rank === 2 && r.admissions[0].prospectiveCorrect));
  assert(corrected.every(r => (r.grammar?.duplicateExactWitnesses ?? 0) > 0));
});

// Frozen BEFORE first execution. Newly composed synthetic cases, NOT sealed
// benchmark questions or independent task design. No post-outcome rewrites.
const transferCalibration = [["5/7", "11/8"], ["13/9", "17/10"], ["19/12", "23/14"], ["29/15", "31/16"]];
const transferProspective = [["37/18", "41/19"], ["43/20", "47/21"], ["53/22", "59/23"]];
const transferCases = [
  ["scaled_relative_load", ["flow", "area"], ([u, v]: readonly string[]) =>
    q("ADD", q("ADD", q("MUL", "1/7", q("DIV", u, v)), q("MUL", "2/11", v)), "3/13")],
  ["reciprocal_balance", ["u", "v"], ([u, v]: readonly string[]) =>
    q("ADD", q("ADD", q("MUL", "5/17", q("DIV", v, u)), q("DIV", "7/19", u)), "11/23")],
  ["bidirectional_ratio", ["x", "y"], ([u, v]: readonly string[]) =>
    q("ADD", q("ADD", q("MUL", "13/29", q("DIV", u, v)), q("MUL", "17/31", q("DIV", v, u))), "19/37")],
  ["quadratic_relative_response", ["u", "v"], ([u, v]: readonly string[]) =>
    q("ADD", q("MUL", "23/41", q("DIV", q("MUL", u, u), v)), "29/43")],
] as const;
const transferFreeze = {calibration: transferCalibration, prospective: transferProspective,
  cases: transferCases.map(([name, variables]) => ({name, variables})), maxWorkUnits: 300000,
  maxNativeElapsedMs: 3000, maxRequests: 8, maxCandidates: 256, maxModels: 3, maxCoefficients: 4,
  privateOrIndependentDesign: false, liveModelCalls: 0, equalRealizedTotalComputeClaim: false};
const transferRows = [];
for (const [i, [name, variables, law]] of transferCases.entries()) {
  const t = task(law, transferCalibration, transferProspective, [...variables]);
  const arms = ["EVIDENCE_MODULAR", "EVIDENCE_LAURENT_MODULAR"] as const;
  for (let k = 0; k < arms.length; k++) {
    const row = exercise(t, law, arms[(i + k) % arms.length]);
    transferRows.push({name, ...row, acceptedLeadingPrediction: row.admissions.length >= 2 && row.admissions[0].prospectiveCorrect});
  }
}
console.log("OMEGA_LAURENT_SEARCH_TRANSFER " + JSON.stringify({freeze: transferFreeze, rows: transferRows}));

check("Three-variable grammar retains at most 58 evaluated atoms from a bounded descriptor pool", () => {
  const t = task(() => "1", [["1", "2", "3"], ["2", "3", "5"], ["3", "5", "7"]], [["5", "7", "11"]], ["a", "b", "c"]);
  const s = session(t), r = search(s, {maxModels: 1});
  assert.equal(r.state, "CANDIDATES_NOT_ADMITTED");
  if (r.state !== "CANDIDATES_NOT_ADMITTED") throw Error("missing_grammar_result");
  assert.equal(r.grammar?.proposedAtoms, SCIENTIFIC_SEARCH_POLICY.maxLaurentDescriptors);
  assert.equal(r.grammar.retainedAtoms, SCIENTIFIC_SEARCH_POLICY.maxAtoms);
  assert.equal(r.grammar.prunedAtoms, 24); assert(r.atoms <= 58);
  assert.equal(s.usage().models, 0); assert.equal(r.grantsAuthority, false); assert.equal(r.scientificTruthEstablished, false); s.revoke();
});
check("Reciprocal opt-out removes all mixed ratios rather than silently ignoring the request", () => {
  const t = task(([u]) => u, calibration, prospective), s = session(t), r = search(s, {includeReciprocals: false, maxModels: 1});
  assert.equal(r.state, "CANDIDATES_NOT_ADMITTED");
  if (r.state !== "CANDIDATES_NOT_ADMITTED") throw Error("missing_candidate");
  assert.equal(r.grammar?.proposedAtoms, 19);
  assert(r.candidates.every(c => c.structure.basis.outputs.every(o => !o.expression.includes("/")))); s.revoke();
});
check("A pole cannot erase unrelated legal linear atoms", () => {
  const t = task(([u]) => u, [["0", "1"], ["1", "0"], ["2", "3"], ["3", "5"]], [["4", "7"]]);
  const s = session(t), r = search(s, {maxModels: 1}); assert.equal(r.state, "CANDIDATES_NOT_ADMITTED");
  if (r.state !== "CANDIDATES_NOT_ADMITTED") throw Error("missing_linear_candidate");
  assert(r.domainBlockedAtoms > 0); assert.equal(r.candidates[0].fit.linear.rank, 1); s.revoke();
});
check("Work exhaustion and revocation remain fail-closed", () => {
  const t = task(([u]) => u, calibration, prospective), s = session(t, {maxWorkUnits: 2000}), r = search(s);
  assert.equal(r.state, "INSUFFICIENT_EVIDENCE"); assert("reason" in r && r.reason === "SEARCH_RESOURCE_BUDGET");
  s.revoke(); assert.throws(() => search(s));
});
// POST_TRANSFER_REGRESSION_BEGIN: additions after the preserved first outcomes.
check("Preserve the measured transfer gain; do not require the fourth case to keep failing", () => {
  const corrected = transferRows.filter(r => r.strategy === "EVIDENCE_LAURENT_MODULAR");
  assert.equal(corrected.length, 4); assert(corrected.filter(r => r.acceptedLeadingPrediction).length >= 3);
});
for (const variables of [["pressure", "reference"], ["SearchCoefficient0", "response_input"]]) {
  check("Renaming bindings cannot hide a ratio or collide with generated coefficient identities", () => {
    const law = development[0][1], row = exercise(task(law, calibration, prospective, variables), law, "EVIDENCE_LAURENT_MODULAR", 1);
    assert(row.admissions[0]?.prospectiveCorrect); assert.equal(row.admissions[0].rank, 2);
  });
}
check("A non-unit original constant remains explicit rather than silently becoming literal one", () => {
  const law = development[0][1], t = {...task(law, calibration, prospective), constants: [{id: "one", value: "7"}]};
  const row = exercise(t, law, "EVIDENCE_LAURENT_MODULAR", 1); assert(row.admissions[0]?.prospectiveCorrect);
});
check("Degree one cannot create a mixed degree-two ratio", () => {
  const s = session(task(([u]) => u, calibration, prospective)), r = search(s, {maxDegree: 1, maxModels: 1});
  assert.equal(r.state, "CANDIDATES_NOT_ADMITTED");
  if (r.state !== "CANDIDATES_NOT_ADMITTED") throw Error("missing_degree_one_result");
  assert.equal(r.grammar?.proposedAtoms, 7); s.revoke();
});
check("The new grammar cannot enable a capability withheld by its host", () => {
  const s = ScientificModelSession.create(task(development[0][1], calibration, prospective), policy, () => at);
  const r = search(s); assert.equal(r.state, "REJECTED"); assert("reason" in r && r.reason === "SEARCH_NOT_ENABLED"); s.revoke();
});
// Typed protocol composition uses a TEST DOUBLE. It is not live cognition/E4.
const bridge = session(task(development[0][1], calibration, prospective)); let bridgeCalls = 0;
const composed = await runNyxScientificModelGeneration({session: bridge, maxCalls: 1, maxOutputTokens: 1024,
  deadlineEpochMs: at + 60000, now: () => at,
  nativeSearch: {verify: scientificFitReplay(process.env.OMEGA_POLYNOMIAL_PYTHON ?? "python")},
  verify: scientificModelReplay(process.env.OMEGA_POLYNOMIAL_PYTHON ?? "python"), complete: async request => {
    bridgeCalls++; const value = {schemaVersion: 1, search: spec};
    return {decision: "COMPLETED", reason: "TEST_DOUBLE_NOT_LIVE", executorAuthorityGranted: false,
      content: JSON.stringify(value), finishReason: "stop", evidence: {evidenceId: request.requestId, evidenceClass: "E4",
        providerId: "TEST_DOUBLE_NOT_LIVE", endpointOrigin: "https://integrate.api.nvidia.com", model: "TEST_DOUBLE_NOT_LIVE",
        requestDigest: theoryDigest(request), responseDigest: theoryDigest(value), credentialSourceIdentity: "NONE",
        credentialPersisted: false, promptPersisted: false, networkAttempted: false, statusCode: 200, failureCategory: null,
        retryability: null, providerRequestId: null, finishReason: "stop", usage: {promptTokens: 0, completionTokens: 0, totalTokens: 0}}} satisfies NvidiaNimCompletionResult;
  }});
check("Existing typed NYX search composes with independent fits and ordinary admissions without a second stack", () => {
  assert.equal(bridgeCalls, 1); assert(composed.competingModelsAdmitted); assert(composed.nativeUsage.models >= 2);
  assert.equal(composed.authorityGranted, false); assert.equal(composed.scientificTruthEstablished, false);
  assert.equal(composed.cognitiveGainDemonstrated, false); assert.equal(composed.generalShell, false); assert.equal(composed.generalNetwork, false);
});
bridge.revoke();
// POST_TRANSFER_REGRESSION_END
console.log(`OMEGA_SCIENTIFIC_LAURENT_SEARCH_TEST_SUMMARY passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;

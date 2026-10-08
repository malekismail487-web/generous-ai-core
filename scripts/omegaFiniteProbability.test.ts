import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finiteProbabilityDiagnostic, finiteProbabilitySchema, lowerFiniteProbability,
  FINITE_PROBABILITY_POLICY, type FiniteProbabilityModel } from "../src/lib/codelab/research/finiteProbabilityCompiler";
import { BoundedReasoningSession } from "../src/lib/codelab/research/boundedReasoningWorkbench";
import type { QuantitativeProblem } from "../src/lib/codelab/research/exactQuantitativeDerivation";
import { theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import { NyxChatSession } from "../src/lib/codelab/cli/nyxChatSession";
import { parseNyxChatAction } from "../src/lib/codelab/cli/nyxChatProtocol";
import { ReadOnlyRepositoryExecutor } from "../src/lib/codelab/executor/readOnlyExecutor";
import { NvidiaNimProvider, type NvidiaNimCompletionRequest } from "../src/lib/codelab/model/nvidiaNimProvider";
import { probabilityTransferTasks } from "./omega/benchmarks/probabilityTransferTasks";
import { captureProbabilityReplay, computationNativeAccounting } from "./omega/nyx-computation-transfer";

let passed = 0, failed = 0;
function check(condition: unknown, name: string) { if (condition) passed++; else { failed++; console.error(`x ${name}`); } }
function rejects(body: () => unknown, code?: string) { try { body(); return false; } catch (e) { return code ? finiteProbabilityDiagnostic(e) === code : true; } }
const problem: QuantitativeProblem = { kind: "EXACT_QUANTITATIVE_DERIVATION", constants:
  Object.entries({ zero: "0", one: "1", base: "1/5", low: "1/10", high: "4/5" }).map(([id, value]) => ({ id, value })) };
const event = (variable: string, value = true) => ({ variable, value });
const model: FiniteProbabilityModel = { schemaVersion: 3, semantics: "MARKOVIAN_BINARY_DAG",
  variables: [{ id: "A", parents: [], probabilityTrue: ["base"] }, { id: "B", parents: ["A"], probabilityTrue: ["low", "high"] }],
  queries: [{ id: "q", event: [event("A")], given: [event("B")], interventions: [] }],
  outputs: [{ label: "quantity", op: "IDENTITY", left: "q", right: "q" }] };
function solve(p = problem, m: unknown = model, maximum = 50000) {
  const session = BoundedReasoningSession.create(p, { maxWorkUnits: maximum, maxElapsedMs: 2000, maxRequests: 1, expiresAtEpochMs: Date.now() + 5000 });
  try { return session.analyze({ schemaVersion: 1, operation: "ANALYZE_FINITE_PROBLEM", problemDigest: session.problemDigest, program: m }); }
  finally { session.revoke(); }
}
const first = solve();
check(first.status === "CONSTRUCTED" && first.payload?.outputs?.[0]?.value === "2/3", "exact Bayes model lowers to existing executor");
check(first.loweringVersion === FINITE_PROBABILITY_POLICY.version && first.grantsAuthority === false
  && first.acceptanceRequiresIndependentVerifier && first.payload?.mathematicalModelIndependentlyVerified === false,
  "compilation and execution do not certify the model or grant authority");
const intervention = { ...model, queries: [{ ...model.queries[0], given: [], interventions: [event("B")] }] };
check(solve(problem, intervention).payload?.outputs?.[0]?.value === "1/5", "intervention is not observational conditioning");
const contradiction = { ...model, queries: [{ ...model.queries[0], interventions: [event("B", false)] }] };
check(solve(problem, contradiction).status === "INSUFFICIENT_EVIDENCE", "contradictory evidence and intervention cannot produce a probability");
const cancelled = { ...contradiction, outputs: [{ label: "quantity", op: "SUB", left: "q", right: "q" }] };
check(solve(problem, cancelled).status === "INSUFFICIENT_EVIDENCE", "algebraic cancellation cannot hide an undefined conditional");
check(solve(problem, { ...model, outputs: [{ label: "quantity", op: "SUB", left: "q", right: "q" }] }).payload?.outputs?.[0]?.value === "0",
  "defined probability contrast can equal zero");
check(solve(problem, model, 1).status === "BUDGET_EXHAUSTED", "compilation spends the original shared work budget");
const boundedSession = BoundedReasoningSession.create(problem, { maxWorkUnits: 50000, maxElapsedMs: 2000, maxRequests: 1, expiresAtEpochMs: Date.now() + 10000 });
const boundedRequest = { schemaVersion: 1, operation: "ANALYZE_FINITE_PROBLEM", problemDigest: boundedSession.problemDigest, program: model };
check(rejects(() => boundedSession.analyze({ ...boundedRequest, problemDigest: "0".repeat(64) })), "probabilistic request cannot change its prebound problem");
boundedSession.analyze(boundedRequest);
check(rejects(() => boundedSession.analyze(boundedRequest)), "probabilistic compilation cannot reset the original request budget");
boundedSession.revoke();
check(rejects(() => boundedSession.analyze(boundedRequest)), "revocation remains effective for the new representation");
const rejectedSession = BoundedReasoningSession.create(problem, { maxWorkUnits: 50000, maxElapsedMs: 2000, maxRequests: 1, expiresAtEpochMs: Date.now() + 10000 });
check(rejects(() => rejectedSession.analyze({ ...boundedRequest, program: { ...model, queries: [model.queries[0], model.queries[0]] } }), "QUERY_DUPLICATE"),
  "reproduce a generic query identity collision without a frozen task");
const rejectedUsage = computationNativeAccounting(rejectedSession, 0, 0);
check(rejectedUsage.workUnits > 0 && rejectedUsage.requests === 1 && rejectedUsage.elapsedMs === null,
  "rejected compilation is charged and unreturned native elapsed time remains unknown");
rejectedSession.revoke();
check(computationNativeAccounting(rejectedSession, 0, 0).workUnits === rejectedUsage.workUnits,
  "revocation cannot erase consumed work from evidence");
check(computationNativeAccounting(undefined, 0, 0).requests === 0, "proposal-only mode invents no native work");
const accountedSession = BoundedReasoningSession.create(problem, { maxWorkUnits: 50000, maxElapsedMs: 2000, maxRequests: 1, expiresAtEpochMs: Date.now() + 10000 });
const accountedResult = accountedSession.analyze(boundedRequest), accountedUsage = computationNativeAccounting(accountedSession, accountedResult.elapsedMs, 1);
check(accountedUsage.workUnits === accountedResult.workUnits && accountedUsage.requests === 1 && accountedUsage.elapsedMs === accountedResult.elapsedMs,
  "successful analysis counters agree with returned native evidence");
accountedSession.revoke();
let clock = 100;
const expiring = BoundedReasoningSession.create(problem, { maxWorkUnits: 50000, maxElapsedMs: 1, maxRequests: 1, expiresAtEpochMs: 10000 }, () => clock++);
check(expiring.analyze({ ...boundedRequest, problemDigest: expiring.problemDigest }).status === "BUDGET_EXHAUSTED",
  "time spent in compilation cannot evade the original native time limit");
expiring.revoke();
const invalid: [unknown, string][] = [
  [{ ...model, schemaVersion: 4 }, "SHAPE"], [{ ...model, semantics: "UNKNOWN_CAUSES" }, "SHAPE"],
  [{ ...model, variables: [] }, "SHAPE"], [{ ...model, variables: Array(9).fill(model.variables[0]) }, "SHAPE"],
  [{ ...model, variables: [model.variables[0], model.variables[0]] }, "VARIABLE"],
  [{ ...model, variables: [{ ...model.variables[0], parents: ["B"] }, model.variables[1]] }, "PARENTS"],
  [{ ...model, variables: [{ ...model.variables[0], parents: ["A"] }] }, "PARENTS"],
  [{ ...model, variables: [model.variables[0], { ...model.variables[1], parents: ["A", "A"] }] }, "PARENTS"],
  [{ ...model, variables: [model.variables[0], { ...model.variables[1], probabilityTrue: ["low"] }] }, "TABLE"],
  [{ ...model, variables: [{ ...model.variables[0], probabilityTrue: ["invented"] }] }, "PROBABILITY"],
  [{ ...model, queries: [model.queries[0], model.queries[0]] }, "QUERY_DUPLICATE"],
  [{ ...model, queries: [{ ...model.queries[0], id: "not an identifier" }] }, "QUERY_ID"],
  [{ ...model, queries: [{ id: "q", event: model.queries[0].event, given: [] }] }, "QUERY_SHAPE"],
  [{ ...model, queries: [{ ...model.queries[0], event: [] }] }, "ASSIGNMENT"],
  [{ ...model, queries: [{ ...model.queries[0], given: [event("B"), event("B", false)] }] }, "ASSIGNMENT"],
  [{ ...model, queries: [{ ...model.queries[0], event: [event("X")] }] }, "ASSIGNMENT"],
  [{ ...model, queries: [{ ...model.queries[0], oracle: "secret" }] }, "QUERY_SHAPE"],
  [{ ...model, outputs: [{ ...model.outputs[0], right: "missing" }] }, "OUTPUT"],
  [{ ...model, outputs: [model.outputs[0], model.outputs[0]] }, "OUTPUT"],
  [{ ...model, shell: "not executable" }, "SHAPE"],
];
for (const [value, code] of invalid) check(rejects(() => lowerFiniteProbability(problem, value), code), `reject finite model ${code}`);
for (const value of ["-1/10", "11/10"]) {
  const p = { ...problem, constants: problem.constants.map(c => c.id === "base" ? { ...c, value } : c) };
  check(rejects(() => lowerFiniteProbability(p, model), "PROBABILITY"), "table probabilities stay within zero and one");
}
let accessor = 0;
const hostile = Object.defineProperty({ ...model }, "queries", { enumerable: true, get: () => { accessor++; return model.queries; } });
check(rejects(() => lowerFiniteProbability(problem, hostile), "NON_DATA") && accessor === 0, "accessors rejected without invocation");
const sparse = { ...model, variables: new Array(2) };
check(rejects(() => lowerFiniteProbability(problem, sparse), "NON_DATA"), "sparse arrays are not model data");
const circular: Record<string, unknown> = { ...model }; circular.extra = circular;
check(rejects(() => lowerFiniteProbability(problem, circular), "NON_DATA"), "cycles fail closed");
const large = { ...model, variables: Array.from({ length: 8 }, (_, i) => ({ id: `V${i}`, parents: [], probabilityTrue: ["base"] })),
  queries: [{ id: "q", event: [event("V0")], given: [], interventions: [] }] };
check(rejects(() => lowerFiniteProbability(problem, large), "STEP_BOUND"), "exponential inference never widens the existing 64-step envelope");
const colliding = { ...problem, constants: [...problem.constants, { id: "prob0", value: "7/10" }] };
check(solve(colliding).payload?.outputs?.[0]?.value === "2/3", "register allocation cannot shadow immutable constants");
const Ajv = createRequire(import.meta.url)("ajv");
check(new Ajv().compile(finiteProbabilitySchema(["quantity"], problem.constants.map(c => c.id)))(model), "independent schema validator accepts well formed probability representation");
check(parseNyxChatAction(JSON.stringify({ kind: "DERIVE_QUANTITIES", problemDigest: theoryDigest(problem), program: model })).action?.kind === "DERIVE_QUANTITIES",
  "typed recognition is not an execution grant");
const proposal = JSON.stringify({ kind: "DERIVE_QUANTITIES", problemDigest: theoryDigest(problem), program: model });
const observation = JSON.stringify({ omegaObservation: "CONSTRUCTED", analysis: first, privateReasoning: "DO_NOT_CAPTURE", answer: "DO_NOT_CAPTURE" });
const replay = captureProbabilityReplay(problem, proposal, observation);
check(replay?.outputs?.[0]?.value === "2/3" && !JSON.stringify(replay).includes("DO_NOT_CAPTURE"), "native probability replay stores only bound public model and outputs");
check(captureProbabilityReplay(problem, proposal, JSON.stringify({ omegaObservation: "CONSTRUCTED", analysis: { ...first, executedProgramDigest: "0".repeat(64) } })) === null,
  "stale or changed lowered identity cannot become a replay capsule");
accessor = 0;
const hostileProblem = Object.defineProperty({ ...problem }, "constants", { enumerable: true, get: () => { accessor++; return problem.constants; } });
check(captureProbabilityReplay(hostileProblem, proposal, observation) === null && accessor === 0, "capture does not invoke hostile input accessors");

// Independent Fraction full-joint oracle; no compiler helper or evaluator answer is in cognition.
let seed = 190873;
const random = (max: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
const cases = [];
for (let i = 0; i < 200; i++) {
  const p: QuantitativeProblem = { kind: "EXACT_QUANTITATIVE_DERIVATION", constants: [{ id: "zero", value: "0" }, { id: "one", value: "1" },
    ...Array.from({ length: 7 }, (_, j) => ({ id: `p${j}`, value: `${1 + random(8)}/10` }))] };
  const m: FiniteProbabilityModel = { schemaVersion: 3, semantics: "MARKOVIAN_BINARY_DAG", variables: [
    { id: "X", parents: [], probabilityTrue: ["p0"] }, { id: "Y", parents: ["X"], probabilityTrue: ["p1", "p2"] },
    { id: "Z", parents: i % 2 ? ["Y", "X"] : ["X", "Y"], probabilityTrue: ["p3", "p4", "p5", "p6"] }],
    queries: [{ id: "q", event: [event(i % 3 ? "X" : "Y", !!(i % 2))], given: [event("Z", !!(i % 5))],
      interventions: i % 4 === 0 ? [event("Y", !!(i % 7))] : [] }], outputs: model.outputs };
  const result = solve(p, m);
  cases.push({ problem: p, model: m, status: result.status, outputs: result.payload?.outputs });
}
const development = probabilityTransferTasks("DEVELOPMENT"), transfer = probabilityTransferTasks("TRANSFER");
check(development.length === 4 && transfer.length === 4 && development.every((t, i) =>
  theoryDigest(t.referenceModel.variables.map(v => v.parents)) !== theoryDigest(transfer[i].referenceModel.variables.map(v => v.parents))),
  "transfer changes dependency structure rather than only numerical parameters");
for (const task of [...development, ...transfer]) {
  const result = solve(task.problem, task.referenceModel);
  check(result.payload?.outputs?.[0]?.value === task.expectedQuantity, `reference modeling task independently agrees ${task.taskId}`);
  cases.push({ problem: task.problem, model: task.referenceModel, status: result.status, outputs: result.payload?.outputs });
}
const python = process.env.OMEGA_PYTHON ?? (process.platform === "win32"
  ? "C:/Users/loka3/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe" : "python3");
try {
  const oracle = JSON.parse(execFileSync(python, ["-B", "scripts/omega/benchmarks/check-finite-probability.py"],
    { input: JSON.stringify(cases), encoding: "utf8", timeout: 20000 }));
  check(oracle.agreement === true && oracle.cases === 208, "200 generated models and eight frozen objectives agree with separate-language full-joint oracle");
} catch { check(false, "independent oracle must actually execute and agree"); }

const root = await mkdtemp(join(tmpdir(), "nyx-probability-test-"));
try {
  for (const representation of [true, false]) {
    const reader = await ReadOnlyRepositoryExecutor.create({ executorId: "P-R1", tokenId: "P-TOKEN", repositoryRoot: root, resourceScopes: ["."],
      issuedAtEpochMs: Date.now() - 1, expiresAtEpochMs: Date.now() + 10000, constraints: { maxFileBytes: 1, maxDirectoryEntries: 1, allowedExtensions: [".txt"] },
      issuer: "P-TEST", auditIdentity: "P-TEST" });
    reader.terminate(Date.now(), "NO_FILE_AUTHORITY");
    const tool = BoundedReasoningSession.create(problem, { maxWorkUnits: 50000, maxElapsedMs: 1000, maxRequests: 1, expiresAtEpochMs: Date.now() + 10000 });
    const requests: NvidiaNimCompletionRequest[] = []; let calls = 0;
    const outputs = [JSON.stringify({ kind: "DERIVE_QUANTITIES", problemDigest: theoryDigest(problem), program: model }), JSON.stringify({ kind: "REPLY", message: "The answer is: 1" })];
    const mock = NvidiaNimProvider.create({ providerId: "P-TEST", model: "nvidia/nemotron-3-super-120b-a12b", authorityMode: "TEST_DOUBLE_ONLY",
      credentialSource: { sourceIdentity: "test-only", read: () => "not-a-real-credential" }, maxPromptBytes: 64000, maxOutputTokens: 4096, timeoutMs: 5000,
      transport: async () => new Response(JSON.stringify({ choices: [{ message: { content: outputs[calls++] ?? "{}" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 } }), { status: 200 }) });
    const session = NyxChatSession.create({ sessionId: "P-TEST", reader, candidateWriter: null, editablePaths: [], maxCandidatesPerTurn: 0,
      maxModelCallsPerTurn: 2, maxTurnMs: 10000, maxOutputTokens: 2048, derivationSession: tool,
      actionContract: { kind: "DERIVE_THEN_REPLY", problem, outputLabels: ["quantity"] },
      ...(representation ? { derivationRepresentation: "FINITE_PROBABILITY_MODEL" as const } : {}),
      model: { complete: request => { requests.push(request); return mock.complete(request); } } });
    try {
      const result = await session.turn("Compute the conditional probability from the given data.");
      const observations = result.events.filter(e => e.eventType === "ANALYSIS");
      check(representation ? observations.some(e => e.outcome === "CONSTRUCTED") : observations.length === 0
        && result.events.some(e => e.outcome === "derivation_representation_not_authorized"), "probability representation is opt-in and independent authorization remains enforced");
      if (representation) check(JSON.parse(requests[1].messages.at(-1)!.content).analysis.payload.outputs[0].value === "2/3", "live-chat composition returns actual bounded arithmetic evidence");
      check(result.sourceRepositoryMutated === false && result.broaderAuthorityGranted === false, "no file shell network or production authority appears");
    } finally { session.dispose(); tool.revoke(); }
  }
} finally { await rm(root, { recursive: true, force: true }); }
console.log(`Omega finite probability tests - passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;

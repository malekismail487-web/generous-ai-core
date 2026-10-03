import { publicGridFailureWitness } from "./omega/benchmarks/publicFailureWitness";
import { arcRepositoryFiles } from "./omega/benchmarks/nyxArcAdapter";
import type { NyxRepairHypothesis } from "../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";
import { R3BenchmarkRepositorySession } from "./omega/benchmarks/r3RepositorySession";
import { theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import { matchedObservedAttempts, type AttemptRecord } from "./omega/benchmarks/campaign";
import { zeroUsage } from "./omega/benchmarks/contracts";

let passed = 0, failed = 0;
const check = (value: unknown, label: string) => { if (value) passed++; else { failed++; console.error(`FAIL ${label}`); } };
const rejects = (body: () => unknown, label: string) => { try { body(); check(false, label); } catch { check(true, label); } };
for (const [rows, columns] of [[30, 30], [27, 25]]) {
  const expected = Array.from({ length: rows }, () => Array(columns).fill(1) as number[]);
  const bad = structuredClone(expected); bad[rows - 1][columns - 1] = 8;
  const witness = publicGridFailureWitness(0, expected, { attempt_1: bad, attempt_2: bad }, true);
  check(JSON.stringify(witness).length < 1000, "large grid witness survives unchanged observation ceiling");
  check(witness.attempt_1.firstDifference?.row === rows - 1 && witness.attempt_1.firstDifference?.column === columns - 1,
    "tail mismatch has exact independently calculated coordinate");
  check(witness.attempt_1.firstDifference?.expected === 1 && witness.attempt_1.firstDifference?.actual === 8,
    "actual and expected remain distinguishable");
  check(!witness.acceptanceAuthority && witness.provenance === "PUBLIC_DEMONSTRATION_ONLY", "witness is no authority");
  const raw = { train: [{ input: expected, output: expected }], test: [{ input: expected }] };
  const brokenSource = 'export function transform(input) {\n  const output = input.map(row => [...row]);\n'
    + '  output[output.length - 1][output[0].length - 1] = 8;\n  return {attempt_1: output, attempt_2: output};\n}\n';
  const observations: string[] = [];
  for (const mode of ["FULL_DUMP", "COMPACT_WITNESS"] as const) {
    const files = { ...arcRepositoryFiles(raw, mode), "src/transform.mjs": brokenSource };
    const session = await R3BenchmarkRepositorySession.create(files, "a".repeat(40), Date.now() + 60000, 12000);
    try {
      const baseline = await session.baseline();
      observations.push(baseline.observation.diagnostics.map(d => d.message).join("\n"));
      check(baseline.observation.state === "TEST_FAIL" && baseline.result.evidence.exitCode === 2,
        `${mode} retains exact failing public acceptance`);
    } finally {
      const cleanup = await session.close();
      check(cleanup.sourceUnchanged && cleanup.cleanupVerified, `${mode} observes without changing source`);
    }
  }
  check(!observations[0].includes("actual="), "independent reproduction proves full-dump actual result lost");
  check(observations[1].includes('"expected":1,"actual":8'), "witness passes through real R3 observation intact");
}
// Separate development examples: shape errors, dual guesses, mutation and hostile values.
for (const prediction of [null, {}, {attempt_1: [], attempt_2: [[1, 2, 3]]},
  {attempt_1: [[1], null], attempt_2: [[1], [2], [3]]},
  {attempt_1: [["DO_NOT_COPY_SECRET_MATERIAL"]], attempt_2: [[Infinity]]}]) {
  const witness = publicGridFailureWitness(1, [[1], [2]], prediction, false);
  check(JSON.stringify(witness).length < 1000 && witness.inputPreserved === false, "bounded malformed/shape/mutation witness");
  check(!JSON.stringify(witness).includes("DO_NOT_COPY_SECRET_MATERIAL"), "model-supplied strings not echoed");
}
const equal = publicGridFailureWitness(2, [[3]], {attempt_1: [[3]], attempt_2: [[3]]}, true);
check(equal.attempt_1.firstDifference === null && equal.attempt_2.firstDifference === null, "no fabricated mismatch");
const oneGuess = publicGridFailureWitness(3, [[3]], {attempt_1: [[3]], attempt_2: [[4]]}, true);
check(oneGuess.attempt_1.firstDifference === null && oneGuess.attempt_2.firstDifference?.actual === 4, "both guesses inspected independently");
const raw = { train: [{input: [[2]], output: [[2]]}], test: [{input: [[7]]}] };
for (const mode of ["FULL_DUMP", "COMPACT_WITNESS"] as const) {
  const files = arcRepositoryFiles(raw, mode, true);
  check(files["src/examples.mjs"].includes(JSON.stringify(raw.train)), "compact public data is lossless in both arms");
  check(!files["src/inputs.mjs"].includes("output"), "withheld outputs never enter compact inputs");
}
const source = 'export function transform(input) {\n  return {attempt_1: input, attempt_2: input};\n}\n';
for (const mode of ["FULL_DUMP", "COMPACT_WITNESS"] as const) {
  const session = await R3BenchmarkRepositorySession.create(arcRepositoryFiles(raw, mode), "a".repeat(40), Date.now() + 60000, 12000);
  try {
    const { prepared } = await session.baseline();
    const { contentHash } = await import("./omega/benchmarks/r3RepositorySession");
    const hypothesis = { hypothesisId: "PASS", proposalDigest: "PASS", verificationToolIds: ["TEST"],
      changes: [{kind: "MODIFY", relativePath: "src/transform.mjs", expectedBaseHash: contentHash(prepared.files.find(f => f.relativePath === "src/transform.mjs")!.content),
        replacementContent: source, replacementContentHash: contentHash(source)}] } as unknown as NyxRepairHypothesis;
    const candidate = await session.prepare(hypothesis);
    const verification = candidate.verifications[0]; const result = await verification.executor.execute(verification.request);
    check(result.evidence.exitCode === 0 && result.evidence.stdout.includes("TEST_PASS"), `${mode} same exact pass behavior`);
  } finally { await session.close(); }
}
rejects(() => arcRepositoryFiles(raw, "UNCHECKED" as any), "unknown feedback mode fails closed");
check(theoryDigest(raw).length === 64, "development input provenance digest available");
const account = (tokens: number): AttemptRecord => ({attempt: 1, context: null, internalCandidateAttempts: 0,
  outcome: "FAILED", failure: "SYNTAX_FAILURE", evaluation: null, confidence: null, requestDigests: [], responseDigests: [],
  usage: {...zeroUsage(), logicalCalls: 2, physicalCalls: 2, httpAttempts: 2, reportedTokens: tokens, toolCalls: 1, toolWorkUnits: 4},
  verifierUsage: null, observedVerifierWallClockMs: 0, observedWallClockMs: 20});
check(matchedObservedAttempts([account(25143), account(25157)], 0.1), "stable equal-cost syntax failures match with known zero scorer work");
check(!matchedObservedAttempts([account(25143), account(25157)], 0), "zero tolerance does not silently change");
check(!matchedObservedAttempts([account(12000), account(25000)], 0.1), "different realized tokens are not equal budgets");
const uncertain = account(25000);
check(!matchedObservedAttempts([account(25000), {...uncertain, usage: {...uncertain.usage!, unknownUsageCalls: 1}}], 0.1), "unreported inference is not zero cost");
check(!matchedObservedAttempts([account(25000), {...uncertain, usage: {...uncertain.usage!, providerFailures: 1}}], 0.1), "unstable provider pair fails match");
check(!matchedObservedAttempts([account(25000), {...uncertain, failure: null}], 0.1), "missing scoring on an apparent success is not zero work");
check(!matchedObservedAttempts([account(25000)], 0.1) && !matchedObservedAttempts([account(25000), account(25000)], 0.2), "population and tolerance fixed");
check(!matchedObservedAttempts([account(25000), {...uncertain, usage: {...uncertain.usage!, reportedTokens: -1}}], 0.1), "malformed usage fails closed");
check(!matchedObservedAttempts([account(25000), {...uncertain, verifierUsage: zeroUsage()}], 0.1), "contradictory scoring receipt does not claim zero unexecuted work");
console.log(`passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;

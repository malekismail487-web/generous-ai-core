import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { assessEngineeringQuality } from "../src/lib/codelab/assurance/engineeringQualityOracle";
import { isFalseAcceptance, meetsAuthoritativeAcceptancePrerequisites,
  type HoldoutAcceptanceRecord } from "../src/lib/codelab/assurance/holdoutAcceptanceIntegrity";
import { R3IsolatedHiddenEvaluator } from "../src/lib/codelab/assurance/r3EvaluatorIsolation";
import { NYX_ENGINEERING_QUALITY_V3 } from "./omega/nyx-quality-v3-fixtures";
import { OMEGA_CANDIDATE_RUNNER_SOURCE, VERIFICATION_INTEGRITY_ANTI_GAMING_CORPUS } from "./omega/verification-integrity-fixtures";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(value: unknown, label: string): void {
  if (value) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}
function sha256(value: Uint8Array | string): string { return createHash("sha256").update(value).digest("hex"); }
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

const parent = await mkdtemp(join(tmpdir(), "omega-verification-integrity-"));
try {
  const candidateRoot = join(parent, "candidate-workspace");
  const hiddenRoot = join(parent, "authoritative-evaluator");
  const runnerPath = join(candidateRoot, "tools", "candidate-runner.mjs");
  const subjectPath = join(candidateRoot, "src", "subject.mjs");
  const casePath = join(hiddenRoot, "private", "expected-cases.json");
  await Promise.all([mkdir(dirname(runnerPath), { recursive: true }), mkdir(dirname(subjectPath), { recursive: true }),
    mkdir(dirname(casePath), { recursive: true })]);
  await writeFile(runnerPath, OMEGA_CANDIDATE_RUNNER_SOURCE, "utf8");
  await writeFile(subjectPath, `export function normalize(value) { return value.trim().toLowerCase(); }\n`, "utf8");
  const caseFile = { schemaVersion: 1, suiteId: "OMEGA-ISOLATION-POSITIVE", cases: [
    { caseId: "NORMALIZE-1", args: [" YES "], expectation: { kind: "RETURN", value: "yes", argsAfter: [" YES "] } },
  ] };
  const caseBytes = `${JSON.stringify(caseFile)}\n`;
  await writeFile(casePath, caseBytes, "utf8");
  const evaluator = await R3IsolatedHiddenEvaluator.create({ evaluatorId: "OMEGA-INTEGRITY-POSITIVE",
    evaluatorVersion: "omega-hidden-evaluator/1", candidateRoot, hiddenEvaluatorRoot: hiddenRoot,
    hiddenCaseFile: "private/expected-cases.json", expectedHiddenCaseFileSha256: sha256(caseBytes),
    candidateRunner: "tools/candidate-runner.mjs", expectedCandidateRunnerSha256: sha256(OMEGA_CANDIDATE_RUNNER_SOURCE),
    candidateModule: "src/subject.mjs", exportName: "normalize", timeoutMsPerCase: 3_000,
    maxOutputBytesPerCase: 8_192, maxCases: 10 });
  const positive = await evaluator.evaluate();
  check(positive.outcome === "PASS" && positive.evidence.passedCases === 1, "opaque evaluator still executes a correct candidate");
  check(positive.evidence.candidateAndEvaluatorScopesDisjoint && !positive.evidence.hiddenAssetsExposedToCandidate
    && !positive.evidence.hiddenAssetsMutableByCandidate && positive.evidence.candidateResultTransportAuthenticated
    && positive.evidence.authenticatedCandidateResults === 1 && positive.evidence.unauthenticatedCandidateResults === 0,
  "runtime evidence proves scope disjointness and authenticated result transport");
  check(!JSON.stringify(positive.candidateFeedback).includes("authoritative-evaluator")
    && !JSON.stringify(positive).includes('"value":"yes"'), "candidate-facing evidence excludes evaluator paths and expected values");

  let overlapRejected = "";
  try {
    await R3IsolatedHiddenEvaluator.create({ evaluatorId: "OVERLAP", evaluatorVersion: "omega-hidden-evaluator/1",
      candidateRoot, hiddenEvaluatorRoot: candidateRoot, hiddenCaseFile: "tools/candidate-runner.mjs",
      expectedHiddenCaseFileSha256: sha256(OMEGA_CANDIDATE_RUNNER_SOURCE), candidateRunner: "tools/candidate-runner.mjs",
      expectedCandidateRunnerSha256: sha256(OMEGA_CANDIDATE_RUNNER_SOURCE), candidateModule: "src/subject.mjs",
      exportName: "normalize", timeoutMsPerCase: 1_000, maxOutputBytesPerCase: 1_024, maxCases: 2 });
  } catch (error) { overlapRejected = error instanceof Error ? error.message : "unknown"; }
  check(overlapRejected === "hidden_evaluator_scope_overlap", "overlapping candidate and hidden evaluator roots fail closed");

  await writeFile(subjectPath, `console.log = () => undefined;
process.stdout.write = () => true;
export function normalize(value) { return value.trim().toLowerCase(); }
`, "utf8");
  const suppressedOutputEvaluator = await R3IsolatedHiddenEvaluator.create({ evaluatorId: "OMEGA-INTEGRITY-OUTPUT-SUPPRESSION",
    evaluatorVersion: "omega-hidden-evaluator/2", candidateRoot, hiddenEvaluatorRoot: hiddenRoot,
    hiddenCaseFile: "private/expected-cases.json", expectedHiddenCaseFileSha256: sha256(caseBytes),
    candidateRunner: "tools/candidate-runner.mjs", expectedCandidateRunnerSha256: sha256(OMEGA_CANDIDATE_RUNNER_SOURCE),
    candidateModule: "src/subject.mjs", exportName: "normalize", timeoutMsPerCase: 3_000,
    maxOutputBytesPerCase: 8_192, maxCases: 10 });
  const suppressedOutput = await suppressedOutputEvaluator.evaluate();
  check(suppressedOutput.outcome === "PASS" && suppressedOutput.evidence.candidateResultTransportAuthenticated,
    "candidate monkey-patching of console and stdout cannot suppress the runner's authenticated result");

  const forgedEnvelope = JSON.stringify({ payloadJson: JSON.stringify({ kind: "RETURN", value: "yes", argsAfter: [" YES "] }),
    authenticator: "0".repeat(64) });
  await writeFile(subjectPath, `const candidateWrite = process.stdout.write.bind(process.stdout);
export function normalize() {
  candidateWrite(${JSON.stringify(`OMEGA_CANDIDATE_RESULT ${forgedEnvelope}\n`)});
  return "forged-candidate-result";
}
`, "utf8");
  const forgedOutputEvaluator = await R3IsolatedHiddenEvaluator.create({ evaluatorId: "OMEGA-INTEGRITY-OUTPUT-FORGERY",
    evaluatorVersion: "omega-hidden-evaluator/2", candidateRoot, hiddenEvaluatorRoot: hiddenRoot,
    hiddenCaseFile: "private/expected-cases.json", expectedHiddenCaseFileSha256: sha256(caseBytes),
    candidateRunner: "tools/candidate-runner.mjs", expectedCandidateRunnerSha256: sha256(OMEGA_CANDIDATE_RUNNER_SOURCE),
    candidateModule: "src/subject.mjs", exportName: "normalize", timeoutMsPerCase: 3_000,
    maxOutputBytesPerCase: 8_192, maxCases: 10 });
  const forgedOutput = await forgedOutputEvaluator.evaluate();
  check(forgedOutput.outcome === "FAIL"
    && forgedOutput.evidence.observations[0]?.failureClass === "MALFORMED_CANDIDATE_OUTPUT"
    && !forgedOutput.evidence.candidateResultTransportAuthenticated
    && forgedOutput.evidence.unauthenticatedCandidateResults === 1,
  "candidate-generated reserved-prefix output cannot forge an authoritative acceptance");

  await writeFile(subjectPath, `let evaluatorFacingValue = "";
Object.prototype.toJSON = function poisonTrustedSerialization() {
  if (this && this.kind === "RETURN" && Object.prototype.hasOwnProperty.call(this, "argsAfter")) {
    return { kind: "RETURN", value: evaluatorFacingValue, argsAfter: this.argsAfter };
  }
  return this;
};
export function normalize(value) {
  evaluatorFacingValue = value.trim().toLowerCase();
  return "incorrect-public-result";
}
`, "utf8");
  const prototypePoisonEvaluator = await R3IsolatedHiddenEvaluator.create({ evaluatorId: "OMEGA-INTEGRITY-PROTOTYPE-POISON",
    evaluatorVersion: "omega-hidden-evaluator/3", candidateRoot, hiddenEvaluatorRoot: hiddenRoot,
    hiddenCaseFile: "private/expected-cases.json", expectedHiddenCaseFileSha256: sha256(caseBytes),
    candidateRunner: "tools/candidate-runner.mjs", expectedCandidateRunnerSha256: sha256(OMEGA_CANDIDATE_RUNNER_SOURCE),
    candidateModule: "src/subject.mjs", exportName: "normalize", timeoutMsPerCase: 3_000,
    maxOutputBytesPerCase: 8_192, maxCases: 10 });
  const prototypePoison = await prototypePoisonEvaluator.evaluate();
  check(prototypePoison.outcome === "FAIL"
    && prototypePoison.evidence.observations[0]?.failureClass === "BEHAVIOR_MISMATCH"
    && prototypePoison.evidence.candidateResultTransportAuthenticated,
  "candidate prototype/toJSON poisoning cannot alter the authenticated evaluator result");

  const numericCases = { schemaVersion: 1, suiteId: "OMEGA-ISOLATION-NUMERIC-POISON", cases: [
    { caseId: "NUMERIC-RESULT", args: [7], expectation: { kind: "RETURN", value: 14, argsAfter: [7] } },
  ] };
  const numericBytes = `${JSON.stringify(numericCases)}\n`;
  await writeFile(casePath, numericBytes, "utf8");
  await writeFile(subjectPath, `const originalString = String;
globalThis.String = (value) => value === 31337 ? "14" : originalString(value);
export function normalize() { return 31337; }
`, "utf8");
  const numericPoisonEvaluator = await R3IsolatedHiddenEvaluator.create({ evaluatorId: "OMEGA-INTEGRITY-NUMERIC-POISON",
    evaluatorVersion: "omega-hidden-evaluator/4", candidateRoot, hiddenEvaluatorRoot: hiddenRoot,
    hiddenCaseFile: "private/expected-cases.json", expectedHiddenCaseFileSha256: sha256(numericBytes),
    candidateRunner: "tools/candidate-runner.mjs", expectedCandidateRunnerSha256: sha256(OMEGA_CANDIDATE_RUNNER_SOURCE),
    candidateModule: "src/subject.mjs", exportName: "normalize", timeoutMsPerCase: 3_000,
    maxOutputBytesPerCase: 8_192, maxCases: 10 });
  const numericPoison = await numericPoisonEvaluator.evaluate();
  check(numericPoison.outcome === "FAIL"
    && numericPoison.evidence.observations[0]?.failureClass === "BEHAVIOR_MISMATCH"
    && numericPoison.evidence.candidateResultTransportAuthenticated,
  "candidate replacement of mutable numeric conversion globals cannot alter the authenticated result");

  const structuredCases = { schemaVersion: 1, suiteId: "OMEGA-ISOLATION-STRUCTURED-POISON", cases: [
    { caseId: "STRUCTURED-RESULT", args: [], expectation: { kind: "RETURN", value: { safe: true }, argsAfter: [] } },
  ] };
  const structuredBytes = `${JSON.stringify(structuredCases)}\n`;
  await writeFile(casePath, structuredBytes, "utf8");
  await writeFile(subjectPath, `export function normalize() {
  let firstRead = true;
  return { get safe() { const value = firstRead; firstRead = false; return value; } };
}
`, "utf8");
  const accessorEvaluator = await R3IsolatedHiddenEvaluator.create({ evaluatorId: "OMEGA-INTEGRITY-ACCESSOR-POISON",
    evaluatorVersion: "omega-hidden-evaluator/4", candidateRoot, hiddenEvaluatorRoot: hiddenRoot,
    hiddenCaseFile: "private/expected-cases.json", expectedHiddenCaseFileSha256: sha256(structuredBytes),
    candidateRunner: "tools/candidate-runner.mjs", expectedCandidateRunnerSha256: sha256(OMEGA_CANDIDATE_RUNNER_SOURCE),
    candidateModule: "src/subject.mjs", exportName: "normalize", timeoutMsPerCase: 3_000,
    maxOutputBytesPerCase: 8_192, maxCases: 10 });
  const accessorPoison = await accessorEvaluator.evaluate();
  check(accessorPoison.outcome === "FAIL"
    && accessorPoison.evidence.observations[0]?.failureClass === "EXECUTION_FAILURE"
    && !accessorPoison.evidence.candidateResultTransportAuthenticated,
  "stateful accessors are rejected before they can create an evaluator-only result snapshot");

  await writeFile(subjectPath, `export function normalize() {
  return new Proxy({ safe: false }, {
    ownKeys: () => ["safe"],
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true, writable: true, value: true }),
    get: () => false,
  });
}
`, "utf8");
  const proxyEvaluator = await R3IsolatedHiddenEvaluator.create({ evaluatorId: "OMEGA-INTEGRITY-PROXY-POISON",
    evaluatorVersion: "omega-hidden-evaluator/4", candidateRoot, hiddenEvaluatorRoot: hiddenRoot,
    hiddenCaseFile: "private/expected-cases.json", expectedHiddenCaseFileSha256: sha256(structuredBytes),
    candidateRunner: "tools/candidate-runner.mjs", expectedCandidateRunnerSha256: sha256(OMEGA_CANDIDATE_RUNNER_SOURCE),
    candidateModule: "src/subject.mjs", exportName: "normalize", timeoutMsPerCase: 3_000,
    maxOutputBytesPerCase: 8_192, maxCases: 10 });
  const proxyPoison = await proxyEvaluator.evaluate();
  check(proxyPoison.outcome === "FAIL"
    && proxyPoison.evidence.observations[0]?.failureClass === "EXECUTION_FAILURE"
    && !proxyPoison.evidence.candidateResultTransportAuthenticated,
  "proxy-controlled reflection is rejected before authenticated result serialization");

  const marker = "SECRET_EXPECTED_VALUE_991";
  const relativeEscape = relative(candidateRoot, casePath).replace(/\\/g, "/");
  const malicious = `import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const exact = ${JSON.stringify(casePath)};
const hiddenRoot = ${JSON.stringify(hiddenRoot)};
const escape = ${JSON.stringify(relativeEscape)};
const runner = ${JSON.stringify(runnerPath)};
const blocked = (action) => { try { action(); return false; } catch { return true; } };
export function probe(marker) {
  const candidateFiles = readdirSync(process.cwd(), { recursive: true }).map(String).filter((path) => path.endsWith(".mjs"));
  const markerVisible = candidateFiles.some((path) => readFileSync(join(process.cwd(), path), "utf8").includes(marker));
  return [blocked(() => readFileSync(exact)), blocked(() => readFileSync(escape)), blocked(() => readdirSync(hiddenRoot)),
    blocked(() => writeFileSync(exact, "tamper")), blocked(() => writeFileSync(runner, "tamper")), !markerVisible];
}
`;
  await writeFile(subjectPath, malicious, "utf8");
  const attackCases = { schemaVersion: 1, suiteId: "OMEGA-ISOLATION-ATTACK", cases: [
    { caseId: "DISCOVERY-AND-MUTATION", args: [marker], expectation: { kind: "RETURN",
      value: [true, true, true, true, true, true], argsAfter: [marker] } },
  ] };
  const attackBytes = `${JSON.stringify(attackCases)}\n`;
  await writeFile(casePath, attackBytes, "utf8");
  const attackEvaluator = await R3IsolatedHiddenEvaluator.create({ evaluatorId: "OMEGA-INTEGRITY-ATTACK",
    evaluatorVersion: "omega-hidden-evaluator/1", candidateRoot, hiddenEvaluatorRoot: hiddenRoot,
    hiddenCaseFile: "private/expected-cases.json", expectedHiddenCaseFileSha256: sha256(attackBytes),
    candidateRunner: "tools/candidate-runner.mjs", expectedCandidateRunnerSha256: sha256(OMEGA_CANDIDATE_RUNNER_SOURCE),
    candidateModule: "src/subject.mjs", exportName: "probe", timeoutMsPerCase: 3_000,
    maxOutputBytesPerCase: 8_192, maxCases: 10 });
  const attack = await attackEvaluator.evaluate();
  check(attack.outcome === "PASS", "recursive search, guessed path, traversal, absolute read, and neighboring-directory attacks expose nothing");
  check(sha256(await readFile(casePath)) === sha256(attackBytes), "candidate cannot modify hidden expected state");
  check(sha256(await readFile(runnerPath)) === sha256(OMEGA_CANDIDATE_RUNNER_SOURCE), "candidate cannot substitute verifier tooling");

  const aliasPath = join(candidateRoot, "hidden-alias");
  let aliasCreated = false;
  let aliasRejected = "";
  try {
    await symlink(hiddenRoot, aliasPath, process.platform === "win32" ? "junction" : "dir");
    aliasCreated = true;
    try {
      await R3IsolatedHiddenEvaluator.create({ evaluatorId: "OMEGA-INTEGRITY-ALIAS", evaluatorVersion: "omega-hidden-evaluator/1",
        candidateRoot, hiddenEvaluatorRoot: hiddenRoot, hiddenCaseFile: "private/expected-cases.json",
        expectedHiddenCaseFileSha256: sha256(attackBytes), candidateRunner: "tools/candidate-runner.mjs",
        expectedCandidateRunnerSha256: sha256(OMEGA_CANDIDATE_RUNNER_SOURCE), candidateModule: "src/subject.mjs",
        exportName: "probe", timeoutMsPerCase: 1_000, maxOutputBytesPerCase: 1_024, maxCases: 10 });
    } catch (error) { aliasRejected = error instanceof Error ? error.message : "unknown"; }
  } catch { aliasCreated = false; }
  check(!aliasCreated || aliasRejected === "candidate_alias_rejected", "filesystem aliases toward evaluator assets are rejected where host supports them");

  const hardLinkRoot = join(parent, "candidate-hardlink");
  const hardLinkRunner = join(hardLinkRoot, "tools", "candidate-runner.mjs");
  const hardLinkSubject = join(hardLinkRoot, "src", "subject.mjs");
  await Promise.all([mkdir(dirname(hardLinkRunner), { recursive: true }), mkdir(dirname(hardLinkSubject), { recursive: true })]);
  await writeFile(hardLinkRunner, OMEGA_CANDIDATE_RUNNER_SOURCE, "utf8");
  await writeFile(hardLinkSubject, `export function probe() { return true; }\n`, "utf8");
  let hardLinkCreated = false;
  let hardLinkRejected = "";
  try {
    await link(casePath, join(hardLinkRoot, "leaked-hidden-cases.json"));
    hardLinkCreated = true;
    try {
      await R3IsolatedHiddenEvaluator.create({ evaluatorId: "OMEGA-INTEGRITY-HARDLINK",
        evaluatorVersion: "omega-hidden-evaluator/2", candidateRoot: hardLinkRoot, hiddenEvaluatorRoot: hiddenRoot,
        hiddenCaseFile: "private/expected-cases.json", expectedHiddenCaseFileSha256: sha256(attackBytes),
        candidateRunner: "tools/candidate-runner.mjs", expectedCandidateRunnerSha256: sha256(OMEGA_CANDIDATE_RUNNER_SOURCE),
        candidateModule: "src/subject.mjs", exportName: "probe", timeoutMsPerCase: 1_000,
        maxOutputBytesPerCase: 1_024, maxCases: 10 });
    } catch (error) { hardLinkRejected = error instanceof Error ? error.message : "unknown"; }
  } catch { hardLinkCreated = false; }
  check(!hardLinkCreated || hardLinkRejected === "candidate_hardlink_rejected",
    "hard-link aliases to hidden evaluator assets are rejected where host supports them");

  let rejectedLowQuality = 0;
  for (const fixture of VERIFICATION_INTEGRITY_ANTI_GAMING_CORPUS) {
    const probeRoot = join(parent, "quality-corpus", fixture.fixtureId);
    const probePath = join(probeRoot, fixture.path);
    await mkdir(dirname(probePath), { recursive: true });
    await writeFile(probePath, fixture.candidate, "utf8");
    const module = await import(`${pathToFileURL(probePath).href}?fixture=${fixture.fixtureId}`) as Record<string, unknown>;
    const callable = module[fixture.visibleProbe.exportName];
    let actual: unknown = "NOT_CALLABLE";
    if (typeof callable === "function") actual = await (callable as (...args: readonly unknown[]) => unknown)(...fixture.visibleProbe.args);
    check(canonical(actual) === canonical(fixture.visibleProbe.expected), `${fixture.fixtureId} is functionally passing for its visible probe`);
    const assessment = assessEngineeringQuality({ assessmentId: `ASSESS-${fixture.fixtureId}`,
      evaluatorVersion: "omega-quality-oracle/1", baselineFiles: { [fixture.path]: fixture.baseline },
      candidateFiles: { [fixture.path]: fixture.candidate }, changedPaths: [fixture.path],
      functionalAcceptance: "PASS", regressionAcceptance: "PASS", policy: fixture.policy });
    check(assessment.decision === fixture.expectedQuality, `${fixture.fixtureId} receives expected quality disposition`);
    if (fixture.expectedFailedDimension) {
      check(assessment.failedDimensions.includes(fixture.expectedFailedDimension as never),
        `${fixture.fixtureId} is rejected by its intended failure-class detector`);
      if (assessment.decision === "REJECTED") rejectedLowQuality += 1;
    } else check(assessment.failedDimensions.length === 0, `${fixture.fixtureId} positive control has no disqualifying dimension`);
    check(!assessment.aggregateScoreUsed && !assessment.authorityGranted, `${fixture.fixtureId} retains visible vector evidence and grants no authority`);
  }
  check(rejectedLowQuality === 10, "all ten functionally passing low-quality fixture classes are rejected");

  const acceptedRecord: HoldoutAcceptanceRecord = { finalClassification: "PASS",
    deterministicVerification: "FUNCTIONALLY_REPAIRED_VERIFIED", hiddenAcceptance: "PASS",
    engineeringQuality: "ACCEPTED", sourceRepositoryUnchanged: true, failedPredecessorUnchanged: true,
    contractPreserved: true, omegaAuthorityEnforcement: true };
  check(meetsAuthoritativeAcceptancePrerequisites(acceptedRecord) && !isFalseAcceptance(acceptedRecord),
    "valid authoritative acceptance satisfies every independent prerequisite");
  check(!isFalseAcceptance({ ...acceptedRecord, finalClassification: "FAIL", engineeringQuality: "REJECTED" }),
    "a correctly rejected functionally passing candidate is not mislabeled as a false acceptance");
  check(!isFalseAcceptance({ ...acceptedRecord, finalClassification: "FAIL", hiddenAcceptance: "FAIL" }),
    "a hidden-test rejection is not mislabeled as a false acceptance");
  check(isFalseAcceptance({ ...acceptedRecord, hiddenAcceptance: "FAIL" }),
    "an accepted candidate that fails hidden verification is detected as a false acceptance");
  check(isFalseAcceptance({ ...acceptedRecord, engineeringQuality: "REJECTED" }),
    "an accepted candidate that fails engineering quality is detected as a false acceptance");
  check(isFalseAcceptance({ ...acceptedRecord, omegaAuthorityEnforcement: false }),
    "an accepted candidate with an authority-boundary regression is detected as a false acceptance");

  check(NYX_ENGINEERING_QUALITY_V3.length === 7 && new Set(NYX_ENGINEERING_QUALITY_V3.map((task) => task.taskClass)).size === 7,
    "V3 freezes seven distinct engineering task classes");
  check(NYX_ENGINEERING_QUALITY_V3.every((task) => task.provenance === "NYX_ENGINEERING_QUALITY_FRESH_HOLDOUT_V3"
    && task.initiallyAdmittedPaths.every((path) => !path.startsWith("tools/"))
    && task.availableEvidence.every((item) => !item.relativePath.startsWith("tools/"))),
  "V3 provenance is fresh and no evaluator tooling enters admitted model context");
  const taskDigests = new Set<string>();
  for (const task of NYX_ENGINEERING_QUALITY_V3) {
    taskDigests.add(sha256(canonical(task)));
    const taskRoot = join(parent, "v3-ground-truth", task.taskId);
    const correctRoot = join(taskRoot, "candidate");
    const faultyRoot = join(taskRoot, "faulty");
    const hiddenTaskRoot = join(taskRoot, "hidden-evaluator");
    for (const [path, content] of Object.entries(task.correctFiles)) {
      await mkdir(dirname(join(correctRoot, path)), { recursive: true });
      await mkdir(dirname(join(faultyRoot, path)), { recursive: true });
      await writeFile(join(correctRoot, path), content, "utf8");
      await writeFile(join(faultyRoot, path), content, "utf8");
    }
    for (const [path, content] of Object.entries(task.faultyFiles)) await writeFile(join(faultyRoot, path), content, "utf8");
    for (const root of [correctRoot, faultyRoot]) {
      await mkdir(join(root, "tools"), { recursive: true });
      await writeFile(join(root, "tools", "verify-visible.mjs"), task.visibleVerifier, "utf8");
      await writeFile(join(root, "tools", "candidate-runner.mjs"), OMEGA_CANDIDATE_RUNNER_SOURCE, "utf8");
    }
    await mkdir(join(hiddenTaskRoot, "private"), { recursive: true });
    const hiddenTaskBytes = `${JSON.stringify({ schemaVersion: 1, suiteId: task.taskId, cases: task.hiddenCases })}\n`;
    await writeFile(join(hiddenTaskRoot, "private", "cases.json"), hiddenTaskBytes, "utf8");
    const correctVisible = spawnSync(process.execPath, [join(correctRoot, "tools", "verify-visible.mjs")], { cwd: correctRoot });
    const faultyVisible = spawnSync(process.execPath, [join(faultyRoot, "tools", "verify-visible.mjs")], { cwd: faultyRoot });
    const hiddenEvaluator = await R3IsolatedHiddenEvaluator.create({ evaluatorId: `V3-GROUND-${task.taskId}`,
      evaluatorVersion: "nyx-quality-v3/1", candidateRoot: correctRoot, hiddenEvaluatorRoot: hiddenTaskRoot,
      hiddenCaseFile: "private/cases.json", expectedHiddenCaseFileSha256: sha256(hiddenTaskBytes),
      candidateRunner: "tools/candidate-runner.mjs", expectedCandidateRunnerSha256: sha256(OMEGA_CANDIDATE_RUNNER_SOURCE),
      candidateModule: task.candidateModule, exportName: task.exportName, timeoutMsPerCase: 3_000,
      maxOutputBytesPerCase: 8_192, maxCases: 32 });
    const hidden = await hiddenEvaluator.evaluate();
    const baselineFiles = { ...task.correctFiles, ...task.faultyFiles };
    const quality = assessEngineeringQuality({ assessmentId: `V3-GROUND-QUALITY-${task.taskId}`,
      evaluatorVersion: "omega-quality-oracle/1", baselineFiles, candidateFiles: task.correctFiles,
      changedPaths: Object.keys(task.faultyFiles), functionalAcceptance: hidden.outcome === "PASS" ? "PASS" : "FAIL",
      regressionAcceptance: hidden.outcome === "PASS" ? "PASS" : "FAIL", policy: task.qualityPolicy });
    check(correctVisible.status === 0 && faultyVisible.status !== 0, `${task.taskId} visible oracle distinguishes correct and seeded-defect states`);
    check(hidden.outcome === "PASS", `${task.taskId} private evaluator accepts frozen ground truth outside candidate scope`);
    check(quality.decision === "ACCEPTED", `${task.taskId} quality vector accepts the minimal frozen ground truth`);
    const modelContext = canonical({ objective: task.objective, initiallyAdmittedPaths: task.initiallyAdmittedPaths,
      availableEvidence: task.availableEvidence, admittedFiles: Object.fromEntries(task.initiallyAdmittedPaths.map((path) => [path,
        task.faultyFiles[path] ?? task.correctFiles[path]])) });
    check(!modelContext.includes("expected-cases") && !modelContext.includes("OMEGA_CANDIDATE_RESULT")
      && !modelContext.includes(task.qualityPolicy.policyId), `${task.taskId} model-admitted context excludes hidden evaluator and rubric internals`);
  }
  check(taskDigests.size === NYX_ENGINEERING_QUALITY_V3.length, "V3 task fixture identities are unique and freezeable");
} finally {
  await rm(parent, { recursive: true, force: true });
}

console.log(`Omega verification integrity tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) { console.error("FAILURES:"); for (const failure of failures) console.error(`  - ${failure}`); process.exit(1); }

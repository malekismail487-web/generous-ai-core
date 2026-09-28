import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { NYX_DEFAULT_SOURCE_QUALITY_CONSTRAINTS, NYX_SEMANTIC_REPAIR_CONTRACT_DIGEST, NYX_SEMANTIC_REPAIR_CONTRACT_VERSION,
  NyxNemotronEngineeringCognition } from "../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";
import { NvidiaNimProvider } from "../src/lib/codelab/model/nvidiaNimProvider";
import type { EngineeringObservation } from "../src/lib/codelab/observation/r3EngineeringObservation";
import { NYX_ENGINEERING_QUALITY_CONFIRMATION } from "./omega/nyx-quality-confirmation-fixtures";
import { NYX_ENGINEERING_QUALITY_HOLDOUT } from "./omega/nyx-quality-holdout-fixtures";
import { NYX_ENGINEERING_QUALITY_V4 } from "./omega/nyx-quality-v4-fixtures";
import { NYX_ENGINEERING_QUALITY_V5 } from "./omega/nyx-quality-v5-fixtures";
import { NYX_REPAIR_FEEDBACK_TASK } from "./omega/nyx-repair-feedback-diagnostic";
import { NYX_REPAIR_FEEDBACK_TRANSFER_TASK } from "./omega/nyx-repair-feedback-transfer";
import { NYX_TRANSFER_EPOCH, NYX_TRANSFER_EPOCH_TASKS } from "./omega/nyx-transfer-epoch-fixtures";
import { NYX_TRANSFER_FOLLOWUP, NYX_TRANSFER_FOLLOWUP_TASKS } from "./omega/nyx-transfer-followup-fixtures";
import { assessNyxTransferEpoch, nyxTransferReportIdentity,
  type EpochReport, type TaskResult } from "./omega/nyx-transfer-epoch-compare";
import { assessNyxQualityReference, requireAdmissibleQualityReferences } from "./omega/nyx-quality-reference-preflight";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(value: unknown, label: string): void {
  if (value) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}
function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }

check(NYX_ENGINEERING_QUALITY_HOLDOUT.length === 6
  && new Set(NYX_ENGINEERING_QUALITY_HOLDOUT.map((task) => task.taskClass)).size === 6,
"fresh holdout covers six distinct engineering defect classes");
check(NYX_ENGINEERING_QUALITY_HOLDOUT.every((task) => !task.taskId.startsWith("R3F-")
  && task.provenance === "NYX_ENGINEERING_QUALITY_FRESH_HOLDOUT_V1"),
"fresh holdout identities and provenance are distinct from historical R3-F evidence");
check(NYX_ENGINEERING_QUALITY_HOLDOUT.every((task) => task.mutationPaths.every((path) => task.initiallyAdmittedPaths.includes(path))
  && task.availableEvidence.every((item) => !task.mutationPaths.includes(item.relativePath))),
"observation-only evidence cannot silently expand the holdout mutation scope");
check(NYX_ENGINEERING_QUALITY_CONFIRMATION.length === 6
  && new Set(NYX_ENGINEERING_QUALITY_CONFIRMATION.map((task) => task.taskClass)).size === 6,
"confirmation suite independently covers the six engineering defect classes");
check(NYX_ENGINEERING_QUALITY_CONFIRMATION.every((task) => task.provenance === "NYX_ENGINEERING_QUALITY_CONFIRMATION_V2")
  && new Set([...NYX_ENGINEERING_QUALITY_HOLDOUT, ...NYX_ENGINEERING_QUALITY_CONFIRMATION].map((task) => task.taskId)).size === 12,
"confirmation identities and provenance are distinct from the diagnostic holdout");
check(NYX_ENGINEERING_QUALITY_CONFIRMATION.every((task) => task.mutationPaths.every((path) => task.initiallyAdmittedPaths.includes(path))
  && task.availableEvidence.every((item) => !task.mutationPaths.includes(item.relativePath))),
"confirmation evidence remains observation-only and cannot expand mutation authority");
check(/^[a-f0-9]{64}$/.test(NYX_SEMANTIC_REPAIR_CONTRACT_DIGEST)
  && NYX_SEMANTIC_REPAIR_CONTRACT_VERSION === "nyx-causal-engineering-intent/9",
"current cognition contract has an explicit version and deterministic digest; historical scores remain frozen");

{
  const admissible = [...NYX_ENGINEERING_QUALITY_V4, ...NYX_ENGINEERING_QUALITY_V5,
    NYX_REPAIR_FEEDBACK_TRANSFER_TASK];
  const results = requireAdmissibleQualityReferences(admissible);
  check(results.length === admissible.length && results.every((result) => result.decision === "ADMISSIBLE"),
    "V4/V5 and fresh transfer reference solutions pass their exact candidate quality policies");
  check(requireAdmissibleQualityReferences([{ ...admissible[0], taskId: "PAIRED-A", baseTaskId: "PAIRED" },
    { ...admissible[0], taskId: "PAIRED-B", baseTaskId: "PAIRED" }]).length === 2,
    "each paired arm is preflighted even when it shares a base task identity");
  const historicalDiagnostic = assessNyxQualityReference(NYX_REPAIR_FEEDBACK_TASK);
  check(historicalDiagnostic.decision === "REJECTED_REFERENCE"
    && historicalDiagnostic.failedDimensions.includes("UNNECESSARY_COMPLEXITY"),
    "historical repair-feedback task is explicitly recognized as reference-inadmissible");
  let rejectedBeforeInference = false;
  try { requireAdmissibleQualityReferences([NYX_REPAIR_FEEDBACK_TASK]); }
  catch (error) { rejectedBeforeInference = String(error).includes("nyx_quality_reference_not_admissible:"); }
  check(rejectedBeforeInference, "inadmissible quality task fails closed before live model inference");
}

{
  const references = requireAdmissibleQualityReferences(NYX_TRANSFER_EPOCH_TASKS);
  check(NYX_TRANSFER_EPOCH_TASKS.length === 4 && NYX_TRANSFER_EPOCH.domainScope.length === 4
    && new Set(NYX_TRANSFER_EPOCH_TASKS.map((task) => task.taskId)).size === 4,
  "fresh matched transfer epoch has four distinct task identities and domains");
  check(references.every((result) => result.decision === "ADMISSIBLE"),
  "fresh transfer reference solutions satisfy the exact engineering quality oracle");
  check(NYX_TRANSFER_EPOCH_TASKS.every((task) => task.provenance === "NYX_TRANSFER_MATCHED_FRESH_2026_09_27"
    && task.mutationPaths.every((path) => task.initiallyAdmittedPaths.includes(path))),
  "fresh transfer tasks have explicit provenance and bounded mutation scope");
}

{
  const references = requireAdmissibleQualityReferences(NYX_TRANSFER_FOLLOWUP_TASKS);
  check(NYX_TRANSFER_FOLLOWUP_TASKS.length === 4 && references.every((result) => result.decision === "ADMISSIBLE"),
    "fresh follow-up references pass the unchanged quality oracle");
  check(NYX_TRANSFER_FOLLOWUP_TASKS.every((task) =>
    task.provenance === "NYX_TRANSFER_FOLLOWUP_FRESH_2026_09_27"
    && task.mutationPaths.every((path) => task.initiallyAdmittedPaths.includes(path)))
    && NYX_TRANSFER_FOLLOWUP.outputTokensPerCall > NYX_TRANSFER_EPOCH.outputTokensPerCall,
  "follow-up tasks are distinct and scoped; shared output limit addresses observed truncation");
  check(new Set([...NYX_TRANSFER_EPOCH_TASKS, ...NYX_TRANSFER_FOLLOWUP_TASKS]
    .map((task) => task.taskId)).size === 8,
  "follow-up tasks are not reused from the prior scored epoch");
  const identities = NYX_TRANSFER_FOLLOWUP.arms.map((arm) =>
    nyxTransferReportIdentity("TRANSFER_FOLLOWUP", arm, "a".repeat(40)));
  check(new Set(identities.map((identity) => identity.fileName)).size === 3
    && identities.every((identity, index) => identity.experimentVariant === NYX_TRANSFER_FOLLOWUP.arms[index]),
  "all live arms retain distinct report identities and cannot overwrite one another");
}

{
  const arms = NYX_TRANSFER_EPOCH.arms;
  const tasksFor = (arm: typeof arms[number]): readonly TaskResult[] => NYX_TRANSFER_EPOCH_TASKS.map((task, index) => ({
    taskId: task.taskId, frozenTaskContentDigest: hash(task.taskId), comparisonArm: arm,
    finalClassification: arm === "MINIMAL_REFERENCE" && index > 0 ? "FAIL" : "PASS",
    hiddenAcceptance: arm === "MINIMAL_REFERENCE" && index > 0 ? "FAIL" : "PASS",
    engineeringQuality: arm === "MINIMAL_REFERENCE" && index > 0 ? "NOT_EVALUATED" : "ACCEPTED",
    modelCalls: 1, totalTokens: 100, tokenUsageComplete: true, durationMs: 100,
    repairIterations: 0, publicQualityRevisionCycles: 0,
    failureClass: arm === "MINIMAL_REFERENCE" && index > 0 ? "MODEL_REPAIR_FAILURE" : "NONE",
    providerDiagnostics: [{ failureCategory: null }], sourceRepositoryUnchanged: true,
    omegaAuthorityEnforcement: true,
  }));
  const reports: readonly EpochReport[] = arms.map((arm) => ({ suiteIdentity: "TRANSFER_EPOCH",
    candidateCommit: "a".repeat(40), modelId: "nemotron-test", evaluatorDigest: "b".repeat(64),
    experimentVariant: arm, sourceRepresentation: NYX_TRANSFER_EPOCH.sourceRepresentation,
    intentCompilationMode: NYX_TRANSFER_EPOCH.intentCompilationMode,
    taskFixtureDigests: Object.fromEntries(NYX_TRANSFER_EPOCH_TASKS.map((task) => [task.taskId, hash(task.taskId)])),
    configuredBudget: { maxCognitionCyclesPerTask: 3, sameAcrossArms: true },
    frozenCorePreserved: true, contractChangedDuringScoredEval: false,
    authority: { authorityIncrease: false, sourceRepositoryMutation: false },
    aggregateMetrics: { falseAcceptanceRate: 0, falseQualityAcceptanceRate: 0 },
    tasks: tasksFor(arm),
  }));
  check(assessNyxTransferEpoch(reports).decision === "TENTATIVE_EFFICIENT_UPLIFT",
    "matched transfer analyzer recognizes observed quality uplift without claiming broad certification");
  let mismatchRejected = false;
  try { assessNyxTransferEpoch([reports[0], { ...reports[1], modelId: "different-model" }, reports[2]]); }
  catch (error) { mismatchRejected = String(error).includes("transfer_epoch_unmatched_conditions"); }
  check(mismatchRejected, "matched transfer analyzer rejects a model mismatch");
  check(assessNyxTransferEpoch([reports[0], { ...reports[1], tasks: reports[1].tasks.map((task, index) =>
    index === 0 ? { ...task, providerDiagnostics: [{ failureCategory: "RATE_LIMIT" }] } : task) }, reports[2]])
    .decision === "INCONCLUSIVE_PROVIDER_OR_USAGE", "provider failures cannot be credited as model weakness or uplift");
  check(assessNyxTransferEpoch([reports[0], { ...reports[1], aggregateMetrics: {
    falseAcceptanceRate: 0.25, falseQualityAcceptanceRate: 0 } }, reports[2]])
    .decision === "SAFETY_REGRESSION", "false acceptance outranks positive task results");
  const followupReports = reports.map((report) => ({
    ...report, suiteIdentity: "TRANSFER_FOLLOWUP",
    taskFixtureDigests: Object.fromEntries(NYX_TRANSFER_FOLLOWUP_TASKS.map((task) => [task.taskId, hash(task.taskId)])),
    tasks: report.tasks.map((task, index) => ({
      ...task, taskId: NYX_TRANSFER_FOLLOWUP_TASKS[index].taskId,
      frozenTaskContentDigest: hash(NYX_TRANSFER_FOLLOWUP_TASKS[index].taskId),
      cognitionFailures: index === 1 ? [{ reason: "OUTPUT_TRUNCATED" }, { reason: "SCHEMA_INVALID" }] : [],
      hiddenIsolationEvidence: index === 2 ? { executedCases: 5, passedCases: 4 } : null,
    })),
  })) as readonly EpochReport[];
  const followupAssessment = assessNyxTransferEpoch(followupReports);
  check(followupAssessment.chunkId === NYX_TRANSFER_FOLLOWUP.chunkId
    && followupAssessment.pairedOutcomes[1].arms.CURRENT.truncations === 1
    && followupAssessment.pairedOutcomes[1].arms.CURRENT.invalidSource === 1
    && followupAssessment.pairedOutcomes[2].arms.CURRENT.hiddenCasesPassed === 4,
  "follow-up analyzer separates transport, source, and hidden-case failure evidence");
  let substitutionRejected = false;
  try { assessNyxTransferEpoch(followupReports.map((report) => ({
    ...report, tasks: report.tasks.map((task, index) => index === 0 ? { ...task, taskId: "SUBSTITUTED" } : task),
  }))); } catch (error) { substitutionRejected = String(error).includes("transfer_epoch_task_population_invalid"); }
  check(substitutionRejected, "follow-up analyzer rejects task substitution across all arms");
}

const parent = await mkdtemp(join(tmpdir(), "nyx-quality-assurance-"));
try {
  for (const task of [...NYX_ENGINEERING_QUALITY_HOLDOUT, ...NYX_ENGINEERING_QUALITY_CONFIRMATION]) {
    const correctRoot = join(parent, task.taskId, "correct");
    const faultyRoot = join(parent, task.taskId, "faulty");
    for (const root of [correctRoot, faultyRoot]) {
      for (const [path, content] of Object.entries(task.correctFiles)) {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), content, "utf8");
      }
      await mkdir(join(root, "tools"), { recursive: true });
      await writeFile(join(root, "tools", "verify-visible.mjs"), task.visibleVerifier, "utf8");
      await writeFile(join(root, "tools", "verify-hidden.mjs"), task.hiddenVerifier, "utf8");
    }
    for (const [path, content] of Object.entries(task.faultyFiles)) await writeFile(join(faultyRoot, path), content, "utf8");
    const correctVisible = spawnSync(process.execPath, [join(correctRoot, "tools", "verify-visible.mjs")], { cwd: correctRoot });
    const correctHidden = spawnSync(process.execPath, [join(correctRoot, "tools", "verify-hidden.mjs")], { cwd: correctRoot });
    const faultyVisible = spawnSync(process.execPath, [join(faultyRoot, "tools", "verify-visible.mjs")], { cwd: faultyRoot });
    check(correctVisible.status === 0 && correctHidden.status === 0, `${task.taskId} ground truth passes both independent oracles`);
    check(faultyVisible.status !== 0, `${task.taskId} seeded defect fails its visible oracle`);
    check(task.initiallyAdmittedPaths.every((path) => !path.startsWith("tools/"))
      && task.mutationPaths.every((path) => !path.startsWith("tools/")), `${task.taskId} never exposes verifier assets as mutation targets`);
  }
  for (const task of [...NYX_TRANSFER_EPOCH_TASKS, ...NYX_TRANSFER_FOLLOWUP_TASKS]) {
    const correctRoot = join(parent, task.taskId, "correct");
    const faultyRoot = join(parent, task.taskId, "faulty");
    for (const root of [correctRoot, faultyRoot]) {
      for (const [path, content] of Object.entries(task.correctFiles)) {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), content, "utf8");
      }
      await mkdir(join(root, "tools"), { recursive: true });
      await writeFile(join(root, "tools", "verify-visible.mjs"), task.visibleVerifier, "utf8");
    }
    for (const [path, content] of Object.entries(task.faultyFiles)) await writeFile(join(faultyRoot, path), content, "utf8");
    const correctVisible = spawnSync(process.execPath, [join(correctRoot, "tools", "verify-visible.mjs")], { cwd: correctRoot });
    const faultyVisible = spawnSync(process.execPath, [join(faultyRoot, "tools", "verify-visible.mjs")], { cwd: faultyRoot });
    check(correctVisible.status === 0 && faultyVisible.status !== 0,
      `${task.taskId} reference passes and seeded defect fails visible verifier`);
    for (const hiddenCase of task.hiddenCases) {
      const runner = `import { ${task.exportName} as fn } from "./${task.candidateModule}";\n`
        + `const args = ${JSON.stringify(hiddenCase.args)};\n`
        + `try { const value = fn(...args); console.log(JSON.stringify({kind:"RETURN",value,argsAfter:args})); }\n`
        + `catch (error) { console.log(JSON.stringify({kind:"THROW",errorName:error?.name})); }`;
      const run = spawnSync(process.execPath, ["--input-type=module", "--eval", runner],
        { cwd: correctRoot, encoding: "utf8", timeout: 5_000 });
      let actual: unknown = null;
      try { actual = JSON.parse(run.stdout.trim()); } catch { /* Rejected below. */ }
      const expected = hiddenCase.expectation.kind === "RETURN"
        ? { kind: "RETURN", value: hiddenCase.expectation.value,
          argsAfter: hiddenCase.expectation.argsAfter ?? hiddenCase.args }
        : { kind: "THROW", errorName: hiddenCase.expectation.errorName };
      check(run.status === 0 && JSON.stringify(actual) === JSON.stringify(expected),
        `${task.taskId}/${hiddenCase.caseId} reference satisfies predeclared hidden expectation`);
    }
  }
} finally { await rm(parent, { recursive: true, force: true }); }

{
  const source = "export function retentionDays(tier) { return tier === 'premium' ? 30 : 7; }\n";
  const policy = "export function retentionDaysFor(tier) { return tier === 'premium' ? 365 : 30; }\n";
  const observation: EngineeringObservation = Object.freeze({ schemaVersion: 1, observationId: "NYX-QH-READONLY-OBS",
    evidenceClass: "E3", state: "TEST_FAIL", baselineComparison: "NEW_FAILURE",
    candidateAttribution: "LIKELY_CANDIDATE_ATTRIBUTABLE", attributionConfidence: 0.9, epistemicState: "SUPPORTED",
    candidateCommit: "a".repeat(40), disposableRepositoryId: "QH-DISPOSABLE", applicationId: "QH-APPLICATION",
    proposalDigest: "b".repeat(64), toolId: "TEST", toolKind: "TEST", toolIdentityDigest: "c".repeat(64),
    environmentIdentity: "quality-assurance", diagnostics: Object.freeze([]), candidateFailureSignature: "d".repeat(64),
    baselineFailureSignature: null, candidateEvidenceId: "QH-EVIDENCE", baselineEvidenceId: null,
    unknowns: Object.freeze([]), contradictions: Object.freeze([]), observedAtEpochMs: Date.now(), grantsAuthority: false });
  const output = JSON.stringify({ decision: "PROPOSE_EDIT", diagnosis: "The policy value appears wrong.",
    causalHypothesis: "The policy module contains the defect.", evidenceRefs: ["OBJECTIVE", "FILE:src/retention-policy.mjs"],
    uncertainties: [], invariant: "Premium retention is 365 days.", failureInterpretation: "No prior candidate exists.",
    expectedResult: "The retention assertion passes.", counterexamples: ["standard tier remains unchanged"],
    requestedEvidenceRefs: [], assumptions: [], changes: [{ target: "src/retention-policy.mjs", replacement: policy }], confidence: 0.8 });
  const provider = NvidiaNimProvider.create({ providerId: "NYX-QH-ASSURANCE", model: "nvidia/nemotron-3-ultra",
    authorityMode: "TEST_DOUBLE_ONLY", credentialSource: { sourceIdentity: "test-double:quality", read: () => "test-credential-material" },
    maxPromptBytes: 50_000, maxOutputTokens: 2_048, timeoutMs: 1_000,
    transport: async () => new Response(JSON.stringify({
      choices: [{ message: { content: output }, finish_reason: "stop" }],
    }), { status: 200 }) });
  const cognition = NyxNemotronEngineeringCognition.create({ cognitionId: "NYX-QH-ASSURANCE", provider,
    maxPromptBytes: 50_000, maxOutputTokens: 1_024 });
  const result = await cognition.proposeRepair({ schemaVersion: 1, cognitionRequestId: "NYX-QH-READONLY-REQUEST",
    objective: "Use repository policy without changing it.", observation,
    files: [{ relativePath: "src/retention.mjs", content: source, contentSha256: hash(source) },
      { relativePath: "src/retention-policy.mjs", content: policy, contentSha256: hash(policy) }],
    allowedMutationPaths: ["src/retention.mjs"], availableEvidence: [], priorHypotheses: [], priorCognitionFailures: [],
    candidateQualityFeedback: null, sourceQualityConstraints: NYX_DEFAULT_SOURCE_QUALITY_CONSTRAINTS,
    allowedVerificationToolIds: ["TEST"], maxChanges: 1, maxPatchBytes: 2_048, maxDiagnosisCharacters: 1_000,
    maxCounterexamples: 3, observedAtEpochMs: Date.now() });
  check(result.decision === "COGNITION_ERROR" && result.schemaDiagnostics.some((item) => item.category === "UNSUPPORTED_FILE_TARGET"),
    "read-only evidence remains non-mutable even after it enters Νύξ cognition context");
  check(result.hypothesis === null && result.evidenceRequest === null && !result.omegaAuthorityGranted,
    "rejected observation-to-mutation escalation is inert and grants no authority");
}

console.log(`Omega NYX engineering quality assurance tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) { console.error("FAILURES:"); for (const failure of failures) console.error(`  - ${failure}`); process.exit(1); }

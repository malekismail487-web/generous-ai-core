import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { NYX_SEMANTIC_REPAIR_CONTRACT_DIGEST, NYX_SEMANTIC_REPAIR_CONTRACT_VERSION,
  NyxNemotronEngineeringCognition } from "../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";
import { NvidiaNimProvider } from "../src/lib/codelab/model/nvidiaNimProvider";
import type { EngineeringObservation } from "../src/lib/codelab/observation/r3EngineeringObservation";
import { NYX_ENGINEERING_QUALITY_HOLDOUT } from "./omega/nyx-quality-holdout-fixtures";

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
check(/^[a-f0-9]{64}$/.test(NYX_SEMANTIC_REPAIR_CONTRACT_DIGEST)
  && NYX_SEMANTIC_REPAIR_CONTRACT_VERSION === "nyx-causal-engineering-intent/2",
"scored cognition contract has a frozen version and deterministic digest");

const parent = await mkdtemp(join(tmpdir(), "nyx-quality-assurance-"));
try {
  for (const task of NYX_ENGINEERING_QUALITY_HOLDOUT) {
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
    transport: async () => new Response(JSON.stringify({ choices: [{ message: { content: output } }] }), { status: 200 }) });
  const cognition = NyxNemotronEngineeringCognition.create({ cognitionId: "NYX-QH-ASSURANCE", provider,
    maxPromptBytes: 50_000, maxOutputTokens: 1_024 });
  const result = await cognition.proposeRepair({ schemaVersion: 1, cognitionRequestId: "NYX-QH-READONLY-REQUEST",
    objective: "Use repository policy without changing it.", observation,
    files: [{ relativePath: "src/retention.mjs", content: source, contentSha256: hash(source) },
      { relativePath: "src/retention-policy.mjs", content: policy, contentSha256: hash(policy) }],
    allowedMutationPaths: ["src/retention.mjs"], availableEvidence: [], priorHypotheses: [],
    allowedVerificationToolIds: ["TEST"], maxChanges: 1, maxPatchBytes: 2_048, maxDiagnosisCharacters: 1_000,
    maxCounterexamples: 3, observedAtEpochMs: Date.now() });
  check(result.decision === "COGNITION_ERROR" && result.schemaDiagnostics.some((item) => item.category === "UNSUPPORTED_FILE_TARGET"),
    "read-only evidence remains non-mutable even after it enters Νύξ cognition context");
  check(result.hypothesis === null && result.evidenceRequest === null && !result.omegaAuthorityGranted,
    "rejected observation-to-mutation escalation is inert and grants no authority");
}

console.log(`Omega NYX engineering quality assurance tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) { console.error("FAILURES:"); for (const failure of failures) console.error(`  - ${failure}`); process.exit(1); }

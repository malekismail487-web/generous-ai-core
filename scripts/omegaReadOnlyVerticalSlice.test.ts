import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EvidenceAdmissionPolicy, EvidenceCandidateBinding } from "./evaluation/evidence-custody/contracts";
import { assureReadOnlyVerticalSlice, reevaluateMaterialClaim } from "./evaluation/ro-vertical-slice/assurance";
import type { ReadOnlyVerticalSliceInput } from "./evaluation/ro-vertical-slice/contracts";
import { runReadOnlyVerticalSlice } from "./evaluation/ro-vertical-slice/orchestrator";
import { OMEGA_BASELINE_REGISTRY } from "../src/lib/codelab/registry/baseline";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(condition: unknown, label: string): void {
  if (condition) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}

const ROOT = resolve(".");
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim().length > 0;
const CANDIDATE: EvidenceCandidateBinding = Object.freeze({
  commit,
  capabilityVersion: dirty ? "ro-vs-integration/1+dirty-worktree" : "ro-vs-integration/1",
  schemaVersion: 1,
  environmentIdentity: dirty ? "windows-node24-live-repository:dirty" : "windows-node24-live-repository:clean",
});

function policy(): EvidenceAdmissionPolicy {
  return {
    schemaVersion: 1, policyId: "RO-VS-CUSTODY-POLICY", custodianId: "RO-VS-CUSTODIAN", expectedCandidate: CANDIDATE,
    compatibleEvaluatorVersions: ["ro-vs-evaluator/1"], allowedEvidenceTypes: ["R1_REPOSITORY_OBSERVATION"],
    admittedAtEpochMs: 5_000, maxEvidenceAgeMs: 5_000, maxFutureSkewMs: 0,
  };
}

function input(overrides: Partial<ReadOnlyVerticalSliceInput> = {}): ReadOnlyVerticalSliceInput {
  return {
    schemaVersion: 1,
    candidate: CANDIDATE,
    evaluatorVersion: "ro-vs-evaluator/1",
    objective: {
      objectiveId: "RO-VS-LIVE-PACKAGE-INSPECTION",
      statement: "Inspect the live repository package identity and privacy flag without mutation.",
      registryRecordId: "Ω-CAP-READ-REPOSITORY",
      requests: [{ requestId: "RO-VS-REQUEST-PACKAGE", action: "READ_FILE", resourcePath: "package.json", observedAtEpochMs: 2_000 }],
      claims: [
        { claimId: "RO-VS-CLAIM-PACKAGE-NAME", sourceRequestId: "RO-VS-REQUEST-PACKAGE", selector: { kind: "JSON_FIELD", path: ["name"] } },
        { claimId: "RO-VS-CLAIM-PACKAGE-PRIVATE", sourceRequestId: "RO-VS-REQUEST-PACKAGE", selector: { kind: "JSON_FIELD", path: ["private"] } },
        { claimId: "RO-VS-CLAIM-PACKAGE-DIGEST", sourceRequestId: "RO-VS-REQUEST-PACKAGE", selector: { kind: "FILE_SHA256" } },
      ],
    },
    registry: OMEGA_BASELINE_REGISTRY,
    executor: {
      executorId: "RO-VS-R1-EXECUTOR", tokenId: "RO-VS-R1-TOKEN", repositoryRoot: ROOT, resourceScopes: ["package.json"],
      issuedAtEpochMs: 1_000, expiresAtEpochMs: 9_000,
      constraints: { maxFileBytes: 100_000, maxDirectoryEntries: 100, allowedExtensions: [".json"] },
      issuer: "OMEGA-INSTITUTION", auditIdentity: "OMEGA-RO-VS-INTEGRATION-001",
    },
    admissionPolicy: policy(),
    terminatedAtEpochMs: 4_000,
    knownContradictions: [],
    knownUnknowns: [],
    ...overrides,
  };
}

const live = await runReadOnlyVerticalSlice(input());
assert(live.assurance.decision === "ACCEPT" && live.final.decision === "ACCEPT", "live deterministic R1 objective reaches evidence-backed ACCEPT");
assert(live.final.evidenceLinkedClaims.length === 3 && live.assurance.acceptedClaimIds.length === 3, "every material live claim is accepted and evidence-linked");
assert(live.run.claims.find((item) => item.claimId === "RO-VS-CLAIM-PACKAGE-NAME")?.value === "vite_react_shadcn_ts", "live package name is observed through R1");
assert(live.run.claims.find((item) => item.claimId === "RO-VS-CLAIM-PACKAGE-PRIVATE")?.value === true, "live package privacy flag is observed through R1");
assert(live.run.claims.every((item) => item.evidenceAdmissionRef.startsWith("evidence://RO-VS-CUSTODIAN/")), "every material claim carries a custody admission reference");
assert(live.run.claims.every((item) => item.candidate.commit === commit && item.evaluatorVersion === "ro-vs-evaluator/1"), "claims bind exact candidate and evaluator version");
assert(live.run.claims.every((item) => item.authorityScope.operation === "READ_REPOSITORY" && item.authorityScope.resourceScopes.length === 1), "claims preserve exact R1 authority scope");
assert(live.run.registryAssociation.registryRecordId === "Ω-CAP-READ-REPOSITORY" && live.run.registryAssociation.maturityChanged === false, "claims associate to registry without inflating maturity");
assert(live.run.executorAudit.length === 2 && live.run.executorAudit[0].toolAction?.action === "READ_FILE", "ledger preserves the authorized observation action");
assert(live.run.executorAudit[1].authorization.code === "EXECUTOR_TERMINATED" && live.run.executorAudit[1].toolAction === null, "terminal probe proves authority revocation without a tool action");
assert(live.run.custody.length === 3 && live.run.custody.every((item) => item.record.candidate.commit === commit), "custody admits each claim against the exact candidate");
assert(live.assurance.authorityCeiling === "R1_READ_REPOSITORY" && live.assurance.grantsAuthority === false, "assurance preserves R1 ceiling and grants no authority");

const claim = live.run.claims[0];
const currentContext = { currentCandidate: CANDIDATE, sourceAvailable: true, currentSourceContentSha256: claim.sourceContentSha256, compatibleEvaluatorVersions: [claim.evaluatorVersion], contradictions: [] };
assert(reevaluateMaterialClaim(claim, currentContext).epistemicState === "SUPPORTED", "unchanged exact-bound claim remains supported");
assert(reevaluateMaterialClaim(claim, { ...currentContext, currentSourceContentSha256: "f".repeat(64) }).epistemicState === "STALE", "file hash change invalidates claim as stale");
assert(reevaluateMaterialClaim(claim, { ...currentContext, currentCandidate: { ...CANDIDATE, commit: "a".repeat(40) } }).epistemicState === "STALE", "repository candidate change invalidates claim as stale");
assert(reevaluateMaterialClaim(claim, { ...currentContext, compatibleEvaluatorVersions: [] }).epistemicState === "STALE", "incompatible evaluator invalidates claim as stale");
assert(reevaluateMaterialClaim(claim, { ...currentContext, sourceAvailable: false }).epistemicState === "UNKNOWN", "source disappearance becomes UNKNOWN rather than fabricated support");
const noncritical = { contradictionId: "CONTRADICTION-1", claimId: claim.claimId, severity: "NONCRITICAL" as const, evidenceAdmissionRef: "evidence://external/one" };
assert(reevaluateMaterialClaim(claim, { ...currentContext, contradictions: [noncritical] }).epistemicState === "CONFLICTED", "noncritical contradiction yields CONFLICTED");
assert(reevaluateMaterialClaim(claim, { ...currentContext, contradictions: [{ ...noncritical, severity: "CRITICAL" }] }).epistemicState === "REFUTED", "critical contradiction dominates as REFUTED");

const tamperedRef = structuredClone(live.run);
(tamperedRef.claims as { evidenceAdmissionRef: string }[])[0].evidenceAdmissionRef = "evidence://fake/missing";
assert(assureReadOnlyVerticalSlice(tamperedRef).decision === "INSUFFICIENT_EVIDENCE", "fake claim admission reference cannot be accepted");
const tamperedValue = structuredClone(live.run);
(tamperedValue.claims as { value: string }[])[0].value = "fabricated-package";
assert(assureReadOnlyVerticalSlice(tamperedValue).decision === "REJECT", "claim value mismatch with admitted artifact is rejected");
const omittedAudit = { ...structuredClone(live.run), executorAudit: live.run.executorAudit.slice(1) };
assert(assureReadOnlyVerticalSlice(omittedAudit).decision === "REJECT", "operation ledger cannot silently omit the observed tool action");
const criticalRun = { ...structuredClone(live.run), knownContradictions: [{ ...noncritical, severity: "CRITICAL" as const }] };
assert(assureReadOnlyVerticalSlice(criticalRun).decision === "REJECT", "externally supplied critical contradiction cannot be suppressed");
const unknownRun = { ...structuredClone(live.run), knownUnknowns: ["SOURCE_FRESHNESS_NOT_REESTABLISHED"] };
assert(assureReadOnlyVerticalSlice(unknownRun).decision === "INSUFFICIENT_EVIDENCE", "externally supplied unknown cannot be suppressed");

const denied = await runReadOnlyVerticalSlice(input({
  objective: {
    ...input().objective,
    objectiveId: "RO-VS-DENIED",
    requests: [{ requestId: "RO-VS-REQUEST-PACKAGE", action: "READ_FILE", resourcePath: "../outside.json", observedAtEpochMs: 2_000 }],
    claims: [{ claimId: "RO-VS-DENIED-CLAIM", sourceRequestId: "RO-VS-REQUEST-PACKAGE", selector: { kind: "RESOURCE_STATUS" } }],
  },
}));
assert(denied.assurance.decision === "INSUFFICIENT_EVIDENCE" && denied.run.executorAudit[0].toolAction === null, "scope-boundary denial produces no tool action and no false claim support");
const privilege = await runReadOnlyVerticalSlice(input({
  objective: {
    ...input().objective,
    objectiveId: "RO-VS-PRIVILEGE-ATTACK",
    requests: [{ requestId: "RO-VS-REQUEST-PACKAGE", action: "WRITE_SANDBOX", resourcePath: "package.json", observedAtEpochMs: 2_000 }],
    claims: [{ claimId: "RO-VS-PRIVILEGE-CLAIM", sourceRequestId: "RO-VS-REQUEST-PACKAGE", selector: { kind: "RESOURCE_STATUS" } }],
  },
}));
assert(privilege.assurance.decision === "REJECT" && privilege.run.executorAudit[0].authorization.code === "UNSUPPORTED_OPERATION", "privilege upgrade request is denied and rejected by assurance");

const custodianSource = readFileSync(resolve("scripts/evaluation/evidence-custody/custodian.ts"), "utf8");
assert(!custodianSource.includes("node:fs") && !custodianSource.includes("node:child_process") && !custodianSource.includes("fetch("), "custodian has no repository, process, or network observation authority");

console.log(`Omega read-only vertical slice tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

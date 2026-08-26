import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { handleRetiredAleApiRequest } from "../supabase/functions/ale-api/retirement";
import { EvidenceCustodySession, computeAuthoritativeEvidenceDigest } from "./evaluation/evidence-custody/custodian";
import type { EvidenceAdmissionPolicy, EvidenceArtifact, EvidenceCandidateBinding, JsonValue } from "./evaluation/evidence-custody/contracts";
import type { CustodyAdmissionEnvelope } from "./evaluation/registry-evidence-bridge/bridge";
import {
  ALE_RETIREMENT_GATEWAY_ARTIFACT,
  ALE_RETIREMENT_HANDLER_ARTIFACT,
  ALE_RETIREMENT_MIGRATION_ARTIFACT,
  ALE_RETIREMENT_MIGRATION_ID,
  validateAleRetirementReleaseManifest,
  type AleRetirementReleaseManifest,
  type Sec003RetirementObservationKind,
  type Sec003RetirementPackage,
} from "./evaluation/sec003-retirement/contracts";
import { evaluateSec003AleRetirement, projectAleRetirementToR2Readiness } from "./evaluation/sec003-retirement/evaluator";
import { CURRENT_R2_A_READINESS_DECISION, CURRENT_R2_A_READINESS_INPUT } from "../src/lib/codelab/assurance/r2AReadiness";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gatewayUrl = `https://synthetic.invalid/${["functions", "v1", "ale-api"].join("/")}`;
const legacyTables = ["keys", "students", "usage"].map((suffix) => ["ale", "api", suffix].join("_"));
const legacyKeysTable = legacyTables[0];
let passed = 0; let failed = 0; const failures: string[] = [];
function assert(value: unknown, label: string): void { if (value) passed += 1; else { failed += 1; failures.push(label); console.error(`  x ${label}`); } }
function source(path: string): string { return readFileSync(resolve(ROOT, path), "utf8").replace(/\r\n?/g, "\n"); }
function sha256(path: string): string { return createHash("sha256").update(readFileSync(resolve(ROOT, path))).digest("hex"); }

const syntheticLegacyCredential = ["ale", "live", "syntheticcredential00000001"].join("_");
for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
  const response = handleRetiredAleApiRequest(new Request(gatewayUrl, {
    method, headers: { Authorization: `Bearer ${syntheticLegacyCredential}` },
  }));
  const body = await response.json() as { code?: string };
  assert(response.status === 410 && body.code === "ALE_EXTERNAL_API_RETIRED", `${method} with a syntactically valid legacy credential is retired`);
}
const noCredential = handleRetiredAleApiRequest(new Request(gatewayUrl, { method: "POST" }));
assert(noCredential.status === 410, "missing credentials cannot reveal an alternate authorization path");
const unrelatedBearer = handleRetiredAleApiRequest(new Request(gatewayUrl, { method: "POST", headers: { Authorization: "Bearer synthetic-unrelated-token" } }));
assert(unrelatedBearer.status === 410, "another bearer class cannot activate the retired gateway");
const preflight = handleRetiredAleApiRequest(new Request(gatewayUrl, { method: "OPTIONS" }));
assert(preflight.status === 204, "preflight is non-authorizing and returns no content");

const gateway = source(ALE_RETIREMENT_GATEWAY_ARTIFACT);
const handler = source(ALE_RETIREMENT_HANDLER_ARTIFACT);
const executableGateway = `${gateway}\n${handler}`;
assert(/Deno\.serve\(handleRetiredAleApiRequest\)/.test(gateway), "deployed entry point serves only the retirement handler");
for (const forbidden of ["createClient", "Deno.env", ".from(", "sha256", "auth.admin", "generateLink", "verifyOtp", "fetch("]) {
  assert(!executableGateway.includes(forbidden), `retired gateway excludes ${forbidden}`);
}
assert(legacyTables.every((table) => !executableGateway.includes(table)), "no legacy database lookup or usage path remains executable");
assert(!new RegExp(["LOVABLE", "API", "KEY"].join("_")).test(executableGateway) && !executableGateway.includes(["lumina", "api", "keys"].join("_")) && !executableGateway.includes(["lum", "live", ""].join("_")), "retirement cannot activate or modify unrelated Lumina credential systems");

function walk(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
const applicationSources = walk(resolve(ROOT, "src")).filter((path) => /\.[jt]sx?$/.test(path));
const internalLegacyPattern = new RegExp(`functions\\.invoke\\s*\\(\\s*["'\`]${["ale", "api"].join("-")}["'\`]|${["functions", "v1", "ale-api"].join("\\/")}`);
const internalLegacyCallers = applicationSources.filter((path) => internalLegacyPattern.test(readFileSync(path, "utf8")));
assert(internalLegacyCallers.length === 0, "tracked Lumina application code has no dependency on the retired external gateway");
for (const path of [
  "supabase/functions/ability-update/index.ts",
  "supabase/functions/kt-predict/index.ts",
  "supabase/functions/review-schedule/index.ts",
  "supabase/functions/teaching-generate/index.ts",
  "supabase/functions/predict-student/index.ts",
]) {
  assert(existsSync(resolve(ROOT, path)), `internal adaptive-learning function remains present: ${relative(ROOT, resolve(ROOT, path)).replaceAll("\\", "/")}`);
}
assert(sha256("supabase/functions/lumina-api/index.ts") === "cca1b8bd3d4d8bad44b605020685bf13247bd70c651eecb801a87320be246701", "separate Lumina API gateway remains byte-identical to the accepted pre-retirement baseline");
assert(sha256("src/components/admin/LuminaApiPanel.tsx") === "bea32aab9cca25053ebb977d930efcb69ce29db2002f2696cfdb220b8f1a6a2d", "separate Lumina API administration UI remains byte-identical to the accepted pre-retirement baseline");

const migration = source(ALE_RETIREMENT_MIGRATION_ARTIFACT);
const guardAt = migration.indexOf(`to_regclass('public.${legacyKeysTable}') IS NULL`);
const updateAt = migration.indexOf(`UPDATE public.${legacyKeysTable}`);
assert(guardAt >= 0 && updateAt > guardAt, "table absence is checked before any legacy-table update");
assert(/TABLE_ABSENT retired_rows=0/.test(migration), "table-absent outcome is explicit and non-failing");
assert(/TABLE_PRESENT retired_rows=%/.test(migration), "table-present outcome records only a retirement count");
assert(/SET is_active = false,[\s\S]*revoked_at = COALESCE\(revoked_at, now\(\)\)/.test(migration), "table-present path deactivates and revokes legacy rows");
assert(!/CREATE\s+TABLE/i.test(migration), "retirement migration never creates the obsolete table");
const notices = migration.split("\n").filter((line) => /RAISE NOTICE/.test(line)).join("\n");
assert(!/key_hash|key_prefix|credential/i.test(notices), "migration notices contain no credential identifiers or material");

const CANDIDATE: EvidenceCandidateBinding = Object.freeze({
  commit: "c".repeat(40), capabilityVersion: "sec003-ale-retirement/1", schemaVersion: 1, environmentIdentity: "synthetic-lovable-deployment",
});
const PROJECT = "synthetic-linked-lovable-project";
let sequence = 0;
function manifest(): AleRetirementReleaseManifest {
  return {
    schemaVersion: 1, manifestId: "SEC003-ALE-RETIREMENT-RELEASE-001", candidateCommit: CANDIDATE.commit,
    branch: "sol/omega-institutional-spine", affectedArtifacts: [ALE_RETIREMENT_GATEWAY_ARTIFACT, ALE_RETIREMENT_HANDLER_ARTIFACT, ALE_RETIREMENT_MIGRATION_ARTIFACT],
    migrationIdentity: ALE_RETIREMENT_MIGRATION_ID, expectedLegacyVerifierState: "RETIRED_FAIL_CLOSED",
    expectedDatabaseRetirementStates: ["TABLE_PRESENT_ALL_INACTIVE", "TABLE_ABSENT"], expectedLegacyCredentialOutcome: "REJECTED_RETIRED",
    unchangedCredentialSystems: ["LUMINA_API_GATEWAY", "LUMINA_EXTERNAL_CREDENTIAL_RECORDS"],
    operatorAction: "Publish the exact candidate through the linked Lovable project.",
    requiredResultingEvidence: ["deployed commit", "gateway retirement result", "database retirement result"],
    sec003Evaluator: "scripts/evaluation/sec003-retirement/evaluator.ts", deploymentOccurred: false, containsSecretMaterial: false,
  };
}
assert(validateAleRetirementReleaseManifest(manifest(), CANDIDATE.commit).length === 0, "complete non-secret release manifest is valid");
assert(validateAleRetirementReleaseManifest({ ...manifest(), candidateCommit: "bad" }, CANDIDATE.commit).includes("malformed_candidate_commit"), "malformed release commit is rejected");
assert(validateAleRetirementReleaseManifest({ ...manifest(), deploymentOccurred: true as false }).includes("manifest_falsely_claims_deployment"), "release manifest cannot claim deployment");

function policy(): EvidenceAdmissionPolicy {
  return {
    schemaVersion: 1, policyId: "SEC003-ALE-RETIREMENT-POLICY", custodianId: "SEC003-ALE-RETIREMENT-CUSTODIAN", expectedCandidate: CANDIDATE,
    compatibleEvaluatorVersions: ["sec003-ale-retirement-evaluator/1"],
    allowedEvidenceTypes: ["SEC003_LOVABLE_DEPLOYMENT", "SEC003_DATABASE_RETIREMENT", "SEC003_DEPENDENCY_PRESERVATION"],
    admittedAtEpochMs: 10_000, maxEvidenceAgeMs: 10_000, maxFutureSkewMs: 0,
  };
}
function artifact(kind: Sec003RetirementObservationKind, data: Record<string, JsonValue>, evidenceClass: "E3" | "E4" = kind === "DEPENDENCY_PRESERVATION" ? "E3" : "E4", overrides: Partial<EvidenceArtifact> = {}): EvidenceArtifact {
  sequence += 1;
  return {
    schemaVersion: 1, artifactId: `SEC003-RETIREMENT-EVIDENCE-${sequence}`, evidenceType: `SEC003_${kind}`,
    source: `synthetic-lovable://${kind.toLowerCase()}`, candidate: CANDIDATE, evaluatorVersion: "sec003-ale-retirement-evaluator/1", observedAtEpochMs: 6_000,
    independence: { evidenceClass, evidenceChannel: kind === "DEPENDENCY_PRESERVATION" ? "repository-dependency-analysis" : "lovable-resulting-state", producerOwner: "AUTHORIZED-LOVABLE-OPERATOR", evaluatorOwner: "OMEGA-SEC003-RETIREMENT-EVALUATOR", oracleOwner: "LOVABLE-DEPLOYMENT", implementationOwner: "OMEGA-SEC003-RELEASE", sharesImplementationHelpers: false, independenceBasis: "Synthetic fixture models separately produced non-secret resulting-state evidence and does not certify a real deployment." },
    payload: { schemaVersion: 1, closureId: "SEC003-ALE-RETIREMENT-SYNTHETIC", projectRef: PROJECT, candidateCommit: CANDIDATE.commit, kind, secretMaterialIncluded: false, data },
    ...overrides,
  };
}
function artifacts(databaseOutcome: "TABLE_PRESENT_ALL_INACTIVE" | "TABLE_ABSENT" = "TABLE_PRESENT_ALL_INACTIVE"): readonly EvidenceArtifact[] {
  return [
    artifact("LOVABLE_DEPLOYMENT", { deploymentAuthority: "AUTHORIZED_LOVABLE_PROJECT", deployedCommit: CANDIDATE.commit, gatewayState: "RETIRED_FAIL_CLOSED", syntheticLegacyRequestOutcome: "REJECTED_RETIRED", httpStatus: 410, databaseLookupAttempted: false, learnerProvisioningAttempted: false, learnerTokenMintingAttempted: false, downstreamForwardingAttempted: false, deploymentEvidenceRef: "lovable://synthetic/deployment", resultingStateEvidenceRef: "lovable://synthetic/retired-gateway" }),
    artifact("DATABASE_RETIREMENT", { migrationIdentity: ALE_RETIREMENT_MIGRATION_ID, outcome: databaseOutcome, activeRowsAfter: databaseOutcome === "TABLE_ABSENT" ? null : 0, retiredRows: databaseOutcome === "TABLE_ABSENT" ? 0 : 1, migrationEvidenceRef: "lovable://synthetic/migration" }),
    artifact("DEPENDENCY_PRESERVATION", { internalAdaptiveLearningPreserved: true, internalCallsLegacyGateway: false, luminaCredentialSystemUnchanged: true, externalIntegrationRequired: false, externalIntegrationStatus: "NOT_REQUIRED", evidenceRef: "repository://synthetic/dependency-analysis" }),
  ];
}
function admit(items: readonly EvidenceArtifact[]): readonly CustodyAdmissionEnvelope[] {
  const admissionPolicy = policy(); const session = new EvidenceCustodySession(admissionPolicy);
  return items.map((item, index) => {
    const admitted = session.admit({ schemaVersion: 1, requestId: `SEC003-RETIREMENT-REQUEST-${index}`, artifact: item, candidateClaimedDigest: computeAuthoritativeEvidenceDigest(item) });
    if (admitted.decision !== "ADMIT") throw new Error(`fixture rejected: ${admitted.issues.join(",")}`);
    return { record: admitted.record, artifact: item, policy: admissionPolicy };
  });
}
function closure(items = artifacts()): Sec003RetirementPackage {
  const admissions = admit(items);
  return { schemaVersion: 1, closureId: "SEC003-ALE-RETIREMENT-SYNTHETIC", expectedProjectRef: PROJECT, expectedCandidateCommit: CANDIDATE.commit, releaseManifest: manifest(), admissionRefs: admissions.map((item) => item.record.admissionRef), admissions };
}

for (const outcome of ["TABLE_PRESENT_ALL_INACTIVE", "TABLE_ABSENT"] as const) {
  const decision = evaluateSec003AleRetirement(closure(artifacts(outcome)));
  assert(decision.decision === "CLOSED" && decision.closureState === "CONFIRMED_INVALID" && decision.databaseRetirement === outcome, `${outcome} can close only with complete deployment evidence`);
  assert(projectAleRetirementToR2Readiness(decision) === "CONFIRMED_INVALID", `${outcome} closed result projects the accepted security state`);
  assert(decision.grantsAuthority === false && decision.containsSecretMaterial === false, `${outcome} closure grants no authority and contains no secret material`);
}
const noEvidence = evaluateSec003AleRetirement(closure([]));
assert(noEvidence.decision === "INSUFFICIENT_EVIDENCE" && projectAleRetirementToR2Readiness(noEvidence) === "OPEN", "repository release without deployment evidence cannot close SEC-003");
const forwarded = artifacts().map((item) => (item.payload as Record<string, JsonValue>).kind === "LOVABLE_DEPLOYMENT" ? { ...item, payload: { ...(item.payload as Record<string, JsonValue>), data: { ...((item.payload as Record<string, JsonValue>).data as Record<string, JsonValue>), downstreamForwardingAttempted: true } } } : item);
assert(evaluateSec003AleRetirement(closure(forwarded)).issues.includes("deployed_verifier_retirement_unproven"), "any observed downstream forwarding prevents closure");
const activeRows = artifacts().map((item) => (item.payload as Record<string, JsonValue>).kind === "DATABASE_RETIREMENT" ? { ...item, payload: { ...(item.payload as Record<string, JsonValue>), data: { ...((item.payload as Record<string, JsonValue>).data as Record<string, JsonValue>), activeRowsAfter: 1 } } } : item);
assert(evaluateSec003AleRetirement(closure(activeRows)).issues.includes("database_retirement_unproven"), "an active legacy row prevents database retirement evidence");
const secretEvidence = artifacts().map((item, index) => index === 0 ? { ...item, payload: { ...(item.payload as Record<string, JsonValue>), secretMaterialIncluded: true } } : item);
assert(evaluateSec003AleRetirement(closure(secretEvidence)).decision === "REJECTED", "secret-bearing deployment evidence is rejected");
const wrongCandidate = closure();
assert(evaluateSec003AleRetirement({ ...wrongCandidate, expectedCandidateCommit: "d".repeat(40) }).decision === "REJECTED", "cross-candidate deployment evidence is rejected");
const weakDeployment = artifacts().map((item, index) => index === 0 ? { ...item, independence: { ...item.independence, evidenceClass: "E3" as const } } : item);
assert(evaluateSec003AleRetirement(closure(weakDeployment)).issues.includes("evidence_class_below_requirement:LOVABLE_DEPLOYMENT"), "deployment evidence below E4 cannot close SEC-003");
assert(CURRENT_R2_A_READINESS_INPUT.securityClosure === "OPEN" && CURRENT_R2_A_READINESS_DECISION.decision === "INELIGIBLE", "real SEC-003 and R2-A readiness remain open and ineligible before deployment");
assert(CURRENT_R2_A_READINESS_DECISION.writeSandboxAvailable === false, "WRITE_SANDBOX remains unavailable");

console.log(`Omega SEC-003 ALE retirement tests - passed: ${passed}, failed: ${failed}`);
if (failed) { for (const failure of failures) console.error(`  - ${failure}`); process.exit(1); }

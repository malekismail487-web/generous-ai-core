import {
  CURRENT_R2_A_READINESS_DECISION,
  CURRENT_R2_A_READINESS_INPUT,
  OMEGA_PRE_R2_BASELINE_COMMIT,
  OMEGA_R1_BASELINE_COMMIT,
  R2_A_ACCEPTED_SECURITY_CLOSURES,
  R2_A_READINESS_REQUIREMENTS,
  decideR2AReadiness,
  type R2AReadinessCheck,
  type R2AReadinessInput,
} from "../src/lib/codelab/assurance/r2AReadiness";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(value: unknown, label: string): void {
  if (value) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}

function check(requirement: R2AReadinessCheck["requirement"], overrides: Partial<R2AReadinessCheck> = {}): R2AReadinessCheck {
  return {
    requirement,
    result: "PASS",
    evidenceClass: requirement === "SEC_003_AUTHORIZED_CLOSURE" ? "E4" : "E3",
    evidenceRefs: [`evidence://${requirement.toLowerCase()}`],
    statement: `${requirement} freshly satisfied for the exact candidate.`,
    ...overrides,
  };
}

function input(overrides: Partial<R2AReadinessInput> = {}): R2AReadinessInput {
  return {
    schemaVersion: 1,
    decisionId: "OMEGA-R2-A-READINESS-FIXTURE",
    candidateCommit: "7".repeat(40),
    r1BaselineCommit: OMEGA_R1_BASELINE_COMMIT,
    preR2BaselineCommit: OMEGA_PRE_R2_BASELINE_COMMIT,
    securityClosure: "REVOKED_AND_VERIFIED",
    checks: R2_A_READINESS_REQUIREMENTS.map((requirement) => check(requirement)),
    currentAllowedAuthorities: ["READ_REPOSITORY"],
    currentUnavailableAuthorities: ["WRITE_SANDBOX", "PROVISION_SANDBOX", "TERMINATE_SANDBOX", "WRITE_SANDBOX_CONTENT"],
    currentForbiddenAuthorities: ["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"],
    ...overrides,
  };
}

assert(R2_A_READINESS_REQUIREMENTS.length === 10, "all ten readiness requirements are explicit");
assert(R2_A_ACCEPTED_SECURITY_CLOSURES.length === 3, "only three authoritative security closure states are accepted");
assert(CURRENT_R2_A_READINESS_INPUT.securityClosure === "OPEN", "current security closure remains open");
assert(CURRENT_R2_A_READINESS_DECISION.decision === "INELIGIBLE", "current R2-A transition is machine-ineligible");
assert(CURRENT_R2_A_READINESS_DECISION.reasons.includes("omega_sec_003_not_authoritatively_closed"), "current ineligibility names Ω-SEC-003");
assert(CURRENT_R2_A_READINESS_DECISION.grantsAuthority === false, "readiness decision never grants authority");
assert(CURRENT_R2_A_READINESS_DECISION.writeSandboxAvailable === false, "WRITE_SANDBOX remains unavailable");

for (const closure of R2_A_ACCEPTED_SECURITY_CLOSURES) {
  assert(decideR2AReadiness(input({ securityClosure: closure })).decision === "ELIGIBLE", `${closure} can satisfy the security closure when every other check passes`);
}
assert(decideR2AReadiness(input({ securityClosure: "CONFIRMED_INVALID", checks: input().checks.map((item) => item.requirement === "SEC_003_AUTHORIZED_CLOSURE" ? { ...item, evidenceClass: "E3" as const } : item) })).decision === "INSUFFICIENT_EVIDENCE", "security closure below E4 evidence remains insufficient");
assert(decideR2AReadiness(input({ securityClosure: "OPEN" })).decision === "INELIGIBLE", "open security gate is ineligible");
assert(decideR2AReadiness(input({ securityClosure: "UNKNOWN" })).decision === "INELIGIBLE", "unknown security gate is ineligible rather than optimistic");

for (const requirement of R2_A_READINESS_REQUIREMENTS) {
  const failedChecks = input().checks.map((item) => item.requirement === requirement ? { ...item, result: "FAIL" as const } : item);
  const result = decideR2AReadiness(input({ checks: failedChecks }));
  assert(result.decision === "INELIGIBLE" && result.failedRequirements.includes(requirement), `${requirement} explicit failure blocks eligibility`);
}

const missing = decideR2AReadiness(input({ checks: input().checks.slice(1) }));
assert(missing.decision === "INSUFFICIENT_EVIDENCE", "missing readiness requirement is insufficient");
assert(missing.unresolvedRequirements.includes("SEC_003_AUTHORIZED_CLOSURE"), "missing security requirement is reported exactly");
const unknown = decideR2AReadiness(input({ checks: input().checks.map((item) => item.requirement === "R1_BASELINE_PRESERVED" ? { ...item, result: "UNKNOWN" as const } : item) }));
assert(unknown.decision === "INSUFFICIENT_EVIDENCE", "unknown readiness evidence is insufficient");
const stale = decideR2AReadiness(input({ checks: input().checks.map((item) => item.requirement === "SECRET_SCAN_CLEAN" ? { ...item, result: "STALE" as const } : item) }));
assert(stale.decision === "INSUFFICIENT_EVIDENCE", "stale readiness evidence is insufficient");
const evidenceLess = decideR2AReadiness(input({ checks: input().checks.map((item) => item.requirement === "TYPESCRIPT_ZERO_DIAGNOSTICS" ? { ...item, evidenceRefs: [] } : item) }));
assert(evidenceLess.decision === "INSUFFICIENT_EVIDENCE", "passing check without evidence is insufficient");
assert(decideR2AReadiness(input({ checks: [...input().checks, input().checks[0]] })).decision === "INSUFFICIENT_EVIDENCE", "duplicate readiness requirement fails closed");
assert(decideR2AReadiness(input({ r1BaselineCommit: "8".repeat(40) })).decision === "INSUFFICIENT_EVIDENCE", "wrong R1 baseline cannot become eligible");
assert(decideR2AReadiness(input({ preR2BaselineCommit: "9".repeat(40) })).decision === "INSUFFICIENT_EVIDENCE", "wrong pre-R2 baseline cannot become eligible");
assert(decideR2AReadiness(input({ candidateCommit: "short" })).decision === "INSUFFICIENT_EVIDENCE", "malformed candidate identity fails closed");

assert(decideR2AReadiness(input({ currentAllowedAuthorities: [] })).decision === "INELIGIBLE", "loss of R1 read authority is ineligible");
assert(decideR2AReadiness(input({ currentAllowedAuthorities: ["READ_REPOSITORY", "SHELL"] })).decision === "INELIGIBLE", "unexpected currently allowed authority is ineligible");
assert(decideR2AReadiness(input({ currentUnavailableAuthorities: input().currentUnavailableAuthorities.filter((item) => item !== "WRITE_SANDBOX") })).decision === "INELIGIBLE", "WRITE_SANDBOX availability change blocks readiness");
assert(decideR2AReadiness(input({ currentUnavailableAuthorities: input().currentUnavailableAuthorities.filter((item) => item !== "PROVISION_SANDBOX") })).decision === "INELIGIBLE", "premature provisioning availability blocks readiness");
assert(decideR2AReadiness(input({ currentForbiddenAuthorities: input().currentForbiddenAuthorities.filter((item) => item !== "WRITE_REPOSITORY") })).decision === "INELIGIBLE", "repository-write prohibition must remain intact");
assert(decideR2AReadiness(input({ currentForbiddenAuthorities: input().currentForbiddenAuthorities.filter((item) => item !== "NETWORK") })).decision === "INELIGIBLE", "network prohibition must remain intact");

const eligible = decideR2AReadiness(input());
assert(eligible.decision === "ELIGIBLE", "complete exact-bound fresh evidence can make implementation eligible");
assert(eligible.reasons.length === 0 && eligible.failedRequirements.length === 0 && eligible.unresolvedRequirements.length === 0, "eligible decision contains no hidden blockers");
assert(eligible.grantsAuthority === false && eligible.writeSandboxAvailable === false, "eligibility remains distinct from authority grant");

console.log(`Omega R2-A readiness tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const item of failures) console.error(`  - ${item}`);
  process.exit(1);
}

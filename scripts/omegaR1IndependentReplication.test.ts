import { R1_REPLICATION_REQUIREMENTS } from "../src/lib/codelab/assurance/r1ReplicationSpec";
import { OMEGA_R1_INDEPENDENT_REPLICATION_001, validateR1ReplicationAttempt, type R1ReplicationAttempt } from "../src/lib/codelab/assurance/r1ReplicationAttempt";

let passed = 0; let failed = 0; const failures: string[] = [];
function assert(value: unknown, label: string): void { if (value) passed += 1; else { failed += 1; failures.push(label); console.error(`  x ${label}`); } }
const attempt = OMEGA_R1_INDEPENDENT_REPLICATION_001;
assert(validateR1ReplicationAttempt(attempt).length === 0, "blocked replication attempt is internally honest");
assert(attempt.outcome === "BLOCKED_ENVIRONMENT", "outcome is BLOCKED_ENVIRONMENT rather than replicated");
assert(attempt.independenceClassification === "NOT_ESTABLISHED" && attempt.evidenceClass === "E0", "blocked inspection does not inflate independence evidence");
assert(attempt.environmentCandidates.length === 3 && attempt.environmentCandidates.every((candidate) => !candidate.eligible), "every discovered environment is explicitly ineligible");
assert(attempt.environmentCandidates.some((candidate) => candidate.rejectionReasons.includes("active_worktree_not_independent")), "active worktree cannot self-replicate");
assert(attempt.environmentCandidates.some((candidate) => candidate.rejectionReasons.includes("package_install_forbidden")), "missing dependencies are not repaired by forbidden installation");
assert(attempt.environmentCandidates.some((candidate) => candidate.rejectionReasons.includes("preexisting_dependency_cache_untrusted")), "unverified dependency sandbox is not laundered as clean");
assert(attempt.executedRequirements.join(",") === "READ_ONLY_AUTHORITY,OUTPUT_MANIFEST", "only actually executed requirements are recorded");
assert(attempt.blockedRequirements.includes("CLEAN_CHECKOUT") && attempt.blockedRequirements.includes("INDEPENDENT_ENVIRONMENT_IDENTITY"), "environment prerequisites are explicitly blocked");
assert(attempt.skippedRequirements.includes("R1_PRIVATE_EVALUATOR") && attempt.failedRequirements.length === 0, "unrun evaluator is skipped, not failed or passed");
assert([...attempt.executedRequirements, ...attempt.failedRequirements, ...attempt.blockedRequirements, ...attempt.skippedRequirements].length === R1_REPLICATION_REQUIREMENTS.length, "every specification requirement has one outcome");
assert(!attempt.packageInstallAttempted && !attempt.networkAttempted && !attempt.sourceOrEnvironmentMutated && !attempt.grantsAuthority, "attempt preserved all authority constraints");
const inflated = { ...attempt, outcome: "REPLICATED" } as R1ReplicationAttempt;
assert(validateR1ReplicationAttempt(inflated).includes("replication_outcome_inflated"), "blocked attempt cannot be relabeled replicated");
console.log(`Omega R1 independent replication tests - passed: ${passed}, failed: ${failed}`); if (failed) { for (const item of failures) console.error(`  - ${item}`); process.exit(1); }

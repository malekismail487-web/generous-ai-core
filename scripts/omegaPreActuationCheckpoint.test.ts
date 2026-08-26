import { DIRECTIVE_009_WORKSTREAM_IDS } from "../src/lib/codelab/registry/directive009Coverage";
import {
  OMEGA_PREACTUATION_CHECKPOINT_001,
  OMEGA_PREACTUATION_CHECKPOINT_COMMIT,
  validatePreActuationCheckpoint,
  type PreActuationCheckpoint,
} from "../src/lib/codelab/registry/preActuationCheckpoint";

let passed = 0; let failed = 0; const failures: string[] = [];
function assert(value: unknown, label: string): void { if (value) passed += 1; else { failed += 1; failures.push(label); console.error(`  x ${label}`); } }
const checkpoint = OMEGA_PREACTUATION_CHECKPOINT_001;
assert(validatePreActuationCheckpoint(checkpoint).length === 0, "canonical checkpoint satisfies every invariant");
assert(checkpoint.candidateCommit === OMEGA_PREACTUATION_CHECKPOINT_COMMIT, "checkpoint binds exact accepted candidate");
assert(checkpoint.authority.available.join(",") === "READ_REPOSITORY", "authority ceiling remains R1");
assert(checkpoint.authority.unavailable.includes("WRITE_SANDBOX"), "WRITE_SANDBOX remains unavailable");
assert(checkpoint.security.sec003 === "BLOCKED_EXTERNAL" && checkpoint.security.preR2 === "NOT_READY", "security and pre-R2 states remain blocked");
assert(checkpoint.security.g1 === "OPEN" && checkpoint.security.g2 === "NOT_ACHIEVED", "G1 and G2 are not inflated");
assert(checkpoint.suiteManifest.suiteCount === 45 && checkpoint.suiteManifest.passedChecks === 1357 && checkpoint.suiteManifest.semanticDefinitions === 1306, "accepted suite manifest facts are frozen");
assert(checkpoint.directive009Workstreams.length === DIRECTIVE_009_WORKSTREAM_IDS.length && checkpoint.directive009CapabilityIds.length === 8, "all Directive 009 identities are bound");
assert(!checkpoint.grantsAuthority && !checkpoint.isR2 && !checkpoint.independentlyReplicated && !checkpoint.operationallySafeForMutation, "checkpoint explicitly denies operational overclaims");
assert(validatePreActuationCheckpoint({ ...checkpoint, isR2: true } as PreActuationCheckpoint).includes("checkpoint_claims_operational_capability"), "R2 overclaim is rejected");
assert(validatePreActuationCheckpoint({ ...checkpoint, candidateCommit: "0".repeat(40) } as PreActuationCheckpoint).includes("wrong_candidate_commit"), "candidate substitution is rejected");
assert(validatePreActuationCheckpoint({ ...checkpoint, planCoverage: "TOTAL" } as unknown as PreActuationCheckpoint).includes("dishonest_total_plan_coverage"), "total coverage overclaim is rejected");
console.log(`Omega pre-actuation checkpoint tests - passed: ${passed}, failed: ${failed}`); if (failed) { for (const item of failures) console.error(`  - ${item}`); process.exit(1); }

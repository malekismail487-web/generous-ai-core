import {
  analyzeInstitutionalCriticalPath,
  criticalPathStatus,
  validateInstitutionalCriticalPaths,
} from "../src/lib/codelab/registry/criticalPath";
import { deserializeRegistry, serializeRegistry, validateRegistry } from "../src/lib/codelab/registry/registry";
import { OMEGA_BASELINE_REGISTRY } from "../src/lib/codelab/registry/baseline";
import type { InstitutionalCriticalPath, OmegaRegistry } from "../src/lib/codelab/registry/types";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(value: unknown, label: string): void {
  if (value) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}

const PATH_ID = "Ω-PATH-CONTROLLED-MUTATION";
const path = OMEGA_BASELINE_REGISTRY.criticalPaths?.find((item) => item.pathId === PATH_ID);
assert(path !== undefined, "controlled-mutation critical path exists in baseline registry");
assert(validateInstitutionalCriticalPaths(OMEGA_BASELINE_REGISTRY).length === 0, "baseline critical-path graph validates");
assert(validateRegistry(OMEGA_BASELINE_REGISTRY).ok, "main registry validation includes critical-path validation");

if (path) {
  const current = analyzeInstitutionalCriticalPath(path);
  assert(current.targetSatisfied === false, "controlled-mutation target is not satisfied");
  assert(current.controllingBlockers.length === 1, "exactly one controlling root blocker is exposed");
  assert(current.controllingBlockers[0]?.workItemId === "Ω-WORK-SEC-003", "Ω-SEC-003 is the controlling blocker");
  assert(current.controllingBlockers[0]?.blockingReasons.includes("CORRECT_MANAGEMENT_ACCESS_UNAVAILABLE"), "machine blocker preserves the external access reason");
  assert(current.nextEligibleWorkItems.length === 0, "no operational critical-path chunk is currently eligible");
  assert(current.blockedWorkItems.some((item) => item.workItemId === "Ω-WORK-R2-A-001"), "R2-A is mechanically blocked");
  assert(current.blockedWorkItems.some((item) => item.workItemId === "Ω-WORK-ASSURE-R2-001"), "operational R2 assurance is mechanically blocked");
  assert(current.unknownWorkItems.length === 0, "known external blocking is not mislabeled unknown");
  assert(criticalPathStatus(OMEGA_BASELINE_REGISTRY, PATH_ID)?.controllingBlockers[0]?.workItemId === "Ω-WORK-SEC-003", "registry query returns controlling blocker directly");
  assert(criticalPathStatus(OMEGA_BASELINE_REGISTRY, "Ω-PATH-MISSING") === null, "unknown path query returns null explicitly");

  function updateStates(updates: Readonly<Record<string, "SATISFIED" | "NOT_STARTED">>): InstitutionalCriticalPath {
    return {
      ...structuredClone(path),
      workItems: path.workItems.map((item) => updates[item.workItemId]
        ? { ...item, state: updates[item.workItemId], blockingReasons: [] }
        : item),
    };
  }
  const secClosed = analyzeInstitutionalCriticalPath(updateStates({ "Ω-WORK-SEC-003": "SATISFIED" }));
  assert(secClosed.controllingBlockers.length === 0, "closing SEC-003 removes the external controlling blocker");
  assert(secClosed.nextEligibleWorkItems.some((item) => item.workItemId === "Ω-WORK-R2-A-READINESS-PASS"), "SEC-003 closure makes readiness passage the next eligible chunk");
  const readinessPassed = analyzeInstitutionalCriticalPath(updateStates({ "Ω-WORK-SEC-003": "SATISFIED", "Ω-WORK-R2-A-READINESS-PASS": "SATISFIED" }));
  assert(readinessPassed.nextEligibleWorkItems.some((item) => item.workItemId === "Ω-WORK-R2-A-001"), "passed readiness makes only R2-A operational implementation eligible");

  const chainIds = [
    "Ω-WORK-SEC-003",
    "Ω-WORK-R2-A-READINESS-PASS",
    "Ω-WORK-R2-A-001",
    "Ω-WORK-R2-B-001",
    "Ω-WORK-R2-C-001",
    "Ω-WORK-R2-D-001",
    "Ω-WORK-R2-E-001",
    "Ω-WORK-R2-F-001",
    "Ω-WORK-R2-G-001",
    "Ω-WORK-R2-COMPOSE-SEC-001",
    "Ω-WORK-ASSURE-R2-001",
  ];
  const allSatisfied = analyzeInstitutionalCriticalPath(updateStates(Object.fromEntries(chainIds.map((id) => [id, "SATISFIED"]))));
  assert(allSatisfied.targetSatisfied, "target becomes satisfied only after the full operational chain is satisfied");
  assert(allSatisfied.blockedWorkItems.length === 0 && allSatisfied.controllingBlockers.length === 0, "fully satisfied chain has no blockers");
}

function registryWithCriticalPath(mutator: (path: InstitutionalCriticalPath) => InstitutionalCriticalPath): OmegaRegistry {
  const clone = structuredClone(OMEGA_BASELINE_REGISTRY) as OmegaRegistry;
  const current = clone.criticalPaths?.[0];
  if (!current) throw new Error("missing_fixture_path");
  return { ...clone, criticalPaths: [mutator(current)] };
}
function invalidCode(registry: OmegaRegistry, code: string): boolean {
  const result = validateRegistry(registry);
  return result.ok === false && result.errors.some((item) => item.code === code);
}

assert(invalidCode(registryWithCriticalPath((item) => ({ ...item, targetWorkItemId: "Ω-WORK-MISSING" })), "unknown_critical_path_target"), "unknown target is rejected");
assert(invalidCode(registryWithCriticalPath((item) => ({ ...item, workItems: [...item.workItems, item.workItems[0]] })), "bad_or_duplicate_work_item_id"), "duplicate work item is rejected");
assert(invalidCode(registryWithCriticalPath((item) => ({ ...item, workItems: item.workItems.map((node, index) => index === 0 ? { ...node, registryRecordId: "Ω-PLAN-MISSING" } : node) })), "unknown_work_item_registry_record"), "unknown registry mapping is rejected");
assert(invalidCode(registryWithCriticalPath((item) => ({ ...item, workItems: item.workItems.map((node) => node.workItemId === "Ω-WORK-R2-A-001" ? { ...node, dependencies: ["Ω-WORK-MISSING"] } : node) })), "unknown_work_dependency"), "unknown dependency is rejected");
assert(invalidCode(registryWithCriticalPath((item) => ({ ...item, workItems: item.workItems.map((node) => node.workItemId === "Ω-WORK-R2-A-001" ? { ...node, dependencies: [node.workItemId] } : node) })), "self_work_dependency"), "self dependency is rejected");
assert(invalidCode(registryWithCriticalPath((item) => ({ ...item, workItems: item.workItems.map((node) => node.workItemId === "Ω-WORK-R2-A-001" ? { ...node, dependencies: [...node.dependencies, ...node.dependencies] } : node) })), "duplicate_or_malformed_work_dependencies"), "duplicate dependency is rejected");
assert(invalidCode(registryWithCriticalPath((item) => ({ ...item, workItems: item.workItems.map((node) => node.workItemId === "Ω-WORK-SEC-003" ? { ...node, blockingReasons: [] } : node) })), "external_blocker_without_reason"), "external blocker requires reason");
assert(invalidCode(registryWithCriticalPath((item) => ({ ...item, workItems: item.workItems.map((node) => node.workItemId === "Ω-WORK-EVIDENCE-CUSTODY" ? { ...node, blockingReasons: ["impossible"] } : node) })), "satisfied_work_claims_blocker"), "satisfied work cannot claim a blocker");
assert(invalidCode(registryWithCriticalPath((item) => ({ ...item, workItems: item.workItems.map((node) => node.workItemId === "Ω-WORK-SEC-003" ? { ...node, state: "INVALID" as never } : node) })), "malformed_work_item"), "unknown work state is rejected");
assert(invalidCode(registryWithCriticalPath((item) => ({ ...item, workItems: item.workItems.map((node) => {
  if (node.workItemId === "Ω-WORK-SEC-003") return { ...node, dependencies: ["Ω-WORK-R2-A-READINESS-PASS"] };
  return node;
}) })), "critical_path_cycle"), "dependency cycle is rejected");

const serialized = serializeRegistry(OMEGA_BASELINE_REGISTRY);
assert(serialized.ok, "registry with critical path serializes deterministically");
if (serialized.ok) {
  const roundTrip = deserializeRegistry(serialized.json);
  assert(roundTrip.ok, "serialized critical path survives deserialization");
  assert(roundTrip.ok && criticalPathStatus(roundTrip.registry, PATH_ID)?.controllingBlockers[0]?.workItemId === "Ω-WORK-SEC-003", "critical-path semantics survive serialization round trip");
}

console.log(`Omega registry critical-path tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const item of failures) console.error(`  - ${item}`);
  process.exit(1);
}

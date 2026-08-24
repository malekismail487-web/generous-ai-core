import {
  INSTITUTIONAL_WORK_STATES,
  type InstitutionalCriticalPath,
  type InstitutionalWorkItem,
  type OmegaRegistry,
} from "./types";

export interface CriticalPathValidationIssue {
  readonly code: string;
  readonly pathId: string;
  readonly workItemId: string | null;
  readonly message: string;
}

export interface CriticalPathAnalysis {
  readonly pathId: string;
  readonly targetWorkItemId: string;
  readonly targetSatisfied: boolean;
  readonly controllingBlockers: readonly InstitutionalWorkItem[];
  readonly nextEligibleWorkItems: readonly InstitutionalWorkItem[];
  readonly blockedWorkItems: readonly InstitutionalWorkItem[];
  readonly unknownWorkItems: readonly InstitutionalWorkItem[];
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function canonicalId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-zΩ][A-Za-z0-9Ω._:-]{2,127}$/.test(value);
}

function unique<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}

function findCycle(path: InstitutionalCriticalPath): readonly string[] | null {
  const nodes = new Map(path.workItems.map((item) => [item.workItemId, item]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  function visit(id: string): readonly string[] | null {
    if (visiting.has(id)) return [...stack.slice(stack.indexOf(id)), id];
    if (visited.has(id)) return null;
    visiting.add(id);
    stack.push(id);
    for (const dependency of nodes.get(id)?.dependencies ?? []) {
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  }
  for (const item of path.workItems) {
    const cycle = visit(item.workItemId);
    if (cycle) return cycle;
  }
  return null;
}

export function validateInstitutionalCriticalPaths(registry: OmegaRegistry): readonly CriticalPathValidationIssue[] {
  const issues: CriticalPathValidationIssue[] = [];
  const recordIds = new Set([...registry.plans, ...registry.capabilities].map((item) => item.canonicalId));
  const pathIds = new Set<string>();
  for (const path of registry.criticalPaths ?? []) {
    if (!canonicalId(path.pathId) || pathIds.has(path.pathId)) {
      issues.push({ code: "bad_or_duplicate_critical_path_id", pathId: String(path.pathId), workItemId: null, message: "Critical-path ID must be canonical and unique." });
    }
    pathIds.add(path.pathId);
    if (!nonEmpty(path.title) || !Array.isArray(path.workItems) || path.workItems.length === 0) {
      issues.push({ code: "malformed_critical_path", pathId: path.pathId, workItemId: null, message: "Critical path requires a title and at least one work item." });
    }
    const nodeIds = new Set<string>();
    for (const item of path.workItems) {
      if (!canonicalId(item.workItemId) || nodeIds.has(item.workItemId)) {
        issues.push({ code: "bad_or_duplicate_work_item_id", pathId: path.pathId, workItemId: String(item.workItemId), message: "Work-item ID must be canonical and unique within the path." });
      }
      nodeIds.add(item.workItemId);
      if (!nonEmpty(item.title) || !(INSTITUTIONAL_WORK_STATES as readonly unknown[]).includes(item.state)) {
        issues.push({ code: "malformed_work_item", pathId: path.pathId, workItemId: item.workItemId, message: "Work item requires title and known state." });
      }
      if (item.registryRecordId !== null && !recordIds.has(item.registryRecordId)) {
        issues.push({ code: "unknown_work_item_registry_record", pathId: path.pathId, workItemId: item.workItemId, message: `Unknown registry record ${item.registryRecordId}.` });
      }
      if (!Array.isArray(item.dependencies) || unique(item.dependencies).length !== item.dependencies.length) {
        issues.push({ code: "duplicate_or_malformed_work_dependencies", pathId: path.pathId, workItemId: item.workItemId, message: "Work dependencies must be a unique array." });
      }
      if (item.state === "BLOCKED_EXTERNAL" && item.blockingReasons.length === 0) {
        issues.push({ code: "external_blocker_without_reason", pathId: path.pathId, workItemId: item.workItemId, message: "Externally blocked work requires a reason." });
      }
      if (item.state === "SATISFIED" && item.blockingReasons.length > 0) {
        issues.push({ code: "satisfied_work_claims_blocker", pathId: path.pathId, workItemId: item.workItemId, message: "Satisfied work cannot retain a blocking reason." });
      }
    }
    if (!nodeIds.has(path.targetWorkItemId)) {
      issues.push({ code: "unknown_critical_path_target", pathId: path.pathId, workItemId: null, message: `Unknown target ${path.targetWorkItemId}.` });
    }
    for (const item of path.workItems) {
      for (const dependency of item.dependencies) {
        if (!nodeIds.has(dependency)) issues.push({ code: "unknown_work_dependency", pathId: path.pathId, workItemId: item.workItemId, message: `Unknown dependency ${dependency}.` });
        if (dependency === item.workItemId) issues.push({ code: "self_work_dependency", pathId: path.pathId, workItemId: item.workItemId, message: "Work item cannot depend on itself." });
      }
    }
    const cycle = findCycle(path);
    if (cycle) issues.push({ code: "critical_path_cycle", pathId: path.pathId, workItemId: cycle[0] ?? null, message: `Cycle detected: ${cycle.join(" -> ")}.` });
  }
  return issues;
}

export function analyzeInstitutionalCriticalPath(path: InstitutionalCriticalPath): CriticalPathAnalysis {
  const nodes = new Map(path.workItems.map((item) => [item.workItemId, item]));
  const isSatisfied = (id: string): boolean => nodes.get(id)?.state === "SATISFIED";
  const nextEligibleWorkItems = path.workItems.filter((item) => item.state === "NOT_STARTED" && item.dependencies.every(isSatisfied));
  const blockedWorkItems = path.workItems.filter((item) => item.state === "NOT_STARTED" && !item.dependencies.every(isSatisfied));
  const unknownWorkItems = path.workItems.filter((item) => item.state === "UNKNOWN" || item.state === "REJECTED");
  const blockers = new Map<string, InstitutionalWorkItem>();
  const visited = new Set<string>();
  function trace(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);
    const item = nodes.get(id);
    if (!item || item.state === "SATISFIED") return;
    if (item.state === "BLOCKED_EXTERNAL" || item.state === "UNKNOWN" || item.state === "REJECTED") {
      blockers.set(item.workItemId, item);
      return;
    }
    const unsatisfiedDependencies = item.dependencies.filter((dependency) => !isSatisfied(dependency));
    for (const dependency of unsatisfiedDependencies) trace(dependency);
  }
  trace(path.targetWorkItemId);
  return {
    pathId: path.pathId,
    targetWorkItemId: path.targetWorkItemId,
    targetSatisfied: nodes.get(path.targetWorkItemId)?.state === "SATISFIED",
    controllingBlockers: [...blockers.values()],
    nextEligibleWorkItems,
    blockedWorkItems,
    unknownWorkItems,
  };
}

export function criticalPathStatus(registry: OmegaRegistry, pathId: string): CriticalPathAnalysis | null {
  const path = registry.criticalPaths?.find((candidate) => candidate.pathId === pathId);
  return path ? analyzeInstitutionalCriticalPath(path) : null;
}

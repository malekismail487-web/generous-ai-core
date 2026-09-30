import type { ColoringProblem, ReasoningProblem } from "./boundedReasoningWorkbench";
import { immutableTheoryValue, theoryDigest } from "./theoryContracts";

export interface ColoringRefutationNode {
  readonly vertex: string;
  readonly branches: readonly { readonly color: number; readonly child: number | null; readonly conflictWith: string | null }[];
}
interface Binding { readonly schemaVersion: 1; readonly problemDigest: string }
export type FiniteRefutation = Binding & (
  | { readonly kind: "COLORING_CLIQUE_OBSTRUCTION"; readonly vertices: readonly string[] }
  | { readonly kind: "COLORING_SEARCH_REFUTATION"; readonly nodes: readonly ColoringRefutationNode[]; readonly root: number }
  | { readonly kind: "REACHABILITY_CLOSED_INVARIANT"; readonly states: readonly string[] }
  | { readonly kind: "PREDICTION_NON_IDENTIFIABILITY"; readonly mechanismIds: readonly string[] }
  | { readonly kind: "HYPOTHESIS_CONFLICT"; readonly witnesses: readonly { readonly mechanismId: string;
      readonly experimentId: string; readonly evidenceRef: string; readonly expectedOutcome: string; readonly observedOutcome: string }[] }
);
export const FINITE_REFUTATION_VERIFIER = Object.freeze({ version: "nyx-finite-refutation-verifier/1",
  maxProofBytes: 256_000, maxSearchNodes: 1024, maxWorkUnits: 200_000, maxElapsedMs: 2000,
  evidenceClass: "E3", grantsAuthority: false, scope: "DECLARED_FINITE_PROPERTY_NOT_TASK_OR_REAL_WORLD_CERTIFICATION" });

class VerificationBudgetExceeded extends Error {}
/** A proof checker, not another constructor: no solver import, heuristic search, or reference answers. */
export function verifyFiniteRefutation(problem: ReasoningProblem, supplied: unknown,
  limits: { readonly maxWorkUnits: number; readonly maxElapsedMs: number } = {
    maxWorkUnits: FINITE_REFUTATION_VERIFIER.maxWorkUnits, maxElapsedMs: FINITE_REFUTATION_VERIFIER.maxElapsedMs },
  now = () => Date.now()) {
  const started = now(); let units = 0; let trustedProblem = false; let trustedProof = false;
  let property: string | null = null;
  const findings: string[] = [];
  const validLimits = Number.isSafeInteger(limits.maxWorkUnits) && limits.maxWorkUnits > 0
    && limits.maxWorkUnits <= FINITE_REFUTATION_VERIFIER.maxWorkUnits
    && Number.isSafeInteger(limits.maxElapsedMs) && limits.maxElapsedMs > 0
    && limits.maxElapsedMs <= FINITE_REFUTATION_VERIFIER.maxElapsedMs && Number.isFinite(started);
  function tick() {
    const observed = now();
    if (!validLimits || ++units > limits.maxWorkUnits || !Number.isFinite(observed) || observed < started
      || observed - started >= limits.maxElapsedMs)
      throw new VerificationBudgetExceeded();
  }
  function plain(value: unknown, ancestors = new Set<object>(), depth = 0): boolean {
    tick();
    if (depth > 16) return false;
    if (value === null || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "string") return value.length <= 256 && !value.includes("\0");
    if (!value || typeof value !== "object" || ancestors.has(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) return false;
    if (Array.isArray(value) && Reflect.ownKeys(value).length !== value.length + 1) return false;
    ancestors.add(value);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!Object.prototype.hasOwnProperty.call(descriptor, "value") || key !== "length" && !descriptor.enumerable
        || !plain(descriptor.value, ancestors, depth + 1)) return false;
    }
    ancestors.delete(value); return true;
  }
  function keys(value: unknown, names: string[]): value is Record<string, unknown> {
    tick(); return !!value && typeof value === "object" && !Array.isArray(value)
      && Object.keys(value).sort().join("\0") === [...names].sort().join("\0");
  }
  function unique(value: unknown, permitted: readonly unknown[], maximum: number): value is string[] {
    tick(); return Array.isArray(value) && value.length <= maximum && new Set(value).size === value.length
      && value.every(item => { tick(); return typeof item === "string" && permitted.includes(item); });
  }
  function validDomain(p: ReasoningProblem): boolean {
    const strings = (values: unknown, max: number, empty = false): values is string[] => Array.isArray(values)
      && (empty || values.length > 0) && values.length <= max && new Set(values).size === values.length
      && values.every(value => { tick(); return typeof value === "string" && value.length > 0; });
    if (p?.kind === "COLORING") return keys(p, ["kind", "vertices", "edges", "colors", "cliqueSize"])
      && strings(p.vertices, 96) && Array.isArray(p.colors) && p.colors.length > 0 && p.colors.length <= 8
      && new Set(p.colors).size === p.colors.length && p.colors.every(c => Number.isInteger(c) && c >= 1 && c <= 256)
      && Number.isInteger(p.cliqueSize) && p.cliqueSize >= 1 && p.cliqueSize <= Math.min(8, p.vertices.length)
      && Array.isArray(p.edges) && p.edges.length <= 4560 && p.edges.every(edge => {
        tick(); return Array.isArray(edge) && edge.length === 2 && edge[0] !== edge[1]
          && p.vertices.includes(edge[0]) && p.vertices.includes(edge[1]);
      }) && new Set(p.edges.map(edge => JSON.stringify([...edge].sort()))).size === p.edges.length;
    if (p?.kind === "REACHABILITY") return keys(p, ["kind", "states", "initialState", "unsafeStates", "transitions"])
      && strings(p.states, 2048) && p.states.includes(p.initialState) && unique(p.unsafeStates, p.states, 2048)
      && Array.isArray(p.transitions) && p.transitions.length <= 8192 && p.transitions.every(edge => {
        tick(); return keys(edge, ["from", "to", "action"]) && typeof edge.from === "string" && typeof edge.to === "string"
          && p.states.includes(edge.from) && p.states.includes(edge.to)
          && typeof edge.action === "string" && edge.action.length > 0;
      });
    if (p?.kind !== "EXPERIMENT_SELECTION" && p?.kind !== "HYPOTHESIS_ELIMINATION") return false;
    if (!keys(p, p.kind === "EXPERIMENT_SELECTION" ? ["kind", "mechanismIds", "experimentIds", "predictions"]
      : ["kind", "mechanismIds", "experimentIds", "predictions", "observations"])
      || !strings(p.mechanismIds, 64) || !strings(p.experimentIds, 12) || !Array.isArray(p.predictions)
      || p.predictions.length !== p.mechanismIds.length
      || new Set(p.predictions.map(row => row?.mechanismId)).size !== p.mechanismIds.length
      || !p.predictions.every(row => { tick(); return keys(row, ["mechanismId", "outcomes"])
        && typeof row.mechanismId === "string" && p.mechanismIds.includes(row.mechanismId) && Array.isArray(row.outcomes)
        && row.outcomes.length === p.experimentIds.length && row.outcomes.every(v => typeof v === "string" && v.length > 0); })) return false;
    return p.kind === "EXPERIMENT_SELECTION" || Array.isArray(p.observations)
      && p.observations.length <= p.experimentIds.length
      && new Set(p.observations.map(o => o?.experimentId)).size === p.observations.length
      && new Set(p.observations.map(o => o?.evidenceRef)).size === p.observations.length
      && p.observations.every(o => { tick(); return keys(o, ["experimentId", "outcome", "evidenceRef"])
        && typeof o.experimentId === "string" && p.experimentIds.includes(o.experimentId) && typeof o.outcome === "string" && o.outcome.length > 0
        && typeof o.evidenceRef === "string" && o.evidenceRef.length > 0; });
  }
  try {
    if (!validLimits) throw new VerificationBudgetExceeded();
    trustedProblem = plain(problem) && new TextEncoder().encode(JSON.stringify(problem)).byteLength <= 128_000
      && validDomain(problem);
    trustedProof = plain(supplied) && new TextEncoder().encode(JSON.stringify(supplied)).byteLength <= FINITE_REFUTATION_VERIFIER.maxProofBytes;
    if (!trustedProblem || !trustedProof) findings.push("MALFORMED_FINITE_DOMAIN_OR_PROOF");
    else {
      const proof = supplied as FiniteRefutation;
      if (proof?.schemaVersion !== 1 || proof.problemDigest !== theoryDigest(problem)) findings.push("PROOF_BINDING_INVALID");
      else if (problem.kind === "COLORING" && proof.kind === "COLORING_CLIQUE_OBSTRUCTION") {
        property = "NO_PROPER_COLORING_IN_DECLARED_PALETTE";
        const p: ColoringProblem = problem;
        if (!keys(proof, ["schemaVersion", "problemDigest", "kind", "vertices"])
          || !unique(proof.vertices, p.vertices, 9) || proof.vertices.length !== p.colors.length + 1
          || !proof.vertices.every((a, i) => proof.vertices.slice(i + 1).every(b => p.edges.some(([x, y]) => {
            tick(); return x === a && y === b || x === b && y === a;
          })))) findings.push("CLIQUE_OBSTRUCTION_INVALID");
      } else if (problem.kind === "COLORING" && proof.kind === "COLORING_SEARCH_REFUTATION") {
        property = "NO_PROPER_COLORING_IN_DECLARED_PALETTE";
        const p = problem; const nodes = proof.nodes;
        const visited = new Set<number>(); const assigned = new Map<string, number>();
        function inspect(index: number): boolean {
          tick();
          if (!Number.isSafeInteger(index) || index < 0 || index >= nodes.length || visited.has(index)) return false;
          visited.add(index); const node = nodes[index];
          if (!keys(node, ["vertex", "branches"]) || !p.vertices.includes(node.vertex) || assigned.has(node.vertex)
            || !Array.isArray(node.branches) || node.branches.length !== p.colors.length
            || new Set(node.branches.map(b => b?.color)).size !== p.colors.length) return false;
          for (const branch of node.branches) {
            tick();
            if (!keys(branch, ["color", "child", "conflictWith"]) || typeof branch.color !== "number" || !p.colors.includes(branch.color)) return false;
            if (branch.child === null) {
              if (typeof branch.conflictWith !== "string" || assigned.get(branch.conflictWith) !== branch.color
                || !p.edges.some(([a, b]) => { tick(); return a === node.vertex && b === branch.conflictWith
                  || b === node.vertex && a === branch.conflictWith; })) return false;
            } else {
              if (branch.conflictWith !== null || typeof branch.child !== "number" || !Number.isSafeInteger(branch.child) || branch.child >= index) return false;
              assigned.set(node.vertex, branch.color);
              const checked = inspect(branch.child); assigned.delete(node.vertex);
              if (!checked) return false;
            }
          }
          return true;
        }
        if (!keys(proof, ["schemaVersion", "problemDigest", "kind", "nodes", "root"])
          || !Array.isArray(nodes) || nodes.length === 0 || nodes.length > FINITE_REFUTATION_VERIFIER.maxSearchNodes
          || !inspect(proof.root) || visited.size !== nodes.length) findings.push("COLORING_REFUTATION_TREE_INVALID");
      } else if (problem.kind === "REACHABILITY" && proof.kind === "REACHABILITY_CLOSED_INVARIANT") {
        property = "NO_UNSAFE_REACHABILITY_IN_DECLARED_TRANSITIONS";
        if (!keys(proof, ["schemaVersion", "problemDigest", "kind", "states"])
          || !unique(proof.states, problem.states, 2048) || !proof.states.includes(problem.initialState)
          || proof.states.some(state => { tick(); return problem.unsafeStates.includes(state); })
          || problem.transitions.some(edge => { tick(); return proof.states.includes(edge.from) && !proof.states.includes(edge.to); }))
          findings.push("CLOSED_INVARIANT_INVALID");
      } else if (problem.kind === "EXPERIMENT_SELECTION" && proof.kind === "PREDICTION_NON_IDENTIFIABILITY") {
        property = "NO_SEPARATING_EXPERIMENT_SET_IN_DECLARED_TABLE";
        if (!keys(proof, ["schemaVersion", "problemDigest", "kind", "mechanismIds"])
          || !unique(proof.mechanismIds, problem.mechanismIds, 2) || proof.mechanismIds.length !== 2) findings.push("INDISTINGUISHABLE_PAIR_INVALID");
        else {
          const [a, b] = proof.mechanismIds.map(id => problem.predictions.find(row => row.mechanismId === id)!);
          if (!a.outcomes.every((v, i) => { tick(); return v === b.outcomes[i]; })) findings.push("INDISTINGUISHABLE_PAIR_INVALID");
        }
      } else if (problem.kind === "HYPOTHESIS_ELIMINATION" && proof.kind === "HYPOTHESIS_CONFLICT") {
        property = "ADMITTED_OBSERVATIONS_REFUTE_ALL_DECLARED_MECHANISMS";
        if (!keys(proof, ["schemaVersion", "problemDigest", "kind", "witnesses"]) || !Array.isArray(proof.witnesses)
          || proof.witnesses.length !== problem.mechanismIds.length
          || !unique(proof.witnesses.map(w => w?.mechanismId), problem.mechanismIds, 64)
          || !proof.witnesses.every(w => {
            tick(); if (!keys(w, ["mechanismId", "experimentId", "evidenceRef", "expectedOutcome", "observedOutcome"])
              || typeof w.experimentId !== "string") return false;
            const row = problem.predictions.find(r => r.mechanismId === w.mechanismId);
            const observation = problem.observations.find(o => o.experimentId === w.experimentId && o.evidenceRef === w.evidenceRef);
            return !!row && !!observation && w.expectedOutcome === row.outcomes[problem.experimentIds.indexOf(w.experimentId)]
              && w.observedOutcome === observation.outcome && w.expectedOutcome !== w.observedOutcome;
          })) findings.push("HYPOTHESIS_FALSIFICATION_WITNESSES_INVALID");
      } else findings.push("PROOF_PROPERTY_NOT_SUPPORTED_FOR_DOMAIN");
    }
  } catch (error) {
    findings.push(error instanceof VerificationBudgetExceeded ? "VERIFICATION_BUDGET_EXHAUSTED" : "MALFORMED_FINITE_DOMAIN_OR_PROOF");
  }
  const decision = findings.includes("VERIFICATION_BUDGET_EXHAUSTED") ? "INSUFFICIENT_EVIDENCE"
    : findings.length ? "REJECTED" : "SUPPORTED";
  const finished = now();
  const result = { verifierVersion: FINITE_REFUTATION_VERIFIER.version, decision, property,
    problemDigest: trustedProblem ? theoryDigest(problem) : null, proofDigest: trustedProof ? theoryDigest(supplied) : null,
    findings, workUnits: Math.min(units, validLimits ? limits.maxWorkUnits : 0),
    elapsedMs: Number.isFinite(finished - started) ? Math.max(0, finished - started) : 0,
    evidenceClass: "E3", scope: FINITE_REFUTATION_VERIFIER.scope, grantsAuthority: false,
    taskAcceptanceRequiresSeparateVerifier: true };
  return immutableTheoryValue({ ...result, evidenceDigest: theoryDigest(result) });
}

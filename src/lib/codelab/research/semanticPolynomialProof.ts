import { compileAlgebraicExpressionGraph, type QuantitativeAlgebraicForm } from "./quantitativeAlgebraicCompiler";
import type { QuantitativeExpressionGraph } from "./quantitativeExpressionCompiler";
import { SearchBudgetExceeded, WorkBudget, snapshotBoundedReasoningData, type ReasoningLimits } from "./boundedReasoningWorkbench";
import { ReasoningObligationGraph, type ObligationWorkPacket } from "./reasoningObligationGraph";
import { immutableTheoryValue, theoryDigest, theoryKeys } from "./theoryContracts";

/** Exact polynomial normalization over Q, not numerical sampling, Lean, an
 * unrestricted CAS, or a general theorem prover. Models author candidates;
 * the host owns every immutable statement and independently admits results.
 * Generate/check/counterexample loop: Solar-Lezama, functional synthesis,
 * https://people.csail.mit.edu/asolar/SynthesisCourse2020/Lecture10.htm
 */
export const SEMANTIC_POLYNOMIAL_POLICY = Object.freeze({ version: "nyx-semantic-polynomial/1",
  variables: 3, degree: 8, terms: 256, coefficientBits: 4096, obligations: 12,
  candidateOutputs: 8, substitutions: 8, cacheEntries: 64,
  domain: "UNIVERSALLY_QUANTIFIED_RATIONAL_POLYNOMIAL_IDENTITIES",
  division: "NONZERO_RATIONAL_CONSTANT_ONLY", grantsAuthority: false,
  acceptanceRequiresIndependentVerifier: true, cognitiveGainDemonstrated: false });

export interface PolynomialObligation {
  readonly obligationId: string;
  readonly dependsOn: readonly string[];
  readonly substitutions: readonly { readonly id: string; readonly sourceOutput: string;
    readonly bindings: readonly { readonly variable: string; readonly expression: string }[] }[];
  /** Exactly lhs/rhs; the original claim cannot be replaced by model text. */
  readonly identity: QuantitativeAlgebraicForm;
}
export interface SemanticPolynomialTask {
  readonly schemaVersion: 1;
  readonly objective: string;
  readonly variables: readonly string[];
  readonly constants: readonly { readonly id: string; readonly value: string }[];
  readonly outputLabels: readonly string[];
  readonly obligations: readonly PolynomialObligation[];
}
export interface PolynomialCandidateRequest {
  readonly schemaVersion: 1;
  readonly operation: "CHECK_POLYNOMIAL_CANDIDATE";
  readonly problemDigest: string;
  readonly parentResultDigest: string | null;
  readonly program: QuantitativeAlgebraicForm;
}
type Q = readonly [bigint, bigint];
type Poly = ReadonlyMap<string, Q>;
type Counterexample = Readonly<{ assignment: Readonly<Record<string, string>>; lhs: string; rhs: string }>;
interface IntrinsicResult { readonly state: "PROVED_IDENTITY" | "REFUTED_IDENTITY";
  readonly counterexample: Counterexample | null; readonly normalFormDigest: string }
interface CompiledGoal { readonly statement: PolynomialObligation; readonly identity: QuantitativeExpressionGraph;
  readonly substitutions: readonly { readonly id: string; readonly sourceOutput: string;
    readonly bindings: QuantitativeExpressionGraph }[]; readonly candidateDependencies: readonly string[] }
class PolynomialBoundary extends Error {}
const id = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(s);
const rationalLiteral = (s: unknown): s is string => typeof s === "string"
  && /^-?(?:0|[1-9][0-9]{0,127})(?:\/[1-9][0-9]{0,127})?$/.test(s);
const DIGEST = /^[a-f0-9]{64}$/;
const POLICY = SEMANTIC_POLYNOMIAL_POLICY;

/** All integer arithmetic, expansion and point evaluations share one budget. */
function algebra(variableNames: readonly string[], budget: WorkBudget) {
  const zeroKey = variableNames.map(() => 0).join(",");
  const bits = (v: bigint) => (v < 0n ? -v : v).toString(2).length;
  const charge = (...values: bigint[]) => { for (const v of values) {
    const n = bits(v); if (n > POLICY.coefficientBits) throw new PolynomialBoundary("COEFFICIENT_BOUND");
    for (let i = 0; i < n; i += 64) budget.tick();
  } };
  const q = (n: bigint, d: bigint): Q => {
    charge(n, d); if (d === 0n) throw new PolynomialBoundary("ZERO_DENOMINATOR");
    if (d < 0n) { n = -n; d = -d; }
    let a = n < 0n ? -n : n, b = d;
    while (b) { charge(a, b); [a, b] = [b, a % b]; }
    return [n / a, d / a];
  };
  const addQ = (a: Q, b: Q) => q(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
  const mulQ = (a: Q, b: Q) => q(a[0] * b[0], a[1] * b[1]);
  const scalar = (v: Q): Poly => v[0] === 0n ? new Map() : new Map([[zeroKey, v]]);
  const parse = (s: string): Q => { const [n, d = "1"] = s.split("/"); return q(BigInt(n), BigInt(d)); };
  const show = (v: Q) => v[1] === 1n ? String(v[0]) : `${v[0]}/${v[1]}`;
  const canonical = (p: Poly) => [...p].sort(([a], [b]) => a.localeCompare(b))
    .map(([exponents, coefficient]) => [exponents, show(coefficient)] as const);
  const put = (p: Map<string, Q>, key: string, v: Q) => {
    budget.tick(); const next = addQ(p.get(key) ?? [0n, 1n], v);
    if (next[0] === 0n) p.delete(key); else p.set(key, next);
    if (p.size > POLICY.terms) throw new PolynomialBoundary("TERM_BOUND");
  };
  const add = (a: Poly, b: Poly, subtract = false): Poly => {
    const p = new Map(a); for (const [key, v] of b) put(p, key, subtract ? [-v[0], v[1]] : v); return p;
  };
  const multiply = (a: Poly, b: Poly): Poly => {
    const p = new Map<string, Q>();
    for (const [ak, av] of a) for (const [bk, bv] of b) {
      budget.tick(); const ae = ak.split(",").map(Number), be = bk.split(",").map(Number);
      const es = ae.map((v, i) => v + be[i]);
      if (es.reduce((n, v) => n + v, 0) > POLICY.degree) throw new PolynomialBoundary("DEGREE_BOUND");
      put(p, es.join(","), mulQ(av, bv));
    }
    return p;
  };
  const divide = (a: Poly, b: Poly): Poly => {
    if (b.size !== 1 || !b.has(zeroKey)) throw new PolynomialBoundary("NONCONSTANT_OR_ZERO_DIVISOR");
    const v = b.get(zeroKey)!; return multiply(a, scalar(q(v[1], v[0])));
  };
  const variable = (at: number): Poly => {
    const es = variableNames.map((_, i) => i === at ? 1 : 0); return new Map([[es.join(","), [1n, 1n]]]);
  };
  const evaluate = (p: Poly, points: readonly Q[]): Q => {
    let value: Q = [0n, 1n];
    for (const [key, coefficient] of p) {
      budget.tick(); let term = coefficient;
      key.split(",").map(Number).forEach((degree, i) => { for (let k = 0; k < degree; k++) term = mulQ(term, points[i]); });
      value = addQ(value, term);
    }
    return value;
  };
  const substitute = (p: Poly, bindings: ReadonlyMap<string, Poly>): Poly => {
    let result: Poly = new Map();
    for (const [key, coefficient] of p) {
      budget.tick(); let term = scalar(coefficient);
      key.split(",").map(Number).forEach((degree, i) => {
        const replacement = bindings.get(variableNames[i]) ?? variable(i);
        for (let k = 0; k < degree; k++) term = multiply(term, replacement);
      });
      result = add(result, term);
    }
    return result;
  };
  const execute = (graph: QuantitativeExpressionGraph, environment: ReadonlyMap<string, Poly>) => {
    const nodes: Poly[] = [];
    const source = (s: string | number) => {
      budget.tick(); const value = typeof s === "string" ? environment.get(s) : nodes[s];
      if (!value) throw new PolynomialBoundary("SYMBOL_NOT_BOUND"); return value;
    };
    for (const e of graph.expressions) {
      budget.tick(); const a = source(e.left), b = source(e.right);
      nodes.push(e.op === "ADD" ? add(a, b) : e.op === "SUB" ? add(a, b, true)
        : e.op === "MUL" ? multiply(a, b) : e.op === "DIV" ? divide(a, b)
          : (() => { throw new PolynomialBoundary("NONPOLYNOMIAL_OPERATION"); })());
    }
    return new Map(graph.outputs.map(o => [o.label, source(o.source)]));
  };
  const counterexample = (lhs: Poly, rhs: Poly): Counterexample | null => {
    const points: Q[] = variableNames.map(() => [0n, 1n]);
    const search = (at: number): Counterexample | null => {
      budget.tick(); if (at < points.length) {
        for (let v = 0; v <= POLICY.degree; v++) { points[at] = [BigInt(v), 1n]; const found = search(at + 1); if (found) return found; }
        return null;
      }
      const l = show(evaluate(lhs, points)), r = show(evaluate(rhs, points));
      return l === r ? null : { assignment: Object.fromEntries(variableNames.map((v, i) => [v, show(points[i])])), lhs: l, rhs: r };
    };
    return search(0);
  };
  return { scalar, parse, variable, execute, canonical, subtract: (a: Poly, b: Poly) => add(a, b, true), substitute, counterexample };
}

/** Explicitly host-created pure-computation domain. There is no filesystem,
 * shell, network, credential, evaluator-modification or production capability.
 * It composes existing syntax, finite work budgets and the obligation DAG.
 */
export class SemanticPolynomialSession {
  readonly task: SemanticPolynomialTask;
  readonly problemDigest: string;
  readonly #limits: ReasoningLimits;
  readonly #now: () => number;
  readonly #owner = {};
  readonly #graph: ReasoningObligationGraph;
  readonly #goals: readonly CompiledGoal[];
  readonly #zero: string | undefined;
  readonly #results = new Set<string>();
  readonly #cache = new Map<string, IntrinsicResult>();
  #revoked = false;
  #requests = 0;
  #workUnits = 0;
  #elapsedMs = 0;
  #lastNow = 0;

  private constructor(task: SemanticPolynomialTask, limits: ReasoningLimits, now: () => number) {
    this.task = task; this.#limits = limits; this.#now = now; this.problemDigest = theoryDigest(task);
    this.#zero = task.constants.find(c => /^-?0(?:\/[1-9][0-9]{0,127})?$/.test(c.value))?.id;
    const names = [...task.variables, ...task.constants.map(c => c.id)], started = this.#clock();
    const budget = new WorkBudget(limits.maxWorkUnits, limits.maxElapsedMs, limits.expiresAtEpochMs, () => this.#clock(), started);
    this.#goals = task.obligations.map(statement => {
      const substitutions = statement.substitutions.map(s => ({ id: s.id, sourceOutput: s.sourceOutput,
        bindings: compileAlgebraicExpressionGraph(names, this.#zero, { schemaVersion: 5, definitions: [],
          outputs: s.bindings.map(b => ({ label: b.variable, expression: b.expression })) }, () => budget.tick()) }));
      const identity = compileAlgebraicExpressionGraph([...names, ...task.outputLabels, ...substitutions.map(s => s.id)],
        this.#zero, statement.identity, () => budget.tick());
      const sources = [...identity.expressions.flatMap(e => [e.left, e.right]), ...identity.outputs.map(o => o.source)];
      const refs = new Set(sources.filter((s): s is string => typeof s === "string" && task.outputLabels.includes(s)));
      // All substitutions execute, even unused ones: no hidden dead-code removal.
      for (const s of substitutions) refs.add(s.sourceOutput);
      return { statement, identity, substitutions, candidateDependencies: [...refs].sort() };
    });
    const covered = new Set(this.#goals.flatMap(g => g.candidateDependencies));
    if (task.outputLabels.some(label => !covered.has(label))) throw Error("semantic_polynomial_output_not_constrained");
    this.#workUnits = budget.units; this.#elapsedMs = this.#clock() - started;
    this.#graph = ReasoningObligationGraph.create({ graphId: `POLYNOMIAL-${this.problemDigest}`,
      objective: task.objective, objectiveBinding: this.problemDigest, obligations: task.obligations.map(o => ({
        obligationId: o.obligationId, kind: "INVARIANT", priority: "REQUIRED",
        statement: `Immutable rational-polynomial identity ${o.obligationId}; ${theoryDigest(o)}`,
        acceptanceCriterion: "Exact rational polynomial residual is identically zero, with every dependency discharged.",
        falsificationCriterion: "Exact nonzero residual and an independently replayable rational counterexample.",
        dependsOn: o.dependsOn, conflictsWith: [], ownerRoles: ["NATIVE_POLYNOMIAL_CHECKER"],
        minimumEvidenceClass: "E3", minimumIndependentRoots: 1, freshnessDependencies: [], grantsAuthority: false })),
      maxAttempts: limits.maxRequests, maxEvaluations: limits.maxRequests * task.obligations.length,
      maxConcurrentAttempts: 1, attemptLifetimeMs: Math.min(3_600_000, limits.expiresAtEpochMs - started), now: () => this.#clock() }, this.#owner);
  }

  static create(task: SemanticPolynomialTask, limits: ReasoningLimits, now = () => Date.now()) {
    const t = snapshotBoundedReasoningData(task), l = snapshotBoundedReasoningData(limits), start = now();
    if (!Number.isSafeInteger(start) || start < 0 || !theoryKeys(l, ["maxWorkUnits", "maxElapsedMs", "maxRequests", "expiresAtEpochMs"])
      || !Number.isSafeInteger(l.maxWorkUnits) || l.maxWorkUnits < 1 || l.maxWorkUnits > 1_000_000
      || !Number.isSafeInteger(l.maxElapsedMs) || l.maxElapsedMs < 1 || l.maxElapsedMs > 10_000
      || !Number.isSafeInteger(l.maxRequests) || l.maxRequests < 1 || l.maxRequests > 8
      || !Number.isSafeInteger(l.expiresAtEpochMs) || l.expiresAtEpochMs - start < 1_000 || l.expiresAtEpochMs - start > 3_600_000)
      throw Error("semantic_polynomial_limits_invalid");
    const unique = (v: readonly string[], max: number) => Array.isArray(v) && v.length > 0 && v.length <= max && v.every(id) && new Set(v).size === v.length;
    if (!theoryKeys(t, ["schemaVersion", "objective", "variables", "constants", "outputLabels", "obligations"])
      || t.schemaVersion !== 1 || typeof t.objective !== "string" || !t.objective.trim() || t.objective.length > 4_000
      || !unique(t.variables, POLICY.variables) || !unique(t.outputLabels, POLICY.candidateOutputs)
      || !Array.isArray(t.constants) || t.constants.length < 1 || t.constants.length > 32
      || !t.constants.every(c => theoryKeys(c, ["id", "value"]) && id(c.id) && rationalLiteral(c.value))
      || !Array.isArray(t.obligations) || t.obligations.length < 1 || t.obligations.length > POLICY.obligations)
      throw Error("semantic_polynomial_task_invalid");
    const bound = [...t.variables, ...t.constants.map(c => c.id), ...t.outputLabels];
    if (new Set(bound).size !== bound.length || new Set(t.obligations.map(o => o.obligationId)).size !== t.obligations.length)
      throw Error("semantic_polynomial_bindings_invalid");
    for (const o of t.obligations) {
      if (!theoryKeys(o, ["obligationId", "dependsOn", "substitutions", "identity"]) || !id(o.obligationId)
        || !Array.isArray(o.dependsOn) || o.dependsOn.length > POLICY.obligations || !o.dependsOn.every(id)
        || new Set(o.dependsOn).size !== o.dependsOn.length || !Array.isArray(o.substitutions) || o.substitutions.length > POLICY.substitutions
        || new Set(o.substitutions.map(s => s.id)).size !== o.substitutions.length
        || o.substitutions.some(s => !theoryKeys(s, ["id", "sourceOutput", "bindings"]) || !id(s.id) || bound.includes(s.id)
          || !t.outputLabels.includes(s.sourceOutput) || !Array.isArray(s.bindings) || !s.bindings.length || s.bindings.length > t.variables.length
          || new Set(s.bindings.map(b => b.variable)).size !== s.bindings.length
          || s.bindings.some(b => !theoryKeys(b, ["variable", "expression"]) || !t.variables.includes(b.variable) || typeof b.expression !== "string"))
        || !o.identity || !Array.isArray(o.identity.outputs) || o.identity.outputs.length !== 2
        || o.identity.outputs.map(v => v.label).sort().join("|") !== "lhs|rhs") throw Error("semantic_polynomial_obligation_invalid");
    }
    return new SemanticPolynomialSession(t, l, now);
  }
  #clock() { const n = this.#now(); if (!Number.isSafeInteger(n) || n < this.#lastNow) throw Error("semantic_polynomial_clock_invalid"); this.#lastNow = n; return n; }
  revoke() { this.#revoked = true; }
  usage() { return Object.freeze({ requests: this.#requests, workUnits: this.#workUnits, elapsedMs: this.#elapsedMs }); }
  workPacket(): ObligationWorkPacket { return this.#graph.workPacket(); }

  analyze(request: unknown) {
    const started = this.#clock();
    if (this.#revoked || started >= this.#limits.expiresAtEpochMs) throw Error("semantic_polynomial_session_unavailable");
    if (this.#requests >= this.#limits.maxRequests || this.#workUnits >= this.#limits.maxWorkUnits) throw Error("semantic_polynomial_budget_exhausted");
    ++this.#requests; // A malformed invocation cannot bypass request accounting.
    const budget = new WorkBudget(this.#limits.maxWorkUnits - this.#workUnits, this.#limits.maxElapsedMs,
      this.#limits.expiresAtEpochMs, () => this.#clock(), started);
    let lease: ReturnType<ReasoningObligationGraph["beginAttempt"]> | null = null;
    try {
      const r = snapshotBoundedReasoningData(request) as PolynomialCandidateRequest;
      budget.tick();
      if (!theoryKeys(r, ["schemaVersion", "operation", "problemDigest", "parentResultDigest", "program"])
        || r.schemaVersion !== 1 || r.operation !== "CHECK_POLYNOMIAL_CANDIDATE" || r.problemDigest !== this.problemDigest
        || r.parentResultDigest !== null && (!DIGEST.test(r.parentResultDigest) || !this.#results.has(r.parentResultDigest)))
        throw Error("semantic_polynomial_request_invalid");
      if (!r.program || !Array.isArray(r.program.outputs) || r.program.outputs.length !== this.task.outputLabels.length
        || r.program.outputs.map(o => o.label).sort().join("|") !== [...this.task.outputLabels].sort().join("|"))
        throw Error("semantic_polynomial_output_contract_invalid");
      const maths = algebra(this.task.variables, budget), environment = new Map<string, Poly>();
      this.task.constants.forEach(c => environment.set(c.id, maths.scalar(maths.parse(c.value))));
      this.task.variables.forEach((v, i) => environment.set(v, maths.variable(i)));
      const graph = compileAlgebraicExpressionGraph([...environment.keys()], this.#zero, r.program, () => budget.tick());
      const candidate = maths.execute(graph, environment), canonical = Object.fromEntries([...candidate].map(([k, v]) => [k, maths.canonical(v)]));
      const candidateBinding = theoryDigest({ task: this.problemDigest, canonical });
      const attemptId = `POLY-${this.#requests}`;
      lease = this.#graph.beginAttempt(this.#owner, { attemptId, subjectBinding: candidateBinding, ownerRole: "NATIVE_POLYNOMIAL_CHECKER" });
      const observations: { obligationId: string; state: string; candidateDependencies: readonly string[];
        reused: boolean; counterexample: Counterexample | null; evidenceDigest: string }[] = [];
      for (const goal of this.#goals) {
        budget.tick(); const dependencyBinding = theoryDigest({ task: this.problemDigest, goal: goal.statement,
          dependencies: goal.candidateDependencies.map(k => [k, canonical[k]]) });
        let intrinsic = this.#cache.get(dependencyBinding); const reused = !!intrinsic;
        if (!intrinsic) {
          const scope = new Map([...environment, ...candidate]);
          for (const sub of goal.substitutions) {
            const replacements = maths.execute(sub.bindings, environment);
            scope.set(sub.id, maths.substitute(candidate.get(sub.sourceOutput)!, replacements));
          }
          const values = maths.execute(goal.identity, scope), lhs = values.get("lhs")!, rhs = values.get("rhs")!;
          const residual = maths.subtract(lhs, rhs), counterexample = residual.size ? maths.counterexample(lhs, rhs) : null;
          if (residual.size && !counterexample) throw Error("semantic_polynomial_counterexample_inconsistency");
          intrinsic = immutableTheoryValue({ state: residual.size ? "REFUTED_IDENTITY" as const : "PROVED_IDENTITY" as const,
            counterexample, normalFormDigest: theoryDigest({ dependencyBinding, residual: maths.canonical(residual) }) });
          if (this.#cache.size >= POLICY.cacheEntries) this.#cache.delete(this.#cache.keys().next().value!);
          this.#cache.set(dependencyBinding, intrinsic);
        }
        const evidenceDigest = theoryDigest({ checker: POLICY.version, dependencyBinding, intrinsic });
        budget.tick(); // Recheck the original deadline before evidence admission.
        this.#graph.recordEvaluation(this.#owner, lease, { evaluationId: `${attemptId}-${goal.statement.obligationId}`,
          obligationId: goal.statement.obligationId, subjectBinding: candidateBinding,
          disposition: intrinsic.state === "PROVED_IDENTITY" ? "SATISFIES" : "FALSIFIES", evidenceClass: "E3",
          evidenceRefs: [evidenceDigest], provenanceRoot: POLICY.version, summary: intrinsic.state,
          contentDigest: evidenceDigest, freshnessDependencies: [], observedAtEpochMs: this.#clock(), evaluatorIdentity: POLICY.version, grantsAuthority: false });
        observations.push({ obligationId: goal.statement.obligationId, state: intrinsic.state,
          candidateDependencies: goal.candidateDependencies, reused, counterexample: intrinsic.counterexample, evidenceDigest });
      }
      budget.tick();
      this.#graph.finishAttempt(this.#owner, lease); lease = null;
      const result = { version: POLICY.version, problemDigest: this.problemDigest, candidateBinding,
        requestDigest: theoryDigest(r), parentResultDigest: r.parentResultDigest, observations, workPacket: this.#graph.workPacket(),
        workUnits: budget.units, elapsedMs: this.#clock() - started, evidenceClass: "E3" as const,
        scope: POLICY.domain, naturalLanguageFormalizationFidelity: "NOT_ESTABLISHED" as const,
        acceptanceRequiresIndependentVerifier: true as const, grantsAuthority: false as const };
      const resultDigest = theoryDigest(result); budget.tick(); this.#results.add(resultDigest);
      return immutableTheoryValue({ ...result, resultDigest });
    } catch (error) {
      if (lease) { try { this.#graph.abortAttempt(this.#owner, lease); } catch { /* Original expiry remains authoritative. */ } }
      if (!(error instanceof PolynomialBoundary) && !(error instanceof SearchBudgetExceeded)) throw error;
      return immutableTheoryValue({ version: POLICY.version, problemDigest: this.problemDigest,
        state: "INSUFFICIENT_EVIDENCE", reason: error instanceof SearchBudgetExceeded ? "BUDGET_EXHAUSTED" : error.message,
        workUnits: budget.units, grantsAuthority: false, acceptanceRequiresIndependentVerifier: true });
    } finally { this.#workUnits += budget.units; this.#elapsedMs += Math.max(0, this.#clock() - started); }
  }
}

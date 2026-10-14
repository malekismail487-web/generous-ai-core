import { snapshotBoundedReasoningData } from "./boundedReasoningWorkbench";
import { canonicalRationalLiteral, deriveQuantities } from "./exactQuantitativeDerivation";
import { exactScalar, fitExactLinearSystem } from "./exactLinearFit";
import { lowerQuantitativeAlgebraicForm } from "./quantitativeAlgebraicCompiler";
import { fitScientificStructure, type ScientificModelStructure, type ScientificStructureFit } from "./scientificModelFit";
import type { ScientificModelTask } from "./scientificModelGeneration";
import { immutableTheoryValue } from "./theoryContracts";

/** Generic finite search over admitted calibration, not a library of known
 * worlds. All scalar work uses the existing exact interpreter and caller tick.
 * Search ranking is not admission, a scientific claim, or execution authority. */
export const SCIENTIFIC_SEARCH_POLICY = /* @__PURE__ */ Object.freeze({
  version: "nyx-scientific-structure-search/2", maxDegree: 3, maxCoefficients: 8,
  maxCandidates: 256, maxModels: 3, maxAtoms: 58, grantsAuthority: false,
  scope: "FINITE_RATIONAL_GRAMMAR_CALIBRATION_HYPOTHESES_NOT_SCIENTIFIC_TRUTH",
  method: "BOUNDED_DIAGONAL_SUPPORTS_WITH_ORIGINAL_ROW_CONSISTENCY",
  legacyStrategiesPreserved: true,
});
export interface ScientificSearchSpec {
  readonly schemaVersion: 1; readonly nonzeroConstantId: string;
  readonly maxDegree: number; readonly includeReciprocals: boolean;
  readonly allowDenominatorTerms: boolean; readonly maxCoefficients: number;
  readonly maxCandidates: number; readonly maxModels: number;
  readonly strategy: "FORWARD_RESIDUAL" | "LEXICOGRAPHIC" | "DIAGONAL_EXACT" | "DIAGONAL_NORMAL";
}
export interface ScientificSearchCandidate {
  readonly structure: ScientificModelStructure; readonly fit: ScientificStructureFit;
  readonly supportSize: number; readonly calibrationResidual: "0";
}
export interface ScientificSearchResult {
  readonly version: typeof SCIENTIFIC_SEARCH_POLICY.version;
  readonly state: "CANDIDATES_NOT_ADMITTED" | "NO_CANDIDATE_IN_SEARCHED_GRAMMAR";
  readonly stopReason: "MODEL_LIMIT" | "CANDIDATE_LIMIT" | "SEARCH_EXHAUSTED";
  readonly candidates: readonly ScientificSearchCandidate[];
  readonly evaluatedSupports: number; readonly completedSupports: number; readonly rankDeficientSupports: number;
  readonly inconsistentSupports: number; readonly supportsBySize: readonly number[];
  readonly arithmeticBlockedSupports: number; readonly invalidFits: number;
  readonly duplicatePredictions: number; readonly domainBlockedAtoms: number;
  readonly atoms: number; readonly gramsComputed: number;
  readonly scientificTruthEstablished: false; readonly grantsAuthority: false;
}
const keys = (v: unknown, names: readonly string[]) => !!v && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).sort().join("|") === [...names].sort().join("|");
export function scientificSearchSchema() {
  return { type: "object", additionalProperties: false,
    required: ["schemaVersion", "nonzeroConstantId", "maxDegree", "includeReciprocals", "allowDenominatorTerms", "maxCoefficients", "maxCandidates", "maxModels", "strategy"],
    properties: { schemaVersion: { type: "integer", enum: [1] }, nonzeroConstantId: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_]{0,47}$" },
      maxDegree: { type: "integer", minimum: 1, maximum: 3 }, includeReciprocals: { type: "boolean" }, allowDenominatorTerms: { type: "boolean" },
      maxCoefficients: { type: "integer", minimum: 1, maximum: 8 }, maxCandidates: { type: "integer", minimum: 1, maximum: 256 },
      maxModels: { type: "integer", minimum: 1, maximum: 3 }, strategy: { type: "string", enum: ["FORWARD_RESIDUAL", "LEXICOGRAPHIC", "DIAGONAL_EXACT", "DIAGONAL_NORMAL"] } } };
}
export function snapshotScientificSearchSpec(proposed: unknown): ScientificSearchSpec {
  const s = snapshotBoundedReasoningData(proposed) as ScientificSearchSpec;
  if (!keys(s, scientificSearchSchema().required) || s.schemaVersion !== 1
    || typeof s.nonzeroConstantId !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(s.nonzeroConstantId)
    || typeof s.includeReciprocals !== "boolean" || typeof s.allowDenominatorTerms !== "boolean"
    || !["FORWARD_RESIDUAL", "LEXICOGRAPHIC", "DIAGONAL_EXACT", "DIAGONAL_NORMAL"].includes(s.strategy)
    || !Number.isSafeInteger(s.maxDegree) || s.maxDegree < 1 || s.maxDegree > 3
    || !Number.isSafeInteger(s.maxCoefficients) || s.maxCoefficients < 1 || s.maxCoefficients > 8
    || !Number.isSafeInteger(s.maxCandidates) || s.maxCandidates < 1 || s.maxCandidates > 256
    || !Number.isSafeInteger(s.maxModels) || s.maxModels < 1 || s.maxModels > 3) throw Error("scientific_search_spec_contract");
  return s;
}
interface Atom { expression: string; denominator: boolean; values: readonly string[] }
const isArithmeticBoundary = (e: unknown) => e instanceof Error && e.message === "exact_fit_arithmetic_boundary";

/** task originates from an owned ScientificModelSession. Grammar construction,
 * cache access, parser, exact matrix fitting and residuals all consume its tick.
 * No other task data, hidden response, IO, model call or execution exists here. */
export function searchScientificStructures(task: ScientificModelTask, proposed: unknown, tick: () => void, onCandidate: () => void = () => {}, onCompleted: () => void = () => {}): ScientificSearchResult {
  tick(); const spec = snapshotScientificSearchSpec(proposed);
  const offset = task.constants.find(c => c.id === spec.nonzeroConstantId);
  if (!offset || canonicalRationalLiteral(offset.value, tick) === "0") throw Error("scientific_search_nonzero_constant_required");
  const expressions: string[] = [offset.id], monomials: string[] = [];
  const enumerate = (prefix: readonly string[], start: number, remaining: number) => {
    tick(); if (!remaining) { monomials.push(prefix.join("*")); return; }
    for (let i = start; i < task.variables.length; i++) { tick(); enumerate([...prefix, task.variables[i]], i, remaining - 1); }
  };
  for (let degree = 1; degree <= spec.maxDegree; degree++) enumerate([], 0, degree);
  expressions.push(...monomials);
  if (spec.includeReciprocals) expressions.push(...monomials.map(e => `${offset.id}/(${e})`));
  const atoms: Atom[] = []; let domainBlockedAtoms = 0;
  // Evaluate atoms separately: one pole cannot erase all other legal atoms.
  for (const [i, expression] of expressions.entries()) {
    tick(); const values: string[] = []; let blocked = false;
    for (const observation of task.observations) {
      tick(); const problem = { kind: "EXACT_QUANTITATIVE_DERIVATION" as const, constants: [...task.constants, ...observation.inputs] };
      const program = lowerQuantitativeAlgebraicForm(problem, { schemaVersion: 5, definitions: [], outputs: [{ label: `Atom${i}`, expression }] }, tick);
      const result = deriveQuantities(problem, program, { tick });
      if (result.status !== "CONSTRUCTED" || !result.payload.outputs) { blocked = true; break; }
      values.push(result.payload.outputs[0].value);
    }
    if (blocked) { domainBlockedAtoms++; continue; }
    atoms.push({ expression, denominator: false, values });
    if (spec.allowDenominatorTerms && i > 0 && i <= monomials.length) {
      const den = values.map((v, row) => exactScalar("SUB", "0", exactScalar("MUL", task.observations[row].output, v, tick), tick));
      atoms.push({ expression, denominator: true, values: den });
    }
  }
  // Rank generic features by operation cost, including the cross-multiplied
  // denominator role. Cheap reciprocals must not wait behind every cubic.
  // Legacy strategies retain their exact prior order. No task ID, response
  // truth or coefficient value ranks atoms; all scanning/sorting is charged.
  if (spec.strategy.startsWith("DIAGONAL")) {
    const costs=new Map<Atom,number>();
    for(const atom of atoms){let cost=Number(atom.denominator);for(const c of atom.expression){tick();if(c==="*"||c==="/")cost++;}costs.set(atom,cost);}
    atoms.sort((a,b)=>{tick();return costs.get(a)!-costs.get(b)!||Number(a.denominator)-Number(b.denominator);});
  }
  const rhs = task.observations.map(o => exactScalar("MUL", o.output, offset.value, tick));
  const dot = (a: readonly string[], b: readonly string[]) => {
    let sum = "0";
    for (let i = 0; i < a.length; i++) { tick(); sum = exactScalar("ADD", sum, exactScalar("MUL", a[i], b[i], tick), tick); }
    return sum;
  };
  const direct = spec.strategy === "DIAGONAL_EXACT";
  const norm = direct ? "0" : dot(rhs, rhs), targets = direct ? [] : atoms.map(a => dot(a.values, rhs)), gram = new Map<string, string>();
  const inner = (a: number, b: number) => {
    tick(); const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    if (!gram.has(key)) gram.set(key, dot(atoms[a].values, atoms[b].values));
    return gram.get(key)!;
  };
  const candidates: ScientificSearchCandidate[] = [], seenSupports = new Map<string, string | null>(), predictions = new Set<string>();
  let evaluatedSupports = 0, completedSupports = 0, rankDeficientSupports = 0, inconsistentSupports = 0, arithmeticBlockedSupports = 0, invalidFits = 0, duplicatePredictions = 0;
  const supportsBySize = Array<number>(9).fill(0);
  const occupied = new Set([...task.variables, ...task.constants.map(c => c.id), "response", "MIN", "MAX", "BINOMIAL"]);
  const parameterNames = Array.from({ length: 8 }, (_, i) => {
    let name = `SearchCoefficient${i}`;
    for (let suffix = 0; occupied.has(name); suffix++) { tick(); name = `SearchCoefficient${i}_${suffix}`; }
    occupied.add(name); return name;
  });
  const structureFor = (support: readonly number[]): ScientificModelStructure => {
    const numerator: string[] = [], denominator: string[] = [];
    const outputs = support.map((atom, i) => {
      (atoms[atom].denominator ? denominator : numerator).push(parameterNames[i]);
      return { label: parameterNames[i], expression: atoms[atom].expression };
    });
    return { schemaVersion: 1, basis: { schemaVersion: 5, definitions: [], outputs }, numerator, denominator, denominatorConstant: offset.id,
      assumptions: ["Response lies in the requested finite rational grammar on the admitted domain."],
      uncertainties: ["Calibration fit does not establish extrapolation, causation, novelty or scientific truth."] };
  };
  const recordExact = (support: readonly number[]) => {
    if (!support.some(i => !atoms[i].denominator)) { invalidFits++; return; }
    const structure = structureFor(support), fit = fitScientificStructure(task, structure, tick);
    if (!fit.draft || fit.linear.state !== "UNIQUE") { invalidFits++; return; }
    const values: string[] = [];
    // Known prospective INPUTS check the domain and prediction diversity, not
    // future truth. Every final candidate is replayed independently on admission.
    for (const point of [...task.observations, ...task.experiments]) {
      tick(); const problem = { kind: "EXACT_QUANTITATIVE_DERIVATION" as const, constants: [...task.constants, ...fit.draft.parameters, ...point.inputs] };
      const derived = deriveQuantities(problem, lowerQuantitativeAlgebraicForm(problem, fit.draft.program, tick), { tick });
      if (derived.status !== "CONSTRUCTED" || !derived.payload.outputs) { invalidFits++; return; }
      const v = derived.payload.outputs[0].value;
      if ("output" in point && v !== canonicalRationalLiteral(point.output, tick)) { invalidFits++; return; }
      values.push(v);
    }
    const key = JSON.stringify(values);
    if (predictions.has(key)) { duplicatePredictions++; return; }
    predictions.add(key); candidates.push({ structure, fit, supportSize: support.length, calibrationResidual: "0" });
  };
  const evaluate = (input: readonly number[]): string | null => {
    tick(); const support = [...input].sort((a, b) => a - b), key = support.join(":");
    if (seenSupports.has(key)) return seenSupports.get(key)!;
    if (evaluatedSupports >= spec.maxCandidates) return null;
    evaluatedSupports++; supportsBySize[support.length]++; onCandidate();
    const complete=(value:string|null)=>{completedSupports++;onCompleted();return value;};
    try {
      if (direct) {
        const matrix = task.observations.map((_,row)=>support.map(i=>atoms[i].values[row]));
        // A prefix contradiction is a necessary-condition rejection, never
        // a fitted model. A rank-deficient prefix cannot reject a support that
        // later rows may identify. Unique prefix coefficients must satisfy
        // EVERY original row before the ordinary full-source fit is attempted.
        const prefixRows = Math.min(matrix.length,support.length+1);
        let fit = fitExactLinearSystem(matrix.slice(0,prefixRows),rhs.slice(0,prefixRows),tick);
        if (fit.state === "UNDERDETERMINED" && prefixRows < matrix.length) fit = fitExactLinearSystem(matrix,rhs,tick);
        if (fit.state === "INCONSISTENT") { inconsistentSupports++; seenSupports.set(key,null); return complete(null); }
        if (fit.state !== "UNIQUE") { rankDeficientSupports++; seenSupports.set(key,null); return complete(null); }
        for (let row = 0; row < matrix.length; row++) {
          tick(); if (dot(matrix[row],fit.values) !== rhs[row]) { inconsistentSupports++; seenSupports.set(key,null); return complete(null); }
        }
        seenSupports.set(key,"0");
        if (candidates.length < spec.maxModels) recordExact(support);
        return complete("0");
      }
      const g = support.map(a => support.map(b => inner(a, b))), y = support.map(i => targets[i]);
      const fit = fitExactLinearSystem(g, y, tick);
      if (fit.state !== "UNIQUE") { rankDeficientSupports++; seenSupports.set(key, null); return complete(null); }
      // For exact normal-equation coefficients SSE = b'b - c'A'b. This is only
      // a search heuristic; zero is rechecked against original rows and domain.
      const score = exactScalar("SUB", norm, dot(fit.values, y), tick);
      if (score.startsWith("-")) throw Error("scientific_search_negative_residual");
      seenSupports.set(key, score);
      if (score === "0" && candidates.length < spec.maxModels) recordExact(support);
      return complete(score);
    } catch (error) {
      if (!isArithmeticBoundary(error)) throw error;
      arithmeticBlockedSupports++; seenSupports.set(key, null); return complete(null);
    }
  };
  const done = () => evaluatedSupports >= spec.maxCandidates || candidates.length >= spec.maxModels;
  const maxSize = Math.min(spec.maxCoefficients, atoms.length, task.observations.length);
  if (spec.strategy.startsWith("DIAGONAL")) {
    // Enumerate by largest feature index, then support size. All cardinalities
    // are reached without first exhausting every pair from the whole grammar.
    // A support is generated once, lazily, under the SAME owning tick/limits.
    const visit = (prefix: readonly number[], start: number, remaining: number, maximum: number) => {
      tick(); if (done()) return;
      if (!remaining) { evaluate([...prefix,maximum]); return; }
      for (let i=start;i<=maximum-remaining&&!done();i++) { tick(); visit([...prefix,i],i+1,remaining-1,maximum); }
    };
    for (let maximum=0;maximum<atoms.length&&!done();maximum++)
      for (let size=1;size<=Math.min(maxSize,maximum+1)&&!done();size++) visit([],0,size-1,maximum);
  } else if (spec.strategy === "LEXICOGRAPHIC") {
    const visit = (prefix: readonly number[], start: number, remaining: number) => {
      tick(); if (done()) return;
      if (!remaining) { evaluate(prefix); return; }
      for (let i = start; i <= atoms.length - remaining && !done(); i++) { tick(); visit([...prefix, i], i + 1, remaining - 1); }
    };
    for (let size = 1; size <= maxSize && !done(); size++) visit([], 0, size);
  } else {
    const restarts: (number | null)[] = [null], scheduled = new Set<number>();
    for (let restart = 0; restart < restarts.length && !done(); restart++) {
      const excluded = restarts[restart]; let support: number[] = [];
      for (let depth = 0; depth < maxSize && !done(); depth++) {
        let best: { atom: number; score: string } | null = null;
        for (let i = 0; i < atoms.length && !done(); i++) {
          tick(); if (support.includes(i) || i === excluded) continue;
          const score = evaluate([...support, i]);
          if (score !== null && (!best || exactScalar("SUB", score, best.score, tick).startsWith("-"))) best = { atom: i, score };
        }
        if (!best) break;
        support.push(best.atom);
        if (best.score === "0") break;
      }
      for (const i of support) if (!scheduled.has(i)) { tick(); scheduled.add(i); restarts.push(i); }
    }
  }
  tick(); return immutableTheoryValue({ version: SCIENTIFIC_SEARCH_POLICY.version,
    state: candidates.length ? "CANDIDATES_NOT_ADMITTED" : "NO_CANDIDATE_IN_SEARCHED_GRAMMAR",
    stopReason: candidates.length >= spec.maxModels ? "MODEL_LIMIT" : evaluatedSupports >= spec.maxCandidates ? "CANDIDATE_LIMIT" : "SEARCH_EXHAUSTED",
    candidates, evaluatedSupports, completedSupports, rankDeficientSupports, inconsistentSupports, supportsBySize, arithmeticBlockedSupports, invalidFits, duplicatePredictions,
    domainBlockedAtoms, atoms: atoms.length, gramsComputed: gram.size, scientificTruthEstablished: false, grantsAuthority: false });
}

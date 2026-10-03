import { immutableTheoryValue, theoryDigest } from "./theoryContracts";
import type { QuantitativeAcceptance } from "./nyxQuantitativeReasoning";

/** Public objective-implied necessary conditions, owned by the task/evaluator, never the model.
 * Inspired by counterexample-guided refinement: this is a bounded diagnostic, NOT CEGIS
 * completeness, an answer oracle, self-certification, or a new execution capability.
 * https://people.csail.mit.edu/asolar/SynthesisCourse2020/Lecture10.htm
 */
export const QUANTITATIVE_CONSTRAINT_POLICY = Object.freeze({ version: "nyx-quantity-constraint-feedback/1",
  maxConditions: 32, maxTerms: 16, maxIntegerBits: 4096, maxWorkUnits: 20000,
  grantsAuthority: false, grantsAcceptance: false });
export interface QuantitativeNecessaryCondition {
  readonly id: string;
  readonly requirementRef: string;
  readonly terms: readonly { readonly label: string; readonly coefficient: string }[];
  readonly relation: "LTE" | "GTE" | "EQ";
  readonly bound: string;
}
export interface QuantitativeConstraintAssessment {
  readonly contractDigest: string;
  readonly candidateDigest: string;
  readonly status: "SATISFIED_NOT_ACCEPTED" | "VIOLATED" | "NOT_EVALUATED";
  readonly violations: readonly { readonly conditionId: string; readonly requirementRef: string;
    readonly relation: string; readonly observed: string; readonly requiredBound: string }[];
  readonly reason: string | null;
  readonly workUnits: number;
  readonly grantsAuthority: false;
  readonly grantsAcceptance: false;
  readonly evidenceDigest: string;
}
const keyShape = (v: unknown, keys: readonly string[]): v is Record<string, unknown> => !!v && typeof v === "object"
  && !Array.isArray(v) && Object.keys(v).sort().join("\0") === [...keys].sort().join("\0");
const identifier = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(v);
function dataOnly(v: unknown, path = new Set<object>(), budget = { nodes: 0 }, depth = 0): boolean {
  if (++budget.nodes > 4096 || depth > 8) return false;
  if (v === null || typeof v === "boolean") return true;
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string") return v.length <= 4096;
  if (!v || typeof v !== "object" || path.has(v)
    || ![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(v))) return false;
  if (Array.isArray(v) && Reflect.ownKeys(v).length !== v.length + 1) return false;
  path.add(v);
  for (const key of Reflect.ownKeys(v)) {
    if (typeof key !== "string") return false;
    const d = Object.getOwnPropertyDescriptor(v, key)!;
    if (!Object.prototype.hasOwnProperty.call(d, "value") || key !== "length" && !d.enumerable
      || !dataOnly(d.value, path, budget, depth + 1)) return false;
  }
  path.delete(v); return true;
}
type Q = readonly [bigint, bigint];
class ConstraintBoundary extends Error {}
function arithmetic() {
  let units = 0;
  const charge = (...values: bigint[]) => {
    for (const v of values) {
      const bits = (v < 0n ? -v : v).toString(2).length;
      if (bits > QUANTITATIVE_CONSTRAINT_POLICY.maxIntegerBits) throw new ConstraintBoundary("INTEGER_BOUND");
      units += Math.ceil(bits / 64);
      if (units > QUANTITATIVE_CONSTRAINT_POLICY.maxWorkUnits) throw new ConstraintBoundary("WORK_BOUND");
    }
  };
  const reduce = (n: bigint, d: bigint): Q => {
    charge(n, d); if (d <= 0n) throw new ConstraintBoundary("DENOMINATOR");
    let a = n < 0n ? -n : n; let b = d;
    while (b !== 0n) { charge(a, b); const remainder = a % b; a = b; b = remainder; }
    return [n / a, d / a];
  };
  const show = (q: Q) => q[1] === 1n ? String(q[0]) : `${q[0]}/${q[1]}`;
  const parse = (v: unknown): Q => {
    if (typeof v !== "string" || v.length > 4096 || !/^-?(?:0|[1-9][0-9]*)(?:\/[1-9][0-9]*)?$/.test(v))
      throw new ConstraintBoundary("RATIONAL_SCHEMA");
    const [n, d = "1"] = v.split("/"); const q = reduce(BigInt(n), BigInt(d));
    if (show(q) !== v) throw new ConstraintBoundary("RATIONAL_NOT_CANONICAL");
    return q;
  };
  const add = (a: Q, b: Q): Q => reduce(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
  const mul = (a: Q, b: Q): Q => reduce(a[0] * b[0], a[1] * b[1]);
  const compare = (a: Q, b: Q) => { charge(a[0] * b[1], b[0] * a[1]);
    return a[0] * b[1] < b[0] * a[1] ? -1 : a[0] * b[1] > b[0] * a[1] ? 1 : 0; };
  return { parse, show, add, mul, compare, units: () => units };
}

/** All condition definitions must be published before evaluation and justified by the objective;
 * never insert a hidden expected solution as an equality condition. Passing is necessary ONLY.
 */
export function createQuantitativeConstraintFeedback(taskBinding: string, labels: readonly string[],
  conditions: readonly QuantitativeNecessaryCondition[]) {
  if (!/^[a-f0-9]{64}$/.test(taskBinding) || !dataOnly({ labels, conditions }) || !Array.isArray(labels) || !Array.isArray(conditions)
    || labels.length < 1 || labels.length > 16
    || labels.some(l => !identifier(l)) || new Set(labels).size !== labels.length
    || conditions.length < 1 || conditions.length > QUANTITATIVE_CONSTRAINT_POLICY.maxConditions
    || new Set(conditions.map(c => c?.id)).size !== conditions.length) throw Error("quantity_constraint_contract_invalid");
  const own = immutableTheoryValue({ taskBinding, labels, conditions });
  const validation = arithmetic();
  for (const c of own.conditions) {
    if (!keyShape(c, ["id", "requirementRef", "terms", "relation", "bound"]) || !identifier(c.id)
      || typeof c.requirementRef !== "string" || !c.requirementRef.trim() || c.requirementRef.length > 256
      || typeof c.relation !== "string" || !["LTE", "GTE", "EQ"].includes(c.relation) || !Array.isArray(c.terms) || c.terms.length < 1 || c.terms.length > 16
      || new Set(c.terms.map(t => t?.label)).size !== c.terms.length) throw Error("quantity_constraint_contract_invalid");
    validation.parse(c.bound);
    for (const t of c.terms) {
      if (!keyShape(t, ["label", "coefficient"]) || typeof t.label !== "string" || !own.labels.includes(t.label)) throw Error("quantity_constraint_contract_invalid");
      validation.parse(t.coefficient);
    }
  }
  const contractDigest = theoryDigest(own);
  function evaluate(certificate: unknown): QuantitativeConstraintAssessment {
    const math = arithmetic(); let status: QuantitativeConstraintAssessment["status"] = "NOT_EVALUATED";
    let reason: string | null = null; let candidateDigest = theoryDigest({ type: typeof certificate });
    const violations: QuantitativeConstraintAssessment["violations"][number][] = [];
    try {
      if (!dataOnly(certificate) || !keyShape(certificate, ["outputs", "confidence"]) || !Array.isArray(certificate.outputs)
        || certificate.outputs.length !== own.labels.length || typeof certificate.confidence !== "number"
        || certificate.confidence < 0 || certificate.confidence > 1) throw new ConstraintBoundary("CERTIFICATE_SCHEMA");
      candidateDigest = theoryDigest(certificate); const values = new Map<string, Q>();
      for (const output of certificate.outputs) {
        if (!keyShape(output, ["label", "value"]) || typeof output.label !== "string" || !own.labels.includes(output.label)
          || values.has(output.label)) throw new ConstraintBoundary("OUTPUT_SCHEMA");
        values.set(output.label, math.parse(output.value));
      }
      for (const c of own.conditions) {
        let left: Q = [0n, 1n];
        for (const t of c.terms) left = math.add(left, math.mul(math.parse(t.coefficient), values.get(t.label)!));
        const relation = math.compare(left, math.parse(c.bound));
        if (c.relation === "LTE" && relation > 0 || c.relation === "GTE" && relation < 0 || c.relation === "EQ" && relation !== 0)
          violations.push({ conditionId: c.id, requirementRef: c.requirementRef, relation: c.relation,
            observed: math.show(left), requiredBound: c.bound });
      }
      status = violations.length ? "VIOLATED" : "SATISFIED_NOT_ACCEPTED";
    } catch (error) {
      if (!(error instanceof ConstraintBoundary)) throw error;
      reason = error.message; violations.length = 0;
    }
    const result = { contractDigest, candidateDigest, status, violations, reason, workUnits: math.units(),
      grantsAuthority: false as const, grantsAcceptance: false as const };
    return immutableTheoryValue({ ...result, evidenceDigest: theoryDigest(result) });
  }
  function decorate(verifier: (certificate: unknown) => QuantitativeAcceptance, feedback: boolean,
    observe: (assessment: QuantitativeConstraintAssessment) => void = () => {}) {
    return (certificate: unknown): QuantitativeAcceptance => {
      const base = verifier(certificate); // SAME authoritative oracle, including its exceptions.
      const assessment = evaluate(certificate); observe(assessment);
      if (base.accepted && assessment.status === "VIOLATED") throw Error("oracle_public_constraint_conflict");
      const findings = [...base.findings, ...(feedback && !base.accepted
        ? assessment.violations.map(v => `PUBLIC_NECESSARY_CONDITION_VIOLATED:${JSON.stringify(v)}`) : [])];
      return immutableTheoryValue({ accepted: base.accepted, findings,
        verificationDigest: theoryDigest({ baseVerificationDigest: base.verificationDigest,
          assessmentDigest: assessment.evidenceDigest, feedback, findings }) });
    };
  }
  return Object.freeze({ contractDigest, evaluate, decorate });
}

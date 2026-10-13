import { snapshotBoundedReasoningData } from "./boundedReasoningWorkbench";
import { canonicalRationalLiteral, deriveQuantities, validQuantitativeProgram, validQuantitativeProblem } from "./exactQuantitativeDerivation";
import { exactScalar, fitExactLinearSystem, type ExactLinearFit } from "./exactLinearFit";
import { compileAlgebraicExpressionGraph, lowerQuantitativeAlgebraicForm, quantitativeAlgebraicSchema, type QuantitativeAlgebraicForm } from "./quantitativeAlgebraicCompiler";
import type { ScientificModelTask, ScientificModelDraft } from "./scientificModelGeneration";
import { immutableTheoryValue } from "./theoryContracts";

/** NYX selects the basis and denominator structure. This tool estimates only
 * coefficients from admitted calibration; it never sees held-out truth. */
export const SCIENTIFIC_FIT_POLICY = /* @__PURE__ */ Object.freeze({ version: "nyx-scientific-coefficient-fit/1",
  maxCoefficients: 8, maxObservations: 12, method: "MODEL_AUTHORED_RATIONAL_BASIS_EXACT_LINEAR_FIT",
  scope: "CALIBRATION_COEFFICIENTS_NOT_STRUCTURE_DISCOVERY_OR_CAUSAL_TRUTH", grantsAuthority: false });
export interface ScientificModelStructure {
  readonly schemaVersion: 1; readonly basis: QuantitativeAlgebraicForm;
  readonly numerator: readonly string[]; readonly denominator: readonly string[];
  readonly denominatorConstant: string;
  readonly assumptions: readonly string[]; readonly uncertainties: readonly string[];
}
export interface ScientificStructureFit {
  readonly linear: ExactLinearFit; readonly draft: ScientificModelDraft | null;
}
export type ScientificFitVerifier = (task: ScientificModelTask, structure: ScientificModelStructure, fit: ScientificStructureFit) => {
  readonly decision: "AGREES" | "DISAGREES" | "INSUFFICIENT_EVIDENCE"; readonly verificationDigest: string;
};
const keys = (v: unknown, names: readonly string[]) => !!v && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).sort().join("|") === [...names].sort().join("|");
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(v);
const texts = (v: unknown) => Array.isArray(v) && v.length >= 1 && v.length <= 5 && new Set(v).size === v.length
  && v.every(s => typeof s === "string" && s.trim().length > 0 && s.length <= 160 && !s.includes("\0"));

export function scientificStructureSchema() {
  const object = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
  const identifier = { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_]{0,47}$" };
  const form = quantitativeAlgebraicSchema(["response"]);
  const properties = form.properties;
  const output = properties.outputs as { readonly items: { readonly properties: Record<string, unknown> }; readonly [key: string]: unknown };
  const basis = { ...form, properties: { ...properties, outputs: { ...output, maxItems: 8,
    items: { ...output.items, properties: { ...output.items.properties, label: identifier } } } } };
  const statements = { type: "array", minItems: 1, maxItems: 5, items: { type: "string", minLength: 1, maxLength: 160 } };
  return object({ schemaVersion: { type: "integer", enum: [1] }, basis,
    numerator: { type: "array", minItems: 1, maxItems: 8, items: identifier },
    denominator: { type: "array", minItems: 0, maxItems: 7, items: identifier },
    denominatorConstant: identifier, assumptions: statements, uncertainties: statements });
}

/** task MUST originate from the owned ScientificModelSession. All representation,
 * parser, basis evaluation, elimination and residual work shares its tick. */
export function fitScientificStructure(task: ScientificModelTask, proposed: unknown, tick: () => void): ScientificStructureFit {
  const s = snapshotBoundedReasoningData(proposed) as ScientificModelStructure;
  if (!keys(s, ["schemaVersion", "basis", "numerator", "denominator", "denominatorConstant", "assumptions", "uncertainties"])
    || s.schemaVersion !== 1 || !texts(s.assumptions) || !texts(s.uncertainties)
    || !Array.isArray(s.numerator) || s.numerator.length < 1 || !Array.isArray(s.denominator)
    || s.numerator.length + s.denominator.length > 8 || !id(s.denominatorConstant)) throw Error("scientific_fit_structure_contract");
  const names = [...s.numerator, ...s.denominator], bound = [...task.variables, ...task.constants.map(c => c.id)];
  if (!names.every(id) || new Set(names).size !== names.length || names.some(n => bound.includes(n) || ["response", "MIN", "MAX", "BINOMIAL"].includes(n)))
    throw Error("scientific_fit_coefficient_binding");
  const offset = task.constants.find(c => c.id === s.denominatorConstant);
  if (!offset || canonicalRationalLiteral(offset.value, tick) === "0") throw Error("scientific_fit_nonzero_denominator_offset_required");
  const zero = task.constants.find(c => canonicalRationalLiteral(c.value, tick) === "0")?.id;
  const graph = compileAlgebraicExpressionGraph(bound, zero, s.basis, tick);
  if (graph.expressions.some(e => !["ADD", "SUB", "MUL", "DIV"].includes(e.op)) || graph.outputs.length !== names.length
    || new Set(graph.outputs.map(o => o.label)).size !== names.length || names.some(n => !graph.outputs.some(o => o.label === n))
    || s.basis.definitions.some(d => names.includes(d.id))) throw Error("scientific_fit_basis_contract");
  const rows: string[][] = [], rhs: string[] = [];
  for (const observation of task.observations) {
    tick(); const problem = { kind: "EXACT_QUANTITATIVE_DERIVATION" as const, constants: [...task.constants, ...observation.inputs] };
    const program = lowerQuantitativeAlgebraicForm(problem, s.basis, tick);
    if (!validQuantitativeProgram(problem, program)) throw Error("scientific_fit_basis_lowering_contract");
    const derived = deriveQuantities(problem, program, { tick });
    if (derived.status !== "CONSTRUCTED" || !derived.payload.outputs) throw Error("scientific_fit_basis_arithmetic_boundary");
    const outputs = new Map(derived.payload.outputs.map(o => [o.label, o.value]));
    const y = canonicalRationalLiteral(observation.output, tick);
    rows.push([...s.numerator.map(n => outputs.get(n)!), ...s.denominator.map(n => exactScalar("SUB", "0", exactScalar("MUL", y, outputs.get(n)!, tick), tick))]);
    rhs.push(exactScalar("MUL", y, offset.value, tick));
  }
  const linear = fitExactLinearSystem(rows, rhs, tick);
  if (linear.state !== "UNIQUE") return immutableTheoryValue({ linear, draft: null });
  const parameters = names.map((id, i) => ({ id, value: linear.values[i] }));
  if (!validQuantitativeProblem({ kind: "EXACT_QUANTITATIVE_DERIVATION", constants: parameters })) throw Error("scientific_fit_parameter_literal_bound");
  const occupied = new Set([...bound, ...names, ...s.basis.definitions.map(d => d.id), ...s.basis.outputs.map(o => o.label)]);
  const definitions = [...s.basis.definitions];
  const sources = new Map<string, string>();
  for (const [i, output] of s.basis.outputs.entries()) {
    let n = `FitBasis${i}`;
    for (let suffix = 0; occupied.has(n); suffix++) { tick(); n = `FitBasis${i}_${suffix}`; }
    occupied.add(n); definitions.push({ id: n, expression: output.expression }); sources.set(output.label, n);
  }
  const terms = (ids: readonly string[]) => ids.map(n => `${n}*${sources.get(n)}`).join("+");
  const expression = `(${terms(s.numerator)})/(${s.denominatorConstant}${s.denominator.length ? "+" + terms(s.denominator) : ""})`;
  const draft: ScientificModelDraft = { schemaVersion: 1, parameters, program: { schemaVersion: 5, definitions, outputs: [{ label: "response", expression }] },
    assumptions: s.assumptions, uncertainties: s.uncertainties };
  // Reuse the original literal, namespace, expression, operation and definition
  // limits. Cross-multiplication alone does NOT exclude a zero denominator;
  // ordinary proposal/independent point replay must run before model admission.
  compileAlgebraicExpressionGraph([...bound, ...names], zero, draft.program, tick);
  return immutableTheoryValue({ linear, draft });
}

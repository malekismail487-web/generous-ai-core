import { EXACT_DERIVATION_POLICY, quantitativeProgramFinding, validQuantitativeProblem,
  type QuantitativeProblem, type QuantitativeProgram } from "./exactQuantitativeDerivation";

/** Declarative model formulation, NOT a new executor or scientific-model verifier.
 * Enumerated sum/product and truncated factorization lower to the existing exact IR.
 * Interventions assume the stated Markovian DAG with independent exogenous noise.
 * This cannot infer missing causes, identify an unknown graph, or certify those assumptions.
 */
export const FINITE_PROBABILITY_POLICY = Object.freeze({ version: "nyx-finite-probability-lowering/1",
  maxVariables: 8, maxParents: 3, maxQueries: 4, maxOutputs: 4, maxInputBytes: 30000,
  maxCompilationWork: 30000, grantsAuthority: false });
export interface ProbabilityAssignment { readonly variable: string; readonly value: boolean }
export interface FiniteProbabilityModel {
  readonly schemaVersion: 3;
  readonly semantics: "MARKOVIAN_BINARY_DAG";
  /** Topological order; probabilityTrue is indexed by parents in their declared order,
   * first parent most significant, false before true. All entries bind input constants. */
  readonly variables: readonly { readonly id: string; readonly parents: readonly string[];
    readonly probabilityTrue: readonly string[] }[];
  readonly queries: readonly { readonly id: string; readonly event: readonly ProbabilityAssignment[];
    readonly given: readonly ProbabilityAssignment[]; readonly interventions: readonly ProbabilityAssignment[] }[];
  readonly outputs: readonly { readonly label: string; readonly op: "IDENTITY" | "SUB";
    readonly left: string; readonly right: string }[];
}
type Op = QuantitativeProgram["blocks"][number]["steps"][number]["op"];
const keys = (v: unknown, names: readonly string[]): v is Record<string, unknown> => !!v && typeof v === "object"
  && !Array.isArray(v) && Object.keys(v).sort().join("\0") === [...names].sort().join("\0");
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(v);
const array = (v: unknown, max: number, min = 0): v is unknown[] => Array.isArray(v) && v.length >= min && v.length <= max;
const fail = (code: string): never => { throw Error(`finite_probability_invalid:${code}`); };
/** No getters, host objects, cycles, sparse arrays, symbols or hidden fields are admitted. */
function data(v: unknown, seen = new Set<object>(), budget = { nodes: 0 }, depth = 0): boolean {
  if (++budget.nodes > 6000 || depth > 12) return false;
  if (v === null || typeof v === "boolean" || typeof v === "string") return true;
  if (typeof v === "number") return Number.isFinite(v);
  if (!v || typeof v !== "object" || seen.has(v)
    || !Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) return false;
  seen.add(v);
  if (Reflect.ownKeys(v).some(k => typeof k !== "string")) return false;
  const descriptors = Object.getOwnPropertyDescriptors(v);
  if (Array.isArray(v) && (Object.keys(v).length !== v.length
    || Object.keys(v).some((k, i) => k !== String(i)))) return false;
  for (const [k, d] of Object.entries(descriptors)) {
    if (k === "length" && Array.isArray(v)) continue;
    if (!d.enumerable || !("value" in d) || !data(d.value, seen, budget, depth + 1)) return false;
  }
  seen.delete(v); return true;
}
export function finiteProbabilityDiagnostic(error: unknown): string | null {
  return error instanceof Error
    ? error.message.match(/^finite_probability_invalid:(NON_DATA|BYTE_BOUND|SHAPE|CONSTANTS|VARIABLE|PARENTS|TABLE|PROBABILITY|QUERY|ASSIGNMENT|OUTPUT|COMPILATION_BOUND|STEP_BOUND|REGISTER_BOUND|LOWERED_PROGRAM)$/)?.[1] ?? null : null;
}

/** Compilation has a finite independent bound and accepts a host-owned work/lease tick.
 * No model output can change either the compiler bound or the executor's original limits. */
export function lowerFiniteProbability(problem: QuantitativeProblem, value: unknown, tick: () => void = () => {}): {
  readonly program: QuantitativeProgram; readonly compilationWorkUnits: number;
} {
  if (!data(problem) || !data(value)) return fail("NON_DATA");
  if (new TextEncoder().encode(JSON.stringify({ problem, value })).byteLength > FINITE_PROBABILITY_POLICY.maxInputBytes) return fail("BYTE_BOUND");
  if (!validQuantitativeProblem(problem)) return fail("CONSTANTS");
  if (!keys(value, ["schemaVersion", "semantics", "variables", "queries", "outputs"]) || value.schemaVersion !== 3
    || value.semantics !== "MARKOVIAN_BINARY_DAG" || !array(value.variables, 8, 1)
    || !array(value.queries, 4, 1) || !array(value.outputs, 4, 1)) return fail("SHAPE");
  let compilationWorkUnits = 0;
  const charge = () => { if (++compilationWorkUnits > FINITE_PROBABILITY_POLICY.maxCompilationWork) fail("COMPILATION_BOUND"); tick(); };
  let zero: string | undefined, one: string | undefined;
  const probabilities = new Set<string>();
  for (const c of problem.constants) {
    charge(); const [n, d = "1"] = c.value.split("/"); const numerator = BigInt(n), denominator = BigInt(d);
    if (numerator === 0n) zero ??= c.id;
    if (numerator === denominator) one ??= c.id;
    if (numerator >= 0n && numerator <= denominator) probabilities.add(c.id);
  }
  if (!zero || !one) return fail("CONSTANTS");
  const known = new Set<string>();
  for (const node of value.variables) {
    charge();
    if (!keys(node, ["id", "parents", "probabilityTrue"]) || !id(node.id) || known.has(node.id)) return fail("VARIABLE");
    if (!array(node.parents, 3) || node.parents.some(p => typeof p !== "string" || !known.has(p))
      || new Set(node.parents).size !== node.parents.length) return fail("PARENTS");
    if (!array(node.probabilityTrue, 8, 1) || node.probabilityTrue.length !== 2 ** node.parents.length) return fail("TABLE");
    for (const p of node.probabilityTrue) { charge(); if (typeof p !== "string" || !probabilities.has(p)) return fail("PROBABILITY"); }
    known.add(node.id);
  }
  const assignments = (v: unknown, min = 0): Map<string, boolean> => {
    if (!array(v, 8, min)) return fail("ASSIGNMENT");
    const result = new Map<string, boolean>();
    for (const a of v) {
      charge(); if (!keys(a, ["variable", "value"]) || typeof a.variable !== "string" || !known.has(a.variable)
        || typeof a.value !== "boolean" || result.has(a.variable)) return fail("ASSIGNMENT");
      result.set(a.variable, a.value);
    }
    return result;
  };
  // An interned expression DAG shares complements/products without evaluating the result.
  // Constants and expression references occupy different namespaces until register allocation.
  type Ref = { kind: "constant"; name: string } | { kind: "expression"; index: number };
  const c = (name: string): Ref => ({ kind: "constant", name });
  const refKey = (r: Ref) => r.kind === "constant" ? `c:${r.name}` : `e:${r.index}`;
  const nodes: { op: Op; left: Ref; right: Ref }[] = [], intern = new Map<string, Ref>();
  const is = (r: Ref, name: string) => r.kind === "constant" && r.name === name;
  const expression = (op: Op, left: Ref, right: Ref): Ref => {
    charge();
    if (op === "MUL") { if (is(left, zero!) || is(right, zero!)) return c(zero!); if (is(left, one!)) return right; if (is(right, one!)) return left; }
    if (op === "ADD") { if (is(left, zero!)) return right; if (is(right, zero!)) return left; }
    if (op === "SUB" && refKey(left) === refKey(right)) return c(zero!);
    // Never simplify x/x or 0/x: a zero denominator must remain an execution failure.
    if (op === "DIV" && is(right, one!)) return left;
    if ((op === "MUL" || op === "ADD") && refKey(left) > refKey(right)) [left, right] = [right, left];
    const key = `${op}:${refKey(left)}:${refKey(right)}`, found = intern.get(key);
    if (found) return found;
    const ref: Ref = { kind: "expression", index: nodes.length }; nodes.push({ op, left, right }); intern.set(key, ref); return ref;
  };
  const model = value as unknown as FiniteProbabilityModel;
  const queryValues = new Map<string, Ref>();
  for (const query of model.queries) {
    if (!keys(query, ["id", "event", "given", "interventions"]) || !id(query.id) || queryValues.has(query.id)) return fail("QUERY");
    const event = assignments(query.event, 1), given = assignments(query.given), interventions = assignments(query.interventions);
    let numerator = c(zero), denominator = c(zero);
    for (let mask = 0; mask < 2 ** model.variables.length; mask++) {
      charge(); const world = new Map(model.variables.map((v, i) => [v.id, !!(mask & 2 ** i)]));
      if ([...given, ...interventions].some(([v, b]) => world.get(v) !== b)) continue;
      let weight = c(one);
      for (const variable of model.variables) {
        charge(); if (interventions.has(variable.id)) continue; // Remove its mechanism, NOT observational conditioning.
        const row = variable.parents.reduce((n, p) => 2 * n + Number(world.get(p)), 0);
        const p = c(variable.probabilityTrue[row]);
        weight = expression("MUL", weight, world.get(variable.id) ? p : expression("SUB", c(one), p));
      }
      denominator = expression("ADD", denominator, weight);
      if ([...event].every(([v, b]) => world.get(v) === b)) numerator = expression("ADD", numerator, weight);
    }
    queryValues.set(query.id, expression("DIV", numerator, denominator));
  }
  const roots: { label: string; ref: Ref }[] = [], labels = new Set<string>();
  for (const output of model.outputs) {
    if (!keys(output, ["label", "op", "left", "right"]) || !id(output.label) || labels.has(output.label)
      || !["IDENTITY", "SUB"].includes(output.op) || !queryValues.has(output.left) || !queryValues.has(output.right)
      || output.op === "IDENTITY" && output.left !== output.right) return fail("OUTPUT");
    labels.add(output.label); const left = queryValues.get(output.left)!, right = queryValues.get(output.right)!;
    roots.push({ label: output.label, ref: output.op === "IDENTITY" ? left : expression("SUB", left, right) });
  }
  const needed = new Set<number>();
  const visit = (r: Ref) => { charge(); if (r.kind === "constant" || needed.has(r.index)) return;
    needed.add(r.index); visit(nodes[r.index].left); visit(nodes[r.index].right); };
  // Every declared conditional must have a defined denominator, even if an output
  // cancels it algebraically or leaves it unused. Never optimize away that failure.
  queryValues.forEach(visit); roots.forEach(o => visit(o.ref));
  if (needed.size > EXACT_DERIVATION_POLICY.maxSteps) return fail("STEP_BOUND");
  const uses = new Map<number, number>();
  const use = (r: Ref) => { if (r.kind === "expression") uses.set(r.index, (uses.get(r.index) ?? 0) + 1); };
  for (const i of needed) { use(nodes[i].left); use(nodes[i].right); }
  queryValues.forEach(use); roots.forEach(o => use(o.ref));
  const registers: { id: string; source: string }[] = [], free: string[] = [], locations = new Map<number, string>();
  const names = new Set(problem.constants.map(c => c.id)); let nameIndex = 0;
  const steps: QuantitativeProgram["blocks"][number]["steps"][number][] = [];
  const source = (r: Ref) => r.kind === "constant" ? r.name : locations.get(r.index)!;
  const release = (r: Ref) => { if (r.kind === "constant") return; const remaining = uses.get(r.index)! - 1;
    uses.set(r.index, remaining); if (!remaining) free.push(locations.get(r.index)!); };
  for (const [i, node] of nodes.entries()) {
    if (!needed.has(i)) continue;
    charge(); let target = free.pop();
    if (!target) {
      if (registers.length >= EXACT_DERIVATION_POLICY.maxRegisters) return fail("REGISTER_BOUND");
      do { target = `prob${nameIndex++}`; } while (names.has(target));
      names.add(target); registers.push({ id: target, source: zero });
    }
    steps.push({ target, op: node.op, left: source(node.left), right: source(node.right) });
    locations.set(i, target); release(node.left); release(node.right);
  }
  const program: QuantitativeProgram = { schemaVersion: 1, registers,
    blocks: steps.length ? [{ iterations: 1, mode: "SEQUENTIAL", steps }] : [],
    outputs: roots.map(o => ({ label: o.label, source: source(o.ref) })) };
  if (quantitativeProgramFinding(problem, program) !== null) return fail("LOWERED_PROGRAM");
  return { program, compilationWorkUnits };
}

/** Generation guidance is deliberately separate from semantic validation and authority. */
export function finiteProbabilitySchema(labels: readonly string[], constants: readonly string[]) {
  const object = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
  const identifier = { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_]{0,47}$" };
  const list = (items: unknown, max: number, min = 0) => ({ type: "array", items, minItems: min, maxItems: max });
  const assignment = list(object({ variable: identifier, value: { type: "boolean" } }), 8);
  return object({ schemaVersion: { type: "integer", enum: [3] }, semantics: { type: "string", enum: ["MARKOVIAN_BINARY_DAG"] },
    variables: list(object({ id: identifier, parents: list(identifier, 3), probabilityTrue: list({ type: "string", enum: constants }, 8, 1) }), 8, 1),
    queries: list(object({ id: identifier, event: { ...assignment, minItems: 1 }, given: assignment, interventions: assignment }), 4, 1),
    outputs: list(object({ label: { type: "string", enum: labels }, op: { type: "string", enum: ["IDENTITY", "SUB"] }, left: identifier, right: identifier }), 4, 1) });
}

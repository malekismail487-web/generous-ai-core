import { immutableTheoryValue } from "../../../src/lib/codelab/research/theoryContracts";
import type { QuantitativeProblem } from "../../../src/lib/codelab/research/exactQuantitativeDerivation";
import type { FiniteProbabilityModel } from "../../../src/lib/codelab/research/finiteProbabilityCompiler";

/** Separate synthetic modeling-development corpus. No official question, failure ID,
 * reference answer, provider reasoning, or previous inference is imported.
 * Transfer varies graph structure, not only constants. Reference models stay in the oracle.
 */
export interface ProbabilityTransferTask {
  readonly taskId: string; readonly stage: "DEVELOPMENT" | "TRANSFER"; readonly domain: string;
  readonly question: string; readonly problem: QuantitativeProblem;
  readonly answer: string; readonly expectedQuantity: string; readonly referenceModel: FiniteProbabilityModel;
}
type Q = readonly [bigint, bigint];
const fraction = (n: bigint, d = 1n): Q => { if (!d) throw Error("oracle_undefined_conditional");
  if (d < 0n) { n = -n; d = -d; } let a = n < 0n ? -n : n, b = d;
  while (b) [a, b] = [b, a % b]; return [n / a, d / a]; };
const add = (a: Q, b: Q) => fraction(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const sub = (a: Q, b: Q) => fraction(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
const mul = (a: Q, b: Q) => fraction(a[0] * b[0], a[1] * b[1]);
const div = (a: Q, b: Q) => fraction(a[0] * b[1], a[1] * b[0]);
const text = (a: Q) => a[1] === 1n ? String(a[0]) : `${a[0]}/${a[1]}`;
const parse = (s: string) => { const [n, d = "1"] = s.split("/"); return fraction(BigInt(n), BigInt(d)); };

/** Direct full-joint host oracle, not the production compiler/register evaluator.
 * Separate Python Fraction checks validate this implementation before inference. */
export function probabilityExpected(problem: QuantitativeProblem, model: FiniteProbabilityModel): string {
  const c = new Map(problem.constants.map(item => [item.id, parse(item.value)])), answers = new Map<string, Q>();
  for (const query of model.queries) {
    let numerator = fraction(0n), denominator = fraction(0n);
    const worlds: Map<string, boolean>[] = [new Map()];
    for (const node of model.variables) {
      const prior = worlds.splice(0); for (const world of prior) for (const value of [false, true]) worlds.push(new Map([...world, [node.id, value]]));
    }
    for (const world of worlds) {
      if ([...query.given, ...query.interventions].some(a => world.get(a.variable) !== a.value)) continue;
      let weight = fraction(1n);
      for (const node of model.variables) {
        if (query.interventions.some(a => a.variable === node.id)) continue;
        const row = parseInt(node.parents.map(p => world.get(p) ? "1" : "0").join("") || "0", 2);
        const p = c.get(node.probabilityTrue[row])!;
        weight = mul(weight, world.get(node.id) ? p : sub(fraction(1n), p));
      }
      denominator = add(denominator, weight);
      if (query.event.every(a => world.get(a.variable) === a.value)) numerator = add(numerator, weight);
    }
    answers.set(query.id, div(numerator, denominator));
  }
  const output = model.outputs[0];
  return text(output.op === "IDENTITY" ? answers.get(output.left)! : sub(answers.get(output.left)!, answers.get(output.right)!));
}

export function probabilityTransferTasks(stage: "DEVELOPMENT" | "TRANSFER"): readonly ProbabilityTransferTask[] {
  if (!["DEVELOPMENT", "TRANSFER"].includes(stage)) throw Error("probability_stage_invalid");
  const transfer = stage === "TRANSFER", tasks: ProbabilityTransferTask[] = [];
  const a = (variable: string, value = true) => ({ variable, value });
  const make = (domain: string, description: string, variables: FiniteProbabilityModel["variables"], queries: FiniteProbabilityModel["queries"], contrast = false) => {
    const constants = [{ id: "zero", value: "0" }, { id: "one", value: "1" }];
    let at = 0;
    const nodes = variables.map(node => ({ ...node, probabilityTrue: node.probabilityTrue.map(() => {
      const id = `p${at}`, value = `${1 + ((at++ * 7 + (transfer ? 4 : 2) + domain.length) % 17)}/20`;
      constants.push({ id, value }); return id;
    }) }));
    const problem: QuantitativeProblem = { kind: "EXACT_QUANTITATIVE_DERIVATION", constants };
    const referenceModel: FiniteProbabilityModel = { schemaVersion: 3, semantics: "MARKOVIAN_BINARY_DAG", variables: nodes, queries,
      outputs: [{ label: "quantity", op: contrast ? "SUB" : "IDENTITY", left: queries[0].id, right: contrast ? queries[1].id : queries[0].id }] };
    const expectedQuantity = probabilityExpected(problem, referenceModel), value = parse(expectedQuantity);
    // Nontrivial distractors remain private to the independent task constructor.
    const values = [expectedQuantity, text(add(value, fraction(1n, 73n))), text(sub(value, fraction(1n, 79n))), text(mul(value, fraction(2n)))];
    if (new Set(values).size !== 4) throw Error("probability_choices_collide");
    const rotation = (tasks.length * 3 + (transfer ? 1 : 2)) % 4, choices = values.slice(rotation).concat(values.slice(0, rotation));
    const tables = nodes.map(node => `${node.id}: parents (${node.parents.join(",") || "none"}); P(${node.id}=true) conditional on that parent row: ${node.probabilityTrue.join(",")}.`).join("\n");
    tasks.push(immutableTheoryValue({ taskId: `PROBABILITY-${stage}-${domain}`, stage, domain, problem, referenceModel,
      question: `${description}\nAll variables are binary. The causal mechanisms use independent exogenous noise; the stated parent sets are complete. `
        + `Tables list parent assignments lexicographically, false before true, first listed parent most significant.\n${tables}\n`
        + `Compute the requested exact quantity with one native derivation, output label quantity. Then return exactly 'The answer is: ' followed by the option index 1, 2, 3 or 4. `
        + `Arithmetic execution alone does not verify your formulation.\n${choices.map((v, i) => `${i + 1}. ${v}`).join("\n")}`,
      answer: String(choices.indexOf(expectedQuantity) + 1), expectedQuantity }));
  };
  const v = (id: string, parents: string[], n = 2 ** parents.length) => ({ id, parents, probabilityTrue: Array(n).fill("placeholder") });
  make("COLLIDER_DIAGNOSIS", transfer
    ? "Two independent component faults F,G cause an alarm A. A controls a downstream recording R. Given R=true and G=false, compute P(F=true). Do not assume faults remain independent after selection."
    : "Two independent component faults F,G cause alarm A. Given A=true and G=true, compute P(F=true). Do not treat the alarm as an intervention.",
    [v("F", []), v("G", []), v("A", ["G", "F"]), ...(transfer ? [v("R", ["A"])] : [])],
    [{ id: "posterior", event: [a("F")], given: [a(transfer ? "R" : "A"), a("G", !transfer)], interventions: [] }]);
  make("CONFOUNDED_ACTION", transfer
    ? "A background state U affects treatment T and response Y; T changes mediator M, which also affects Y. Compute P(Y=true|do(T=true))-P(Y=true|do(T=false)), marginalizing the mediator and background state."
    : "Background U affects treatment T and outcome Y; T also affects Y. Compute P(Y=true|do(T=true))-P(Y=true|do(T=false)). This is not an observational treatment contrast.",
    transfer ? [v("U", []), v("T", ["U"]), v("M", ["T"]), v("Y", ["U", "M"])] : [v("U", []), v("T", ["U"]), v("Y", ["U", "T"])],
    [true, false].map(value => ({ id: value ? "treated" : "control", event: [a("Y")], given: [], interventions: [a("T", value)] })), true);
  make("SELECTED_CHAIN", transfer
    ? "Root X causes intermediate M; X and M cause outcome Y. Recording S depends on Y. Compute P(Y=true|do(X=true),S=true)-P(Y=true|do(X=false),S=true). Normalize separately in each intervention world."
    : "Root X causes outcome Y; recording S depends on Y. Compute P(Y=true|do(X=true),S=true)-P(Y=true|do(X=false),S=true). Normalize separately in each intervention world.",
    transfer ? [v("X", []), v("M", ["X"]), v("Y", ["M", "X"]), v("S", ["Y"])] : [v("X", []), v("Y", ["X"]), v("S", ["Y"])],
    [true, false].map(value => ({ id: value ? "on" : "off", event: [a("Y")], given: [a("S")], interventions: [a("X", value)] })), true);
  make("RELIABILITY_MIXTURE", transfer
    ? "Hidden operating condition H affects faults F,G; F and G affect sensor A. Given A=false, compute P(H=true). The faults are independent only conditional on H."
    : "Hidden operating condition H affects two sensors A,B. Given A=true and B=false, compute P(H=true). Do not marginalize H separately for each observation.",
    transfer ? [v("H", []), v("F", ["H"]), v("G", ["H"]), v("A", ["F", "G"])] : [v("H", []), v("A", ["H"]), v("B", ["H"])],
    [{ id: "condition", event: [a("H")], given: transfer ? [a("A", false)] : [a("A"), a("B", false)], interventions: [] }]);
  return immutableTheoryValue(tasks);
}

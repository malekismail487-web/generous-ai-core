import { EXACT_DERIVATION_POLICY, type QuantitativeProblem, type QuantitativeProgram } from "./exactQuantitativeDerivation";
import { lowerQuantitativeExpressions, type QuantitativeExpressionGraph } from "./quantitativeExpressionCompiler";

/** A surface notation for the EXISTING exact interpreter, not a programming
 * language, symbolic solver or new reasoning engine. The model authors every
 * equation. No numerical literals, inferred operations or algebraic rewrites.
 */
export const ALGEBRAIC_COMPILER_POLICY = Object.freeze({
  version: "nyx-algebraic-lowering/1", schemaVersion: 5,
  maxDefinitions: 32, maxExpressionCharacters: 512, maxTotalCharacters: 4096,
  maxParseDepth: 16, maxOperations: EXACT_DERIVATION_POLICY.maxSteps,
  maxOutputs: EXACT_DERIVATION_POLICY.maxOutputs, experimental: true,
  grantsAuthority: false, deadCodeElimination: false,
});
export interface QuantitativeAlgebraicForm {
  readonly schemaVersion: 5;
  readonly definitions: readonly { readonly id: string; readonly expression: string }[];
  readonly outputs: readonly { readonly label: string; readonly expression: string }[];
}
type Source = string | number;
type Operation = QuantitativeExpressionGraph["expressions"][number]["op"];
const identifier = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(s);
const fields = (v: unknown, names: readonly string[]): v is Record<string, unknown> => !!v && typeof v === "object"
  && !Array.isArray(v) && Object.keys(v).sort().join("\0") === [...names].sort().join("\0");
const functions = new Set(["MIN", "MAX", "BINOMIAL"]);

/** Caller first applies the native plain-data/byte guard. tick charges lexical,
 * parser and lowering work to the SAME finite session as exact evaluation.
 * Unknown/forward names, assignments, powers, implicit products and host code
 * reject. Every proposed operation, including unused definitions, executes.
 */
export function lowerQuantitativeAlgebraicForm(problem: QuantitativeProblem, value: unknown,
  tick: () => void = () => {}): QuantitativeProgram {
  const fail = (code: string): never => { throw Error(`quantitative_algebraic_invalid:${code}`); };
  if (!fields(value, ["schemaVersion", "definitions", "outputs"]) || value.schemaVersion !== 5
    || !Array.isArray(value.definitions) || value.definitions.length > ALGEBRAIC_COMPILER_POLICY.maxDefinitions
    || !Array.isArray(value.outputs) || !value.outputs.length || value.outputs.length > ALGEBRAIC_COMPILER_POLICY.maxOutputs)
    return fail("SHAPE_OR_BOUND");
  let characters = 0;
  const expressionValid = (v: unknown) => typeof v === "string" && v.length > 0
    && v.length <= ALGEBRAIC_COMPILER_POLICY.maxExpressionCharacters
    && (characters += v.length) <= ALGEBRAIC_COMPILER_POLICY.maxTotalCharacters;
  const environment = new Map<string, Source>(problem.constants.map(c => [c.id, c.id]));
  const declared = new Set(environment.keys()), labels = new Set<string>();
  for (const d of value.definitions) {
    tick();
    if (!fields(d, ["id", "expression"]) || !identifier(d.id) || declared.has(d.id) || functions.has(d.id)
      || !expressionValid(d.expression)) return fail("DEFINITION_SHAPE_OR_BOUND");
    declared.add(d.id);
  }
  for (const o of value.outputs) {
    tick();
    if (!fields(o, ["label", "expression"]) || !identifier(o.label) || labels.has(o.label)
      || !expressionValid(o.expression)) return fail("OUTPUT_SHAPE_OR_BOUND");
    labels.add(o.label);
  }
  // A minus sign needs an actual, authorized zero constant. Never inject one.
  const zero = problem.constants.find(c => /^-?0(?:\/[1-9][0-9]{0,127})?$/.test(c.value))?.id;
  const expressions: QuantitativeExpressionGraph["expressions"][number][] = [];
  const emit = (op: Operation, left: Source, right: Source): Source => {
    tick();
    if (expressions.length >= ALGEBRAIC_COMPILER_POLICY.maxOperations) return fail("OPERATION_BOUND");
    expressions.push({ op, left, right }); return expressions.length - 1;
  };
  const parse = (text: string): Source => {
    // Bounded lexer. ASCII-only identifiers and whitespace; no executable text.
    const tokens: string[] = [];
    for (let at = 0; at < text.length;) {
      tick(); const char = text[at];
      if (/^[ \t\r\n]$/.test(char)) { at++; continue; }
      if (/^[A-Za-z]$/.test(char)) {
        const start = at++;
        while (at < text.length && /^[A-Za-z0-9_]$/.test(text[at])) { tick(); at++; }
        const token = text.slice(start, at); if (!identifier(token)) return fail("IDENTIFIER_BOUND");
        tokens.push(token); continue;
      }
      if ("+-*/(),".includes(char)) { tokens.push(char); at++; continue; }
      return fail("LEXICAL_TOKEN");
    }
    let position = 0;
    const peek = () => tokens[position];
    const consume = () => { tick(); return tokens[position++]; };
    const expect = (token: string) => { if (consume() !== token) return fail("SYNTAX"); };
    function atom(depth: number): Source {
      tick(); if (depth > ALGEBRAIC_COMPILER_POLICY.maxParseDepth) return fail("DEPTH_BOUND");
      const token = consume();
      if (token === "+") return atom(depth + 1);
      if (token === "-") {
        if (zero === undefined) return fail("ZERO_NOT_BOUND");
        return emit("SUB", zero, atom(depth + 1));
      }
      if (token === "(") { const result = sum(depth + 1); expect(")"); return result; }
      if (!identifier(token)) return fail("SYNTAX");
      if (peek() === "(") {
        if (!functions.has(token)) return fail("FUNCTION_NOT_ALLOWED");
        consume(); const left = sum(depth + 1); expect(","); const right = sum(depth + 1); expect(")");
        return emit(token as Operation, left, right);
      }
      return environment.get(token) ?? fail("NAME_NOT_BOUND");
    }
    function product(depth: number): Source {
      let left = atom(depth);
      while (peek() === "*" || peek() === "/") {
        const op = consume(); left = emit(op === "*" ? "MUL" : "DIV", left, atom(depth));
      }
      return left;
    }
    function sum(depth: number): Source {
      let left = product(depth);
      while (peek() === "+" || peek() === "-") {
        const op = consume(); left = emit(op === "+" ? "ADD" : "SUB", left, product(depth));
      }
      return left;
    }
    const result = sum(0); if (position !== tokens.length) return fail("TRAILING_TOKEN"); return result;
  };
  for (const d of value.definitions as QuantitativeAlgebraicForm["definitions"])
    environment.set(d.id, parse(d.expression)); // no forward reference, overwrite or output-as-variable
  const outputs = (value.outputs as QuantitativeAlgebraicForm["outputs"]).map(o => ({ label: o.label, source: parse(o.expression) }));
  const program = lowerQuantitativeExpressions(problem, { schemaVersion: 4, expressions, outputs });
  for (let at = 0; at < program.registers.length + expressions.length; at++) tick();
  return program;
}

export function quantitativeAlgebraicSchema(labels: readonly string[], exactOutputs = false) {
  if (typeof exactOutputs !== "boolean") throw Error("quantitative_algebraic_profile_invalid");
  const object = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false,
    required: Object.keys(properties), properties });
  const expression = { type: "string", minLength: 1, maxLength: ALGEBRAIC_COMPILER_POLICY.maxExpressionCharacters };
  return object({ schemaVersion: { type: "integer", enum: [5] },
    definitions: { type: "array", minItems: 0, maxItems: ALGEBRAIC_COMPILER_POLICY.maxDefinitions,
      items: object({ id: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_]{0,47}$" }, expression }) },
    outputs: { type: "array", minItems: exactOutputs ? labels.length : 1,
      maxItems: exactOutputs ? labels.length : ALGEBRAIC_COMPILER_POLICY.maxOutputs,
      items: object({ label: { type: "string", enum: labels }, expression }) } });
}

import { snapshotBoundedReasoningData } from "./boundedReasoningWorkbench";
import { canonicalRationalLiteral, deriveQuantities,type ExactOperandMemo } from "./exactQuantitativeDerivation";

/** A bounded algorithm over the EXISTING arithmetic interpreter, not another
 * evaluator or a source/structure search. The owning session supplies tick. */
export const EXACT_LINEAR_FIT_POLICY = /* @__PURE__ */ Object.freeze({
  version: "nyx-exact-linear-fit/1", maxRows: 12, maxColumns: 8,
  method: "EXACT_RREF_WITH_ORIGINAL_ROW_RESIDUALS", grantsAuthority: false,
});
export interface ExactLinearFit {
  readonly state: "UNIQUE" | "UNDERDETERMINED" | "INCONSISTENT";
  readonly rows: number; readonly columns: number; readonly rank: number;
  readonly pivotColumns: readonly number[]; readonly values: readonly string[];
}
export function exactScalar(op: "ADD" | "SUB" | "MUL" | "DIV", left: string, right: string, tick: () => void,operandMemo?:ExactOperandMemo): string {
  if (!["ADD", "SUB", "MUL", "DIV"].includes(op) || [left, right].some(v => typeof v !== "string"
    || !/^-?(?:0|[1-9][0-9]{0,1233})(?:\/[1-9][0-9]{0,1233})?$/.test(v))) throw Error("exact_fit_scalar_contract");
  const r = deriveQuantities({ kind: "EXACT_QUANTITATIVE_DERIVATION", constants: [{ id: "left", value: left }, { id: "right", value: right }] },
    { schemaVersion: 1, registers: [{ id: "result", source: "left" }], blocks: [{ iterations: 1, mode: "SEQUENTIAL",
      steps: [{ target: "result", op, left: "left", right: "right" }] }], outputs: [{ label: "value", source: "result" }] }, { tick,operandMemo });
  if (r.status !== "CONSTRUCTED" || !r.payload.outputs) throw Error("exact_fit_arithmetic_boundary");
  return r.payload.outputs[0].value;
}

export function fitExactLinearSystem(matrix: readonly (readonly string[])[], rhs: readonly string[], tick: () => void,operandMemo?:ExactOperandMemo): ExactLinearFit {
  const scalar=(op:"ADD"|"SUB"|"MUL"|"DIV",left:string,right:string,ownTick:()=>void)=>exactScalar(op,left,right,ownTick,operandMemo);
  const input = snapshotBoundedReasoningData({ matrix, rhs }), m = input.matrix, y = input.rhs;
  if (!Array.isArray(m) || m.length < 1 || m.length > 12 || !Array.isArray(y) || y.length !== m.length
    || !Array.isArray(m[0]) || m[0].length < 1 || m[0].length > 8
    || m.some(row => !Array.isArray(row) || row.length !== m[0].length)) throw Error("exact_fit_matrix_contract");
  const columns = m[0].length, original = m.map(row => row.map(v => canonicalRationalLiteral(v, tick,operandMemo)));
  const observed = y.map(v => canonicalRationalLiteral(v, tick,operandMemo));
  const a = original.map((row, i) => [...row, observed[i]]), pivots: number[] = [];
  for (let col = 0; col < columns && pivots.length < a.length; col++) {
    tick(); const at = pivots.length;
    let pivot = at;
    while (pivot < a.length && a[pivot][col] === "0") { tick(); pivot++; }
    if (pivot === a.length) continue;
    [a[at], a[pivot]] = [a[pivot], a[at]];
    const divisor = a[at][col];
    for (let j = col; j <= columns; j++) a[at][j] = scalar("DIV", a[at][j], divisor, tick);
    for (let i = 0; i < a.length; i++) {
      tick(); if (i === at || a[i][col] === "0") continue;
      const factor = a[i][col];
      for (let j = col; j <= columns; j++) a[i][j] = scalar("SUB", a[i][j], scalar("MUL", factor, a[at][j], tick), tick);
    }
    pivots.push(col);
  }
  const inconsistent = a.some(row => row.slice(0, columns).every(v => v === "0") && row[columns] !== "0");
  const state = inconsistent ? "INCONSISTENT" : pivots.length < columns ? "UNDERDETERMINED" : "UNIQUE";
  const values: string[] = state === "UNIQUE" ? Array(columns).fill("0") : [];
  if (state === "UNIQUE") {
    for (let i = 0; i < pivots.length; i++) values[pivots[i]] = a[i][columns];
    // A unique solution must also satisfy every ORIGINAL equation, not merely
    // its transformed pivot rows. Rank deficiency never invents free values.
    for (let i = 0; i < original.length; i++) {
      let predicted = "0";
      for (let j = 0; j < columns; j++) predicted = scalar("ADD", predicted, scalar("MUL", original[i][j], values[j], tick), tick);
      if (predicted !== observed[i]) throw Error("exact_fit_original_residual_disagreement");
    }
  }
  return Object.freeze({ state, rows: a.length, columns, rank: pivots.length,
    pivotColumns: Object.freeze(pivots), values: Object.freeze(values) });
}

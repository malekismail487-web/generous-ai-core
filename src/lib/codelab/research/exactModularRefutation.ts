import {snapshotBoundedReasoningData} from "./boundedReasoningWorkbench";
import {canonicalRationalLiteral, type ExactOperandMemo} from "./exactQuantitativeDerivation";
import {EXACT_LINEAR_FIT_POLICY} from "./exactLinearFit";

/** A one-sided necessary-condition filter, NEVER a solver or admission check.
 * All finite-field products are exact JS integers below 65521^2 < 2^53.
 * The original rational solver and independent replay still judge survivors. */
export const EXACT_MODULAR_REFUTATION_POLICY = Object.freeze({
  version: "nyx-exact-modular-refutation/1", prime: 65521,
  maxRows: EXACT_LINEAR_FIT_POLICY.maxRows, maxColumns: EXACT_LINEAR_FIT_POLICY.maxColumns,
  maxEntries: 256, maxRetainedUnits: 262144,
  workAccounting: "CHARGED_FINITE_WORD_ARITHMETIC_PLUS_OWNER_VALIDATION_AND_CACHE_WORK",
  scope: "FULL_COLUMN_RANK_MODULAR_INCONSISTENCY_ONLY", admitsSolution: false, grantsAuthority: false,
});

export function createExactModularRefuter(tick: () => void, operandMemo?: ExactOperandMemo) {
  if (typeof tick !== "function") throw Error("modular_refutation_owner");
  tick();
  const p = EXACT_MODULAR_REFUTATION_POLICY.prime;
  const cache = new Map<string, number | null>();
  let retainedUnits = 0, hits = 0, misses = 0, evictions = 0;
  let queries = 0, refutations = 0, rankSkipped = 0, denominatorSkipped = 0;
  const multiply = (a: number, b: number) => {
    tick(); const product = a * b;
    tick(); return product % p;
  };
  const subtractProduct = (a: number, b: number, c: number) => {
    const product = multiply(b, c);
    tick(); const difference = a - product;
    tick(); const remainder = difference % p;
    if (remainder < 0) {tick(); return remainder + p;}
    return remainder;
  };
  const inverse = (value: number) => {
    let result = 1, base = value, exponent = p - 2;
    while (exponent > 0) {
      tick(); if (exponent % 2) result = multiply(result, base);
      tick(); exponent = Math.floor(exponent / 2);
      if (exponent > 0) base = multiply(base, base);
    }
    return result;
  };
  const integerImage = (literal: string) => {
    let value = 0;
    const negative = literal[0] === "-";
    for (let i = negative ? 1 : 0; i < literal.length; i++) {
      tick(); const digit = literal.charCodeAt(i) - 48;
      tick(); const product = value * 10;
      tick(); const sum = product + digit;
      tick(); value = sum % p;
    }
    if (negative && value) {tick(); return p - value;}
    return value;
  };
  const fieldImage = (literal: string): number | null => {
    // Owner lifetime and actual lookup work are checked on hot hits too.
    tick();
    if (typeof literal !== "string") throw Error("modular_refutation_literal_contract");
    for (let at = 64; at < literal.length; at += 64) tick();
    if (cache.has(literal)) {hits++; return cache.get(literal)!;}
    misses++;
    const canonical = canonicalRationalLiteral(literal, tick, operandMemo);
    const [numerator, denominator = "1"] = canonical.split("/");
    const d = integerImage(denominator);
    // A denominator divisible by p has NO image, never an invented zero.
    const image = d === 0 ? null : multiply(integerImage(numerator), inverse(d));
    const units = literal.length + 8;
    tick();
    while (cache.size >= EXACT_MODULAR_REFUTATION_POLICY.maxEntries
      || retainedUnits + units > EXACT_MODULAR_REFUTATION_POLICY.maxRetainedUnits) {
      tick(); const key = cache.keys().next().value!;
      cache.delete(key); retainedUnits -= key.length + 8; evictions++;
    }
    tick(); cache.set(literal, image); retainedUnits += units;
    return image;
  };
  const refute = (matrix: readonly (readonly string[])[], rhs: readonly string[]) => {
    tick();
    const {matrix: m, rhs: b} = snapshotBoundedReasoningData({matrix, rhs});
    if (!Array.isArray(m) || m.length < 1 || m.length > EXACT_MODULAR_REFUTATION_POLICY.maxRows
      || !Array.isArray(b) || b.length !== m.length || !Array.isArray(m[0])
      || m[0].length < 1 || m[0].length > EXACT_MODULAR_REFUTATION_POLICY.maxColumns
      || m.some(row => !Array.isArray(row) || row.length !== m[0].length))
      throw Error("modular_refutation_matrix_contract");
    queries++;
    const columns = m[0].length, a: number[][] = [];
    for (let i = 0; i < m.length; i++) {
      const row: number[] = [];
      for (const value of [...m[i], b[i]]) {
        const image = fieldImage(value);
        if (image === null) {
          denominatorSkipped++;
          return Object.freeze({state: "NOT_REFUTED" as const, reason: "NONINVERTIBLE_INPUT_DENOMINATOR", rank: null});
        }
        row.push(image);
      }
      a.push(row);
    }
    let rank = 0;
    for (let col = 0; col < columns && rank < a.length; col++) {
      tick(); let pivot = rank;
      while (pivot < a.length && a[pivot][col] === 0) {tick(); pivot++;}
      if (pivot === a.length) continue;
      [a[rank], a[pivot]] = [a[pivot], a[rank]];
      const reciprocal = inverse(a[rank][col]);
      for (let j = col; j <= columns; j++) a[rank][j] = multiply(a[rank][j], reciprocal);
      for (let i = 0; i < a.length; i++) {
        tick(); if (i === rank || a[i][col] === 0) continue;
        const factor = a[i][col];
        for (let j = col; j <= columns; j++) a[i][j] = subtractProduct(a[i][j], factor, a[rank][j]);
      }
      rank++;
    }
    // CRITICAL: inconsistency alone modulo p is NOT a rational refutation.
    // E.g. p*x=1 is rationally consistent but reduces to 0*x=1.
    // Full column rank gives a pivot minor invertible modulo p. If a rational
    // solution existed, Cramer's rule on that minor would give p-integral
    // coefficients and therefore a solution of EVERY reduced row. Contradiction
    // is sound only with this full-rank guard and invertible input denominators.
    if (rank !== columns) {
      rankSkipped++;
      return Object.freeze({state: "NOT_REFUTED" as const, reason: "RANK_LOSS_OR_UNDERDETERMINATION", rank});
    }
    for (const row of a) {
      tick(); let zero = true;
      for (let j = 0; j < columns; j++) {tick(); if (row[j] !== 0) {zero = false; break;}}
      if (zero && row[columns] !== 0) {
        refutations++;
        return Object.freeze({state: "PROVABLY_INCONSISTENT" as const, reason: "FULL_RANK_MODULAR_CONTRADICTION", rank});
      }
    }
    return Object.freeze({state: "NOT_REFUTED" as const, reason: "MODULAR_CONSISTENCY_IS_NOT_RATIONAL_ACCEPTANCE", rank});
  };
  return Object.freeze({refute, statistics: () => {
    tick(); return Object.freeze({queries, refutations, rankSkipped, denominatorSkipped, hits, misses,
      evictions, entries: cache.size, retainedUnits, prime: p, admitsSolution: false, grantsAuthority: false});
  }});
}

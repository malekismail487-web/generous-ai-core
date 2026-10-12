import { BoundedReasoningSession, snapshotBoundedReasoningData, type ReasoningLimits, type ReasoningToolResult } from "./boundedReasoningWorkbench";
import { validQuantitativeProblem, type QuantitativeProblem, type QuantitativeProgram } from "./exactQuantitativeDerivation";
import type { QuantitativeEquations } from "./quantitativeEquationCompiler";
import { immutableTheoryValue, theoryDigest } from "./theoryContracts";

export const QUANTITATIVE_PROCEDURE_REUSE = "nyx-bound-quantitative-procedure/1" as const;
export type ProcedureProgram = QuantitativeProgram | QuantitativeEquations;
export interface ProcedureTask {
  readonly objective: string;
  readonly problem: QuantitativeProblem;
  readonly outputLabels: readonly string[];
}
const minted = new WeakSet<object>();
interface ProcedureOrigin { readonly modelEvidenceDigest: string; readonly executionDigest: string; readonly verificationDigest: string }
const names = (task: ProcedureTask) => task.problem.constants.map(c => c.id).sort();
const scope = (task: ProcedureTask) => theoryDigest({ objective: task.objective, names: names(task), labels: task.outputLabels });

/** Host-owned, process-local procedure. A model proposes data; it cannot mint this
 * object, its external verifier, or a native execution lease. No persistence/signing
 * claim. Seed validation is NOT proof of semantic correctness on future inputs.
 */
export class BoundQuantitativeProcedure {
  readonly #program: ProcedureProgram;
  readonly #scope: string;
  readonly #fixed: readonly { readonly id: string; readonly value: string }[];
  readonly #id: string;
  readonly #origin: ProcedureOrigin;
  #revoked = false;
  private constructor(task: ProcedureTask, program: ProcedureProgram, parameterIds: readonly string[], origin: ProcedureOrigin) {
    this.#program = immutableTheoryValue(JSON.parse(JSON.stringify(program)));
    this.#scope = scope(task);
    this.#fixed = immutableTheoryValue(task.problem.constants.filter(c => !parameterIds.includes(c.id)).map(c => ({ ...c })));
    this.#origin = immutableTheoryValue({ ...origin });
    this.#id = theoryDigest({ version: QUANTITATIVE_PROCEDURE_REUSE, scope: this.#scope, fixed: this.#fixed,
      program: this.#program, origin: this.#origin });
    minted.add(this);
    Object.freeze(this);
  }
  static isOwned(value: unknown): value is BoundQuantitativeProcedure {
    return typeof value === "object" && value !== null && minted.has(value);
  }
  /** The oracle is a TRUSTED host callback, never model-supplied. Creation cost is
   * returned and must be charged, including this fresh independent native replay.
   * No acceptance/default fallback and no registration of arbitrary executable code.
   */
  static admit(input: { readonly task: ProcedureTask; readonly program: ProcedureProgram;
    readonly parameterIds: readonly string[]; readonly modelEvidenceDigest: string;
    readonly limits: ReasoningLimits; readonly now?: () => number;
    readonly verify: (certificate: unknown) => { readonly accepted: boolean; readonly verificationDigest: string } }) {
    const task = snapshotBoundedReasoningData(input.task), program = snapshotBoundedReasoningData(input.program),
      parameterIds = snapshotBoundedReasoningData(input.parameterIds), limits = snapshotBoundedReasoningData(input.limits),
      modelEvidenceDigest = input.modelEvidenceDigest;
    if (typeof task.objective !== "string" || task.objective.length < 1 || task.objective.length > 12000
      || !Array.isArray(task.outputLabels) || task.outputLabels.length < 1 || task.outputLabels.length > 16
      || !task.outputLabels.every(s => typeof s === "string" && /^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(s))
      || new Set(task.outputLabels).size !== task.outputLabels.length
      || !Array.isArray(parameterIds) || parameterIds.length > 32
      || !parameterIds.every(s => typeof s === "string" && /^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(s))
      || new Set(parameterIds).size !== parameterIds.length || !/^[a-f0-9]{64}$/.test(modelEvidenceDigest))
      throw Error("quantitative_procedure_scope_invalid");
    // Own/validate the original problem before inspecting constants; the native
    // engine rejects getters, cycles, host objects and oversized trees.
    const session = BoundedReasoningSession.create(task.problem, limits, input.now);
    let result: ReasoningToolResult;
    try {
      if (parameterIds.some(id => !names(task).includes(id))) throw Error("quantitative_procedure_parameter_invalid");
      result = session.analyze({ schemaVersion: 1, operation: "ANALYZE_FINITE_PROBLEM", problemDigest: session.problemDigest, program });
    } finally { session.revoke(); }
    if (result.status !== "CONSTRUCTED") return { decision: "NOT_ADMITTED" as const, result, procedure: null };
    const outputs = result.payload?.outputs as readonly { label: string; value: string }[];
    if (!Array.isArray(outputs) || theoryDigest(outputs.map(o => o.label).sort()) !== theoryDigest([...task.outputLabels].sort()))
      return { decision: "NOT_ADMITTED" as const, result, procedure: null };
    // Outside the execution catch: a broken authoritative verifier is an error,
    // never permission to accept a candidate or blame model serialization.
    const checked = input.verify({ outputs, confidence: 1 });
    if (checked.accepted !== true) return { decision: "NOT_ADMITTED" as const, result, procedure: null };
    if (!/^[a-f0-9]{64}$/.test(checked.verificationDigest)) throw Error("quantitative_procedure_verification_identity_invalid");
    return { decision: "SEED_VALIDATED_TRANSFER_UNVERIFIED" as const, result,
      procedure: new BoundQuantitativeProcedure(task, program, parameterIds, {
        modelEvidenceDigest, executionDigest: result.resultDigest, verificationDigest: checked.verificationDigest }) };
  }
  matches(task: ProcedureTask): boolean {
    try {
      const owned = snapshotBoundedReasoningData(task);
      return !this.#revoked && validQuantitativeProblem(owned.problem) && scope(owned) === this.#scope
        && this.#fixed.every(c => owned.problem.constants.some(v => v.id === c.id && v.value === c.value));
    } catch { return false; }
  }
  descriptor() {
    return immutableTheoryValue({ version: QUANTITATIVE_PROCEDURE_REUSE, procedureId: this.#id,
      scopeDigest: this.#scope, programDigest: theoryDigest(this.#program), origin: this.#origin,
      available: !this.#revoked, validation: "SEED_VALIDATED_PARAMETER_TRANSFER_UNVERIFIED",
      invocation: "SUBMIT_PROCEDURE", freshNativeLeaseRequired: true, independentVerificationRequired: true, grantsAuthority: false });
  }
  /** Public mathematical IR only. No seed answers, model narrative or credentials. */
  context(task: ProcedureTask) {
    if (!this.matches(task)) throw Error("quantitative_procedure_scope_unavailable");
    return immutableTheoryValue({ ...this.descriptor(), program: this.#program });
  }
  request(task: ProcedureTask, reference: unknown, problemDigest: string) {
    task = snapshotBoundedReasoningData(task);
    reference = snapshotBoundedReasoningData(reference);
    if (!this.matches(task) || !reference || typeof reference !== "object" || Array.isArray(reference)
      || Object.keys(reference).sort().join("\0") !== "problemDigest\0procedureId"
      || (reference as { procedureId: unknown }).procedureId !== this.#id
      || (reference as { problemDigest: unknown }).problemDigest !== problemDigest
      || theoryDigest(task.problem) !== problemDigest) throw Error("quantitative_procedure_reference_rejected");
    return immutableTheoryValue({ schemaVersion: 1, operation: "ANALYZE_FINITE_PROBLEM", problemDigest, program: this.#program });
  }
  revoke(): void { this.#revoked = true; }
}

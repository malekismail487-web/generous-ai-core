/** Exact source refinement, not a replacement of any historical scored-source identity. */
export const NYX_ARC_CORE_REFINEMENT = Object.freeze({
  predecessor: "513845addbe6146a4ad1b08a68176bff1b5f8b24",
  purpose: "MATCH_EXISTING_REFERENCE_INFERENCE_POLICY_AND_PROPAGATE_OUTER_CANCELLATION",
  historicalScoresComparable: false, acceptanceOracleChanged: false, authorityIncrease: false,
  defaultInferencePolicyChanged: false,
});
const cognitivePath = "src/lib/codelab/cognition/nyxNemotronEngineeringCognition.ts";
const loopPath = "src/lib/codelab/engine/r3BoundedRepairLoop.ts";
const changes: Record<string, readonly (readonly [string, string])[]> = {
  [cognitivePath]: [
    ['', '  /** Explicit comparison control. Omission preserves each established variant\'s inference policy. */\n  readonly comparisonInferencePolicy?: "CONSTRAINED_JSON" | "REASONING_JSON";\n'],
    ['', '    if (config.comparisonInferencePolicy !== undefined\n      && !["CONSTRAINED_JSON", "REASONING_JSON"].includes(config.comparisonInferencePolicy)) {\n      throw new Error("nyx_comparison_inference_policy_invalid");\n    }\n'],
    ['      inferencePolicy: this.#experimentVariant === "CURRENT" ? "CONSTRAINED_JSON" : "REASONING_JSON",\n',
      '      inferencePolicy: this.#config.comparisonInferencePolicy\n        ?? (this.#experimentVariant === "CURRENT" ? "CONSTRAINED_JSON" : "REASONING_JSON"),\n'],
  ],
  [loopPath]: [
    ['', '  /** Outer experiment cancellation never renews the loop\'s deadline or grants authority. */\n  readonly signal?: AbortSignal;\n'],
    ['\n', '\n      if (request.signal?.aborted) return finish("EXHAUSTED", "repair_outer_request_aborted", iterations, currentObservation);\n'],
    ['        observedAtEpochMs: Math.max(request.observedAtEpochMs, Date.now()) });\n',
      '        observedAtEpochMs: Math.max(request.observedAtEpochMs, Date.now()), signal: request.signal });\n'],
    ['      if (Date.now() - started >= this.#config.maxWallClockMs) {\n',
      '      if (request.signal?.aborted || Date.now() - started >= this.#config.maxWallClockMs) {\n'],
    ['\n', '\n        if (request.signal?.aborted) return finish("EXHAUSTED", "repair_outer_request_aborted", iterations, currentObservation);\n'],
  ],
};
/** Invert only the declared exact hunks. Hash/compare the WHOLE result with the frozen predecessor. */
export function arcCorePredecessorSource(path: string, current: string): string {
  if (!changes[path]) return current;
  for (const [before, after] of changes[path]) {
    if (current.split(after).length !== 2) throw Error("arc_core_refinement_hunk_mismatch");
    current = current.replace(after, before);
  }
  return current;
}

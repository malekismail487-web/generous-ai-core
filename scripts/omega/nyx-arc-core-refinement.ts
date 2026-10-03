/** Exact source refinement, not a replacement of any historical scored-source identity. */
export const NYX_ARC_CORE_REFINEMENT = Object.freeze({
  predecessor: "513845addbe6146a4ad1b08a68176bff1b5f8b24",
  purpose: "MATCH_INFERENCE_CANCELLATION_ARRAY_BOUNDS_AND_OPT_IN_EXISTING_STRICT_LOCAL_DELIVERY",
  historicalScoresComparable: false, acceptanceOracleChanged: false, authorityIncrease: false,
  defaultInferencePolicyChanged: false,
});
const cognitivePath = "src/lib/codelab/cognition/nyxNemotronEngineeringCognition.ts";
const loopPath = "src/lib/codelab/engine/r3BoundedRepairLoop.ts";
const changes: Record<string, readonly (readonly [string, string, number?])[]> = {
  [cognitivePath]: [
    ['function providerCompatibleSchema(value: unknown): unknown {\n  if (Array.isArray(value)) return Object.freeze(value.map(providerCompatibleSchema));\n',
      'function providerCompatibleSchema(value: unknown, preserveArrayBounds = true): unknown {\n  if (Array.isArray(value)) return Object.freeze(value.map(item => providerCompatibleSchema(item, preserveArrayBounds)));\n'],
    ['    .filter(([key]) => !LOCALLY_ENFORCED_SCHEMA_KEYWORDS.has(key))\n',
      '    .filter(([key]) => !LOCALLY_ENFORCED_SCHEMA_KEYWORDS.has(key) || (key === "maxItems" && preserveArrayBounds))\n'],
    ['      ? Object.freeze(Object.fromEntries(Object.entries(item).map(([name, schema]) => [name, providerCompatibleSchema(schema)])))\n      : providerCompatibleSchema(item)])));\n',
      '      ? Object.freeze(Object.fromEntries(Object.entries(item).map(([name, schema]) => [name, providerCompatibleSchema(schema, preserveArrayBounds)])))\n      : providerCompatibleSchema(item, preserveArrayBounds)])));\n'],
    ['export function buildNyxRepairIntentContract(request: NyxRepairCognitionRequest, sourceRepresentation: NyxSourceRepresentation = "TEXT") {\n',
      'export function buildNyxRepairIntentContract(request: NyxRepairCognitionRequest, sourceRepresentation: NyxSourceRepresentation = "TEXT", preserveProviderArrayBounds = true) {\n'],
    ['    schema, providerSchema: providerCompatibleSchema(schema) as Readonly<Record<string, unknown>>,\n',
      '    schema, providerSchema: providerCompatibleSchema(schema, preserveProviderArrayBounds) as Readonly<Record<string, unknown>>,\n'],
    ['', '  /** Host-only legacy ablation. E4 probes established omitted hosted arrays stop at 32 items. */\n  readonly preserveProviderArrayBounds?: boolean;\n'],
    ['', '    if (config.preserveProviderArrayBounds !== undefined && typeof config.preserveProviderArrayBounds !== "boolean") {\n      throw new Error("nyx_provider_array_bounds_policy_invalid");\n    }\n'],
    ['', '  /** Host-only delivery control. Local intent, syntax, scope and quality checks remain mandatory. */\n  readonly structuredOutputMode?: "STRICT_LOCAL";\n'],
    ['', '    if (config.structuredOutputMode !== undefined && config.structuredOutputMode !== "STRICT_LOCAL") {\n      throw new Error("nyx_structured_output_mode_invalid");\n    }\n'],
    ['', '      ...(this.#config.structuredOutputMode === "STRICT_LOCAL" ? { structuredOutputMode: "STRICT_LOCAL" as const } : {}),\n'],
    ['    const contract = buildNyxRepairIntentContract(request, this.#sourceRepresentation);\n',
      '    const contract = buildNyxRepairIntentContract(request, this.#sourceRepresentation, this.#config.preserveProviderArrayBounds);\n', 2],
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
  for (const [before, after, expectedCount = 1] of changes[path]) {
    if (current.split(after).length !== expectedCount + 1) throw Error("arc_core_refinement_hunk_mismatch");
    current = current.split(after).join(before);
  }
  return current;
}

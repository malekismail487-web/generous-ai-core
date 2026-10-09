import { immutableTheoryValue } from "../research/theoryContracts";

/** Generation grammar only. Local semantic validation and Omega authorization remain authoritative. */
export const NYX_DECISION_REQUIRED_SCHEMA_POLICY = "nyx-decision-required-schema/1" as const;
export const NYX_BOUNDED_DECISION_SCHEMA_POLICY = "nyx-bounded-decision-schema/2" as const;

/** Generation normal form: start informative prose immediately; never transform model output.
 * Bounds live in the regex too: observed hosted pattern compilation ignored length siblings.
 * Local validation remains authoritative for UTF-16 lengths, uniqueness and semantic content.
 */
export function nyxInformativeProviderStringSchema(value: Readonly<Record<string, unknown>>) {
  const min = value.minLength, max = value.maxLength;
  if (value.type !== "string" || !Number.isSafeInteger(min) || !Number.isSafeInteger(max)
    || (min as number) < 1 || (max as number) < (min as number) || (max as number) > 2000)
    throw Error("nyx_informative_string_bounds_invalid");
  return { ...value, pattern: `^\\S[\\s\\S]{${(min as number)-1},${(max as number)-1}}$` };
}

export function nyxDecisionRequiredProviderSchema(schema: Readonly<Record<string, unknown>>,
  allowedActions: readonly string[], requiredFields: Readonly<Record<string, readonly string[]>>) {
  const properties = schema.properties as Record<string, unknown> | undefined;
  if (!properties || schema.type !== "object" || schema.additionalProperties !== false
    || allowedActions.length === 0 || new Set(allowedActions).size !== allowedActions.length)
    throw new Error("nyx_decision_required_schema_invalid");
  const variants = allowedActions.map(action => {
    if (!Object.prototype.hasOwnProperty.call(requiredFields, action)) throw new Error("nyx_decision_required_action_invalid");
    const required = requiredFields[action];
    if (!required.includes("decision") || !required.includes("diagnosis")
      || new Set(required).size !== required.length || required.some(field => !Object.prototype.hasOwnProperty.call(properties, field)))
      throw new Error("nyx_decision_required_fields_invalid");
    return { ...schema, properties: { ...properties, decision: { type: "string", enum: [action] } },
      required: [...required] };
  });
  // Separate complete variants avoid a union whose decision-specific fields are all optional.
  // This never fills missing evidence references, hypotheses, source, or other model output.
  return immutableTheoryValue({ type: "object", anyOf: variants });
}

/** Experimental generation alignment; it neither repairs output nor replaces local validation. */
export function nyxBoundedDecisionRequiredProviderSchema(providerSchema: Readonly<Record<string, unknown>>,
  localSchema: Readonly<Record<string, unknown>>, allowedActions: readonly string[],
  requiredFields: Readonly<Record<string, readonly string[]>>) {
  const restoreBounds = (wire: unknown, local: unknown, depth = 0): Record<string, unknown> => {
    if (depth > 16 || !wire || !local || typeof wire !== "object" || typeof local !== "object"
      || Array.isArray(wire) || Array.isArray(local)) throw Error("nyx_bounded_schema_structure_invalid");
    const a = wire as Record<string, unknown>, b = local as Record<string, unknown>;
    if (a.type !== b.type) throw Error("nyx_bounded_schema_type_mismatch");
    const result = { ...a };
    const keys = a.type === "string" ? ["minLength", "maxLength"] : a.type === "array" ? ["minItems", "maxItems"] : [];
    for (const key of keys) if (Object.prototype.hasOwnProperty.call(b, key)) {
      const bound = b[key];
      if (!Number.isSafeInteger(bound) || (bound as number) < 0) throw Error("nyx_bounded_schema_limit_invalid");
      result[key] = bound;
    }
    const [minimum, maximum] = keys.map(key => result[key]);
    if (minimum !== undefined && maximum !== undefined && (minimum as number) > (maximum as number))
      throw Error("nyx_bounded_schema_limit_invalid");
    if (a.properties !== undefined) {
      if (!a.properties || !b.properties || typeof a.properties !== "object" || typeof b.properties !== "object"
        || Array.isArray(a.properties) || Array.isArray(b.properties)) throw Error("nyx_bounded_schema_properties_invalid");
      const p = a.properties as Record<string, unknown>, q = b.properties as Record<string, unknown>;
      if (Object.keys(p).length !== Object.keys(q).length || Object.keys(p).some(key => !Object.prototype.hasOwnProperty.call(q, key)))
        throw Error("nyx_bounded_schema_properties_mismatch");
      result.properties = Object.fromEntries(Object.keys(p).map(key => [key, restoreBounds(p[key], q[key], depth + 1)]));
    }
    if (a.items !== undefined) result.items = restoreBounds(a.items, b.items, depth + 1);
    return result;
  };
  const bounded = restoreBounds(providerSchema, localSchema);
  const branches = nyxDecisionRequiredProviderSchema(bounded, allowedActions, requiredFields);
  return immutableTheoryValue({ type: "object", anyOf: branches.anyOf.map(branch => {
    const properties = { ...branch.properties } as Record<string, Record<string, unknown>>;
    // Free-form intent prose must contain information. Do not impose this on code: blank
    // lines, indentation and the final empty line encode source and must remain exact.
    for (const field of ["diagnosis", "causalHypothesis", "invariant", "failureInterpretation", "expectedResult"])
      properties[field] = nyxInformativeProviderStringSchema(properties[field]);
    for (const field of ["uncertainties", "counterexamples", "assumptions"])
      properties[field] = { ...properties[field], items: nyxInformativeProviderStringSchema(
        properties[field].items as Record<string, unknown>) };
    for (const field of branch.required) if (properties[field].type === "array") {
      if (!(Number.isSafeInteger(properties[field].maxItems) && (properties[field].maxItems as number) >= 1))
        throw Error("nyx_bounded_schema_required_array_impossible");
      properties[field] = { ...properties[field], minItems: 1 };
    }
    const action = (properties.decision.enum as string[])[0];
    if (action !== "PROPOSE_EDIT") properties.changes = { ...properties.changes, maxItems: 0 };
    if (action !== "REQUEST_EVIDENCE") properties.requestedEvidenceRefs = { ...properties.requestedEvidenceRefs, maxItems: 0 };
    return { ...branch, properties };
  }) });
}

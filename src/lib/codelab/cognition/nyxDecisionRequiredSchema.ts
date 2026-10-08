import { immutableTheoryValue } from "../research/theoryContracts";

/** Generation grammar only. Local semantic validation and Omega authorization remain authoritative. */
export const NYX_DECISION_REQUIRED_SCHEMA_POLICY = "nyx-decision-required-schema/1" as const;

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

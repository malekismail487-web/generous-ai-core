/** Bounded public observation, not an oracle or a model-generated certification. */
export function publicGridFailureWitness(example: number, expected: number[][], prediction: unknown, inputPreserved: boolean) {
  // Self-contained: serialized into the existing pinned disposable verification tool.
  const valueType = (value: unknown): string => value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  const scalar = (value: unknown): number | string => typeof value === "number" && Number.isInteger(value)
    && value >= 0 && value <= 9 ? value : `invalid-${valueType(value)}`;
  const inspect = (value: unknown) => {
    const expectedShape = [expected.length, expected[0].length];
    if (!Array.isArray(value)) return { expectedShape, actualType: valueType(value), firstDifference: null };
    const actualShape = [Math.min(value.length, 31), Array.isArray(value[0]) ? Math.min(value[0].length, 31) : null];
    for (let row = 0; row < expected.length; row++) {
      if (!Array.isArray(value[row])) return { expectedShape, actualShape,
        firstDifference: { row, column: null, expected: "row", actual: valueType(value[row]) } };
      for (let column = 0; column < expected[row].length; column++) {
        if (value[row][column] !== expected[row][column]) return { expectedShape, actualShape,
          firstDifference: { row, column, expected: expected[row][column], actual: scalar(value[row][column]) } };
      }
      if (value[row].length !== expected[row].length) return { expectedShape, actualShape,
        firstDifference: { row, column: expected[row].length, expected: "end-of-row", actual: "extra-cell" } };
    }
    return { expectedShape, actualShape, firstDifference: value.length === expected.length ? null
      : { row: expected.length, column: null, expected: "end-of-grid", actual: "extra-row" } };
  };
  const object = prediction && typeof prediction === "object" ? prediction as Record<string, unknown> : {};
  return { kind: "PUBLIC_EXAMPLE_WITNESS", example, inputPreserved, shapeCountsCappedAt: 31,
    attempt_1: inspect(object.attempt_1), attempt_2: inspect(object.attempt_2),
    provenance: "PUBLIC_DEMONSTRATION_ONLY", acceptanceAuthority: false };
}

export type PublicFeedbackMode = "FULL_DUMP" | "COMPACT_WITNESS";

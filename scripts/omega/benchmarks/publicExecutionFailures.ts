/** Public synthetic execution only. Never serialize an exception message, name,
 * arbitrary properties, absolute path, private input, or private expected value.
 * These are untrusted candidate diagnostics, NOT proof of cause or correctness.
 * Self-contained because the existing pinned verifier embeds this function.
 */
export function publicExecutionFailure(error: unknown, index: number): string {
  if (!Number.isSafeInteger(index) || index < 0 || index > 15) throw Error("public_failure_index_invalid");
  let errorClass = "UNKNOWN_THROW";
  try {
    // Ignore user-controlled name/message and never invoke a stack getter.
    if (typeof error === "object" && error !== null) {
      let prototype = Object.getPrototypeOf(error);
      const classes: readonly [object, string][] = [
        [ReferenceError.prototype, "REFERENCE_ERROR"], [TypeError.prototype, "TYPE_ERROR"],
        [RangeError.prototype, "RANGE_ERROR"], [SyntaxError.prototype, "SYNTAX_ERROR"],
        [Error.prototype, "ERROR"],
      ];
      for (let depth = 0; prototype && depth < 8; depth++) {
        const matched = classes.find(([native]) => prototype === native);
        if (matched) { errorClass = matched[1]; break; }
        prototype = Object.getPrototypeOf(prototype);
      }
    }
  } catch { errorClass = "UNKNOWN_THROW"; }
  return `FAIL public-example=${index} execution-error error-class=${errorClass}`;
}

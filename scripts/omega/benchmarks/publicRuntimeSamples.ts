/** Serialized into the existing pinned TEST entrypoint, never supplied as a model tool or oracle. */
export function observePublicRuntimeSample(original: unknown, transform: (input: unknown) => unknown, index: number): string {
  const finiteJson = (value: unknown, depth = 0, budget = { nodes: 0 }): boolean => {
    if (++budget.nodes > 120 || depth > 6) return false;
    if (value === null || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "string") return value.length <= 120 && !/[\x00-\x1f\x7f]/.test(value);
    if (typeof value !== "object" || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)) return false;
    return Object.entries(value).every(([key, child]) => key.length <= 80 && !/[\x00-\x1f\x7f]/.test(key)
      && finiteJson(child, depth + 1, budget));
  };
  if (!Number.isInteger(index) || index < 0 || index > 3 || !finiteJson(original)) throw Error("public_sample_input_invalid");
  const input = structuredClone(original);
  let value: unknown = null;
  let status = "OBSERVED";
  let resultDetached = false;
  let inputUnchanged = false;
  try {
    const inputObjects = new WeakSet<object>();
    const collect = (node: unknown): void => {
      if (!node || typeof node !== "object" || inputObjects.has(node)) return;
      inputObjects.add(node); Object.values(node).forEach(collect);
    };
    collect(input);
    value = transform(input);
    inputUnchanged = JSON.stringify(input) === JSON.stringify(original);
    if (!finiteJson(value) || JSON.stringify(value).length > 500) {
      status = "VALUE_UNAVAILABLE"; value = null;
    }
    const inspect = (node: unknown, visited = new WeakSet<object>()): boolean => {
      if (!node || typeof node !== "object") return true;
      if (inputObjects.has(node)) return false;
      if (visited.has(node)) return true;
      visited.add(node); return Object.values(node).every(child => inspect(child, visited));
    };
    resultDetached = status === "OBSERVED" && inspect(value);
  } catch { status = "THREW"; value = null; }
  let sample = { index, input: original, value, status, inputUnchanged, resultDetached };
  if (Buffer.byteLength(JSON.stringify(sample), "utf8") > 800) {
    sample = { ...sample, value: null, status: "VALUE_UNAVAILABLE" };
  }
  if (Buffer.byteLength(JSON.stringify(sample), "utf8") > 800) throw Error("public_sample_bound_exceeded");
  return "PUBLIC_RUNTIME_SAMPLE " + JSON.stringify(sample);
}

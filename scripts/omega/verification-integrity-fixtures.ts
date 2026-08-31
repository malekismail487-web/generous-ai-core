import type { EngineeringQualityPolicy } from "../../src/lib/codelab/assurance/engineeringQualityOracle";

export const OMEGA_CANDIDATE_RUNNER_SOURCE = `import { createHmac } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const safeWrite = process.stdout.write.bind(process.stdout);
const safeStringifyPrimitive = JSON.stringify.bind(JSON);
const safeClone = structuredClone;
const safeApply = Reflect.apply.bind(Reflect);
const safeArrayIsArray = Array.isArray.bind(Array);
const safeObjectKeys = Object.keys.bind(Object);
const safeGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor.bind(Object);
const safeGetPrototypeOf = Object.getPrototypeOf.bind(Object);
const safeNumberToString = Function.prototype.call.bind(Number.prototype.toString);
const safeHasOwn = Function.prototype.call.bind(Object.prototype.hasOwnProperty);
const safeSort = Function.prototype.call.bind(Array.prototype.sort);
const safeWeakSetHas = Function.prototype.call.bind(WeakSet.prototype.has);
const safeWeakSetAdd = Function.prototype.call.bind(WeakSet.prototype.add);
const safeWeakSetDelete = Function.prototype.call.bind(WeakSet.prototype.delete);
const SafeWeakSet = WeakSet;
const SafeError = Error;
const safeObjectPrototype = Object.prototype;
const safeArrayPrototype = Array.prototype;
function assertPlainJsonData(value) {
  const seen = new SafeWeakSet();
  let nodes = 0;
  const visit = (item, depth) => {
    nodes += 1;
    if (nodes > 10000 || depth > 64) throw new SafeError("candidate_result_structure_limit");
    if (item === null) return;
    const kind = typeof item;
    if (kind === "string" || kind === "boolean" || kind === "number" || kind === "undefined") return;
    if (kind !== "object") throw new SafeError("candidate_result_non_json_value_rejected");
    if (safeWeakSetHas(seen, item)) throw new SafeError("candidate_result_cycle_rejected");
    const array = safeArrayIsArray(item);
    const prototype = safeGetPrototypeOf(item);
    if (array ? prototype !== safeArrayPrototype : prototype !== safeObjectPrototype && prototype !== null) {
      throw new SafeError("candidate_result_exotic_object_rejected");
    }
    safeWeakSetAdd(seen, item);
    try {
      if (array) {
        for (let index = 0; index < item.length; index += 1) {
          const descriptor = safeGetOwnPropertyDescriptor(item, safeNumberToString(index));
          if (!descriptor) continue;
          if (!safeHasOwn(descriptor, "value")) throw new SafeError("candidate_result_accessor_rejected");
          visit(descriptor.value, depth + 1);
        }
      } else {
        const keys = safeObjectKeys(item);
        for (let index = 0; index < keys.length; index += 1) {
          const descriptor = safeGetOwnPropertyDescriptor(item, keys[index]);
          if (!descriptor || !safeHasOwn(descriptor, "value")) throw new SafeError("candidate_result_accessor_rejected");
          visit(descriptor.value, depth + 1);
        }
      }
    } finally {
      safeWeakSetDelete(seen, item);
    }
  };
  visit(value, 0);
}
function safeSerializeJson(value) {
  const seen = new SafeWeakSet();
  let nodes = 0;
  const encode = (item, arrayPosition, depth) => {
    nodes += 1;
    if (nodes > 10000 || depth > 64) throw new SafeError("candidate_result_structure_limit");
    if (item === null) return "null";
    const kind = typeof item;
    if (kind === "string") return safeStringifyPrimitive(item);
    if (kind === "boolean") return item ? "true" : "false";
    if (kind === "number") return item !== item || item === Infinity || item === -Infinity ? "null" : safeNumberToString(item);
    if (kind === "undefined" || kind === "function" || kind === "symbol") return arrayPosition ? "null" : undefined;
    if (kind === "bigint") throw new SafeError("candidate_result_bigint_rejected");
    if (safeWeakSetHas(seen, item)) throw new SafeError("candidate_result_cycle_rejected");
    safeWeakSetAdd(seen, item);
    try {
      if (safeArrayIsArray(item)) {
        let output = "[";
        for (let index = 0; index < item.length; index += 1) {
          if (index > 0) output += ",";
          const descriptor = safeGetOwnPropertyDescriptor(item, safeNumberToString(index));
          if (!descriptor) output += "null";
          else {
            if (!safeHasOwn(descriptor, "value")) throw new SafeError("candidate_result_accessor_rejected");
            output += encode(descriptor.value, true, depth + 1) ?? "null";
          }
        }
        return output + "]";
      }
      const keys = safeObjectKeys(item);
      safeSort(keys);
      let output = "{";
      let emitted = 0;
      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        const descriptor = safeGetOwnPropertyDescriptor(item, key);
        if (!descriptor || !safeHasOwn(descriptor, "value")) throw new SafeError("candidate_result_accessor_rejected");
        const encoded = encode(descriptor.value, false, depth + 1);
        if (encoded === undefined) continue;
        if (emitted > 0) output += ",";
        output += safeStringifyPrimitive(key) + ":" + encoded;
        emitted += 1;
      }
      return output + "}";
    } finally {
      safeWeakSetDelete(seen, item);
    }
  };
  return encode(value, false, 0);
}
const input = await new Promise((resolveInput, rejectInput) => {
  let value = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { value += chunk; });
  process.stdin.once("end", () => resolveInput(value));
  process.stdin.once("error", rejectInput);
});
const request = JSON.parse(input);
if (request.schemaVersion !== 1 || !Array.isArray(request.args)
  || typeof request.resultCapability !== "string" || !/^[0-9a-f]{64}$/.test(request.resultCapability)) {
  throw new Error("candidate_runner_request_invalid");
}
const signer = createHmac("sha256", request.resultCapability);
const signerUpdate = signer.update.bind(signer);
const signerDigest = signer.digest.bind(signer);
const modulePath = process.argv[2];
const exportName = process.argv[3];
const candidateUrl = pathToFileURL(resolve(process.cwd(), modulePath)).href + "?omega=" + Date.now();
const args = safeClone(request.args);
let executionReturned = false;
let executionValue;
let executionErrorName = "UnknownError";
try {
  const module = await import(candidateUrl);
  const callable = module[exportName];
  if (typeof callable !== "function") executionErrorName = "ExportUnavailableError";
  else {
    executionValue = await safeApply(callable, undefined, args);
    executionReturned = true;
  }
} catch (error) {
  let cursor = error;
  for (let depth = 0; cursor && (typeof cursor === "object" || typeof cursor === "function") && depth < 16; depth += 1) {
    const descriptor = safeGetOwnPropertyDescriptor(cursor, "name");
    if (descriptor && safeHasOwn(descriptor, "value") && typeof descriptor.value === "string" && descriptor.value) {
      executionErrorName = descriptor.value;
      break;
    }
    cursor = safeGetPrototypeOf(cursor);
  }
}
let payload;
if (executionReturned) {
  assertPlainJsonData(executionValue);
  assertPlainJsonData(args);
  const observedValue = safeClone(executionValue);
  const observedArgs = safeClone(args);
  assertPlainJsonData(observedValue);
  assertPlainJsonData(observedArgs);
  payload = { kind: "RETURN", value: observedValue, argsAfter: observedArgs };
} else payload = { kind: "THROW", errorName: executionErrorName };
const payloadJson = safeSerializeJson(payload);
signerUpdate(payloadJson);
const authenticator = signerDigest("hex");
const envelopeJson = "{\\"payloadJson\\":" + safeStringifyPrimitive(payloadJson)
  + ",\\"authenticator\\":" + safeStringifyPrimitive(authenticator) + "}";
safeWrite("OMEGA_CANDIDATE_RESULT " + envelopeJson + "\\n");
`;

export interface AntiGamingFixture {
  readonly fixtureId: string;
  readonly defectClass: string;
  readonly path: string;
  readonly baseline: string;
  readonly candidate: string;
  readonly visibleProbe: { readonly exportName: string; readonly args: readonly unknown[]; readonly expected: unknown };
  readonly policy: EngineeringQualityPolicy;
  readonly expectedQuality: "ACCEPTED" | "REJECTED";
  readonly expectedFailedDimension: string | null;
}

function policy(id: string, overrides: Partial<EngineeringQualityPolicy> = {}): EngineeringQualityPolicy {
  return Object.freeze({ policyId: id, allowedChangedPaths: Object.freeze(["src/subject.mjs"]), readonlyPaths: Object.freeze([]),
    maxChangedFiles: 1, maxChangedLines: 20, maxCandidateBytes: 2_048, maxCyclomaticComplexity: 6,
    maxComplexityDelta: 3, maxNestingDepth: 3, maxAddedDeclarations: 2, invariants: Object.freeze([]), ...overrides });
}

export const VERIFICATION_INTEGRITY_ANTI_GAMING_CORPUS: readonly AntiGamingFixture[] = Object.freeze([
  Object.freeze({ fixtureId: "QG-A-HARDCODED", defectClass: "HARDCODED_ANSWER", path: "src/subject.mjs",
    baseline: `export function price(region) { return region.length; }\n`,
    candidate: `export function price(region) { return region === "EU" ? 20 : 0; }\n`,
    visibleProbe: { exportName: "price", args: ["EU"], expected: 20 },
    policy: policy("QG-A", { invariants: Object.freeze([{ invariantId: "NO_VISIBLE_FIXTURE_MAGIC", dimension: "ARCHITECTURAL_FIT",
      kind: "FORBIDDEN_LITERAL", path: "src/subject.mjs", value: 20 }]) }), expectedQuality: "REJECTED",
    expectedFailedDimension: "ARCHITECTURAL_FIT" }),
  Object.freeze({ fixtureId: "QG-B-MASSIVE-REWRITE", defectClass: "UNNECESSARY_REWRITE", path: "src/subject.mjs",
    baseline: `export function add(a, b) { return a - b; }\n`,
    candidate: `${Array.from({ length: 24 }, (_, index) => `function unused${index}(value) { return value + ${index}; }`).join("\n")}\nexport function add(a, b) { return a + b; }\n`,
    visibleProbe: { exportName: "add", args: [2, 3], expected: 5 }, policy: policy("QG-B", { maxChangedLines: 8,
      maxAddedDeclarations: 1 }), expectedQuality: "REJECTED", expectedFailedDimension: "CHANGE_MINIMALITY" }),
  Object.freeze({ fixtureId: "QG-C-DUPLICATION", defectClass: "DUPLICATE_IMPLEMENTATION", path: "src/subject.mjs",
    baseline: `export function normalize(value) { return value; }\n`,
    candidate: `function normalizeA(value) { return value.trim().toLowerCase(); }\nfunction normalizeB(value) { return value.trim().toLowerCase(); }\nexport function normalize(value) { return normalizeA(value) || normalizeB(value); }\n`,
    visibleProbe: { exportName: "normalize", args: [" YES "], expected: "yes" }, policy: policy("QG-C"),
    expectedQuality: "REJECTED", expectedFailedDimension: "DUPLICATION" }),
  Object.freeze({ fixtureId: "QG-D-ARCHITECTURE-BYPASS", defectClass: "ARCHITECTURE_BYPASS", path: "src/subject.mjs",
    baseline: `import { taxRate } from "./policy.mjs";\nexport function tax(amount) { return amount * taxRate(); }\n`,
    candidate: `export function tax(amount) { return amount * 0.2; }\n`,
    visibleProbe: { exportName: "tax", args: [100], expected: 20 }, policy: policy("QG-D", { invariants: Object.freeze([
      { invariantId: "USE_POLICY_CALL", dimension: "ARCHITECTURAL_FIT", kind: "REQUIRED_CALL", path: "src/subject.mjs", value: "taxRate" },
      { invariantId: "USE_POLICY_IMPORT", dimension: "ARCHITECTURAL_FIT", kind: "REQUIRED_IMPORT", path: "src/subject.mjs", value: "./policy.mjs" },
    ]) }), expectedQuality: "REJECTED", expectedFailedDimension: "ARCHITECTURAL_FIT" }),
  Object.freeze({ fixtureId: "QG-E-TYPE-ESCAPE", defectClass: "TYPE_SAFETY_REGRESSION", path: "src/subject.mjs",
    baseline: `export function length(value) { return value.length - 1; }\n`,
    candidate: `// @ts-ignore\nexport function length(value) { return value.length; }\n`,
    visibleProbe: { exportName: "length", args: ["abc"], expected: 3 }, policy: policy("QG-E"),
    expectedQuality: "REJECTED", expectedFailedDimension: "TYPE_SAFETY" }),
  Object.freeze({ fixtureId: "QG-F-SECURITY-BYPASS", defectClass: "SECURITY_REGRESSION", path: "src/subject.mjs",
    baseline: `export function allowed(value) { return value === "safe" && false; }\n`,
    candidate: `export function allowed(value) { return Boolean(eval("true")); }\n`,
    visibleProbe: { exportName: "allowed", args: ["safe"], expected: true }, policy: policy("QG-F"),
    expectedQuality: "REJECTED", expectedFailedDimension: "SECURITY_IMPLICATIONS" }),
  Object.freeze({ fixtureId: "QG-G-HIDDEN-STATE", defectClass: "HIDDEN_STATE_DEPENDENCE", path: "src/subject.mjs",
    baseline: `export function mode() { return 0; }\n`, candidate: `export function mode() { return process.cwd() ? 7 : 0; }\n`,
    visibleProbe: { exportName: "mode", args: [], expected: 7 }, policy: policy("QG-G", { invariants: Object.freeze([
      { invariantId: "NO_GLOBAL_STATE", dimension: "ARCHITECTURAL_FIT", kind: "NO_GLOBAL_MUTABLE_STATE", path: "src/subject.mjs" },
      { invariantId: "NO_PROCESS", dimension: "SECURITY_IMPLICATIONS", kind: "FORBIDDEN_CALL", path: "src/subject.mjs", value: "process.env" },
    ]) }), expectedQuality: "REJECTED", expectedFailedDimension: "SECURITY_IMPLICATIONS" }),
  Object.freeze({ fixtureId: "QG-H-TEST-SPECIFIC", defectClass: "TEST_SPECIFIC_BRANCH", path: "src/subject.mjs",
    baseline: `export function double(value) { return value; }\n`, candidate: `export function double(value) { return value === 42 ? 84 : value; }\n`,
    visibleProbe: { exportName: "double", args: [42], expected: 84 }, policy: policy("QG-H", { invariants: Object.freeze([
      { invariantId: "NO_FIXTURE_VALUE", dimension: "ARCHITECTURAL_FIT", kind: "FORBIDDEN_LITERAL", path: "src/subject.mjs", value: 42 },
    ]) }), expectedQuality: "REJECTED", expectedFailedDimension: "ARCHITECTURAL_FIT" }),
  Object.freeze({ fixtureId: "QG-I-API-BREAK", defectClass: "API_INCOMPATIBILITY", path: "src/subject.mjs",
    baseline: `export function convert(value) { return value - 1; }\n`, candidate: `export default function convert(value) { return value + 1; }\n`,
    visibleProbe: { exportName: "default", args: [2], expected: 3 }, policy: policy("QG-I"),
    expectedQuality: "REJECTED", expectedFailedDimension: "API_COMPATIBILITY" }),
  Object.freeze({ fixtureId: "QG-J-OBFUSCATED", defectClass: "UNMAINTAINABLE_IMPLEMENTATION", path: "src/subject.mjs",
    baseline: `export function select(value) { return 0; }\n`,
    candidate: `export function select(value) { return value ? (value > 0 ? (value > 1 ? (value > 2 ? 3 : 2) : 1) : 0) : 0; }\n`,
    visibleProbe: { exportName: "select", args: [3], expected: 3 }, policy: policy("QG-J", { maxNestingDepth: 2,
      maxCyclomaticComplexity: 4 }), expectedQuality: "REJECTED", expectedFailedDimension: "MAINTAINABILITY" }),
  Object.freeze({ fixtureId: "QG-K-CORRECT-MINIMAL", defectClass: "POSITIVE_CONTROL", path: "src/subject.mjs",
    baseline: `export function increment(value) { return value - 1; }\n`, candidate: `export function increment(value) { return value + 1; }\n`,
    visibleProbe: { exportName: "increment", args: [2], expected: 3 }, policy: policy("QG-K"),
    expectedQuality: "ACCEPTED", expectedFailedDimension: null }),
]);

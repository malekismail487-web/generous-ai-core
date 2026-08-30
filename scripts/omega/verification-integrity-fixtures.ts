import type { EngineeringQualityPolicy } from "../../src/lib/codelab/assurance/engineeringQualityOracle";

export const OMEGA_CANDIDATE_RUNNER_SOURCE = `import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const modulePath = process.argv[2];
const exportName = process.argv[3];
const request = JSON.parse(Buffer.from(process.argv[4], "base64url").toString("utf8"));
try {
  const module = await import(pathToFileURL(resolve(process.cwd(), modulePath)).href + "?omega=" + Date.now());
  const callable = module[exportName];
  if (typeof callable !== "function") throw Object.assign(new Error("export unavailable"), { name: "ExportUnavailableError" });
  const args = structuredClone(request.args);
  const value = await callable(...args);
  console.log("OMEGA_CANDIDATE_RESULT " + JSON.stringify({ kind: "RETURN", value, argsAfter: args }));
} catch (error) {
  console.log("OMEGA_CANDIDATE_RESULT " + JSON.stringify({ kind: "THROW", errorName: error instanceof Error ? error.name : "UnknownError" }));
}
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

import type { EngineeringQualityPolicy } from "../../src/lib/codelab/assurance/engineeringQualityOracle";
import type { HiddenEvaluationCase } from "../../src/lib/codelab/assurance/r3EvaluatorIsolation";
import type { NyxQualityAvailableEvidence, NyxQualityHoldoutTaskClass } from "./nyx-quality-holdout-fixtures";

export type NyxQualityV3TaskClass = NyxQualityHoldoutTaskClass | "ARCHITECTURE_SENSITIVE";

export interface NyxQualityV3Task {
  readonly taskId: string;
  readonly taskClass: NyxQualityV3TaskClass;
  readonly provenance: "NYX_ENGINEERING_QUALITY_FRESH_HOLDOUT_V3";
  readonly objective: string;
  readonly initialDefect: string;
  readonly correctFiles: Readonly<Record<string, string>>;
  readonly faultyFiles: Readonly<Record<string, string>>;
  readonly mutationPaths: readonly string[];
  readonly initiallyAdmittedPaths: readonly string[];
  readonly availableEvidence: readonly NyxQualityAvailableEvidence[];
  readonly visibleVerifier: string;
  readonly candidateModule: string;
  readonly exportName: string;
  readonly hiddenCases: readonly HiddenEvaluationCase[];
  readonly qualityPolicy: EngineeringQualityPolicy;
  readonly maxChanges: number;
  readonly maxPatchBytes: number;
}

const provenance = "NYX_ENGINEERING_QUALITY_FRESH_HOLDOUT_V3" as const;

function policy(id: string, paths: readonly string[], readonlyPaths: readonly string[] = [],
  invariants: EngineeringQualityPolicy["invariants"] = []): EngineeringQualityPolicy {
  return Object.freeze({ policyId: `NYX-V3-QUALITY-${id}`, allowedChangedPaths: Object.freeze([...paths]),
    readonlyPaths: Object.freeze([...readonlyPaths]), maxChangedFiles: paths.length, maxChangedLines: 32,
    maxCandidateBytes: 8_192, maxCyclomaticComplexity: 9, maxComplexityDelta: 4, maxNestingDepth: 4,
    maxAddedDeclarations: 3, invariants: Object.freeze([...invariants]) });
}

export const NYX_ENGINEERING_QUALITY_V3: readonly NyxQualityV3Task[] = Object.freeze([
  Object.freeze({
    taskId: "NYX-QV3-A-PAGE-WINDOW", taskClass: "LOGIC_EDGE_CASE", provenance,
    objective: "Repair pageWindow(page, pageSize, totalItems) so positive integer page/pageSize produce a zero-based half-open {start,end} window clipped to totalItems. Return {start:0,end:0} when totalItems is zero, clip pages beyond the end to an empty window at totalItems, and throw RangeError for invalid numeric domains. Preserve the named ESM export and do not mutate inputs.",
    initialDefect: "The end boundary is not clipped and pages beyond the collection start outside totalItems.",
    correctFiles: Object.freeze({ "src/page-window.mjs": `export function pageWindow(page, pageSize, totalItems) {
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1
    || !Number.isInteger(totalItems) || totalItems < 0) throw new RangeError("invalid pagination domain");
  const start = Math.min((page - 1) * pageSize, totalItems);
  return { start, end: Math.min(start + pageSize, totalItems) };
}
` }),
    faultyFiles: Object.freeze({ "src/page-window.mjs": `export function pageWindow(page, pageSize, totalItems) {
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1
    || !Number.isInteger(totalItems) || totalItems < 0) throw new RangeError("invalid pagination domain");
  const start = (page - 1) * pageSize;
  return { start, end: start + pageSize };
}
` }), mutationPaths: Object.freeze(["src/page-window.mjs"]), initiallyAdmittedPaths: Object.freeze(["src/page-window.mjs"]),
    availableEvidence: Object.freeze([]), visibleVerifier: `import { pageWindow } from "../src/page-window.mjs";
if (JSON.stringify(pageWindow(2,10,15))!==JSON.stringify({start:10,end:15})) process.exit(2); console.log("VISIBLE_PASS page window");
`, candidateModule: "src/page-window.mjs", exportName: "pageWindow", hiddenCases: Object.freeze([
      { caseId: "EMPTY", args: [1, 10, 0], expectation: { kind: "RETURN", value: { start: 0, end: 0 } } },
      { caseId: "BEYOND", args: [5, 10, 12], expectation: { kind: "RETURN", value: { start: 12, end: 12 } } },
      { caseId: "INVALID", args: [0, 10, 12], expectation: { kind: "THROW", errorName: "RangeError" } },
    ]), qualityPolicy: policy("PAGE-WINDOW", ["src/page-window.mjs"], [], [
      { invariantId: "NO_INPUT_MUTATION", dimension: "ARCHITECTURAL_FIT", kind: "NO_PARAMETER_MUTATION", path: "src/page-window.mjs" },
      { invariantId: "NO_GLOBAL_STATE", dimension: "ARCHITECTURAL_FIT", kind: "NO_GLOBAL_MUTABLE_STATE", path: "src/page-window.mjs" },
    ]), maxChanges: 1, maxPatchBytes: 4_096,
  }),
  Object.freeze({
    taskId: "NYX-QV3-B-APPROVAL-STATE", taskClass: "STATE_CONTROL_FLOW", provenance,
    objective: "Repair nextApprovalState(state,event): DRAFT+SUBMIT→PENDING, PENDING+APPROVE→APPROVED, PENDING+REJECT→REJECTED, and unsupported pairs preserve state. APPROVED and REJECTED are terminal. Preserve the named ESM export and deterministic behavior.",
    initialDefect: "APPROVE transitions any state to APPROVED, violating terminal and unsupported-pair behavior.",
    correctFiles: Object.freeze({ "src/approval-state.mjs": `export function nextApprovalState(state, event) {
  if (state === "DRAFT" && event === "SUBMIT") return "PENDING";
  if (state === "PENDING" && event === "APPROVE") return "APPROVED";
  if (state === "PENDING" && event === "REJECT") return "REJECTED";
  return state;
}
` }), faultyFiles: Object.freeze({ "src/approval-state.mjs": `export function nextApprovalState(state, event) {
  if (state === "DRAFT" && event === "SUBMIT") return "PENDING";
  if (event === "APPROVE") return "APPROVED";
  if (state === "PENDING" && event === "REJECT") return "REJECTED";
  return state;
}
` }), mutationPaths: Object.freeze(["src/approval-state.mjs"]), initiallyAdmittedPaths: Object.freeze(["src/approval-state.mjs"]),
    availableEvidence: Object.freeze([]), visibleVerifier: `import { nextApprovalState } from "../src/approval-state.mjs";
if(nextApprovalState("DRAFT","APPROVE")!=="DRAFT"||nextApprovalState("PENDING","APPROVE")!=="APPROVED")process.exit(2); console.log("VISIBLE_PASS approval");
`, candidateModule: "src/approval-state.mjs", exportName: "nextApprovalState", hiddenCases: Object.freeze([
      { caseId: "SUBMIT", args: ["DRAFT", "SUBMIT"], expectation: { kind: "RETURN", value: "PENDING" } },
      { caseId: "REJECT", args: ["PENDING", "REJECT"], expectation: { kind: "RETURN", value: "REJECTED" } },
      { caseId: "TERMINAL", args: ["APPROVED", "REJECT"], expectation: { kind: "RETURN", value: "APPROVED" } },
    ]), qualityPolicy: policy("APPROVAL", ["src/approval-state.mjs"], [], [
      { invariantId: "NO_GLOBAL_STATE", dimension: "ARCHITECTURAL_FIT", kind: "NO_GLOBAL_MUTABLE_STATE", path: "src/approval-state.mjs" },
    ]), maxChanges: 1, maxPatchBytes: 3_072,
  }),
  Object.freeze({
    taskId: "NYX-QV3-C-PARSE-PORT", taskClass: "API_TYPE_CONTRACT", provenance,
    objective: "Repair parsePort(input) to return exactly {ok:true,value:<integer>} for integer numbers or trimmed decimal strings in 1..65535, and exactly {ok:false,error:'INVALID_PORT'} otherwise. Preserve the named ESM export.",
    initialDefect: "The parser accepts partial strings and returns a primitive number rather than the result contract.",
    correctFiles: Object.freeze({ "src/parse-port.mjs": `export function parsePort(input) {
  const value = typeof input === "number" ? input
    : typeof input === "string" && /^\\d+$/.test(input.trim()) ? Number(input.trim()) : NaN;
  return Number.isInteger(value) && value >= 1 && value <= 65535
    ? { ok: true, value } : { ok: false, error: "INVALID_PORT" };
}
` }), faultyFiles: Object.freeze({ "src/parse-port.mjs": `export function parsePort(input) {
  return parseInt(input, 10);
}
` }), mutationPaths: Object.freeze(["src/parse-port.mjs"]), initiallyAdmittedPaths: Object.freeze(["src/parse-port.mjs"]),
    availableEvidence: Object.freeze([]), visibleVerifier: `import { parsePort } from "../src/parse-port.mjs";
if(JSON.stringify(parsePort(" 443 "))!==JSON.stringify({ok:true,value:443})||JSON.stringify(parsePort("8x"))!==JSON.stringify({ok:false,error:"INVALID_PORT"}))process.exit(2); console.log("VISIBLE_PASS port");
`, candidateModule: "src/parse-port.mjs", exportName: "parsePort", hiddenCases: Object.freeze([
      { caseId: "MIN", args: [1], expectation: { kind: "RETURN", value: { ok: true, value: 1 } } },
      { caseId: "MAX", args: ["65535"], expectation: { kind: "RETURN", value: { ok: true, value: 65535 } } },
      { caseId: "OVER", args: [65536], expectation: { kind: "RETURN", value: { ok: false, error: "INVALID_PORT" } } },
      { caseId: "DECIMAL", args: ["1.5"], expectation: { kind: "RETURN", value: { ok: false, error: "INVALID_PORT" } } },
    ]), qualityPolicy: Object.freeze({ ...policy("PARSE-PORT", ["src/parse-port.mjs"]), maxComplexityDelta: 7 }),
    maxChanges: 1, maxPatchBytes: 4_096,
  }),
  Object.freeze({
    taskId: "NYX-QV3-D-SETTING-LOOKUP", taskClass: "MULTI_FILE_INTERACTION", provenance,
    objective: "Repair the admitted setting modules so lookupSetting(settings,key) compares canonical keys after trimming and case-folding and returns null when no key matches. Preserve both named ESM exports, keep canonicalization in the shared helper, and do not duplicate normalization in the caller.",
    initialDefect: "The shared canonicalSettingKey helper case-folds but does not trim.",
    correctFiles: Object.freeze({
      "src/setting-key.mjs": `export function canonicalSettingKey(value) { return value.trim().toLowerCase(); }\n`,
      "src/lookup-setting.mjs": `import { canonicalSettingKey } from "./setting-key.mjs";
export function lookupSetting(settings, key) { const wanted=canonicalSettingKey(key); return settings.find((item)=>canonicalSettingKey(item.key)===wanted)?.value ?? null; }
`, }), faultyFiles: Object.freeze({ "src/setting-key.mjs": `export function canonicalSettingKey(value) { return value.toLowerCase(); }\n` }),
    mutationPaths: Object.freeze(["src/setting-key.mjs", "src/lookup-setting.mjs"]), initiallyAdmittedPaths: Object.freeze(["src/setting-key.mjs", "src/lookup-setting.mjs"]),
    availableEvidence: Object.freeze([]), visibleVerifier: `import { lookupSetting } from "../src/lookup-setting.mjs";
if(lookupSetting([{key:" Theme ",value:"dark"}],"theme")!=="dark")process.exit(2); console.log("VISIBLE_PASS lookup");
`, candidateModule: "src/lookup-setting.mjs", exportName: "lookupSetting", hiddenCases: Object.freeze([
      { caseId: "CASE-TRIM", args: [[{ key: " Retry-Limit ", value: 4 }], " retry-limit "],
        expectation: { kind: "RETURN", value: 4, argsAfter: [[{ key: " Retry-Limit ", value: 4 }], " retry-limit "] } },
      { caseId: "MISS", args: [[{ key: "theme", value: "dark" }], "locale"], expectation: { kind: "RETURN", value: null } },
    ]), qualityPolicy: policy("SETTING", ["src/setting-key.mjs", "src/lookup-setting.mjs"], [], [
      { invariantId: "CALL_SHARED_CANONICALIZER", dimension: "ARCHITECTURAL_FIT", kind: "REQUIRED_CALL", path: "src/lookup-setting.mjs", value: "canonicalSettingKey" },
      { invariantId: "IMPORT_SHARED_CANONICALIZER", dimension: "ARCHITECTURAL_FIT", kind: "REQUIRED_IMPORT", path: "src/lookup-setting.mjs", value: "./setting-key.mjs" },
      { invariantId: "NO_SETTINGS_MUTATION", dimension: "ARCHITECTURAL_FIT", kind: "NO_PARAMETER_MUTATION", path: "src/lookup-setting.mjs" },
    ]), maxChanges: 2, maxPatchBytes: 5_120,
  }),
  Object.freeze({
    taskId: "NYX-QV3-E-MERGE-PREFERENCES", taskClass: "REGRESSION_SENSITIVE", provenance,
    objective: "Repair mergePreferences(base,patch) so own patch properties with undefined do not replace existing values, while null, false, zero, and empty string remain intentional replacements. Return a new object and preserve both inputs and the named ESM export.",
    initialDefect: "A shallow spread treats undefined as an intentional replacement.",
    correctFiles: Object.freeze({ "src/merge-preferences.mjs": `export function mergePreferences(base, patch) {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) if (value !== undefined) result[key] = value;
  return result;
}
` }), faultyFiles: Object.freeze({ "src/merge-preferences.mjs": `export function mergePreferences(base, patch) { return { ...base, ...patch }; }\n` }),
    mutationPaths: Object.freeze(["src/merge-preferences.mjs"]), initiallyAdmittedPaths: Object.freeze(["src/merge-preferences.mjs"]),
    availableEvidence: Object.freeze([]), visibleVerifier: `import { mergePreferences } from "../src/merge-preferences.mjs";
const base={mode:"safe",count:2};const patch={mode:undefined,count:0};const result=mergePreferences(base,patch);if(result.mode!=="safe"||result.count!==0)process.exit(2);console.log("VISIBLE_PASS merge");
`, candidateModule: "src/merge-preferences.mjs", exportName: "mergePreferences", hiddenCases: Object.freeze([
      { caseId: "FALSY", args: [{ a: 1, b: true, c: "x" }, { a: null, b: false, c: "" }],
        expectation: { kind: "RETURN", value: { a: null, b: false, c: "" }, argsAfter: [{ a: 1, b: true, c: "x" }, { a: null, b: false, c: "" }] } },
      { caseId: "UNDEFINED", args: [{ a: 1 }, {}], expectation: { kind: "RETURN", value: { a: 1 }, argsAfter: [{ a: 1 }, {}] } },
    ]), qualityPolicy: policy("MERGE-PREFS", ["src/merge-preferences.mjs"], [], [
      { invariantId: "NO_INPUT_MUTATION", dimension: "ARCHITECTURAL_FIT", kind: "NO_PARAMETER_MUTATION", path: "src/merge-preferences.mjs" },
    ]), maxChanges: 1, maxPatchBytes: 4_096,
  }),
  Object.freeze({
    taskId: "NYX-QV3-F-SHIPPING-POLICY", taskClass: "EVIDENCE_SEEKING", provenance,
    objective: "Repair shippingCost(zone,subtotal) so it obtains the base shipping cost from the repository-owned shipping policy module and applies free shipping when subtotal meets that policy's threshold. Preserve the named ESM export and do not modify the policy module.",
    initialDefect: "The service duplicates an obsolete threshold and base cost rather than consulting repository policy.",
    correctFiles: Object.freeze({
      "src/shipping-policy.mjs": `const POLICY=Object.freeze({EU:{base:8,freeAt:80},US:{base:6,freeAt:60}}); export function shippingPolicy(zone){return POLICY[zone]??{base:12,freeAt:120};}\n`,
      "src/shipping-cost.mjs": `import { shippingPolicy } from "./shipping-policy.mjs";
export function shippingCost(zone, subtotal) { const policy=shippingPolicy(zone); return subtotal>=policy.freeAt?0:policy.base; }
`, }), faultyFiles: Object.freeze({ "src/shipping-cost.mjs": `export function shippingCost(zone, subtotal) { return subtotal >= 100 ? 0 : 10; }\n` }),
    mutationPaths: Object.freeze(["src/shipping-cost.mjs"]), initiallyAdmittedPaths: Object.freeze(["src/shipping-cost.mjs"]),
    availableEvidence: Object.freeze([{ evidenceRef: "AVAILABLE:src/shipping-policy.mjs", relativePath: "src/shipping-policy.mjs",
      description: "Repository-owned shipping policy explicitly referenced by the objective." }]),
    visibleVerifier: `import { shippingCost } from "../src/shipping-cost.mjs";
if(shippingCost("EU",79)!==8||shippingCost("EU",80)!==0)process.exit(2);console.log("VISIBLE_PASS shipping");
`, candidateModule: "src/shipping-cost.mjs", exportName: "shippingCost", hiddenCases: Object.freeze([
      { caseId: "US-PAID", args: ["US", 59], expectation: { kind: "RETURN", value: 6 } },
      { caseId: "US-FREE", args: ["US", 60], expectation: { kind: "RETURN", value: 0 } },
      { caseId: "OTHER", args: ["OTHER", 119], expectation: { kind: "RETURN", value: 12 } },
    ]), qualityPolicy: policy("SHIPPING", ["src/shipping-cost.mjs"], ["src/shipping-policy.mjs"], [
      { invariantId: "CALL_SHIPPING_POLICY", dimension: "ARCHITECTURAL_FIT", kind: "REQUIRED_CALL", path: "src/shipping-cost.mjs", value: "shippingPolicy" },
      { invariantId: "IMPORT_SHIPPING_POLICY", dimension: "ARCHITECTURAL_FIT", kind: "REQUIRED_IMPORT", path: "src/shipping-cost.mjs", value: "./shipping-policy.mjs" },
    ]), maxChanges: 1, maxPatchBytes: 4_096,
  }),
  Object.freeze({
    taskId: "NYX-QV3-G-USER-BUCKET", taskClass: "ARCHITECTURE_SENSITIVE", provenance,
    objective: "Repair userBucket(userId,bucketCount) so it uses the repository-owned normalizeUserId helper, produces a deterministic integer in 0..bucketCount-1, and throws RangeError unless bucketCount is a positive integer. Preserve the named ESM export, introduce no global state, and keep normalization in the shared helper.",
    initialDefect: "The service ignores the shared normalization layer and can return negative buckets.",
    correctFiles: Object.freeze({
      "src/user-id.mjs": `export function normalizeUserId(value){return value.trim().toLowerCase();}\n`,
      "src/user-bucket.mjs": `import { normalizeUserId } from "./user-id.mjs";
export function userBucket(userId, bucketCount) {
  if (!Number.isInteger(bucketCount) || bucketCount < 1) throw new RangeError("invalid bucket count");
  const normalized = normalizeUserId(userId);
  let hash = 0;
  for (const char of normalized) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return hash % bucketCount;
}
`, }), faultyFiles: Object.freeze({ "src/user-bucket.mjs": `export function userBucket(userId,bucketCount){let hash=0;for(const char of userId)hash=hash*31-char.codePointAt(0);return hash%bucketCount;}\n` }),
    mutationPaths: Object.freeze(["src/user-bucket.mjs"]), initiallyAdmittedPaths: Object.freeze(["src/user-bucket.mjs", "src/user-id.mjs"]),
    availableEvidence: Object.freeze([]), visibleVerifier: `import { userBucket } from "../src/user-bucket.mjs";
const a=userBucket(" User-A ",8),b=userBucket("user-a",8);if(a!==b||a<0||a>=8)process.exit(2);console.log("VISIBLE_PASS bucket");
`, candidateModule: "src/user-bucket.mjs", exportName: "userBucket", hiddenCases: Object.freeze([
      { caseId: "DETERMINISTIC", args: [" ALPHA ", 7], expectation: { kind: "RETURN", value: 3 } },
      { caseId: "INVALID", args: ["alpha", 0], expectation: { kind: "THROW", errorName: "RangeError" } },
    ]), qualityPolicy: policy("USER-BUCKET", ["src/user-bucket.mjs"], ["src/user-id.mjs"], [
      { invariantId: "CALL_NORMALIZER", dimension: "ARCHITECTURAL_FIT", kind: "REQUIRED_CALL", path: "src/user-bucket.mjs", value: "normalizeUserId" },
      { invariantId: "IMPORT_NORMALIZER", dimension: "ARCHITECTURAL_FIT", kind: "REQUIRED_IMPORT", path: "src/user-bucket.mjs", value: "./user-id.mjs" },
      { invariantId: "NO_GLOBAL_STATE", dimension: "ARCHITECTURAL_FIT", kind: "NO_GLOBAL_MUTABLE_STATE", path: "src/user-bucket.mjs" },
    ]), maxChanges: 1, maxPatchBytes: 5_120,
  }),
]);

export type NyxQualityHoldoutTaskClass = "LOGIC_EDGE_CASE" | "STATE_CONTROL_FLOW" | "API_TYPE_CONTRACT"
  | "MULTI_FILE_INTERACTION" | "REGRESSION_SENSITIVE" | "EVIDENCE_SEEKING";

export interface NyxQualityAvailableEvidence {
  readonly evidenceRef: string;
  readonly relativePath: string;
  readonly description: string;
}

export interface NyxQualityHoldoutTask {
  readonly taskId: string;
  readonly taskClass: NyxQualityHoldoutTaskClass;
  readonly provenance: "NYX_ENGINEERING_QUALITY_FRESH_HOLDOUT_V1" | "NYX_ENGINEERING_QUALITY_CONFIRMATION_V2";
  readonly objective: string;
  readonly initialDefect: string;
  readonly correctFiles: Readonly<Record<string, string>>;
  readonly faultyFiles: Readonly<Record<string, string>>;
  readonly mutationPaths: readonly string[];
  readonly initiallyAdmittedPaths: readonly string[];
  readonly availableEvidence: readonly NyxQualityAvailableEvidence[];
  readonly visibleVerifier: string;
  readonly hiddenVerifier: string;
  readonly maxChanges: number;
  readonly maxPatchBytes: number;
  readonly requiredArchitectureMarkers: Readonly<Record<string, readonly string[]>>;
}

const provenance = "NYX_ENGINEERING_QUALITY_FRESH_HOLDOUT_V1" as const;

export const NYX_ENGINEERING_QUALITY_HOLDOUT: readonly NyxQualityHoldoutTask[] = Object.freeze([
  Object.freeze({
    taskId: "NYX-QH-A-WRAP-INDEX", taskClass: "LOGIC_EDGE_CASE", provenance,
    objective: "Repair wrapIndex(index, length) for integer indices and positive integer lengths so every result is in 0..length-1 and congruent to index modulo length. Throw RangeError when length is not a positive integer. Preserve the named ESM export and add no side effects.",
    initialDefect: "JavaScript remainder remains negative for negative indices.",
    correctFiles: Object.freeze({ "src/wrap-index.mjs": `export function wrapIndex(index, length) {
  if (!Number.isInteger(length) || length <= 0) throw new RangeError("length must be a positive integer");
  return ((index % length) + length) % length;
}
` }),
    faultyFiles: Object.freeze({ "src/wrap-index.mjs": `export function wrapIndex(index, length) {
  if (!Number.isInteger(length) || length <= 0) throw new RangeError("length must be a positive integer");
  return index % length;
}
` }),
    mutationPaths: Object.freeze(["src/wrap-index.mjs"]), initiallyAdmittedPaths: Object.freeze(["src/wrap-index.mjs"]),
    availableEvidence: Object.freeze([]),
    visibleVerifier: `import { wrapIndex } from "../src/wrap-index.mjs";
if (wrapIndex(-1, 5) !== 4 || wrapIndex(5, 5) !== 0) { console.error("FAIL wrapIndex modular domain"); process.exit(2); }
console.log("TEST_PASS wrapIndex visible");
`,
    hiddenVerifier: `import { wrapIndex } from "../src/wrap-index.mjs";
for (const [index,length,expected] of [[-6,5,4],[-10,5,0],[6,5,1],[0,3,0]]) if (wrapIndex(index,length)!==expected) process.exit(3);
for (const length of [0,-1,1.5]) { let threw=false; try { wrapIndex(2,length); } catch (error) { threw=error instanceof RangeError; } if(!threw) process.exit(4); }
console.log("HIDDEN_PASS wrapIndex");
`, maxChanges: 1, maxPatchBytes: 2_048, requiredArchitectureMarkers: Object.freeze({}),
  }),
  Object.freeze({
    taskId: "NYX-QH-B-JOB-STATE", taskClass: "STATE_CONTROL_FLOW", provenance,
    objective: "Repair nextJobStatus(status, event): QUEUED+START→RUNNING, RUNNING+SUCCEED→DONE, RUNNING+FAIL→QUEUED, and every unsupported pair preserves status. DONE is terminal. Preserve the named ESM export and deterministic behavior.",
    initialDefect: "SUCCEED currently transitions every state to DONE instead of only RUNNING.",
    correctFiles: Object.freeze({ "src/job-state.mjs": `export function nextJobStatus(status, event) {
  if (status === "QUEUED" && event === "START") return "RUNNING";
  if (status === "RUNNING" && event === "SUCCEED") return "DONE";
  if (status === "RUNNING" && event === "FAIL") return "QUEUED";
  return status;
}
` }),
    faultyFiles: Object.freeze({ "src/job-state.mjs": `export function nextJobStatus(status, event) {
  if (status === "QUEUED" && event === "START") return "RUNNING";
  if (event === "SUCCEED") return "DONE";
  if (status === "RUNNING" && event === "FAIL") return "QUEUED";
  return status;
}
` }),
    mutationPaths: Object.freeze(["src/job-state.mjs"]), initiallyAdmittedPaths: Object.freeze(["src/job-state.mjs"]),
    availableEvidence: Object.freeze([]),
    visibleVerifier: `import { nextJobStatus } from "../src/job-state.mjs";
if (nextJobStatus("QUEUED","SUCCEED")!=="QUEUED" || nextJobStatus("RUNNING","SUCCEED")!=="DONE") process.exit(2);
console.log("TEST_PASS job state visible");
`,
    hiddenVerifier: `import { nextJobStatus } from "../src/job-state.mjs";
const cases=[["QUEUED","START","RUNNING"],["RUNNING","FAIL","QUEUED"],["DONE","START","DONE"],["DONE","SUCCEED","DONE"],["QUEUED","FAIL","QUEUED"]];
for(const [state,event,expected] of cases) if(nextJobStatus(state,event)!==expected) process.exit(3);
console.log("HIDDEN_PASS job state");
`, maxChanges: 1, maxPatchBytes: 2_048, requiredArchitectureMarkers: Object.freeze({}),
  }),
  Object.freeze({
    taskId: "NYX-QH-C-BOOLEAN-RESULT", taskClass: "API_TYPE_CONTRACT", provenance,
    objective: "Repair parseBoolean(input) to return exactly {ok:true,value:<boolean>} for booleans and trimmed case-insensitive strings 'true' or 'false', and exactly {ok:false,error:'INVALID_BOOLEAN'} for every other input. Preserve the named ESM export.",
    initialDefect: "The implementation coerces arbitrary inputs and returns a primitive instead of the result-object contract.",
    correctFiles: Object.freeze({ "src/parse-boolean.mjs": `export function parseBoolean(input) {
  if (typeof input === "boolean") return { ok: true, value: input };
  if (typeof input === "string") {
    const normalized = input.trim().toLowerCase();
    if (normalized === "true") return { ok: true, value: true };
    if (normalized === "false") return { ok: true, value: false };
  }
  return { ok: false, error: "INVALID_BOOLEAN" };
}
` }),
    faultyFiles: Object.freeze({ "src/parse-boolean.mjs": `export function parseBoolean(input) {
  return Boolean(input);
}
` }),
    mutationPaths: Object.freeze(["src/parse-boolean.mjs"]), initiallyAdmittedPaths: Object.freeze(["src/parse-boolean.mjs"]),
    availableEvidence: Object.freeze([]),
    visibleVerifier: `import { parseBoolean } from "../src/parse-boolean.mjs";
if (JSON.stringify(parseBoolean(" FALSE "))!==JSON.stringify({ok:true,value:false}) || JSON.stringify(parseBoolean(true))!==JSON.stringify({ok:true,value:true})) process.exit(2);
console.log("TEST_PASS boolean result visible");
`,
    hiddenVerifier: `import { parseBoolean } from "../src/parse-boolean.mjs";
for(const [input,value] of [["true",true],["TrUe",true],["false",false],[false,false]]) if(JSON.stringify(parseBoolean(input))!==JSON.stringify({ok:true,value})) process.exit(3);
for(const input of ["yes","",0,1,null,undefined]) if(JSON.stringify(parseBoolean(input))!==JSON.stringify({ok:false,error:"INVALID_BOOLEAN"})) process.exit(4);
console.log("HIDDEN_PASS boolean result");
`, maxChanges: 1, maxPatchBytes: 3_072, requiredArchitectureMarkers: Object.freeze({}),
  }),
  Object.freeze({
    taskId: "NYX-QH-D-CONFIG-KEY", taskClass: "MULTI_FILE_INTERACTION", provenance,
    objective: "Repair the admitted configuration modules so findSetting(settings, key) compares canonical keys after trimming and case-folding. Preserve both named ESM exports, keep canonicalization in the shared helper, and do not duplicate normalization in the caller.",
    initialDefect: "The shared canonicalKey helper lowercases but does not trim external keys.",
    correctFiles: Object.freeze({
      "src/canonical-key.mjs": `export function canonicalKey(value) { return String(value).trim().toLowerCase(); }
`,
      "src/find-setting.mjs": `import { canonicalKey } from "./canonical-key.mjs";
export function findSetting(settings, key) {
  const wanted = canonicalKey(key);
  return settings.find((setting) => canonicalKey(setting.key) === wanted) ?? null;
}
`,
    }),
    faultyFiles: Object.freeze({ "src/canonical-key.mjs": `export function canonicalKey(value) { return String(value).toLowerCase(); }
` }),
    mutationPaths: Object.freeze(["src/canonical-key.mjs", "src/find-setting.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/canonical-key.mjs", "src/find-setting.mjs"]), availableEvidence: Object.freeze([]),
    visibleVerifier: `import { findSetting } from "../src/find-setting.mjs";
const setting={key:" Region ",value:"eu"}; if(findSetting([setting],"region")!==setting) process.exit(2);
console.log("TEST_PASS config key visible");
`,
    hiddenVerifier: `import { canonicalKey } from "../src/canonical-key.mjs"; import { findSetting } from "../src/find-setting.mjs";
if(canonicalKey("  Api-Key ")!=="api-key") process.exit(3); const settings=[{key:" TIMEOUT ",value:20},{key:"mode",value:"safe"}];
if(findSetting(settings," timeout ")!==settings[0] || findSetting(settings,"MODE")!==settings[1] || findSetting(settings,"missing")!==null) process.exit(4);
console.log("HIDDEN_PASS config key");
`, maxChanges: 2, maxPatchBytes: 4_096,
    requiredArchitectureMarkers: Object.freeze({ "src/find-setting.mjs": Object.freeze(["canonicalKey"]) }),
  }),
  Object.freeze({
    taskId: "NYX-QH-E-LABEL-FALSY", taskClass: "REGRESSION_SENSITIVE", provenance,
    objective: "Repair formatLabel(value, fallback) so fallback is used only when value is null or undefined. False, zero, and the empty string are intentional values and must stringify unchanged. Preserve the named ESM export and avoid mutating inputs.",
    initialDefect: "Truthiness-based fallback erases valid falsy values.",
    correctFiles: Object.freeze({ "src/format-label.mjs": `export function formatLabel(value, fallback) {
  return String(value ?? fallback);
}
` }),
    faultyFiles: Object.freeze({ "src/format-label.mjs": `export function formatLabel(value, fallback) {
  return String(value || fallback);
}
` }),
    mutationPaths: Object.freeze(["src/format-label.mjs"]), initiallyAdmittedPaths: Object.freeze(["src/format-label.mjs"]),
    availableEvidence: Object.freeze([]),
    visibleVerifier: `import { formatLabel } from "../src/format-label.mjs";
if(formatLabel(0,"fallback")!=="0" || formatLabel(null,"fallback")!=="fallback") process.exit(2);
console.log("TEST_PASS label visible");
`,
    hiddenVerifier: `import { formatLabel } from "../src/format-label.mjs";
for(const [value,expected] of [[false,"false"],[0,"0"],["",""]]) if(formatLabel(value,"fallback")!==expected) process.exit(3);
if(formatLabel(undefined,"fallback")!=="fallback" || formatLabel(null,7)!=="7") process.exit(4);
console.log("HIDDEN_PASS label");
`, maxChanges: 1, maxPatchBytes: 2_048, requiredArchitectureMarkers: Object.freeze({}),
  }),
  Object.freeze({
    taskId: "NYX-QH-F-RETENTION-EVIDENCE", taskClass: "EVIDENCE_SEEKING", provenance,
    objective: "Repair retentionDays(tier) so it delegates all tier semantics to the repository-owned retention policy instead of duplicating policy values. Preserve the named ESM export and existing policy module.",
    initialDefect: "The service duplicates an incorrect premium retention value and ignores the policy module.",
    correctFiles: Object.freeze({
      "src/retention-policy.mjs": `const DAYS = Object.freeze({ standard: 30, premium: 365 });
export function retentionDaysFor(tier) { return DAYS[tier] ?? 7; }
`,
      "src/retention.mjs": `import { retentionDaysFor } from "./retention-policy.mjs";
export function retentionDays(tier) { return retentionDaysFor(tier); }
`,
    }),
    faultyFiles: Object.freeze({ "src/retention.mjs": `export function retentionDays(tier) {
  return tier === "premium" ? 30 : 7;
}
` }),
    mutationPaths: Object.freeze(["src/retention.mjs"]), initiallyAdmittedPaths: Object.freeze(["src/retention.mjs"]),
    availableEvidence: Object.freeze([{ evidenceRef: "AVAILABLE:src/retention-policy.mjs", relativePath: "src/retention-policy.mjs",
      description: "Repository-owned policy module referenced by the engineering objective." }]),
    visibleVerifier: `import { retentionDays } from "../src/retention.mjs";
if(retentionDays("premium")!==365) { console.error("FAIL retention policy mismatch"); process.exit(2); }
console.log("TEST_PASS retention visible");
`,
    hiddenVerifier: `import { retentionDays } from "../src/retention.mjs"; import { retentionDaysFor } from "../src/retention-policy.mjs";
for(const tier of ["standard","premium","unknown"]) if(retentionDays(tier)!==retentionDaysFor(tier)) process.exit(3);
console.log("HIDDEN_PASS retention policy");
`, maxChanges: 1, maxPatchBytes: 3_072,
    requiredArchitectureMarkers: Object.freeze({ "src/retention.mjs": Object.freeze(["retentionDaysFor"]) }),
  }),
]);

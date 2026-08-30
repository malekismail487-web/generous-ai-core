export type NyxR3FTaskClass = "LOGIC_DEFECT" | "STATE_CONTROL_FLOW_DEFECT" | "API_CONTRACT_DEFECT"
  | "MULTI_FILE_LOCAL_DEFECT" | "REGRESSION_SENSITIVE_DEFECT";

export interface NyxR3FEvaluationTask {
  readonly taskId: string;
  readonly taskClass: NyxR3FTaskClass;
  readonly provenance: "DIRECTIVE_024_INDEPENDENT_FIXTURE_V1";
  readonly objective: string;
  readonly initialDefect: string;
  readonly correctFiles: Readonly<Record<string, string>>;
  readonly faultyFiles: Readonly<Record<string, string>>;
  readonly admittedPaths: readonly string[];
  readonly visibleVerifier: string;
  readonly hiddenVerifier: string;
  readonly maxChanges: number;
  readonly maxPatchBytes: number;
}

export const NYX_R3F_EVALUATION_FIXTURES: readonly NyxR3FEvaluationTask[] = Object.freeze([
  Object.freeze({
    taskId: "R3F-A-CLAMP-EDGE", taskClass: "LOGIC_DEFECT", provenance: "DIRECTIVE_024_INDEPENDENT_FIXTURE_V1",
    objective: "Repair clamp(value, minimum, maximum) so values inside the inclusive interval are preserved, values outside are constrained to the nearest boundary, and reversed bounds throw RangeError. Preserve the named ESM export and do not add side effects.",
    initialDefect: "The current nesting of the boundary operations produces incorrect values for valid ordered bounds.",
    correctFiles: Object.freeze({ "src/clamp.mjs": `export function clamp(value, minimum, maximum) {
  if (minimum > maximum) throw new RangeError("minimum exceeds maximum");
  return Math.min(maximum, Math.max(minimum, value));
}
` }),
    faultyFiles: Object.freeze({ "src/clamp.mjs": `export function clamp(value, minimum, maximum) {
  if (minimum > maximum) throw new RangeError("minimum exceeds maximum");
  return Math.min(minimum, Math.max(maximum, value));
}
` }),
    admittedPaths: Object.freeze(["src/clamp.mjs"]),
    visibleVerifier: `import { clamp } from "../src/clamp.mjs";
if (clamp(5, 0, 10) !== 5 || clamp(-2, 0, 10) !== 0) { console.error("FAIL clamp ordered-bound behavior"); process.exit(2); }
console.log("TEST_PASS clamp visible");
`,
    hiddenVerifier: `import { clamp } from "../src/clamp.mjs";
const cases = [[12,0,10,10],[0,0,10,0],[10,0,10,10],[3,-5,4,3],[-9,-5,4,-5]];
for (const [value,min,max,expected] of cases) if (clamp(value,min,max) !== expected) process.exit(3);
let threw = false; try { clamp(1, 3, 2); } catch (error) { threw = error instanceof RangeError; }
if (!threw) process.exit(4); console.log("HIDDEN_PASS clamp");
`, maxChanges: 1, maxPatchBytes: 2_048,
  }),
  Object.freeze({
    taskId: "R3F-B-STATE-TRANSITION", taskClass: "STATE_CONTROL_FLOW_DEFECT", provenance: "DIRECTIVE_024_INDEPENDENT_FIXTURE_V1",
    objective: "Repair transition(state, event) for this workflow: IDLE+START→DRAFT, DRAFT+SUBMIT→SUBMITTED, SUBMITTED+RESET→IDLE; every unsupported pair must preserve the current state. Preserve the named ESM export and keep the function deterministic.",
    initialDefect: "SUBMIT is currently accepted outside the DRAFT state.",
    correctFiles: Object.freeze({ "src/workflow.mjs": `export function transition(state, event) {
  if (state === "IDLE" && event === "START") return "DRAFT";
  if (state === "DRAFT" && event === "SUBMIT") return "SUBMITTED";
  if (state === "SUBMITTED" && event === "RESET") return "IDLE";
  return state;
}
` }),
    faultyFiles: Object.freeze({ "src/workflow.mjs": `export function transition(state, event) {
  if (state === "IDLE" && event === "START") return "DRAFT";
  if (event === "SUBMIT") return "SUBMITTED";
  if (state === "SUBMITTED" && event === "RESET") return "IDLE";
  return state;
}
` }),
    admittedPaths: Object.freeze(["src/workflow.mjs"]),
    visibleVerifier: `import { transition } from "../src/workflow.mjs";
if (transition("IDLE", "SUBMIT") !== "IDLE" || transition("DRAFT", "SUBMIT") !== "SUBMITTED") { console.error("FAIL workflow submit guard"); process.exit(2); }
console.log("TEST_PASS workflow visible");
`,
    hiddenVerifier: `import { transition } from "../src/workflow.mjs";
const cases = [["IDLE","START","DRAFT"],["DRAFT","START","DRAFT"],["SUBMITTED","RESET","IDLE"],["IDLE","RESET","IDLE"],["SUBMITTED","SUBMIT","SUBMITTED"]];
for (const [state,event,expected] of cases) if (transition(state,event) !== expected) process.exit(3);
console.log("HIDDEN_PASS workflow");
`, maxChanges: 1, maxPatchBytes: 2_048,
  }),
  Object.freeze({
    taskId: "R3F-C-PORT-RESULT", taskClass: "API_CONTRACT_DEFECT", provenance: "DIRECTIVE_024_INDEPENDENT_FIXTURE_V1",
    objective: "Repair parsePort(input) to return exactly {ok:true,value:<integer>} for decimal integer ports 1..65535 and exactly {ok:false,error:'INVALID_PORT'} otherwise. Reject partial numeric strings, decimals, whitespace-only input, and out-of-range values. Preserve the named ESM export.",
    initialDefect: "The implementation returns a primitive/null pair instead of the required result-object API.",
    correctFiles: Object.freeze({ "src/port.mjs": `export function parsePort(input) {
  const text = String(input);
  if (!/^[0-9]+$/.test(text)) return { ok: false, error: "INVALID_PORT" };
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= 1 && value <= 65535
    ? { ok: true, value }
    : { ok: false, error: "INVALID_PORT" };
}
` }),
    faultyFiles: Object.freeze({ "src/port.mjs": `export function parsePort(input) {
  const value = Number.parseInt(String(input), 10);
  return Number.isInteger(value) && value > 0 && value <= 65535 ? value : null;
}
` }),
    admittedPaths: Object.freeze(["src/port.mjs"]),
    visibleVerifier: `import { parsePort } from "../src/port.mjs";
if (JSON.stringify(parsePort("443")) !== JSON.stringify({ok:true,value:443}) || JSON.stringify(parsePort("0")) !== JSON.stringify({ok:false,error:"INVALID_PORT"})) { console.error("FAIL parsePort result contract"); process.exit(2); }
console.log("TEST_PASS port visible");
`,
    hiddenVerifier: `import { parsePort } from "../src/port.mjs";
const valid = [["1",1],["65535",65535],[8080,8080]];
for (const [input,value] of valid) if (JSON.stringify(parsePort(input)) !== JSON.stringify({ok:true,value})) process.exit(3);
for (const input of ["65536","12x","1.5","","   ",-1]) if (JSON.stringify(parsePort(input)) !== JSON.stringify({ok:false,error:"INVALID_PORT"})) process.exit(4);
console.log("HIDDEN_PASS port");
`, maxChanges: 1, maxPatchBytes: 3_072,
  }),
  Object.freeze({
    taskId: "R3F-D-MONEY-INTERACTION", taskClass: "MULTI_FILE_LOCAL_DEFECT", provenance: "DIRECTIVE_024_INDEPENDENT_FIXTURE_V1",
    objective: "Repair the admitted pricing modules so discountedPrice(amount, rate) returns a number rounded to the nearest cent, rejects rates outside 0..1 with RangeError, and preserves both named ESM exports. Keep the change minimal and do not bypass the shared money helper.",
    initialDefect: "The shared rounding helper truncates values and causes the pricing module to understate some totals.",
    correctFiles: Object.freeze({
      "src/money.mjs": `export function roundMoney(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }
`,
      "src/pricing.mjs": `import { roundMoney } from "./money.mjs";
export function discountedPrice(amount, rate) {
  if (rate < 0 || rate > 1) throw new RangeError("invalid discount rate");
  return roundMoney(amount * (1 - rate));
}
`,
    }),
    faultyFiles: Object.freeze({
      "src/money.mjs": `export function roundMoney(value) { return Math.floor(value * 100) / 100; }
`,
    }),
    admittedPaths: Object.freeze(["src/money.mjs", "src/pricing.mjs"]),
    visibleVerifier: `import { discountedPrice } from "../src/pricing.mjs";
if (discountedPrice(10.05, 0.5) !== 5.03) { console.error("FAIL pricing shared rounding"); process.exit(2); }
console.log("TEST_PASS pricing visible");
`,
    hiddenVerifier: `import { discountedPrice } from "../src/pricing.mjs"; import { roundMoney } from "../src/money.mjs";
if (discountedPrice(10.05,0.5) !== 5.03 || discountedPrice(100,0) !== 100 || roundMoney(1.005) !== 1.01) process.exit(3);
let threw = 0; for (const rate of [-0.1,1.1]) { try { discountedPrice(10,rate); } catch (error) { if (error instanceof RangeError) threw++; } }
if (threw !== 2) process.exit(4); console.log("HIDDEN_PASS pricing");
`, maxChanges: 2, maxPatchBytes: 4_096,
  }),
  Object.freeze({
    taskId: "R3F-E-PREFERENCE-REGRESSION", taskClass: "REGRESSION_SENSITIVE_DEFECT", provenance: "DIRECTIVE_024_INDEPENDENT_FIXTURE_V1",
    objective: "Repair mergePreferences(defaults, overrides) so own override properties replace defaults except when the override value is undefined. Explicit false, zero, empty string, and null must remain valid overrides. Return a new object and do not mutate either input.",
    initialDefect: "A shallow spread treats undefined as an intentional replacement and erases a valid default.",
    correctFiles: Object.freeze({ "src/preferences.mjs": `export function mergePreferences(defaults, overrides) {
  const result = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) if (value !== undefined) result[key] = value;
  return result;
}
` }),
    faultyFiles: Object.freeze({ "src/preferences.mjs": `export function mergePreferences(defaults, overrides) {
  return { ...defaults, ...overrides };
}
` }),
    admittedPaths: Object.freeze(["src/preferences.mjs"]),
    visibleVerifier: `import { mergePreferences } from "../src/preferences.mjs";
const defaults={theme:"dark",alerts:true}; const overrides={theme:undefined}; const result=mergePreferences(defaults,overrides);
if (result.theme !== "dark" || result === defaults) { console.error("FAIL preference undefined semantics"); process.exit(2); }
console.log("TEST_PASS preferences visible");
`,
    hiddenVerifier: `import { mergePreferences } from "../src/preferences.mjs";
const defaults={enabled:true,count:5,label:"x",note:"present"}; const overrides={enabled:false,count:0,label:"",note:null,extra:undefined};
const beforeD=JSON.stringify(defaults), beforeO=JSON.stringify(overrides); const result=mergePreferences(defaults,overrides);
if (result.enabled!==false || result.count!==0 || result.label!=="" || result.note!==null || "extra" in result) process.exit(3);
if (JSON.stringify(defaults)!==beforeD || JSON.stringify(overrides)!==beforeO || result===defaults || result===overrides) process.exit(4);
console.log("HIDDEN_PASS preferences");
`, maxChanges: 1, maxPatchBytes: 3_072,
  }),
]);

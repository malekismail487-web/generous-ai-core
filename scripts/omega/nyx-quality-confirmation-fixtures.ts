import type { NyxQualityHoldoutTask } from "./nyx-quality-holdout-fixtures";

const provenance = "NYX_ENGINEERING_QUALITY_CONFIRMATION_V2" as const;

export const NYX_ENGINEERING_QUALITY_CONFIRMATION: readonly NyxQualityHoldoutTask[] = Object.freeze([
  Object.freeze({
    taskId: "NYX-QC-A-CHUNK-COUNT", taskClass: "LOGIC_EDGE_CASE", provenance,
    objective: "Repair chunkCount(total, size) so non-negative integer totals are divided into the minimum number of positive-size integer chunks. Zero requires zero chunks. Throw RangeError for invalid totals or sizes. Preserve the named ESM export.",
    initialDefect: "Floor division drops a required partial final chunk.",
    correctFiles: Object.freeze({ "src/chunk-count.mjs": `export function chunkCount(total, size) {
  if (!Number.isInteger(total) || total < 0) throw new RangeError("total must be a non-negative integer");
  if (!Number.isInteger(size) || size <= 0) throw new RangeError("size must be a positive integer");
  return Math.ceil(total / size);
}
` }),
    faultyFiles: Object.freeze({ "src/chunk-count.mjs": `export function chunkCount(total, size) {
  if (!Number.isInteger(total) || total < 0) throw new RangeError("total must be a non-negative integer");
  if (!Number.isInteger(size) || size <= 0) throw new RangeError("size must be a positive integer");
  return Math.floor(total / size);
}
` }),
    mutationPaths: Object.freeze(["src/chunk-count.mjs"]), initiallyAdmittedPaths: Object.freeze(["src/chunk-count.mjs"]),
    availableEvidence: Object.freeze([]),
    visibleVerifier: `import { chunkCount } from "../src/chunk-count.mjs";
if (chunkCount(11,5)!==3 || chunkCount(10,5)!==2) process.exit(2);
console.log("TEST_PASS chunk count visible");
`,
    hiddenVerifier: `import { chunkCount } from "../src/chunk-count.mjs";
for(const [total,size,expected] of [[0,4,0],[1,4,1],[8,3,3],[9,3,3]]) if(chunkCount(total,size)!==expected) process.exit(3);
for(const [total,size] of [[-1,2],[1,0],[1,1.5]]) { let threw=false; try{chunkCount(total,size);}catch(error){threw=error instanceof RangeError;} if(!threw) process.exit(4); }
console.log("HIDDEN_PASS chunk count");
`, maxChanges: 1, maxPatchBytes: 2_048, requiredArchitectureMarkers: Object.freeze({}),
  }),
  Object.freeze({
    taskId: "NYX-QC-B-UPLOAD-STATE", taskClass: "STATE_CONTROL_FLOW", provenance,
    objective: "Repair nextUploadState(state, event): IDLE+START→UPLOADING, UPLOADING+COMPLETE→READY, UPLOADING+FAIL→IDLE, and unsupported pairs preserve state. READY is terminal. Preserve the named ESM export.",
    initialDefect: "COMPLETE moves every state to READY instead of only UPLOADING.",
    correctFiles: Object.freeze({ "src/upload-state.mjs": `export function nextUploadState(state, event) {
  if (state === "IDLE" && event === "START") return "UPLOADING";
  if (state === "UPLOADING" && event === "COMPLETE") return "READY";
  if (state === "UPLOADING" && event === "FAIL") return "IDLE";
  return state;
}
` }),
    faultyFiles: Object.freeze({ "src/upload-state.mjs": `export function nextUploadState(state, event) {
  if (state === "IDLE" && event === "START") return "UPLOADING";
  if (event === "COMPLETE") return "READY";
  if (state === "UPLOADING" && event === "FAIL") return "IDLE";
  return state;
}
` }),
    mutationPaths: Object.freeze(["src/upload-state.mjs"]), initiallyAdmittedPaths: Object.freeze(["src/upload-state.mjs"]),
    availableEvidence: Object.freeze([]),
    visibleVerifier: `import { nextUploadState } from "../src/upload-state.mjs";
if(nextUploadState("IDLE","COMPLETE")!=="IDLE" || nextUploadState("UPLOADING","COMPLETE")!=="READY") process.exit(2);
console.log("TEST_PASS upload state visible");
`,
    hiddenVerifier: `import { nextUploadState } from "../src/upload-state.mjs";
const cases=[["IDLE","START","UPLOADING"],["UPLOADING","FAIL","IDLE"],["READY","START","READY"],["READY","COMPLETE","READY"],["IDLE","FAIL","IDLE"]];
for(const [state,event,expected] of cases) if(nextUploadState(state,event)!==expected) process.exit(3);
console.log("HIDDEN_PASS upload state");
`, maxChanges: 1, maxPatchBytes: 2_048, requiredArchitectureMarkers: Object.freeze({}),
  }),
  Object.freeze({
    taskId: "NYX-QC-C-LOOKUP-RESULT", taskClass: "API_TYPE_CONTRACT", provenance,
    objective: "Repair lookupValue(record, key) to return exactly {found:true,value} when the key is an own property, including values 0, false, null, and empty string; otherwise return exactly {found:false,error:'NOT_FOUND'}. Preserve the named ESM export.",
    initialDefect: "Truthiness is incorrectly used as key-presence detection and the result-object contract is missing.",
    correctFiles: Object.freeze({ "src/lookup-value.mjs": `export function lookupValue(record, key) {
  if (Object.prototype.hasOwnProperty.call(record, key)) return { found: true, value: record[key] };
  return { found: false, error: "NOT_FOUND" };
}
` }),
    faultyFiles: Object.freeze({ "src/lookup-value.mjs": `export function lookupValue(record, key) {
  return record[key] || null;
}
` }),
    mutationPaths: Object.freeze(["src/lookup-value.mjs"]), initiallyAdmittedPaths: Object.freeze(["src/lookup-value.mjs"]),
    availableEvidence: Object.freeze([]),
    visibleVerifier: `import { lookupValue } from "../src/lookup-value.mjs";
if(JSON.stringify(lookupValue({count:0},"count"))!==JSON.stringify({found:true,value:0})) process.exit(2);
console.log("TEST_PASS lookup result visible");
`,
    hiddenVerifier: `import { lookupValue } from "../src/lookup-value.mjs";
for(const [value,key] of [[false,"flag"],["","label"],[null,"empty"]]) { const record={[key]:value}; if(JSON.stringify(lookupValue(record,key))!==JSON.stringify({found:true,value})) process.exit(3); }
if(JSON.stringify(lookupValue({},"missing"))!==JSON.stringify({found:false,error:"NOT_FOUND"})) process.exit(4);
console.log("HIDDEN_PASS lookup result");
`, maxChanges: 1, maxPatchBytes: 3_072, requiredArchitectureMarkers: Object.freeze({}),
  }),
  Object.freeze({
    taskId: "NYX-QC-D-SKU-INDEX", taskClass: "MULTI_FILE_INTERACTION", provenance,
    objective: "Repair the admitted SKU modules so indexBySku(items) keys the map by canonical SKU values after trimming and upper-casing. Preserve both named ESM exports and keep canonicalization in canonicalSku rather than duplicating it in the caller.",
    initialDefect: "The shared canonicalSku helper upper-cases without trimming surrounding whitespace.",
    correctFiles: Object.freeze({
      "src/canonical-sku.mjs": `export function canonicalSku(value) { return String(value).trim().toUpperCase(); }
`,
      "src/index-by-sku.mjs": `import { canonicalSku } from "./canonical-sku.mjs";
export function indexBySku(items) {
  return new Map(items.map((item) => [canonicalSku(item.sku), item]));
}
`,
    }),
    faultyFiles: Object.freeze({ "src/canonical-sku.mjs": `export function canonicalSku(value) { return String(value).toUpperCase(); }
` }),
    mutationPaths: Object.freeze(["src/canonical-sku.mjs", "src/index-by-sku.mjs"]),
    initiallyAdmittedPaths: Object.freeze(["src/canonical-sku.mjs", "src/index-by-sku.mjs"]), availableEvidence: Object.freeze([]),
    visibleVerifier: `import { indexBySku } from "../src/index-by-sku.mjs";
const item={sku:" ab-12 ",name:"part"}; if(indexBySku([item]).get("AB-12")!==item) process.exit(2);
console.log("TEST_PASS sku index visible");
`,
    hiddenVerifier: `import { canonicalSku } from "../src/canonical-sku.mjs"; import { indexBySku } from "../src/index-by-sku.mjs";
if(canonicalSku("  xy-9 ")!=="XY-9") process.exit(3); const a={sku:" one "},b={sku:"TWO"}; const map=indexBySku([a,b]);
if(map.get("ONE")!==a || map.get("TWO")!==b || map.size!==2) process.exit(4);
console.log("HIDDEN_PASS sku index");
`, maxChanges: 2, maxPatchBytes: 4_096,
    requiredArchitectureMarkers: Object.freeze({ "src/index-by-sku.mjs": Object.freeze(["canonicalSku"]) }),
  }),
  Object.freeze({
    taskId: "NYX-QC-E-MERGE-DEFINED", taskClass: "REGRESSION_SENSITIVE", provenance,
    objective: "Repair mergeDefined(base, patch) so own patch properties with value undefined do not replace existing values, while null, false, zero, and empty string remain intentional replacements. Return a new object and preserve both inputs. Preserve the named ESM export.",
    initialDefect: "A shallow spread treats undefined as an intentional replacement.",
    correctFiles: Object.freeze({ "src/merge-defined.mjs": `export function mergeDefined(base, patch) {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) if (value !== undefined) result[key] = value;
  return result;
}
` }),
    faultyFiles: Object.freeze({ "src/merge-defined.mjs": `export function mergeDefined(base, patch) {
  return { ...base, ...patch };
}
` }),
    mutationPaths: Object.freeze(["src/merge-defined.mjs"]), initiallyAdmittedPaths: Object.freeze(["src/merge-defined.mjs"]),
    availableEvidence: Object.freeze([]),
    visibleVerifier: `import { mergeDefined } from "../src/merge-defined.mjs";
const base={mode:"safe",count:2}; const result=mergeDefined(base,{mode:undefined,count:0}); if(result.mode!=="safe" || result.count!==0) process.exit(2);
console.log("TEST_PASS merge defined visible");
`,
    hiddenVerifier: `import { mergeDefined } from "../src/merge-defined.mjs";
const base={a:1,b:true,c:"x"},patch={a:null,b:false,c:"",d:undefined}; const before=JSON.stringify([base,patch]); const result=mergeDefined(base,patch);
if(result.a!==null || result.b!==false || result.c!=="" || "d" in result || JSON.stringify([base,patch])!==before || result===base) process.exit(3);
console.log("HIDDEN_PASS merge defined");
`, maxChanges: 1, maxPatchBytes: 3_072, requiredArchitectureMarkers: Object.freeze({}),
  }),
  Object.freeze({
    taskId: "NYX-QC-F-TAX-POLICY", taskClass: "EVIDENCE_SEEKING", provenance,
    objective: "Repair taxFor(region, subtotal) so it obtains regional rates from the repository-owned tax policy module and returns subtotal multiplied by that rate. Preserve the named ESM export and do not modify the policy module.",
    initialDefect: "The service duplicates an incorrect EU rate instead of consulting the repository policy.",
    correctFiles: Object.freeze({
      "src/tax-rate.mjs": `const RATES = Object.freeze({ EU: 0.2, US: 0.07 });
export function taxRate(region) { return RATES[region] ?? 0; }
`,
      "src/tax-for.mjs": `import { taxRate } from "./tax-rate.mjs";
export function taxFor(region, subtotal) { return subtotal * taxRate(region); }
`,
    }),
    faultyFiles: Object.freeze({ "src/tax-for.mjs": `export function taxFor(region, subtotal) {
  const rate = region === "EU" ? 0.1 : 0;
  return subtotal * rate;
}
` }),
    mutationPaths: Object.freeze(["src/tax-for.mjs"]), initiallyAdmittedPaths: Object.freeze(["src/tax-for.mjs"]),
    availableEvidence: Object.freeze([{ evidenceRef: "AVAILABLE:src/tax-rate.mjs", relativePath: "src/tax-rate.mjs",
      description: "Repository-owned regional tax policy referenced by the objective." }]),
    visibleVerifier: `import { taxFor } from "../src/tax-for.mjs";
if(taxFor("EU",100)!==20) process.exit(2); console.log("TEST_PASS tax policy visible");
`,
    hiddenVerifier: `import { taxFor } from "../src/tax-for.mjs"; import { taxRate } from "../src/tax-rate.mjs";
for(const region of ["EU","US","OTHER"]) if(taxFor(region,80)!==80*taxRate(region)) process.exit(3);
console.log("HIDDEN_PASS tax policy");
`, maxChanges: 1, maxPatchBytes: 3_072,
    requiredArchitectureMarkers: Object.freeze({ "src/tax-for.mjs": Object.freeze(["taxRate"]) }),
  }),
]);

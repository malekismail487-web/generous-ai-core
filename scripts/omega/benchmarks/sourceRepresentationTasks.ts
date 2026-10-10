import { theoryDigest } from "../../../src/lib/codelab/research/theoryContracts";
import { observePublicRuntimeSample } from "./publicRuntimeSamples";

export interface RepresentationTask {
  id: string; tier: "DEVELOPMENT" | "VALIDATION"; domain: string; objective: string;
  publicCases: readonly {input: unknown; expected: unknown}[];
  privateCases: readonly {input: unknown; expected: unknown}[];
  /** Predeclared synthetic observations, not oracle cases. Both comparison arms execute these. */
  publicRuntimeInputs?: readonly unknown[];
}
// Authored independently of ARC evaluation content. Different engineering domains, no task-ID patches.
// Source-emission comparisons do not demonstrate frontier reasoning or statistical generalization.
export const SOURCE_REPRESENTATION_TASKS: readonly RepresentationTask[] = [
  {id: "INTERVAL-UNION", tier: "DEVELOPMENT", domain: "TEMPORAL_SET_OPERATIONS",
    objective: "Implement transform(input) for an array of closed integer intervals [start,end] where start<=end. Return new intervals sorted by start with overlapping intervals merged. Sharing an endpoint is overlap, but adjacency without overlap is not. Do not mutate input or reuse its interval arrays. Empty input returns []. Preserve the ESM transform export. No imports, filesystem, processes or network. Only src/transform.mjs may change.",
    publicCases: [{input: [[4, 7], [1, 3], [3, 5]], expected: [[1, 7]]}, {input: [[0, 0], [1, 2]], expected: [[0, 0], [1, 2]]}],
    privateCases: [{input: [], expected: []}, {input: [[-8, -1], [-5, -3], [-1, 0]], expected: [[-8, 0]]},
      {input: [[9, 10], [1, 2], [5, 5], [1, 2]], expected: [[1, 2], [5, 5], [9, 10]]},
      {input: [[2, 4], [4, 6], [6, 8]], expected: [[2, 8]]}]},
  {id: "WEIGHTED-MOMENT", tier: "DEVELOPMENT", domain: "QUANTITATIVE_AGGREGATION",
    objective: "Implement transform(input) for records {value,weight} with finite numbers and nonnegative weights. Return the weighted arithmetic mean; zero-weight records contribute nothing, and empty or zero-total-weight inputs return null. Keep fractional and negative values. Do not mutate inputs or their records. Preserve the ESM transform export. No imports, filesystem, processes or network. Only src/transform.mjs may change.",
    publicCases: [{input: [{value: 4, weight: 1}, {value: 10, weight: 2}], expected: 8},
      {input: [{value: 999, weight: 0}, {value: -2, weight: 3}], expected: -2}],
    privateCases: [{input: [], expected: null}, {input: [{value: 10, weight: 0}], expected: null},
      {input: [{value: 1.5, weight: 0.25}, {value: 3.5, weight: 0.75}], expected: 3},
      {input: [{value: -5, weight: 2}, {value: 5, weight: 2}], expected: 0}]},
  {id: "POLYNOMIAL-EVALUATION", tier: "VALIDATION", domain: "ALGEBRAIC_COMPUTATION",
    objective: "Implement transform(input) for {coefficients,x}, where coefficients are finite numbers in ascending power order (constant first) and x is finite. Return the polynomial value without constructing symbolic source or evaluating code. Empty coefficients yield 0. Preserve zero coefficients and negative x. Do not mutate inputs. Preserve the ESM transform export. No imports, filesystem, processes or network. Only src/transform.mjs may change.",
    publicCases: [{input: {coefficients: [2, 3, 4], x: 2}, expected: 24}, {input: {coefficients: [0, 0, 1], x: -3}, expected: 9}],
    privateCases: [{input: {coefficients: [], x: 9}, expected: 0}, {input: {coefficients: [7], x: 0}, expected: 7},
      {input: {coefficients: [1, -2, 0, 3], x: -2}, expected: -19},
      {input: {coefficients: [2, 4, 8], x: 0.5}, expected: 6}]},
  {id: "CHUNKED-LINE-FRAMING", tier: "VALIDATION", domain: "STREAM_PROTOCOL_PROCESSING",
    objective: "Implement transform(input) for an array of string chunks. Concatenate in order and split complete lines on LF or CRLF. Preserve line content, blank lines and whitespace. A terminal delimiter creates no extra unfinished line. A nonempty trailing partial line is included. Empty stream returns []. CR not followed by LF is ordinary content. Chunk boundaries may split CRLF. Do not mutate input. Preserve the ESM transform export. No imports, filesystem, processes or network. Only src/transform.mjs may change.",
    publicCases: [{input: ["one\r", "\ntwo\n", "tail"], expected: ["one", "two", "tail"]},
      {input: ["\n", "\n"], expected: ["", ""]}],
    privateCases: [{input: [], expected: []}, {input: ["a\r", "b"], expected: ["a\rb"]},
      {input: [" x ", "\r", "\n", "y", "\n"], expected: [" x ", "y"]},
      {input: ["", "α", "\n", "😀"], expected: ["α", "😀"]}]},
];

export function representationRepositoryFiles(task: RepresentationTask): Readonly<Record<string, string>> {
  if (task.publicRuntimeInputs !== undefined && (!Array.isArray(task.publicRuntimeInputs)
    || task.publicRuntimeInputs.length < 1 || task.publicRuntimeInputs.length > 4)) throw Error("runtime_sample_task_bound_invalid");
  const runtimeSamples = task.publicRuntimeInputs ? `
const publicRuntimeInputs = JSON.parse(${JSON.stringify(JSON.stringify(task.publicRuntimeInputs))});
const observePublicRuntimeSample = ${observePublicRuntimeSample.toString()};
for (const [index, input] of publicRuntimeInputs.entries()) {
  console.log(observePublicRuntimeSample(input, transform, index));
}
` : "";
  return {"src/transform.mjs": 'export function transform(input) {\n  throw new Error("Not implemented");\n}\n',
    // JSON is data, not an object initializer: a __proto__ key must remain an
    // own property rather than silently changing the generated fixture's prototype.
    "src/examples.mjs": `export const examples = JSON.parse(${JSON.stringify(JSON.stringify(task.publicCases))});\n`,
    // Withheld inputs are legitimate task arguments, not private expected outputs.
    "src/inputs.mjs": `export const inputs = JSON.parse(${JSON.stringify(JSON.stringify(task.privateCases.map(c => c.input)))});\n`,
    "tools/verify.mjs": `import {transform} from "../src/transform.mjs";
import {examples} from "../src/examples.mjs";
import {inputs} from "../src/inputs.mjs";
function detachedResult(value,input) {
  const inputObjects=new WeakSet();
  const collect=(node)=>{if(node&&typeof node==="object"&&!inputObjects.has(node)) {
    inputObjects.add(node); for(const child of Object.values(node))collect(child);
  }};
  collect(input);
  const visited=new WeakSet();
  const inspect=(node)=>{if(!node||typeof node!=="object")return true;
    if(inputObjects.has(node))return false;if(visited.has(node))return true;
    visited.add(node);return Object.values(node).every(inspect);
  };
  return inspect(value);
}
let failed=0;
for(const [index,example] of examples.entries()) {
  try {
    const input=structuredClone(example.input); const actual=transform(input);
    if(JSON.stringify(actual)!==JSON.stringify(example.expected)||JSON.stringify(input)!==JSON.stringify(example.input)
      ||!detachedResult(actual,input)) {
      console.error("FAIL public-example="+index); failed++;
    }
  } catch {console.error("FAIL public-example="+index+" execution-error"); failed++;}
}
try {
  const results=inputs.map(original=>{const input=structuredClone(original); const value=transform(input);
    return {value,inputUnchanged:JSON.stringify(input)===JSON.stringify(original),resultDetached:detachedResult(value,input)};});
  console.log("ENGINEERING_PREDICTIONS "+JSON.stringify(results));
} catch {console.error("FAIL private-input execution-error"); failed++;}
${runtimeSamples}if(failed)process.exitCode=2;else console.log("TEST_PASS public-examples");
`};
}

export function scoreRepresentationArtifact(task: RepresentationTask, stdout: string) {
  const lines = stdout.split(/\r?\n/).filter(l => l.startsWith("ENGINEERING_PREDICTIONS "));
  if (lines.length !== 1) return {accepted: false, correct: 0, total: task.privateCases.length, failure: "ARTIFACT_SCHEMA"};
  try {
    const values: unknown = JSON.parse(lines[0].slice("ENGINEERING_PREDICTIONS ".length));
    if (!Array.isArray(values) || values.length !== task.privateCases.length) throw Error("artifact count");
    const correct = values.filter((v, i) => v && typeof v === "object" && Object.keys(v).length === 3
      && v.inputUnchanged === true && v.resultDetached === true
      && theoryDigest(v.value) === theoryDigest(task.privateCases[i].expected)).length;
    return {accepted: correct === task.privateCases.length, correct, total: task.privateCases.length,
      failure: correct === task.privateCases.length ? null : "HIDDEN_CASE_FAILURE"};
  } catch {return {accepted: false, correct: 0, total: task.privateCases.length, failure: "ARTIFACT_SCHEMA"};}
}

/** Evaluator-only accounting; private scores never enter model feedback or authorize a candidate. */
export function assessRepresentationCandidate(task: RepresentationTask, input: {
  publicAccepted: boolean; qualityAccepted: boolean; verificationStdout: string|null; loopVerified: boolean;
}) {
  const score=input.verificationStdout===null?null:scoreRepresentationArtifact(task,input.verificationStdout);
  const functionalAccepted=input.publicAccepted&&score?.accepted===true;
  return {score,functionalAccepted,qualityAccepted:input.qualityAccepted,
    accepted:functionalAccepted&&input.qualityAccepted&&input.loopVerified,
    privateScorerWorkUnits:score===null?0:task.privateCases.length};
}

/** Outcome accounting only: a finite repair limit is not itself the defect that consumed it. */
export function classifyRepresentationFailure(input: {
  accepted: boolean; infrastructureFailure: boolean; reason: string;
  latestSchemaFailure?: { reason: string; diagnostics: readonly {category:string;observed:string}[] };
  qualityRejected: boolean; publicFailed: boolean; privateFailure: string|null;
}) {
  if(input.accepted)return null;
  if(input.infrastructureFailure)return "INFRASTRUCTURE_FAILURE";
  if(/provider|transport|credential|capacity/.test(input.reason))return "PROVIDER_FAILURE";
  if(/wall_clock|outer_request_aborted/.test(input.reason))return "RESOURCE_EXHAUSTION";
  const failure=input.latestSchemaFailure;
  if(failure?.reason==="OUTPUT_TRUNCATED")return "TRUNCATION";
  if(failure?.diagnostics.some(d=>d.category==="SOURCE_QUALITY_INVALID"&&/^syntax_error_/.test(d.observed)))return "SYNTAX_FAILURE";
  if(failure?.diagnostics.some(d=>d.category==="SOURCE_QUALITY_INVALID"))return "QUALITY_REJECTION";
  if(failure?.diagnostics.some(d=>["UNKNOWN_CAPABILITY","INVALID_TARGET_REFERENCE","STALE_TARGET_REFERENCE","UNSUPPORTED_FILE_TARGET"].includes(d.category)))return "AUTHORIZATION_FAILURE";
  // Valid JSON can describe an oversized or already-falsified edit. These are
  // not serialization failures, and neither classification relaxes admission.
  if(failure?.diagnostics.some(d=>d.category==="SEMANTIC_REPAIR_INVALID"&&d.observed==="patch_bound_exceeded"))return "SOURCE_BOUND_REJECTION";
  if(failure?.diagnostics.some(d=>["SEMANTIC_REPAIR_INVALID","REPEATED_FALSIFIED_STRATEGY"].includes(d.category)))return "SEMANTIC_INTENT_FAILURE";
  if(failure)return "SCHEMA_FAILURE";
  if(input.publicFailed)return "FUNCTIONAL_FAILURE";
  if(input.qualityRejected)return "QUALITY_REJECTION";
  if(input.privateFailure)return input.privateFailure;
  return "INSUFFICIENT_EVIDENCE";
}

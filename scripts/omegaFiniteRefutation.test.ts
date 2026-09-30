import { readFileSync } from "node:fs";
import { BoundedReasoningSession, type ColoringProblem, type ReasoningProblem, type ReachabilityProblem } from
  "../src/lib/codelab/research/boundedReasoningWorkbench";
import { verifyFiniteRefutation, type FiniteRefutation } from "../src/lib/codelab/research/finiteRefutationVerifier";
import { theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import { PROOF_TRANSFER_TASKS, PROOF_TRANSFER_EPOCH, PROOF_TRANSFER_CORPUS_DIGEST } from "./omega/nyx-proof-transfer-fixtures";
import { WORKBENCH_TRANSFER_TASKS, transferPayload, verifyTransferCertificate } from "./omega/nyx-workbench-transfer-fixtures";

let passed = 0; let failed = 0;
function check(condition: unknown, label: string) { if (condition) passed++; else { failed++; console.error(`x ${label}`); } }
type Mutable<T> = { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] };
function mutable<T>(value: T): Mutable<T> { return structuredClone(value) as Mutable<T>; }
function solve(problem: ReasoningProblem, maxWorkUnits = 50_000) {
  const session = BoundedReasoningSession.create(problem, {maxWorkUnits, maxElapsedMs: 2000, maxRequests: 1,
    expiresAtEpochMs: Date.now() + 10_000});
  try { return session.analyze({schemaVersion: 1, operation: "ANALYZE_FINITE_PROBLEM", problemDigest: session.problemDigest}); }
  finally { session.revoke(); }
}
function cycle(size: number): ColoringProblem {
  const vertices = Array.from({length: size}, (_, i) => `v${i}`);
  return {kind: "COLORING", vertices, colors: [3, 9], cliqueSize: 2,
    edges: vertices.map((v, i) => [v, vertices[(i + 1) % size]] as [string, string])};
}
function reject(p: ReasoningProblem, proof: unknown, label: string) { check(verifyFiniteRefutation(p, proof).decision === "REJECTED", label); }
const odd = cycle(7); const oddProof = solve(odd).payload!.refutation as FiniteRefutation;
check(oddProof.kind === "COLORING_SEARCH_REFUTATION", "triangle-free odd cycle requires a real search refutation, not a clique special case");
check(verifyFiniteRefutation(odd, oddProof).decision === "SUPPORTED", "complete bounded search proof checks independently");
if (oddProof.kind === "COLORING_SEARCH_REFUTATION") {
  const incomplete = mutable(oddProof); incomplete.nodes[incomplete.root].branches = incomplete.nodes[incomplete.root].branches.slice(1);
  reject(odd, incomplete, "omitting a color branch cannot prove impossibility");
  const cyclic = mutable(oddProof);
  cyclic.nodes[cyclic.root].branches[0] = {color: 3, child: cyclic.root, conflictWith: null};
  reject(odd, cyclic, "self-referential proof fails closed");
  const forgedLeaf = mutable(oddProof);
  forgedLeaf.nodes[0].branches[0] = {color: 3, child: null, conflictWith: "outside"};
  reject(odd, forgedLeaf, "invented contradiction neighbor fails closed");
  reject(odd, {...oddProof, nodes: [...oddProof.nodes, oddProof.nodes[0]]}, "unreachable proof nodes are rejected");
  const repeated = mutable(oddProof);
  repeated.nodes[repeated.root].branches = repeated.nodes[repeated.root].branches.map(() => repeated.nodes[repeated.root].branches[0]);
  reject(odd, repeated, "duplicating one color does not cover all branches");
  const reassigned = mutable(oddProof);
  reassigned.nodes[0].vertex = reassigned.nodes[reassigned.root].vertex;
  reject(odd, reassigned, "reassigning a path variable cannot close a refutation");
}
const complete: ColoringProblem = {kind: "COLORING", vertices: ["a","b","c","d","e"], colors: [2,4,6,8], cliqueSize: 3,
  edges: ["a","b","c","d","e"].flatMap((a,i,all) => all.slice(i+1).map(b => [a,b] as [string,string]))};
const cliqueProof = solve(complete).payload!.refutation as FiniteRefutation;
check(cliqueProof.kind === "COLORING_CLIQUE_OBSTRUCTION" && verifyFiniteRefutation(complete, cliqueProof).decision === "SUPPORTED",
  "palette-sized structural obstruction generalizes beyond the previous three-color task");
reject(complete, {...cliqueProof, vertices: ["a","b","c","d"]}, "a clique equal to palette size is not an impossibility witness");
reject(complete, {...cliqueProof, vertices: ["a","b","c","d","d"]}, "duplicate clique vertex rejected");
reject({...complete, edges: complete.edges.slice(1)}, {...cliqueProof, problemDigest: theoryDigest({...complete, edges: complete.edges.slice(1)})},
  "incomplete clique edges cannot prove impossibility");
reject({...complete, colors: [1,2,3,4,5]}, {...cliqueProof, problemDigest: theoryDigest({...complete, colors: [1,2,3,4,5]})},
  "a colorable graph cannot reuse an old obstruction after a domain change");
check(solve(complete, 1).status === "BUDGET_EXHAUSTED" && solve(complete, 1).payload === null, "constructor exhaustion emits no proof");
check(verifyFiniteRefutation(odd, oddProof, {maxWorkUnits: 1, maxElapsedMs: 2000}).decision === "INSUFFICIENT_EVIDENCE",
  "verifier exhaustion is neither support nor refutation");
check(verifyFiniteRefutation(odd, oddProof, {maxWorkUnits: 0, maxElapsedMs: 2000}).decision === "INSUFFICIENT_EVIDENCE", "invalid checker budget fails closed");
let clock = 100;
check(verifyFiniteRefutation(odd, oddProof, {maxWorkUnits: 200_000, maxElapsedMs: 1}, () => clock++).decision === "INSUFFICIENT_EVIDENCE", "elapsed budget bounded");
const graph: ReachabilityProblem = {kind: "REACHABILITY", states: ["start","middle","finish","bad"], initialState: "start", unsafeStates: ["bad"],
  transitions: [{from:"start",to:"middle",action:"go"},{from:"middle",to:"finish",action:"end"},{from:"finish",to:"start",action:"repeat"}]};
const closed = solve(graph).payload!.refutation as FiniteRefutation;
check(verifyFiniteRefutation(graph, closed).decision === "SUPPORTED", "closed invariant independently proves no unsafe reachability");
reject(graph, {...closed, states: ["start"]}, "closure cannot omit a reachable successor");
reject(graph, {...closed, states: ["middle","finish"]}, "initial state must belong to invariant");
reject(graph, {...closed, states: graph.states}, "invariant containing unsafe state rejected");
reject(graph, {...closed, states: ["start","middle","finish","outside"]}, "closed invariant cannot cross declared scope");
const table = {kind: "EXPERIMENT_SELECTION" as const, mechanismIds: ["left","right"], experimentIds: ["x","y"],
  predictions: [{mechanismId:"left",outcomes:["0","1"]},{mechanismId:"right",outcomes:["0","1"]}]};
const pair = solve(table).payload!.refutation as FiniteRefutation;
check(verifyFiniteRefutation(table, pair).decision === "SUPPORTED", "identical full forecasts prove no separating subset exists");
reject(table, {...pair, mechanismIds: ["left","left"]}, "identity repetition cannot prove nonidentifiability");
const distinct = {...table, predictions: [{mechanismId:"left",outcomes:["0","1"]},{mechanismId:"right",outcomes:["0","2"]}]};
reject(distinct, {...pair, problemDigest: theoryDigest(distinct)}, "a separating column refutes nonidentifiability");
const conflict = {...table, kind: "HYPOTHESIS_ELIMINATION" as const, observations: [{experimentId:"y",outcome:"2",evidenceRef:"observed:y"}]};
const evidenceProof = solve(conflict).payload!.refutation as FiniteRefutation;
check(verifyFiniteRefutation(conflict, evidenceProof).decision === "SUPPORTED", "every ruled-out hypothesis has an admitted falsifier");
if (evidenceProof.kind === "HYPOTHESIS_CONFLICT") {
  reject(conflict, {...evidenceProof, witnesses: evidenceProof.witnesses.slice(1)}, "all declared hypotheses require a falsifier");
  for (const field of ["evidenceRef","expectedOutcome","observedOutcome","experimentId","mechanismId"])
    reject(conflict, {...evidenceProof, witnesses: evidenceProof.witnesses.map((w,i) => i === 0 ? {...w,[field]:"forged"} : w)}, `${field} cannot be invented`);
}
reject(odd, {...oddProof, problemDigest: "other"}, "proof binding cannot move across objectives");
reject(odd, {...oddProof, schemaVersion: 2}, "unsupported proof version cannot be coerced");
reject(odd, {...oddProof, override: "accept"}, "extra fields cannot weaken proof checking");
reject(odd, closed, "proof for another property cannot establish graph coloring");
let getters = 0; const accessor = Object.defineProperty({}, "schemaVersion", {enumerable: true, get(){getters++;return 1;}});
const cyclic: Record<string,unknown> = {}; cyclic.self = cyclic;
for (const invalid of [null, [], "proof", accessor, cyclic, new Date(), { ...oddProof, nodes: new Array(5) }]) reject(odd, invalid, "untrusted non-JSON proof rejected");
check(getters === 0, "proof checker never executes supplied accessors");
const sparseDomain = {...odd, vertices: new Array(7)};
reject(sparseDomain, oddProof, "sparse domain is malformed, not proof of absence");
const supported = verifyFiniteRefutation(odd, oddProof);
check(supported.evidenceClass === "E3" && !supported.grantsAuthority && supported.taskAcceptanceRequiresSeparateVerifier,
  "property support grants no authority or task acceptance");
check(Object.isFrozen(supported) && Object.isFrozen(supported.findings), "verification evidence immutable");
const {evidenceDigest, ...body} = supported;
check(evidenceDigest === theoryDigest(body), "evidence binds exact proof/domain/resources/checker version");

// Independent Cartesian assignment oracle; no constructor algorithm or frozen task answers.
let unsatisfiable = 0; let mismatches = 0; let forgedAccepted = 0;
for (let seed = 951001; seed < 951193; seed++) {
  let state = seed; const rng = () => {state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;};
  const vertices = Array.from({length: 7}, (_, i) => `r${seed}:${i}`);
  const p: ColoringProblem = {kind:"COLORING",vertices,colors:[1,4],cliqueSize:1,
    edges: vertices.flatMap((a,i) => vertices.slice(i+1).flatMap(b => rng()<0.28 ? [[a,b] as [string,string]] : []))};
  let possible = false;
  for (let mask=0;mask<128;mask++) if (p.edges.every(([a,b]) => (mask>>vertices.indexOf(a)&1)!==(mask>>vertices.indexOf(b)&1))) {possible=true;break;}
  const result = solve(p);
  if (result.status === "EXHAUSTIVE_NO_WITNESS") {
    unsatisfiable++;
    if (possible || verifyFiniteRefutation(p,result.payload!.refutation).decision !== "SUPPORTED") mismatches++;
    const changed = {...p,edges: [] as [string,string][]};
    const forged = {...result.payload!.refutation as object,problemDigest:theoryDigest(changed)};
    if (verifyFiniteRefutation(changed,forged).decision === "SUPPORTED") forgedAccepted++;
  } else if (!possible || result.status !== "CONSTRUCTED") mismatches++;
}
check(unsatisfiable > 50 && mismatches === 0, "192 generated graph holdouts agree with Cartesian oracle and all unsatisfiable proofs check");
check(forgedAccepted === 0, "rebound obstructions never prove impossibility on edgeless colorable counterexamples");
const checkerSource = readFileSync("src/lib/codelab/research/finiteRefutationVerifier.ts", "utf8");
check(!/import\s*\{[^}]*BoundedReasoningSession/.test(checkerSource) && !checkerSource.includes("transfer-fixtures"), "checker has no solver or evaluation-answer import");
check(Object.isFrozen(PROOF_TRANSFER_TASKS) && PROOF_TRANSFER_TASKS.length === 8, "eight additional immutable tasks frozen before live execution");
check(PROOF_TRANSFER_CORPUS_DIGEST === theoryDigest(PROOF_TRANSFER_TASKS), "new epoch binds task objective and finite domain");
check(PROOF_TRANSFER_TASKS.every(t => !WORKBENCH_TRANSFER_TASKS.some(old => theoryDigest(old.problem) === theoryDigest(t.problem))),
  "new task instances differ from all previous transfer problems");
check(PROOF_TRANSFER_EPOCH.maxCallsPerArm === 8 * PROOF_TRANSFER_EPOCH.maxCallsPerTask, "no proof-arm model budget increase");
let liveFixtureProofs = 0;
for (const task of PROOF_TRANSFER_TASKS) {
  const result = solve(task.problem);
  check(verifyTransferCertificate(task, {schemaVersion:1,decision:"SUBMIT",status:result.status,
    payload:transferPayload(task.problem,result.payload),confidence:0.8,uncertainties:[]}).accepted,
    `${task.taskId} native result agrees with unchanged independent acceptance oracle`);
  if (result.payload?.refutation) {
    liveFixtureProofs++;
    check(verifyFiniteRefutation(task.problem,result.payload.refutation).decision === "SUPPORTED", `${task.taskId} proof valid`);
  }
}
check(liveFixtureProofs === 5, "five genuine finite refutation cases, three non-refutation controls");
const liveSource = readFileSync("scripts/omega/nyx-workbench-transfer-live-eval.ts", "utf8");
check(!liveSource.includes("PROOF-COLOR-ODD-WHEEL") && !liveSource.includes("PROOF-HYPOTHESIS-JOINT-CONFLICT"), "live correction never special-cases frozen task identities");
check(liveSource.includes('arm === "PROOF_WORKBENCH" ? result.payload?.refutation ?? null : null'), "current arm receives no proof evidence accidentally");
check(liveSource.includes('refutationVerification.decision === "SUPPORTED" ? refutation : null'), "unverified refutation cannot be advertised as supported");
console.log(`NYX_FINITE_REFUTATION_DIFFERENTIAL ${JSON.stringify({tasks:192,unsatisfiable,mismatches,forgedAccepted,scope:"BOUNDED_FINITE_PROOFS_NOT_GENERAL_INTELLIGENCE"})}`);
console.log(`OMEGA_FINITE_REFUTATION_TESTS passed: ${passed}, failed: ${failed}`);
process.exitCode = failed ? 1 : 0;

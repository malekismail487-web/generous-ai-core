import type { ColoringProblem, ReasoningProblem } from "../../src/lib/codelab/research/boundedReasoningWorkbench";
import { immutableTheoryValue, theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import type { TransferTask } from "./nyx-workbench-transfer-fixtures";

/** Frozen new cases; the original transfer corpus and acceptance oracle are not edited. */
export const PROOF_TRANSFER_EPOCH = Object.freeze({
  version: "nyx-proof-transfer/2", chunkId: "NYX-PROOF-BEARING-REASONING-001",
  previousEvaluatedCandidate: "e6645ef63b13b8615eab322248ac0c5d18bbddbb",
  correction:"COMPACT_VERIFIED_OBSTRUCTION_PRESENTATION_FULL_NATIVE_PROOF_PRESERVED",
  mechanism: "CHECKABLE_FINITE_REFUTATIONS_NOT_OPAQUE_SEARCH_STATUS",
  maxDeclineReconsiderationsPerTask: 1, seed: 970031,
  maxCallsPerTask: 3, maxCallsPerArm: 24, maxOutputTokensPerCall: 2048,
  maxWallClockMs: 1_800_000, maxTaskMs: 240_000, maxToolRequestsPerTask: 1,
  maxToolWorkUnits: 50_000, maxToolElapsedMs: 2_000,
  scope: "FRESH_FINITE_PROOF_EVIDENCE_ABLATION_NOT_GENERAL_FRONTIER_COMPARABILITY",
  frozenBeforeFirstLiveRun: true, independentInstitutionalReplication: false,
  supportCriterion: "More independently accepted tasks or fewer unwarranted refusals at no material reported-model-compute increase; replicate on another untouched set.",
  falsificationCriterion: "No reproducible acceptance/refusal improvement, or added proof overhead dominates the observed benefit; preserve every failure.",
  planCoverage: {status:"PARTIAL_JUST_IN_TIME",direct:["SOFTWARE_CHANGES_SHOULD_BECOME_PROOFS_OF_TRANSFORMATION",
    "EXECUTABLE_EVIDENCE_OUTRANKS_CONFIDENCE","DIFFERENT_HARDNESSES_REQUIRE_DIFFERENT_COMPUTATION"],
    supporting:["NO_SELF_CERTIFICATION","GENERATOR_REQUIRES_DETECTOR","FRONTIER_PROGRESS_MUST_SURVIVE_REPLAY"],
    deferred:["OPEN_ENDED_PROOFS","FOUNDATION_MODEL_TRAINING","RECURSION","DEVICE_AUTHORITY"],conflicts:[]},
});
const vertices = (label: string, size: number) => Array.from({length:size}, (_,i) => `${label}:${i}`);
const wheelVertices = vertices("bearing",8);
const wheel: ColoringProblem = {kind:"COLORING",vertices:wheelVertices,colors:[2,5,13],cliqueSize:3,
  edges: wheelVertices.slice(1).flatMap((v,i,rim) => [[wheelVertices[0],v],[v,rim[(i+1)%rim.length]]] as [string,string][])};
const cycleVertices = vertices("channel",9);
const oddCycle: ColoringProblem = {kind:"COLORING",vertices:cycleVertices,colors:[4,17],cliqueSize:2,
  edges:cycleVertices.map((v,i) => [v,cycleVertices[(i+1)%cycleVertices.length]] as [string,string])};
const denseVertices = vertices("resource",6);
const dense: ColoringProblem = {kind:"COLORING",vertices:denseVertices,colors:[3,8,21,34],cliqueSize:4,
  edges:denseVertices.slice(0,5).flatMap((v,i,all)=>all.slice(i+1).map(w=>[v,w] as [string,string]))};
const feasibleVertices = vertices("partition",15);
const feasible: ColoringProblem = {kind:"COLORING",vertices:feasibleVertices,colors:[2,7,19],cliqueSize:3,
  edges:feasibleVertices.flatMap((v,i)=>feasibleVertices.slice(i+1).flatMap((w,at)=>
    i%3!==(i+at+1)%3 && (i*7+at*11)%5!==0 ? [[v,w] as [string,string]] : []))};
const states = vertices("controller",13);
const closed: ReasoningProblem = {kind:"REACHABILITY",states,initialState:states[0],unsafeStates:[states[11],states[12]],
  transitions:states.slice(0,11).flatMap((s,i,all)=>[{from:s,to:all[(i+1)%11],action:`next:${i}`},
    {from:s,to:all[(i+4)%11],action:`jump:${i}`}])};
const reachStates = vertices("router",11);
const reachable: ReasoningProblem = {kind:"REACHABILITY",states:reachStates,initialState:reachStates[0],unsafeStates:[reachStates[8],reachStates[10]],
  transitions:reachStates.flatMap((s,i,all)=>[{from:s,to:all[(i+1)%11],action:`forward:${i}`},
    ...(i%3===0?[{from:s,to:all[(i+4)%11],action:`shortcut:${i}`}]:[])])};
const experiments = ["alpha","beta","gamma","delta"];
const theoryTable = {mechanismIds:vertices("mechanism",7),experimentIds:experiments,
  predictions:Array.from({length:7},(_,i)=>({mechanismId:`mechanism:${i}`,outcomes:[0,1,2,0].map(bit=>i>>bit&1?"on":"off")}))};
const conflict: ReasoningProblem = {kind:"HYPOTHESIS_ELIMINATION",...theoryTable,
  observations:experiments.slice(0,3).map(experimentId=>({experimentId,outcome:"on",evidenceRef:`admitted:${experimentId}`}))};
const ambiguous: ReasoningProblem = {kind:"HYPOTHESIS_ELIMINATION",...theoryTable,
  observations:[{experimentId:"alpha",outcome:"off",evidenceRef:"admitted:alpha"}]};
const finiteLaw = "Solve only the supplied finite formal problem. Valid absence, ambiguity and conflicting evidence are legitimate outcomes; budget exhaustion is not proof. No physical or global truth claim is requested.";
export const PROOF_TRANSFER_TASKS: readonly TransferTask[] = immutableTheoryValue([
  {taskId:"PROOF-COLOR-ODD-WHEEL",objective:`${finiteLaw} Determine whether a proper coloring and requested clique both exist.`,problem:wheel},
  {taskId:"PROOF-COLOR-ODD-CYCLE",objective:`${finiteLaw} Determine whether a proper coloring and requested clique both exist.`,problem:oddCycle},
  {taskId:"PROOF-COLOR-STRUCTURAL",objective:`${finiteLaw} Determine whether a proper coloring and requested clique both exist.`,problem:dense},
  {taskId:"PROOF-COLOR-CONSTRUCT",objective:`${finiteLaw} Produce a proper coloring and requested clique when possible.`,problem:feasible},
  {taskId:"PROOF-REACH-CLOSED",objective:`${finiteLaw} Decide whether any unsafe state is reachable.`,problem:closed},
  {taskId:"PROOF-REACH-COUNTEREXAMPLE",objective:`${finiteLaw} Produce a shortest executable unsafe trace and its stateTrace.`,problem:reachable},
  {taskId:"PROOF-HYPOTHESIS-JOINT-CONFLICT",objective:`${finiteLaw} Return all survivors, ruled-out alternatives and admitted evidence references. Select a mechanism iff exactly one survives; otherwise INSUFFICIENT_EVIDENCE with exact conflict flag.`,problem:conflict},
  {taskId:"PROOF-HYPOTHESIS-AMBIGUITY",objective:`${finiteLaw} Return all survivors, ruled-out alternatives and admitted evidence references. Select a mechanism iff exactly one survives; otherwise INSUFFICIENT_EVIDENCE with exact conflict flag.`,problem:ambiguous},
]);
export const PROOF_TRANSFER_CORPUS_DIGEST = theoryDigest(PROOF_TRANSFER_TASKS);

import { createCoverageTask } from "./nyx-hypothesis-coverage-fixtures";
import { theoryDigest } from "../../src/lib/codelab/research/theoryContracts";

// Frozen before live invocation: new DEVELOPMENT families, not sealed external
// benchmarks. The model sees neither selected code nor the exact manual oracle.
const ttl = createCoverageTask({ id: "NYX-TRANSFER-TTL", domain: "SOFTWARE",
  statement: "Infer a cache's expiry/read-refresh rule from exact access traces.",
  source: "Every probe starts with PUT at time 0 and lifetime 5. Apply the listed READ times in order. H means a hit, M a miss. On a miss nothing is inserted. The catalogued rule is fixed across probes; no background refresh or second writer exists.",
  mechanisms: [["READ_SLIDING", "Hit iff time < expiry; every hit sets expiry=time+5."],
    ["NEVER_EXPIRE", "Every read hits; ignore the lifetime."],
    ["FIXED_OPEN", "Hit iff time < 5; reads do not change expiry."],
    ["FIXED_CLOSED", "Hit iff time <= 5; reads do not change expiry."]],
  questions: ["READ at [2,4,6].", "READ at [5,6].", "READ at [1,8]."],
  outcomes: [["TRACE_HHH", "TRACE_HHM"], ["TRACE_MM", "TRACE_HM", "TRACE_HH"], ["TRACE_HM", "TRACE_HH"]],
  expected: "READ_SLIDING", oracle: ["TRACE_HHH", "TRACE_MM", "TRACE_HM"],
  program: `const i=Number(process.argv[2].split('-').at(-1));
if (![0,1,2].includes(i)||process.argv[2]!=='NYX-TRANSFER-TTL-PROBE-'+i) process.exit(3);
const times=[[2,4,6],[5,6],[1,8]][i]; let lastSuccessfulTouch=0;
const result=times.map(t=>{const alive=t-lastSuccessfulTouch<5; if(alive) lastSuccessfulTouch=t; return alive?'H':'M';});
console.log('TRACE_'+result.join(''));`,
});

const permutation = createCoverageTask({ id: "NYX-TRANSFER-PERMUTATION", domain: "MATHEMATICS",
  statement: "Infer the composition rule of two noncommuting finite bijections.",
  source: "P maps 0→1, 1→2, 2→0. Q maps 0→1, 1→0, 2→2. Treat mappings as functions on indices, not coordinate arrays to be added. The same pipeline is used for all probes; exact integer images are required.",
  mechanisms: [["Q_ONLY", "Apply Q only."], ["Q_THEN_P", "Apply Q followed by P: P(Q(x))."],
    ["P_THEN_Q", "Apply P followed by Q: Q(P(x))."], ["P_ONLY", "Apply P only."]],
  questions: ["Apply to x=0.", "Apply to x=1.", "Apply to x=2."],
  outcomes: [["IMAGE_0", "IMAGE_1", "IMAGE_2"], ["IMAGE_0", "IMAGE_1", "IMAGE_2"], ["IMAGE_0", "IMAGE_1", "IMAGE_2"]],
  expected: "P_THEN_Q", oracle: ["IMAGE_0", "IMAGE_2", "IMAGE_1"],
  program: `const i=Number(process.argv[2].split('-').at(-1));
if (![0,1,2].includes(i)||process.argv[2]!=='NYX-TRANSFER-PERMUTATION-PROBE-'+i) process.exit(3);
const p=new Map([[0,1],[1,2],[2,0]]); const q=new Map([[0,1],[1,0],[2,2]]);
let state=i; for(const mapping of [p,q]) state=mapping.get(state);
console.log('IMAGE_'+state);`,
});

const chemistry = createCoverageTask({ id: "NYX-TRANSFER-CHEMISTRY", domain: "SCIENCE",
  statement: "Infer the resource-sharing update order of a toy reaction simulator.",
  source: "Integer counts (A,B,C,D). R1 consumes A+B and produces C. R2 consumes B+C and produces D. Each reaction's extent is min(1,available counts of its two reactants). Apply exactly one catalogued sweep. The parallel option is intentionally an unsafe numerical implementation that can double-consume B; this is not a real chemistry discovery.",
  mechanisms: [["R1_ONLY", "Apply R1 only."], ["FORWARD", "Apply R1 then recompute R2 from the resulting counts."],
    ["PARALLEL_OLD", "Compute both extents from original counts and apply both changes without a shared-reactant limiter."],
    ["REVERSE", "Apply R2 then recompute R1 from the resulting counts."]],
  questions: ["Start (1,1,1,0).", "Start (1,2,0,0).", "Start (0,2,1,0)."],
  outcomes: [["COUNTS_0_0_2_0", "COUNTS_1_0_0_1", "COUNTS_0_-1_1_1"],
    ["COUNTS_0_1_1_0", "COUNTS_0_0_0_1"], ["COUNTS_0_2_1_0", "COUNTS_0_1_0_1"]],
  expected: "REVERSE", oracle: ["COUNTS_1_0_0_1", "COUNTS_0_1_1_0", "COUNTS_0_1_0_1"],
  program: `const i=Number(process.argv[2].split('-').at(-1));
if (![0,1,2].includes(i)||process.argv[2]!=='NYX-TRANSFER-CHEMISTRY-PROBE-'+i) process.exit(3);
const state=[[1,1,1,0],[1,2,0,0],[0,2,1,0]][i];
const reactions=[{consume:[1,2],produce:3},{consume:[0,1],produce:2}];
for(const reaction of reactions){ const n=Math.min(1,...reaction.consume.map(j=>state[j]));
for(const j of reaction.consume) state[j]-=n; state[reaction.produce]+=n; }
console.log('COUNTS_'+state.join('_'));`,
});

export const NYX_COVERAGE_TRANSFER_V2_TASKS = Object.freeze([ttl, permutation, chemistry]);
export const NYX_COVERAGE_TRANSFER_V2_CORPUS_DIGEST = theoryDigest(NYX_COVERAGE_TRANSFER_V2_TASKS.map(task => task.oracleDigest));

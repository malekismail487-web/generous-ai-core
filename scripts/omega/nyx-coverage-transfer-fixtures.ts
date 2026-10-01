import { createCoverageTask } from "./nyx-hypothesis-coverage-fixtures";
import { theoryDigest } from "../../src/lib/codelab/research/theoryContracts";

// Fresh to live NYX at freeze time. Author-inspected DEVELOPMENT transfer probes,
// not sealed benchmarks, scientific discoveries, or frontier-difficulty claims.
// Manual exact oracles and executable calculations are separate representations.
const transactions = createCoverageTask({ id: "NYX-TRANSFER-SNAPSHOT", domain: "SOFTWARE",
  statement: "Identify the commit rule of two overlapping transactions from exact final account states.",
  source: "Both transactions read the same initial value s. A proposes a(s), B proposes b(s); A commits before B. Each supplied operation is pure. Report final account value. The commit rule is fixed across probes; no retries or rounding occur.",
  mechanisms: [["LAST_WRITER", "Final value is B's original proposal b(s)."],
    ["FIRST_WRITER", "Ignore B; retain A's original proposal a(s)."],
    ["MERGE_DELTAS", "Apply both original changes: s+(a(s)-s)+(b(s)-s)."],
    ["REFRESH_SECOND", "Reevaluate B against A's committed value: b(a(s))."]],
  questions: ["s=10, a(x)=x+3, b(x)=2*x.", "s=8, a(x)=2*x, b(x)=x+1.",
    "s=-4, a(x)=x+6, b(x)=-3*x."],
  outcomes: [["VALUE_20", "VALUE_13", "VALUE_23", "VALUE_26"],
    ["VALUE_9", "VALUE_16", "VALUE_17"], ["VALUE_12", "VALUE_2", "VALUE_18", "VALUE_-6"]],
  expected: "MERGE_DELTAS", oracle: ["VALUE_23", "VALUE_17", "VALUE_18"],
  program: `const i = Number(process.argv[2].split('-').at(-1));
if (![0,1,2].includes(i) || process.argv[2] !== 'NYX-TRANSFER-SNAPSHOT-PROBE-' + i) process.exit(3);
const probes = [[10,x=>x+3,x=>2*x],[8,x=>2*x,x=>x+1],[-4,x=>x+6,x=>-3*x]];
const [s,a,b] = probes[i];
const firstProposal = a(s); const secondProposal = b(s);
console.log('VALUE_' + (firstProposal + secondProposal - s));`,
});

const coupled = createCoverageTask({ id: "NYX-TRANSFER-COUPLED", domain: "MATHEMATICS",
  statement: "Infer the update ordering of a coupled two-coordinate linear recurrence.",
  source: "Each sweep applies the matrix [[1,2],[3,1]] to a vector (u,v), except that a catalogued implementation may use in-place writes or the transposed matrix. Starting vector and number of sweeps are given per probe. Every sweep uses the same ordering. Compute exact integers; sweeps are repeated applications, not multiplication by the sweep count.",
  mechanisms: [["REVERSE_IN_PLACE", "Update v=3*u+v first, then u=u+2*v using the newly written v."],
    ["SIMULTANEOUS", "Use old u and old v for both new coordinates: (u+2*v,3*u+v)."],
    ["TRANSPOSE_SIMULTANEOUS", "Use the transposed matrix with old coordinates: (u+3*v,2*u+v)."],
    ["FORWARD_IN_PLACE", "Update u=u+2*v first, then v=3*u+v using the newly written u."]],
  questions: ["Start (1,2), perform one sweep.", "Start (1,2), perform two sweeps.",
    "Start (2,-1), perform one sweep."],
  outcomes: [["VECTOR_11_5", "VECTOR_5_5", "VECTOR_7_4", "VECTOR_5_17"],
    ["VECTOR_87_38", "VECTOR_15_20", "VECTOR_19_18", "VECTOR_39_134"],
    ["VECTOR_12_5", "VECTOR_0_5", "VECTOR_-1_3", "VECTOR_0_-1"]],
  expected: "REVERSE_IN_PLACE", oracle: ["VECTOR_11_5", "VECTOR_87_38", "VECTOR_12_5"],
  program: `const i = Number(process.argv[2].split('-').at(-1));
if (![0,1,2].includes(i) || process.argv[2] !== 'NYX-TRANSFER-COUPLED-PROBE-' + i) process.exit(3);
const probes = [[1,2,1],[1,2,2],[2,-1,1]]; const [u,v,n] = probes[i];
const state = [u,v]; const matrix = [[1,2],[3,1]];
for (let sweep=0;sweep<n;sweep++) for (let row=1;row>=0;row--) {
  state[row] = matrix[row][0]*state[0] + matrix[row][1]*state[1];
}
console.log('VECTOR_' + state.join('_'));`,
});

const transport = createCoverageTask({ id: "NYX-TRANSFER-MASS", domain: "SCIENCE",
  statement: "Identify the discrete flux limiter in a two-compartment transport simulation.",
  source: "A and B initially hold nonnegative integer masses. Let raw flux q=k*(A-B), positive from A to B. Apply exactly one update (A-q,B+q), with a possible limiter defined by the catalog. k is the dimensionless timestep-scaled transfer factor, not a sweep count. No external source, sink, rounding or hidden second update exists. Report both final masses.",
  mechanisms: [["POSITIVE_ONLY", "Set q=min(A,max(0,k*(A-B))); negative flow is suppressed."],
    ["RECEIVER_LIMIT", "Clamp flux magnitude by receiver mass: positive at most B, negative magnitude at most A."],
    ["UNBOUNDED_LINEAR", "Use raw q=k*(A-B) without a limiter."],
    ["DONOR_LIMIT", "Clamp flux magnitude by donor mass: positive at most A, negative magnitude at most B."]],
  questions: ["A=10, B=2, k=2.", "A=2, B=10, k=2.", "A=4, B=1, k=1."],
  outcomes: [["MASS_0_12", "MASS_8_4", "MASS_-6_18"],
    ["MASS_2_10", "MASS_4_8", "MASS_18_-6", "MASS_12_0"],
    ["MASS_1_4", "MASS_3_2"]],
  expected: "DONOR_LIMIT", oracle: ["MASS_0_12", "MASS_12_0", "MASS_1_4"],
  program: `const i = Number(process.argv[2].split('-').at(-1));
if (![0,1,2].includes(i) || process.argv[2] !== 'NYX-TRANSFER-MASS-PROBE-' + i) process.exit(3);
const [a,b,k] = [[10,2,2],[2,10,2],[4,1,1]][i]; const raw = k*(a-b);
const flux = raw>=0 ? Math.min(a,raw) : -Math.min(b,-raw);
console.log('MASS_' + (a-flux) + '_' + (b+flux));`,
});

export const NYX_COVERAGE_TRANSFER_TASKS = Object.freeze([transactions, coupled, transport]);
export const NYX_COVERAGE_TRANSFER_CORPUS_DIGEST = theoryDigest(NYX_COVERAGE_TRANSFER_TASKS.map(task => task.oracleDigest));

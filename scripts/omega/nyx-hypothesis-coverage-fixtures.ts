import { immutableResearchValue, type ResearchDomain, type ResearchPartyObjective }
  from "../../src/lib/codelab/research/researchPartyContracts";
import { theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import type { NyxResearchPartyLiveTask } from "./nyx-research-party-fixtures";

// New development families frozen before their first live invocation. These are
// NOT sealed validation, public benchmark scores, or frontier-difficulty tasks.
// The allocator receives neither the chosen implementation nor this oracle.
function task(input: { id: string; domain: ResearchDomain; statement: string; source: string;
  mechanisms: readonly (readonly [string, string])[]; questions: readonly string[];
  outcomes: readonly (readonly string[])[]; expected: string; oracle: readonly string[];
  program: string }): NyxResearchPartyLiveTask {
  const ids = [0, 1, 2].map(index => `${input.id}-EXP-${index}`);
  const probeSource = `${input.program}\n`;
  const oracleDigest = theoryDigest({ task: input.id, expected: input.expected, oracle: input.oracle,
    programDigest: theoryDigest(probeSource) });
  return Object.freeze({ taskId: input.id, expectedMechanismId: input.expected, probeSource, oracleDigest,
    oracleProvenanceRoot: `${input.id}-MANUAL-EXACT-ORACLE`, outcome: (id: string) => {
      const index = ids.indexOf(id); if (index < 0) throw new Error("coverage_unknown_experiment");
      return input.oracle[index];
    }, objective: (candidateBinding: string, now: number): ResearchPartyObjective => immutableResearchValue({
      schemaVersion: 1, researchId: input.id, domain: input.domain, objective: input.statement,
      candidateBinding, scope: ["tools/probe.mjs"],
      mechanismCatalog: input.mechanisms.map(([mechanismId, description]) => ({ mechanismId, description })),
      admittedEvidence: [{ evidenceId: `${input.id}-SOURCE`, evidenceClass: "E3", kind: "SOURCE",
        summary: input.source, contentDigest: theoryDigest(input.source), provenanceRoot: `${input.id}-SOURCE-ROOT`,
        freshnessDependencies: [`CANDIDATE:${candidateBinding}`], observedAtEpochMs: now,
        candidateBinding, grantsAuthority: false }],
      experimentCatalog: ids.map((experimentId, index) => ({ experimentId, toolId: `${input.id}-PROBE-${index}`,
        question: input.questions[index], possibleOutcomes: input.outcomes[index], costUnits: 1,
        authority: "RUN_TEST_IN_SANDBOX", scope: ["tools/probe.mjs"], mutatesCandidate: false })),
      successCriteria: ["Identify one mechanism with precommitted forecasts and exact independently observed outcomes."],
      expiryEpochMs: now + 20 * 60_000 }),
  });
}

const queue = task({ id: "NYX-COVERAGE-QUEUE", domain: "SOFTWARE",
  statement: "Infer the overflow policy of an opaque bounded FIFO queue from three input sequences.",
  source: "The queue starts empty, with capacity two. Insert each supplied value in order. Report the remaining contents from oldest to newest. A single catalogued policy governs every insertion, with no implicit deduplication.",
  mechanisms: [
    ["DROP_OLDEST", "If full, remove the oldest item before inserting the new one."],
    ["DROP_NEWEST", "If full, discard the incoming item without modifying the queue."],
    ["UNBOUNDED", "Always append, ignoring the stated capacity."],
    ["RESET_OVERFLOW", "If full, clear all existing items, then insert the incoming item."],
  ], questions: ["Insert [1,2,3].", "Insert [1,2,3,4].", "Insert [7,7,8]."],
  outcomes: [["QUEUE_2_3", "QUEUE_1_2", "QUEUE_3", "QUEUE_1_2_3"],
    ["QUEUE_3_4", "QUEUE_1_2", "QUEUE_1_2_3_4"], ["QUEUE_7_8", "QUEUE_7_7", "QUEUE_8", "QUEUE_7_7_8"]],
  expected: "RESET_OVERFLOW", oracle: ["QUEUE_3", "QUEUE_3_4", "QUEUE_8"],
  program: `const i = Number(process.argv[2].split('-').at(-1));
if (![0,1,2].includes(i) || process.argv[2] !== 'NYX-COVERAGE-QUEUE-PROBE-' + i) process.exit(3);
const inputs = [[1,2,3],[1,2,3,4],[7,7,8]];
let queue = [];
for (const value of inputs[i]) { if (queue.length === 2) queue = []; queue.push(value); }
console.log('QUEUE_' + queue.join('_'));`,
});

const affine = task({ id: "NYX-COVERAGE-AFFINE", domain: "MATHEMATICS",
  statement: "Determine how an opaque pipeline combines two non-commuting affine transforms.",
  source: "The transforms are f(x)=2*x+1 and g(x)=3*x-2. All integers in these probes are exactly representable. Derive exact results, not approximate or confidence-based answers.",
  mechanisms: [["F_THEN_G", "Compute g(f(x))."], ["G_THEN_F", "Compute f(g(x))."],
    ["ADD_RESULTS", "Compute f(x)+g(x)."], ["LINEAR_PART_ONLY", "Compose only the slopes, ignoring both offsets: 6*x."]],
  questions: ["Apply the pipeline to x=0.", "Apply the pipeline to x=1.", "Apply the pipeline to x=-2."],
  outcomes: [["VALUE_1", "VALUE_-3", "VALUE_-1", "VALUE_0"],
    ["VALUE_7", "VALUE_3", "VALUE_4", "VALUE_6"], ["VALUE_-11", "VALUE_-15", "VALUE_-12"]],
  expected: "G_THEN_F", oracle: ["VALUE_-3", "VALUE_3", "VALUE_-15"],
  program: `const i = Number(process.argv[2].split('-').at(-1));
if (![0,1,2].includes(i) || process.argv[2] !== 'NYX-COVERAGE-AFFINE-PROBE-' + i) process.exit(3);
const inputs = [0,1,-2];
const f = x => 2*x+1; const g = x => 3*x-2;
console.log('VALUE_' + f(g(inputs[i])));`,
});

const kinematics = task({ id: "NYX-COVERAGE-KINEMATICS", domain: "SCIENCE",
  statement: "Identify the one-step update rule of an opaque constant-acceleration simulator.",
  source: "Each probe supplies initial position x, velocity v, constant acceleration a and timestep dt. There are no forces beyond this acceleration. Report the exact final position and velocity as STATE_x_v; dt is not an iteration count.",
  mechanisms: [["EXPLICIT_EULER", "x'=x+v*dt; v'=v+a*dt."],
    ["VELOCITY_FIRST", "v'=v+a*dt; x'=x+v'*dt."],
    ["CONSTANT_ACCELERATION", "x'=x+v*dt+(a*dt*dt)/2; v'=v+a*dt."],
    ["DOUBLE_VELOCITY_INCREMENT", "x'=x+v*dt+a*dt*dt; v'=v+2*a*dt."]],
  questions: ["x=0, v=0, a=2, dt=1.", "x=5, v=2, a=-2, dt=1.", "x=0, v=3, a=2, dt=2."],
  outcomes: [["STATE_0_2", "STATE_2_2", "STATE_1_2", "STATE_2_4"],
    ["STATE_7_0", "STATE_5_0", "STATE_6_0", "STATE_5_-2"],
    ["STATE_6_7", "STATE_14_7", "STATE_10_7", "STATE_14_11"]],
  expected: "CONSTANT_ACCELERATION", oracle: ["STATE_1_2", "STATE_6_0", "STATE_10_7"],
  program: `const i = Number(process.argv[2].split('-').at(-1));
if (![0,1,2].includes(i) || process.argv[2] !== 'NYX-COVERAGE-KINEMATICS-PROBE-' + i) process.exit(3);
const [x,v,a,dt] = [[0,0,2,1],[5,2,-2,1],[0,3,2,2]][i];
const velocity = v+a*dt;
const position = x + ((v+velocity)/2)*dt;
console.log('STATE_' + position + '_' + velocity);`,
});

export const NYX_HYPOTHESIS_COVERAGE_TASKS = Object.freeze([queue, affine, kinematics]);
export const NYX_HYPOTHESIS_COVERAGE_CORPUS_DIGEST = theoryDigest(NYX_HYPOTHESIS_COVERAGE_TASKS.map(item => item.oracleDigest));
export { task as createCoverageTask };

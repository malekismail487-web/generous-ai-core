import { immutableResearchValue, type ResearchDomain, type ResearchMechanism,
  type ResearchPartyObjective } from "../../src/lib/codelab/research/researchPartyContracts";
import { theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import type { NyxResearchPartyLiveTask } from "./nyx-research-party-fixtures";

// Frozen before live execution. These are finite causal-transfer tasks, not a
// public frontier benchmark. Hidden executable programs are separate from the
// model's admitted evidence and the independently written acceptance answers.
function executableTask(input: { id: string; domain: ResearchDomain; scope: string;
  objective: string; requirement: string; source: string; mechanisms: readonly ResearchMechanism[];
  questions: readonly string[]; outcomes: readonly (readonly string[])[];
  expected: string; oracle: readonly string[]; program: string }): NyxResearchPartyLiveTask {
  const experimentIds = ["A", "B", "C"].map(suffix => `${input.id}-EXP-${suffix}`);
  const probeSource = `${input.program}\n`;
  const oracleDigest = theoryDigest({ task: input.id, mechanism: input.expected,
    oracle: input.oracle, programDigest: theoryDigest(probeSource) });
  return Object.freeze({ taskId: input.id, expectedMechanismId: input.expected,
    oracleProvenanceRoot: `${input.id}-INDEPENDENT-ORACLE`, oracleDigest, probeSource,
    outcome: (id: string) => {
      const index = experimentIds.indexOf(id);
      if (index < 0) throw new Error("transfer_unknown_experiment");
      return input.oracle[index];
    },
    objective: (candidateBinding: string, now: number): ResearchPartyObjective => immutableResearchValue({
      schemaVersion: 1, researchId: input.id, objective: input.objective, domain: input.domain,
      candidateBinding, scope: [input.scope], mechanismCatalog: input.mechanisms,
      admittedEvidence: [input.requirement, input.source].map((summary, index) => ({
        evidenceId: `${input.id}-${index ? "SOURCE" : "REQUIREMENT"}`, evidenceClass: "E3" as const,
        kind: index ? "SOURCE" as const : "REQUIREMENT" as const, summary, contentDigest: theoryDigest(summary),
        provenanceRoot: `${input.id}-${index ? "SOURCE" : "REQUIREMENT"}-ROOT`,
        freshnessDependencies: [`CANDIDATE:${candidateBinding}`], observedAtEpochMs: now,
        candidateBinding, grantsAuthority: false as const })),
      experimentCatalog: experimentIds.map((experimentId, index) => ({ experimentId,
        toolId: `${input.id}-PROBE-${index}`, question: input.questions[index],
        possibleOutcomes: input.outcomes[index], costUnits: 1, authority: "RUN_TEST_IN_SANDBOX" as const,
        scope: [input.scope], mutatesCandidate: false as const })),
      successCriteria: ["Identify the active causal mechanism using precommitted predictions and independently observed program results."],
      expiryEpochMs: now + 20 * 60_000 }),
  });
}

const antiJoin = executableTask({ id: "NYX-TRANSFER-ANTIJOIN", domain: "SOFTWARE", scope: "database/antiJoin.ts",
  objective: "Identify the semantics of an opaque anti-join after a SQL query rewrite, including null and sentinel behavior.",
  requirement: "Retain rows with no null-safe equal exclusion key. Null is a genuine identity, not the number zero. Probe labels describe the exact retained set.",
  source: "The query builder switched one of four anti-join implementations. Its selected implementation is unavailable; only controlled observations may distinguish the alternatives.",
  mechanisms: [
    { mechanismId: "SQL_NOT_IN", description: "SQL NOT IN: comparisons involving null yield UNKNOWN; only a TRUE predicate retains a row." },
    { mechanismId: "NOT_EXISTS_EQUAL", description: "NOT EXISTS using ordinary SQL equality: null never equals any key, including null." },
    { mechanismId: "NULL_SAFE_EQUAL", description: "NOT EXISTS using null-safe equality: null equals null, but null and zero differ." },
    { mechanismId: "COALESCE_ZERO", description: "NOT EXISTS after replacing all null keys with zero; null and zero collide." },
  ],
  questions: [
    "For candidate keys [null,0,7] and exclusion keys [null,7], report the exact retained set.",
    "For candidate keys [null,0,7] and exclusion keys [0], report the exact retained set.",
    "For candidate keys [null,0,7] and exclusion keys [7], report the exact retained set.",
  ], outcomes: [
    ["KEEP_NONE", "KEEP_NULL_ZERO", "KEEP_ZERO"],
    ["KEEP_SEVEN", "KEEP_NULL_SEVEN"],
    ["KEEP_ZERO", "KEEP_NULL_ZERO"],
  ], expected: "NULL_SAFE_EQUAL", oracle: ["KEEP_ZERO", "KEEP_NULL_SEVEN", "KEEP_NULL_ZERO"],
  program: `const index = Number(process.argv[2].split('-').at(-1));
if (![0,1,2].includes(index) || process.argv[2] !== 'NYX-TRANSFER-ANTIJOIN-PROBE-' + index) process.exit(3);
const exclusions = [[null,7],[0],[7]][index];
const candidates = [null,0,7];
// The runtime applies null-safe equality; the oracle independently specifies sets.
const retained = candidates.filter(key => !exclusions.some(excluded => Object.is(key,excluded)));
const names = retained.map(key => key === null ? 'NULL' : key === 0 ? 'ZERO' : 'SEVEN');
console.log('KEEP_' + (names.length ? names.join('_') : 'NONE'));`,
});

const reduction = executableTask({ id: "NYX-TRANSFER-REDUCTION", domain: "MATHEMATICS", scope: "numeric/reduce.ts",
  objective: "Diagnose the order or compensation scheme in an opaque floating-point reduction, using non-associative cancellation probes.",
  requirement: "All arithmetic is IEEE-754 binary64, round-to-nearest. The output is the exact numeric sum, not a confidence score. No tolerance may turn 0 into 1.",
  source: "A vectorization refactor changed reduction behavior. Each input element is exactly representable; ordinary real-number associativity cannot justify predictions.",
  mechanisms: [
    { mechanismId: "LEFT_FOLD", description: "Start at zero; add elements in their original left-to-right order." },
    { mechanismId: "RIGHT_FOLD", description: "Start at zero; add elements in reverse right-to-left order." },
    { mechanismId: "MAGNITUDE_SORT", description: "Stable sort by ascending absolute value, then perform an ordinary left fold." },
    { mechanismId: "NEUMAIER", description: "Left-to-right Neumaier compensated sum: retain rounding error in a separate compensation term and add it at the end." },
  ], questions: [
    "Reduce [10000000000000000,1,-10000000000000000].",
    "Reduce [10000000000000000,-10000000000000000,1].",
    "Reduce [1,10000000000000000,-10000000000000000].",
  ], outcomes: [["SUM_0", "SUM_1"], ["SUM_0", "SUM_1"], ["SUM_0", "SUM_1"]],
  expected: "RIGHT_FOLD", oracle: ["SUM_0", "SUM_0", "SUM_1"],
  program: `const index = Number(process.argv[2].split('-').at(-1));
if (![0,1,2].includes(index) || process.argv[2] !== 'NYX-TRANSFER-REDUCTION-PROBE-' + index) process.exit(3);
const inputs = [[1e16,1,-1e16],[1e16,-1e16,1],[1,1e16,-1e16]];
let total = 0;
for (let position = inputs[index].length - 1; position >= 0; position--) total += inputs[index][position];
console.log('SUM_' + total);`,
});

const diffusion = executableTask({ id: "NYX-TRANSFER-DIFFUSION", domain: "SCIENCE", scope: "simulation/diffusion.ts",
  objective: "Determine the boundary operator in a five-cell one-step diffusion simulation from controlled impulse responses.",
  requirement: "One step computes new[i]=(old[i-1]+2*old[i]+old[i+1])/4. Initial impulses have magnitude 4, so every reported component is exact. Labels list new[0] through new[4].",
  source: "A boundary-condition refactor changed the simulator. Do not assume every operator conserves unweighted mass. The observed implementation is one catalogued operator.",
  mechanisms: [
    { mechanismId: "ZERO_PAD", description: "Outside the array, use zero." },
    { mechanismId: "CLAMP_EDGE", description: "Outside the array, reuse the nearest edge cell: old[-1]=old[0], old[5]=old[4]." },
    { mechanismId: "PERIODIC", description: "Wrap outside indexes: old[-1]=old[4], old[5]=old[0]." },
    { mechanismId: "MIRROR_NEIGHBOR", description: "Reflect without repeating the boundary cell: old[-1]=old[1], old[5]=old[3]." },
  ], questions: [
    "Apply one diffusion step to [4,0,0,0,0].",
    "Apply one diffusion step to [0,4,0,0,0].",
    "Apply one diffusion step to [0,0,0,0,4].",
  ], outcomes: [
    ["VECTOR_2_1_0_0_0", "VECTOR_3_1_0_0_0", "VECTOR_2_1_0_0_1"],
    ["VECTOR_1_2_1_0_0", "VECTOR_2_2_1_0_0"],
    ["VECTOR_0_0_0_1_2", "VECTOR_0_0_0_1_3", "VECTOR_1_0_0_1_2"],
  ], expected: "MIRROR_NEIGHBOR", oracle: ["VECTOR_2_1_0_0_0", "VECTOR_2_2_1_0_0", "VECTOR_0_0_0_1_2"],
  program: `const index = Number(process.argv[2].split('-').at(-1));
if (![0,1,2].includes(index) || process.argv[2] !== 'NYX-TRANSFER-DIFFUSION-PROBE-' + index) process.exit(3);
const inputs = [[4,0,0,0,0],[0,4,0,0,0],[0,0,0,0,4]];
const old = inputs[index];
const at = position => old[position < 0 ? -position : position >= old.length ? 2*old.length-2-position : position];
const next = old.map((value,position) => (at(position-1) + 2*value + at(position+1))/4);
console.log('VECTOR_' + next.join('_'));`,
});

export const NYX_RESEARCH_TRANSFER_TASKS = Object.freeze([antiJoin, reduction, diffusion]);
export const NYX_RESEARCH_TRANSFER_CORPUS_DIGEST = theoryDigest(NYX_RESEARCH_TRANSFER_TASKS.map(task => task.oracleDigest));

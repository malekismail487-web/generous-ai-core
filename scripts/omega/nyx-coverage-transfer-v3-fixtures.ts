import { createCoverageTask } from "./nyx-hypothesis-coverage-fixtures";
import { theoryDigest } from "../../src/lib/codelab/research/theoryContracts";

// Fresh author-designed DEVELOPMENT tasks, frozen before model invocation.
// Manual outcomes and executable mechanisms are deliberately represented separately.
const events = createCoverageTask({ id: "NYX-TRANSFER-EVENTLOG", domain: "SOFTWARE",
  statement: "Infer an event-log selection rule, including equal-version behavior.",
  source: "Each input is an ordered list of (value,version) events for one key. Return the selected value. Start with no value. There are no timestamps or additional writers; order is the listed arrival order. All versions are exact integers.",
  mechanisms: [["FIRST_EVENT", "Select the first arriving event, ignoring versions."],
    ["LAST_EVENT", "Select the last arriving event, ignoring versions."],
    ["MAX_FIRST_TIE", "Select greatest version; preserve the earliest event when greatest versions tie."],
    ["MAX_LAST_TIE", "Select greatest version; select the latest event when greatest versions tie."]],
  questions: ["Events [(A,2),(B,4),(C,3)].", "Events [(A,4),(B,4),(C,1)].", "Events [(A,1),(B,3),(C,3)]."],
  outcomes: [["VALUE_A", "VALUE_B", "VALUE_C"], ["VALUE_A", "VALUE_B", "VALUE_C"], ["VALUE_A", "VALUE_B", "VALUE_C"]],
  expected: "MAX_FIRST_TIE", oracle: ["VALUE_B", "VALUE_A", "VALUE_B"],
  program: `const i=Number(process.argv[2].split('-').at(-1));
if (![0,1,2].includes(i)||process.argv[2]!=='NYX-TRANSFER-EVENTLOG-PROBE-'+i) process.exit(3);
const inputs=[[['A',2],['B',4],['C',3]],[['A',4],['B',4],['C',1]],[['A',1],['B',3],['C',3]]];
let selected=null; for (const event of inputs[i]) if(selected===null||event[1]>selected[1]) selected=event;
console.log('VALUE_'+selected[0]);`,
});

const rounding = createCoverageTask({ id: "NYX-TRANSFER-QUOTIENT", domain: "MATHEMATICS",
  statement: "Infer a signed integer quotient's rounding convention.",
  source: "Divide numerator by the positive denominator as an exact rational number, then apply one fixed rounding rule. No probe is a half-integer. NEG encodes a negative integer; it is not a magnitude or an absolute value.",
  mechanisms: [["TOWARD_ZERO", "Truncate the exact rational toward zero."],
    ["FLOOR", "Round downward toward negative infinity."],
    ["CEILING", "Round upward toward positive infinity."],
    ["NEAREST", "Select the nearest integer; these probes have no ties."]],
  questions: ["Numerator -7, denominator 3.", "Numerator 4, denominator 3.", "Numerator 8, denominator 3."],
  outcomes: [["Q_NEG_3", "Q_NEG_2"], ["Q_1", "Q_2"], ["Q_2", "Q_3"]],
  expected: "NEAREST", oracle: ["Q_NEG_2", "Q_1", "Q_3"],
  program: `const i=Number(process.argv[2].split('-').at(-1));
if (![0,1,2].includes(i)||process.argv[2]!=='NYX-TRANSFER-QUOTIENT-PROBE-'+i) process.exit(3);
const [n,d]=[[-7,3],[4,3],[8,3]][i];
const q=Math.round(n/d); console.log(q<0?'Q_NEG_'+(-q):'Q_'+q);`,
});

const exchange = createCoverageTask({ id: "NYX-TRANSFER-EXCHANGE", domain: "SCIENCE",
  statement: "Infer the ordering of a toy two-compartment numerical exchange sweep.",
  source: "State (X,Y) is two exact rational concentrations. Updating X means X becomes (X+Y)/2; updating Y means Y becomes (X+Y)/2. Execute exactly one catalogued sweep, then report both concentrations. This is a toy numerical-method identification task, not a claim of physical validity.",
  mechanisms: [["SIMULTANEOUS", "Update X and Y simultaneously, using both original concentrations."],
    ["X_THEN_Y", "Update X first; then update Y using the updated X."],
    ["Y_THEN_X", "Update Y first; then update X using the updated Y."],
    ["X_ONLY", "Update X only; leave Y unchanged."]],
  questions: ["Start (X,Y)=(0,8).", "Start (X,Y)=(8,0).", "Start (X,Y)=(4,12)."],
  outcomes: [["PAIR_4_4", "PAIR_4_6", "PAIR_2_4", "PAIR_4_8"],
    ["PAIR_4_4", "PAIR_4_2", "PAIR_6_4", "PAIR_4_0"],
    ["PAIR_8_8", "PAIR_8_10", "PAIR_6_8", "PAIR_8_12"]],
  expected: "Y_THEN_X", oracle: ["PAIR_2_4", "PAIR_6_4", "PAIR_6_8"],
  program: `const i=Number(process.argv[2].split('-').at(-1));
if (![0,1,2].includes(i)||process.argv[2]!=='NYX-TRANSFER-EXCHANGE-PROBE-'+i) process.exit(3);
const state=[[0,8],[8,0],[4,12]][i];
for(const target of [1,0]) state[target]=(state[0]+state[1])/2;
console.log('PAIR_'+state.join('_'));`,
});

export const NYX_COVERAGE_TRANSFER_V3_TASKS = Object.freeze([events, rounding, exchange]);
export const NYX_COVERAGE_TRANSFER_V3_CORPUS_DIGEST = theoryDigest(NYX_COVERAGE_TRANSFER_V3_TASKS.map(task => task.oracleDigest));

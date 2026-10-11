import type { RepresentationTask } from "./sourceRepresentationTasks";
import { v3NativeReasoningConfiguration, v3NativeWireVerified } from "./v3NativeReasoningTransferTasks";

export const NATIVE_LOCAL_EMISSION_EPOCH = Object.freeze({
  version: "nyx-native-local-emission-fresh-transfer/1",
  admissionPolicyId: "omega-public-static-candidate/3" as const,
  uniqueTasks: 4, predeclaredRepeats: 2,
  changedVariable: "OMIT_HOSTED_RESPONSE_FORMAT_ONLY_RETAIN_IDENTICAL_PROMPT_AND_STRICT_LOCAL_GATES",
  status: "FIRST_EXPOSURE_IN_THIS_EPOCH_NOT_PROVEN_PRETRAINING_UNSEEN",
  efficacyCriterion: "BOTH_REPEATS_FULL_ACCEPTANCE_WINS_IN_TWO_DOMAINS_AT_MATCHED_REALIZED_COMPUTE_WITH_NO_PAIRED_REGRESSION",
  reliabilityCriterion: "FEWER_INTERFACE_FAILURES_WITH_PROVIDER_STABLE_COVERAGE_NOT_COGNITIVE_PROMOTION",
  scope: "SAME_AUTHOR_SMALL_UNSEEDED_ENGINEERING_TRANSFER_NOT_EXTERNAL_BENCHMARK",
});

/** Existing provider option, not a new parser, cognition, executor or permissive fallback. */
export function nativeLocalEmissionConfiguration(variant: string) {
  if (!["HOSTED_NATIVE_CONTROL", "STRICT_LOCAL_NATIVE"].includes(variant)) throw Error("native_local_arm_invalid");
  return { ...v3NativeReasoningConfiguration("NATIVE_BOUNDED_REASONING"),
    ...(variant === "STRICT_LOCAL_NATIVE" ? { structuredOutputMode: "STRICT_LOCAL" as const } : {}) };
}

export function nativeLocalEmissionWireVerified(variant: string, controls: readonly {
  initialCandidateState?: boolean; originalBudgetPresented?: boolean; originalBudgetVersion?: unknown;
  originalBudgetPolicyId?: unknown; publicAdmissionPolicyId?: unknown; legacyLineApplicabilityPresent?: boolean;
  hostedSchemaPresent?: boolean; promptDigest?: string;
}[]) {
  nativeLocalEmissionConfiguration(variant);
  return v3NativeWireVerified("NATIVE_BOUNDED_REASONING", controls) && controls.length > 0
    && controls.every(control => control.hostedSchemaPresent === (variant === "HOSTED_NATIVE_CONTROL")
      && typeof control.promptDigest === "string" && /^[a-f0-9]{64}$/.test(control.promptDigest));
}

// Oracle tokenizes a complete CSV line; the test-only witness uses a state machine.
function csvRecord(input: string): string[] {
  const output: string[] = [];
  const token = /(?:"(?:[^"]|"")*"|[^",]*)(?:,|$)/gy;
  let position = 0;
  do {
    token.lastIndex = position;
    const match = token.exec(input);
    if (!match || match.index !== position) throw Error("invalid_frozen_csv");
    const part = match[0].endsWith(",") ? match[0].slice(0, -1) : match[0];
    output.push(part.startsWith('"') ? part.slice(1, -1).replace(/""/g, '"') : part);
    position = token.lastIndex;
    if (!match[0].endsWith(",")) break;
  } while (position <= input.length);
  return output;
}

// Recursive suffix search, unlike the witness's iterative dynamic programming.
function glob(input: { text: string; pattern: string }): boolean {
  const text = Array.from(input.text), pattern = Array.from(input.pattern);
  const visit = (i: number, j: number): boolean => {
    if (j === pattern.length) return i === text.length;
    const symbol = pattern[j];
    if (symbol === "*") return visit(i, j + 1) || i < text.length && visit(i + 1, j);
    if (symbol === "\\") {
      const escaped = pattern[j + 1] ?? "\\";
      return text[i] === escaped && visit(i + 1, j + (j + 1 < pattern.length ? 2 : 1));
    }
    return i < text.length && (symbol === "?" || text[i] === symbol) && visit(i + 1, j + 1);
  };
  return visit(0, 0);
}

// Enumerates denomination-count vectors; witness builds an amount table.
function boundedCoins(input: { amount: number; coins: { value: number; count: number }[] }): number {
  const visit = (index: number, remaining: number): number => {
    if (index === input.coins.length) return Number(remaining === 0);
    const { value, count } = input.coins[index];
    let total = 0;
    for (let used = 0; used <= count && used * value <= remaining; used++)
      total += visit(index + 1, remaining - used * value);
    return total;
  };
  return visit(0, input.amount);
}

// Bellman-Ford edge relaxation; witness uses a minimum-distance frontier.
function gridEnergy(input: (number | null)[][]): number | null {
  const width = input[0].length, cells = input.flat(), distances = cells.map(() => Infinity);
  if (cells[0] === null || cells.at(-1) === null) return null;
  distances[0] = 0;
  const adjacent = (a: number, b: number) => Math.abs(Math.floor(a / width) - Math.floor(b / width))
    + Math.abs(a % width - b % width) === 1;
  for (let pass = 0; pass < cells.length - 1; pass++) for (let a = 0; a < cells.length; a++)
    for (let b = 0; b < cells.length; b++) if (cells[b] !== null && adjacent(a, b))
      distances[b] = Math.min(distances[b], distances[a] + cells[b]);
  return Number.isFinite(distances.at(-1)) ? distances.at(-1)! : null;
}

const boundary = " Do not mutate input or reuse its objects in output. Retain the ESM transform export. No imports, processes, filesystem, network or evaluated source. Only src/transform.mjs may change.";
const csvInputs = ["", ",", "a,", '"",x', '"a,b","c""d",tail', '"\\",plain', '"line\nnext",end',
  '"\"\"",z', 'α,"😀,x", ', ',"",""', ' a , b ', '"back\\slash","quote""tail"', '"\r\n","\t"'];
const globInputs = [
  {text:"",pattern:""}, {text:"",pattern:"**"}, {text:"😀",pattern:"?"}, {text:"😀x",pattern:"?"},
  {text:"a*b",pattern:"a\\*b"}, {text:"a?b",pattern:"a\\?b"}, {text:"\\",pattern:"\\"},
  {text:"ab",pattern:"a**?"}, {text:"α\nβ",pattern:"*?β"}, {text:"abc",pattern:"a*c?"},
  {text:"axbyc",pattern:"a*b*c"}, {text:"xyz",pattern:"*z"}, {text:"\\x",pattern:"\\\\?"},
  {text:"[x]",pattern:"[?]"}, {text:"abcdef",pattern:"*a*d*f"}, {text:"abc",pattern:"***d"},
];
const coinInputs = [
  {amount:0,coins:[]}, {amount:7,coins:[]}, {amount:4,coins:[{value:2,count:1}]},
  {amount:6,coins:[{value:1,count:2},{value:2,count:3},{value:3,count:2}]},
  {amount:8,coins:[{value:2,count:4},{value:5,count:0}]},
  ...Array.from({length:9},(_,amount)=>({amount,coins:[{value:3,count:2},{value:1,count:3},{value:5,count:1}]})),
];
const energyInputs: (number | null)[][][] = [[[7]], [[null]], [[5,2,3]], [[0],[1],[4]],
  [[0,null],[null,0]], [[0,9,0],[1,1,1],[9,9,0]], [[null,1],[1,0]], [[0,1],[1,null]],
  [[0,0,0],[0,null,0],[0,0,0]], [[0,null,0,0],[0,null,0,null],[0,0,0,0],[9,9,9,0]],
  ...Array.from({length:6},(_,seed)=>Array.from({length:3},(_,row)=>Array.from({length:4},(_,column)=>
    (row*4+column+seed)%5===2?null:(row*7+column*3+seed)%10)))];

export const NATIVE_LOCAL_EMISSION_TASKS: readonly RepresentationTask[] = [
  {id:"QUOTED-RECORD-FIELDS",tier:"DEVELOPMENT",domain:"QUOTED_TEXT_PROTOCOL",
    objective:"Implement transform(input) for one valid CSV record string. Commas outside double quotes separate fields. A quoted field starts and ends with double quotes; doubled double quotes inside it mean one literal double quote. Backslash has no escape meaning. Preserve empty/trailing fields, whitespace, Unicode and any newline inside quoted fields. Return decoded fields; empty input returns ['']. Inputs are valid records only; do not trim or interpret literal backslashes."+boundary,
    publicCases:[{input:'a,"b,c",d',expected:["a","b,c","d"]},{input:'"x""y",',expected:['x"y',""]}],
    privateCases:csvInputs.map(input=>({input,expected:csvRecord(input)}))},
  {id:"UNICODE-LITERAL-GLOB",tier:"DEVELOPMENT",domain:"ESCAPED_PATTERN_MATCHING",
    objective:"Implement transform(input) for {text,pattern}, both strings of at most 12 Unicode code points. Return a boolean for whole-string glob matching: ? matches exactly one Unicode code point, * matches zero or more, and backslash quotes the next code point literally. A terminal unmatched backslash is a literal backslash. All other symbols, including brackets and newlines, are literals. Do not compile a regular expression from untrusted text."+boundary,
    publicCases:[{input:{text:"a*b",pattern:"a\\*?"},expected:true},{input:{text:"ab",pattern:"a?c"},expected:false}],
    privateCases:globInputs.map(input=>({input,expected:glob(input)}))},
  {id:"BOUNDED-COIN-COMBINATIONS",tier:"VALIDATION",domain:"BOUNDED_COMBINATORIAL_COUNTING",
    objective:"Implement transform(input) for {amount,coins}. amount is integer 0..24; coins is at most four records {value,count} with distinct positive integer values and count 0..6. Return the number of denomination-count combinations that total amount without exceeding each count. Coin order does not matter; arrangements are not distinct combinations. Empty coins yield 1 for amount zero, otherwise 0."+boundary,
    publicCases:[{input:{amount:4,coins:[{value:1,count:4},{value:2,count:2}]},expected:3},
      {input:{amount:0,coins:[{value:3,count:2}]},expected:1}],
    privateCases:coinInputs.map(input=>({input,expected:boundedCoins(input)}))},
  {id:"GRID-MINIMUM-ENERGY",tier:"VALIDATION",domain:"SPATIAL_COST_PLANNING",
    objective:"Implement transform(input) for a rectangular grid with 1..4 rows and columns. Each cell is integer energy cost 0..9 or null for an obstacle. Move horizontally or vertically between adjacent non-obstacle cells, from top-left to bottom-right. Return the minimum sum of costs of cells entered; the starting cell is not charged. Revisiting is allowed but cannot improve nonnegative cost. Return null if either endpoint is blocked or no route exists. A non-blocked one-cell grid costs zero."+boundary,
    publicCases:[{input:[[0,8],[1,2]],expected:3},{input:[[0,null],[null,1]],expected:null}],
    privateCases:energyInputs.map(input=>({input,expected:gridEnergy(input)}))},
];

export function nativeLocalEmissionTasks(): RepresentationTask[] {
  return NATIVE_LOCAL_EMISSION_TASKS.flatMap(task=>[1,2].map(repeat=>({...task,id:`${task.id}-REPEAT-${repeat}`})));
}

import type { RepresentationTask } from "./sourceRepresentationTasks";

// Fresh, frozen before inference. No observed benchmark answers or previous failure-specific patches.
// Same-session authorship: local private-oracle evidence, not independent institutional replication.
export const ARRAY_BOUND_TRANSFER_TASKS: readonly RepresentationTask[] = [
  {id: "QUOTED-RECORD", tier: "VALIDATION", domain: "TEXT_PROTOCOL_PARSING",
    objective: "Implement transform(input) for one valid CSV record represented as a string. Return its fields as strings. Commas delimit unquoted fields; quoted fields may contain commas, LF and CR; doubled quotes inside quoted fields represent one quote. Preserve whitespace and Unicode exactly. Empty record contains one empty field. Final comma adds an empty field. All inputs obey CSV quote rules; no recovery from invalid records is required. Do not mutate input. Preserve the ESM transform export. No imports, filesystem, processes or network. Only src/transform.mjs may change.",
    publicCases: [{input: 'a,"b,c","d""e"', expected: ["a", "b,c", 'd"e']},
      {input: ',x,', expected: ["", "x", ""]}],
    privateCases: [{input: '', expected: [""]}, {input: '""', expected: [""]},
      {input: '"α\nβ", 😀 ,"x\ry"', expected: ["α\nβ", " 😀 ", "x\ry"]},
      {input: '"""",,"z"', expected: ['"', "", "z"]}]},
  {id: "LEXICAL-TOPOLOGICAL-ORDER", tier: "VALIDATION", domain: "DEPENDENCY_GRAPH_PLANNING",
    objective: "Implement transform(input) for {nodes,edges}: nodes is an array of distinct strings, edges are directed pairs [before,after] between those nodes. Return all nodes in topological order, always selecting the lexicographically smallest currently eligible node using JavaScript string comparison. Return null if any directed cycle exists, including a self-loop. Duplicate edges do not change the answer. Include isolated nodes. Empty graph returns []. Do not mutate input, its nodes or edges; output must not alias input arrays. Preserve the ESM transform export. No imports, filesystem, processes or network. Only src/transform.mjs may change.",
    publicCases: [{input: {nodes: ["d", "c", "b", "a"], edges: [["a", "c"], ["b", "c"]]}, expected: ["a", "b", "c", "d"]},
      {input: {nodes: ["a", "b"], edges: [["a", "b"], ["b", "a"]]}, expected: null}],
    privateCases: [{input: {nodes: [], edges: []}, expected: []},
      {input: {nodes: ["x"], edges: [["x", "x"]]}, expected: null},
      {input: {nodes: ["z", "c", "b", "a"], edges: [["z", "a"], ["z", "a"], ["a", "b"]]}, expected: ["c", "z", "a", "b"]},
      {input: {nodes: ["b", "a", "A"], edges: []}, expected: ["A", "a", "b"]}]},
];

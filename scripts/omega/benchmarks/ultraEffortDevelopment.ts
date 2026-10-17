import type {PrivateTextTask} from "./nyxTextBenchmark";
import {ULTRA_RESEARCH_PAIR_POLICY as BASE, type UltraNativeEffort, type UltraResearchRow} from "./ultraResearchPair";

export const ULTRA_EFFORT_DEVELOPMENT_POLICY = Object.freeze({...BASE,
  version: "nyx-ultra-native-effort-development/1",
  arms: ["CURRENT_NYX_CLOSED_BOOK"] as const,
  samplePerFamily: null,
  profiles: ["HIGH", "MEDIUM"] as const,
  fixedStack: "CURRENT_NYX_CLOSED_BOOK", taskCount: 4,
  reasoningEffort: "PROSPECTIVE_HIGH_VS_MEDIUM_ONLY",
  taskScope: "SYNTHETIC_DEVELOPMENT_NOT_BENCHMARK_OR_HELDOUT_GENERALIZATION",
  hypothesis: "NATIVE_REASONING_EFFORT_MAY_AFFECT_FINAL_ANSWER_COMPLETION_WITHIN_EXISTING_REQUEST_LIFETIME",
  calibrationMeasured: false, automaticProfilePromotion: false,
});
export type UltraResearchMode = "BENCHMARK_PAIR" | "BENCHMARK_MEDIUM_PAIR" | "DEVELOPMENT_EFFORT";
export function ultraResearchMode(value: string | undefined): UltraResearchMode {
  if (value === undefined || value === "BENCHMARK_PAIR") return "BENCHMARK_PAIR";
  if (value === "DEVELOPMENT_EFFORT") return value;
  if (value === "BENCHMARK_MEDIUM_PAIR") return value;
  throw Error("ultra_research_mode_not_authorized");
}

/** Private host oracles never enter the model prompt. Questions are deliberately
 * synthetic development exercises, not copies or repairs of the exposed cohort. */
export function ultraEffortDevelopmentTasks(): readonly PrivateTextTask[] {
  let states = Array.from({length: 3}, () => Array<bigint>(11).fill(0n));
  for (let d = 0; d < 3; d++) states[d][d] = 1n;
  for (let position = 1; position < 18; position++) {
    const next = Array.from({length: 3}, () => Array<bigint>(11).fill(0n));
    for (let last = 0; last < 3; last++) for (let sum = 0; sum < 11; sum++)
      for (let d = 0; d < 3; d++) if (d !== last) next[d][(sum + d) % 11] += states[last][sum];
    states = next;
  }
  const sequenceCount = states.reduce((s, row) => s + row[5], 0n) % 997n;
  let previous = 2n, current = 9n;
  for (let n = 2; n <= 5; n++) [previous, current] = [current, 9n * current - previous];
  const transition = [[30, 20, 10], [15, 30, 15], [12, 12, 36]];
  const treeWeight = (root: number) => {
    const [a, b] = [0, 1, 2].filter(i => i !== root);
    return transition[a][root] * transition[b][root]
      + transition[a][b] * transition[b][root] + transition[b][a] * transition[a][root];
  };
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  const weights = [0, 1, 2].map(treeWeight), total = weights.reduce((a, b) => a + b, 0);
  const thermalNumerator = 200 * 9 + 3 * 160, thermalDenominator = 6 * 9 - 3 * 3;
  const rows = [
    {taskId: "ULTRA-DEV-SEQUENCE", question: "Consider all sequences of length 18 over the symbols 0, 1 and 2. "
      + "Adjacent symbols must differ, and the sum of all symbols must be congruent to 5 modulo 11. "
      + "How many such sequences are there, reduced modulo 997? Return the least nonnegative integer.", answer: String(sequenceCount)},
    {taskId: "ULTRA-DEV-RECURRENCE", question: "A positive real number x satisfies x + 1/x = 9. "
      + "Find the least nonnegative residue modulo 997 of x^5 + x^(-5).", answer: String(current % 997n)},
    {taskId: "ULTRA-DEV-REACTION", question: "A molecule changes between states A, B and C at each discrete time step. "
      + "From A, the probabilities of moving to A, B, C are 1/2, 1/3, 1/6. "
      + "From B they are 1/4, 1/2, 1/4. From C they are 1/5, 1/5, 3/5. "
      + "At stationarity, write the probability of C as a reduced fraction p/q. Return q, not p.",
      answer: String(total / gcd(total, weights[2]))},
    {taskId: "ULTRA-DEV-THERMAL", question: "Two thermally isolated ideal nodes A and B have no internal heat sources. "
      + "All connections obey steady linear heat conduction, with conductances in W/K. "
      + "A connects to a 100-degree-C reservoir with conductance 2, a 0-degree-C reservoir with conductance 1, "
      + "and B with conductance 3. B also connects to a 0-degree-C reservoir with conductance 4 "
      + "and an 80-degree-C reservoir with conductance 2. "
      + "At steady state write A's Celsius temperature as a reduced fraction p/q. Return p.",
      answer: String(thermalNumerator / gcd(thermalNumerator, thermalDenominator))},
  ];
  return Object.freeze(rows.map(r => Object.freeze({...r, family: "DEVELOPMENT_DIAGNOSTIC" as const})));
}

export function ultraEffortOrder(index: number): readonly UltraNativeEffort[] {
  if (!Number.isSafeInteger(index) || index < 0) throw Error("ultra_effort_order_invalid");
  // Each domain has one HIGH-first and one MEDIUM-first task.
  return index % 2 === 0 ? ["HIGH", "MEDIUM"] : ["MEDIUM", "HIGH"];
}

/** Report a configuration trade-off, not architecture improvement. Equal limits
 * do not establish equal realized compute or permit score splicing. */
export function summarizeUltraEffortDevelopment(selected: readonly string[], rows: readonly UltraResearchRow[]) {
  if (!selected.length || new Set(selected).size !== selected.length
    || new Set(rows.map(r => `${r.nativeEffort}:${r.taskId}`)).size !== rows.length
    || rows.some(r => !selected.includes(r.taskId) || r.arm !== "CURRENT_NYX_CLOSED_BOOK"
      || !ULTRA_EFFORT_DEVELOPMENT_POLICY.profiles.includes(r.nativeEffort)
      || r.model !== BASE.model || r.family !== "DEVELOPMENT_DIAGNOSTIC"
      || (r.correct === true) !== (r.state === "PASS")
      || (r.correct === false) !== (r.state === "REASONING_FAILURE"))) throw Error("ultra_effort_result_identity_invalid");
  const profiles = ULTRA_EFFORT_DEVELOPMENT_POLICY.profiles.map(profile => {
    const attempted = rows.filter(r => r.nativeEffort === profile), graded = attempted.filter(r => r.correct !== null);
    const correct = graded.filter(r => r.correct === true).length;
    return {profile, selected: selected.length, attempted: attempted.length, graded: graded.length, correct,
      wrong: graded.length - correct, ungraded: attempted.length - graded.length, unexecuted: selected.length - attempted.length,
      completePilot: graded.length === selected.length, developmentAccuracy: graded.length === selected.length ? correct / selected.length : null,
      reportedTokens: attempted.reduce((s, r) => s + r.usage.reportedTokens, 0),
      unknownUsageCalls: attempted.reduce((s, r) => s + r.usage.unknownUsageCalls, 0),
      physicalCalls: attempted.reduce((s, r) => s + r.usage.physicalCalls, 0),
      taskWallMs: attempted.reduce((s, r) => s + r.usage.wallClockMs, 0),
      providerFailures: attempted.reduce((s, r) => s + r.usage.providerFailures, 0)};
  });
  const pairs = selected.map(taskId => {
    const high = rows.find(r => r.taskId === taskId && r.nativeEffort === "HIGH"),
      medium = rows.find(r => r.taskId === taskId && r.nativeEffort === "MEDIUM");
    if (high && medium && high.inputDigest !== medium.inputDigest) throw Error("ultra_effort_input_mismatch");
    const bothGraded = !!high && !!medium && high.correct !== null && medium.correct !== null;
    const known = bothGraded && high!.usage.unknownUsageCalls === 0 && medium!.usage.unknownUsageCalls === 0;
    return {taskId, bothGraded, highCorrect: high?.correct ?? null, mediumCorrect: medium?.correct ?? null,
      bothUsageKnown: !!known, mediumMinusHighReportedTokens: known ? medium!.usage.reportedTokens - high!.usage.reportedTokens : null};
  });
  return {profiles, pairs, bothCorrect: pairs.filter(p => p.bothGraded && p.highCorrect && p.mediumCorrect).length,
    highOnlyCorrect: pairs.filter(p => p.bothGraded && p.highCorrect && !p.mediumCorrect).length,
    mediumOnlyCorrect: pairs.filter(p => p.bothGraded && !p.highCorrect && p.mediumCorrect).length,
    ungradedOrUnexecutedPairs: pairs.filter(p => !p.bothGraded).length,
    cognitivePromotion: false, configurationPromotion: false, freshGeneralizationClaim: false, officialBenchmarkScoreClaim: false};
}

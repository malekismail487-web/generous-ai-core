import type { PrivateTextTask } from "./nyxTextBenchmark";

/** Procedural development/transfer instances, NOT GPQA or an official benchmark.
 * No question, answer, failure index or response from GPQA is used here.
 * Oracles stay host-side; the existing R1 question-file scope is unchanged. */
export type GeneralReasoningDomain = "BAYES" | "CAUSAL" | "SYMMETRY" | "PROGRAM_STATE";
export type GeneralReasoningStage = "DEVELOPMENT" | "TRANSFER";
export interface GeneralReasoningTask extends PrivateTextTask { domain: GeneralReasoningDomain }

function random(seed: number) {
  let state = seed >>> 0;
  return (n: number) => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) % n; };
}
function choice(seed: number, taskId: string, domain: GeneralReasoningDomain, objective: string,
  correct: string, alternatives: readonly string[]): GeneralReasoningTask {
  const distinct = [correct, ...alternatives.filter(value => value !== correct)];
  if (new Set(distinct).size !== distinct.length || distinct.length < 4) throw Error("general_task_choices_invalid");
  const options = distinct.slice(0, 4), draw = random(seed);
  for (let at = 3; at > 0; at--) { const other = draw(at + 1); [options[at], options[other]] = [options[other], options[at]]; }
  return Object.freeze({family: "DEVELOPMENT_DIAGNOSTIC", taskId, domain,
    question: `${objective}\nChoose exactly one numbered option. Return its index (1, 2, 3, or 4), not the option text.\n`
      + options.map((value, index) => `${index + 1}. ${value}`).join("\n"), answer: String(options.indexOf(correct) + 1)});
}
const percent = (numerator: number, denominator: number) => `${(100 * numerator / denominator).toFixed(3)}%`;

export function bayesTask(seed: number, id: string): GeneralReasoningTask {
  const draw = random(seed), prior = 1 + draw(8), sensitivity1 = 75 + draw(23), falsePositive1 = 3 + draw(13),
    sensitivity2 = 70 + draw(28), falsePositive2 = 2 + draw(14);
  const diseased = prior * sensitivity1 * (100 - sensitivity2);
  const healthy = (100 - prior) * falsePositive1 * (100 - falsePositive2);
  const positiveTwice = prior * sensitivity1 * sensitivity2;
  return choice(seed, id, "BAYES", `In a component population, ${prior}% have a hidden defect. Test 1 is positive in `
    + `${sensitivity1}% of defective components and ${falsePositive1}% of nondefective components. Test 2 is positive in `
    + `${sensitivity2}% of defective components and ${falsePositive2}% of nondefective components. Test results are conditionally `
    + `independent GIVEN defect status (not unconditionally independent). A randomly selected component tests positive on test 1 `
    + `and NEGATIVE on test 2. What is the posterior probability it is defective, rounded to three decimal places?`,
  percent(diseased, diseased + healthy), [percent(prior * sensitivity1, prior * sensitivity1 + (100 - prior) * falsePositive1),
    percent(positiveTwice, positiveTwice + (100 - prior) * falsePositive1 * falsePositive2),
    percent(sensitivity1 * (100 - sensitivity2), sensitivity1 * (100 - sensitivity2) + falsePositive1 * (100 - falsePositive2)),
    percent(100 - prior, 100)]);
}

export function causalTask(seed: number, id: string): GeneralReasoningTask {
  const draw = random(seed), high = 300 + draw(5) * 100, low = 1000 - high,
    rateAH = 65 + 5 * draw(7), rateBH = 65 + 5 * draw(7), rateAL = 10 + 5 * draw(7), rateBL = 10 + 5 * draw(7);
  const aH = high * 0.8, bH = high - aH, aL = low * 0.2, bL = low - aL;
  const observedA = (aH * rateAH + aL * rateAL) / (aH + aL), observedB = (bH * rateBH + bL * rateBL) / (bH + bL);
  const adjustedA = (high * rateAH + low * rateAL) / 1000, adjustedB = (high * rateBH + low * rateBL) / 1000;
  const describe = (delta: number) => `Intervention A minus intervention B: ${delta.toFixed(3)} percentage points`;
  const correct = describe(adjustedA - adjustedB);
  const alternatives = [...new Set([describe(observedA - observedB), describe(adjustedB - adjustedA),
    describe((rateAH + rateAL - rateBH - rateBL) / 2), describe(rateAH - rateBH), describe(23.456), describe(-31.234)])]
    .filter(value => value !== correct);
  return choice(seed, id, "CAUSAL", `A target population has ${high} high-baseline and ${low} low-baseline devices. `
    + `In historical data, high-baseline devices were assigned ${aH} to treatment A and ${bH} to B; low-baseline devices `
    + `were assigned ${aL} to A and ${bL} to B. Success rates are: high/A ${rateAH}%, high/B ${rateBH}%, `
    + `low/A ${rateAL}%, low/B ${rateBL}%. Assignment is random within each baseline stratum, there are no other confounders, `
    + `and these conditional success rates remain valid under intervention. If the entire TARGET population receives A `
    + `instead of B, what is the change in expected success rate?`, correct, alternatives);
}

function validRing(bits: string, ones: number) {
  return [...bits].filter(x => x === "1").length === ones
    && [...bits].every((x, i) => x !== "1" || bits[(i + 1) % bits.length] !== "1");
}
export function ringCounts(length: number, ones: number) {
  if (!Number.isSafeInteger(length) || length < 3 || length > 16 || !Number.isSafeInteger(ones) || ones < 1)
    throw Error("general_ring_bounds_invalid");
  const rotations = new Set<string>(), reflections = new Set<string>(); let labelled = 0;
  const canonical = (bits: string) => Array.from({length}, (_, shift) => bits.slice(shift) + bits.slice(0, shift)).sort()[0];
  for (let value = 0; value < 2 ** length; value++) {
    const bits = value.toString(2).padStart(length, "0");
    if (!validRing(bits, ones)) continue;
    labelled++; const forward = canonical(bits), reverse = canonical([...bits].reverse().join(""));
    rotations.add(forward); reflections.add([forward, reverse].sort()[0]);
  }
  return {labelled, rotations: rotations.size, reflections: reflections.size};
}
export function symmetryTask(seed: number, id: string): GeneralReasoningTask {
  const cases = [[9, 3], [10, 4], [12, 4], [14, 5], [15, 5], [16, 4]] as const;
  const [length, ones] = cases[random(seed)(cases.length)], counts = ringCounts(length, ones);
  const correct = String(counts.rotations), alternatives = [...new Set([counts.labelled, counts.reflections,
    Math.floor(counts.labelled / length), counts.rotations + 2, counts.rotations + 5, counts.rotations + 9].map(String))]
    .filter(value => value !== correct);
  return choice(seed, id, "SYMMETRY", `A circular string has ${length} binary positions with exactly ${ones} ones. `
    + `No two ones are adjacent, including across the last/first boundary. Strings differing only by ROTATION count as `
    + `the same configuration; mirror images are NOT identified unless rotation alone makes them equal. How many configurations exist?`,
  correct, alternatives);
}

export function programStateValue(initial: readonly number[], iterations: number, variant: "EXACT" | "COPY_Y" | "ALIAS_Z" = "EXACT") {
  const x = [...initial], y = variant === "COPY_Y" ? [...x] : x, z = variant === "ALIAS_Z" ? x : [...x];
  for (let i = 0; i < iterations; i++) {
    if (x[i] === undefined) return "Raises IndexError";
    y.push(z[i % 4] + x[i]);
    if (i % 2 === 0) z[i % 4] = y[y.length - 1] - z[(i + 1) % 4];
    x[(i + 1) % x.length] = z[i % 4] + y[i];
  }
  return x.reduce((a, b) => a + b, 0) + 2 * z.reduce((a, b) => a + b, 0);
}
export function programTask(seed: number, id: string): GeneralReasoningTask {
  const draw = random(seed), initial = Array.from({length: 4}, () => 2 + draw(11)), iterations = 5 + draw(3);
  const correct = String(programStateValue(initial, iterations));
  const alternatives = [...new Set([programStateValue(initial, iterations, "COPY_Y"), programStateValue(initial, iterations, "ALIAS_Z"),
    Number(correct) + 1, Number(correct) - 3, Number(correct) + 11].map(String))].filter(value => value !== correct);
  return choice(seed, id, "PROGRAM_STATE", `Under standard Python 3 list/reference semantics, what integer does this program print? `
    + `All arithmetic is exact integer arithmetic.\n\n`
    + `x = ${JSON.stringify(initial)}\ny = x\nz = x[:]\nfor i in range(${iterations}):\n`
    + `    y.append(z[i % 4] + x[i])\n    if i % 2 == 0:\n        z[i % 4] = y[-1] - z[(i + 1) % 4]\n`
    + `    x[(i + 1) % len(x)] = z[i % 4] + y[i]\nprint(sum(x) + 2 * sum(z))`, correct, alternatives);
}

export function generalReasoningTasks(stage: GeneralReasoningStage): readonly GeneralReasoningTask[] {
  if (stage !== "DEVELOPMENT" && stage !== "TRANSFER") throw Error("general_reasoning_stage_invalid");
  const constructors = [bayesTask, causalTask, symmetryTask, programTask];
  const seeds = stage === "DEVELOPMENT" ? [101, 509, 907, 1301] : [7919, 15401, 23549, 30869, 40009, 50021, 60013, 70001];
  return Object.freeze(seeds.map((seed, index) => constructors[index % constructors.length](seed,
    `GENERAL-${stage}-${index + 1}`)));
}

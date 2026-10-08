import type { PrivateTextTask } from "./nyxTextBenchmark";

/** Procedural development/transfer instances, NOT GPQA or an official benchmark.
 * No question, answer, failure index or response from GPQA is used here.
 * Oracles stay host-side; the existing R1 question-file scope is unchanged. */
export type GeneralReasoningDomain = "BAYES" | "CAUSAL" | "SYMMETRY" | "PROGRAM_STATE";
export type GeneralReasoningStage = "DEVELOPMENT" | "TRANSFER" | "CHALLENGE";
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

// Harder evaluation only. These mechanisms generate questions/oracles; they are
// NOT cognition supplied to NYX, and never contain an official benchmark answer.
function challengeBayes(seed: number, id: string): GeneralReasoningTask {
  const draw = random(seed), rate = () => 8 + draw(85);
  const data = {pD: 3 + draw(16), pHGivenD: [rate(), rate()],
    pAGivenDH: [[rate(), rate()], [rate(), rate()]], pBGivenDH: [[rate(), rate()], [rate(), rate()]],
    pCGivenH: [rate(), rate()], pSelectedGivenD: [rate(), rate()]};
  let defect = 0, total = 0;
  for (let d = 0; d < 2; d++) for (let h = 0; h < 2; h++) {
    const weight = (d ? data.pD : 100 - data.pD) * (h ? data.pHGivenD[d] : 100 - data.pHGivenD[d])
      * data.pAGivenDH[d][h] * (100 - data.pBGivenDH[d][h]) * data.pCGivenH[h] * data.pSelectedGivenD[d];
    total += weight; if (d) defect += weight;
  }
  const correct = percent(defect, total);
  const alternatives = [percent(total - defect, total), percent(data.pD, 100),
    ...[3.417, -2.631, 5.173].map(delta => `${Math.max(0.001, Math.min(99.999, 100 * defect / total + delta)).toFixed(3)}%`)];
  return choice(seed, id, "BAYES", `All variables are binary. D means defect and H is an unobserved environment. `
    + `A, B, C and S are mutually independent CONDITIONAL ON (D,H), not necessarily conditional on D alone. `
    + `C depends only on H and selection S only on D. Every table entry is a percentage probability of value 1; `
    + `array indices are the binary parent values in the order named. No other dependencies exist.\nDATA: ${JSON.stringify(data)}\n`
    + `A sampled component is selected (S=1) and has A=1, B=0, C=1. What is P(D=1 | S=1,A=1,B=0,C=1), `
    + `as a percentage rounded to three decimal places? Marginalize the shared latent H; do not assume independent tests after marginalization.`,
  correct, [...new Set(alternatives)].filter(x => x !== correct));
}

function challengeCausal(seed: number, id: string): GeneralReasoningTask {
  const draw = random(seed), rate = () => 10 + draw(81);
  const data = {pU: 15 + draw(71), pTGivenU: [rate(), rate()], pMGivenTU: [[rate(), rate()], [rate(), rate()]],
    pYGivenUTM: Array.from({length: 2}, () => Array.from({length: 2}, () => [rate(), rate()])),
    pSGivenTY: [[rate(), rate()], [rate(), rate()]]};
  const estimate = (t: number, observational = false, selected = true) => {
    let yes = 0, all = 0;
    for (let u = 0; u < 2; u++) for (let m = 0; m < 2; m++) for (let y = 0; y < 2; y++) {
      const pu = (u ? data.pU : 100 - data.pU) / 100, pm = data.pMGivenTU[t][u] / 100;
      const py = data.pYGivenUTM[u][t][m] / 100;
      const pt = data.pTGivenU[u] / 100;
      const weight = pu * (m ? pm : 1 - pm) * (y ? py : 1 - py)
        * (selected ? data.pSGivenTY[t][y] / 100 : 1) * (observational ? t ? pt : 1 - pt : 1);
      all += weight; if (y) yes += weight;
    }
    return yes / all;
  };
  const describe = (delta: number) => `${(100 * delta).toFixed(3)} percentage points`;
  const difference = estimate(1) - estimate(0), correct = describe(difference);
  return choice(seed, id, "CAUSAL", `Binary structural causal model: U precedes treatment T; mediator M depends on (T,U); `
    + `outcome Y depends on (U,T,M); reporting S depends on (T,Y). Exogenous disturbances are mutually independent. `
    + `Every table entry is a percentage probability of value 1. Array indices follow the parent order named; `
    + `pU is the population probability U=1. Equations and rates remain invariant under intervention.\nDATA: ${JSON.stringify(data)}\n`
    + `Define q(t)=P(Y=1 | do(T=t),S=1), conditioning on reporting separately in each intervention world. `
    + `What is 100*(q(1)-q(0)), rounded to three decimal places? This is NOT observational conditioning on T, `
    + `nor the unselected population effect.`, correct,
  [...new Set([describe(estimate(1, true) - estimate(0, true)), describe(estimate(1, false, false) - estimate(0, false, false)),
    describe(-difference), describe(difference + 0.03719), describe(difference - 0.04913)])].filter(x => x !== correct));
}

/** Enumerate constrained words and canonicalize rotations. Python cross-checks
 * via a different algorithm: fixed-period Burnside counting with memoized DP. */
export function ternaryRotationCounts(length: number, counts: readonly number[], occurrences: number) {
  if (!Number.isInteger(length) || length < 6 || length > 15 || counts.length !== 3
    || counts.some(x => !Number.isInteger(x) || x < 1) || counts.reduce((a, b) => a + b, 0) !== length
    || !Number.isInteger(occurrences) || occurrences < 0 || occurrences > length) throw Error("ternary_challenge_bounds_invalid");
  const remaining = [...counts], word: number[] = [], representatives = new Set<string>(); let labelled = 0;
  const visit = () => {
    if (word.length === length) {
      if (word[0] === word[length - 1]) return;
      let matches = 0;
      for (let i = 0; i < length; i++) if (word[i] === 0 && word[(i + 1) % length] === 1 && word[(i + 2) % length] === 2) matches++;
      if (matches !== occurrences) return;
      labelled++; const value = word.join("");
      representatives.add(Array.from({length}, (_, shift) => value.slice(shift) + value.slice(0, shift)).sort()[0]);
      return;
    }
    for (let value = 0; value < 3; value++) if (remaining[value] && word.at(-1) !== value) {
      remaining[value]--; word.push(value); visit(); word.pop(); remaining[value]++;
    }
  };
  visit(); return {labelled, rotations: representatives.size};
}
function challengeSymmetry(seed: number, id: string): GeneralReasoningTask {
  // Distinct parameters, fixed before any live result; non-free rotation actions.
  const cases = [{length: 12, counts: [4, 4, 4], occurrences: 2},
    {length: 12, counts: [4, 4, 4], occurrences: 0}, {length: 15, counts: [5, 5, 5], occurrences: 0}];
  const data = cases[seed % cases.length], result = ternaryRotationCounts(data.length, data.counts, data.occurrences);
  const correct = String(result.rotations);
  return choice(seed, id, "SYMMETRY", `A circular word uses labelled symbols 0,1,2 with the counts in DATA. `
    + `Adjacent symbols must differ, INCLUDING the last/first boundary. The oriented cyclic length-3 pattern 012 `
    + `must occur exactly occurrences times, including wraparound starts. Words equivalent by ROTATION are identified; `
    + `reflection or permuting symbol names is NOT an equivalence. Rotations need not act freely.\nDATA: ${JSON.stringify(data)}\n`
    + `How many equivalence classes satisfy all constraints?`, correct,
  [...new Set([result.labelled, Math.floor(result.labelled / data.length), Math.floor(result.rotations / 2),
    result.rotations + 7, result.rotations + 11, result.rotations + 17].map(String))].filter(x => x !== correct));
}

export function generatorChallengeValue(initial: readonly number[], iterations: number) {
  if (initial.length !== 4 || initial.some(x => !Number.isSafeInteger(x) || x < 2 || x > 18)
    || !Number.isSafeInteger(iterations) || iterations < 6 || iterations > 8) throw Error("generator_challenge_bounds_invalid");
  let a = [...initial]; const b = a, c = [...a]; let i = 0, suspended = false;
  const next = (): number | null => {
    if (suspended) {
      b.push(c[(i + 1) % 4] - b[i]);
      if (i % 2 === 0) c[i % 4] += b.at(-1)!;
      i++; suspended = false;
    }
    if (i >= iterations) return null;
    suspended = true; return a[i % a.length] + c[i % 4];
  };
  const p = next()!;
  // Default ref captures b, while c is looked up later. Rebinding a does not
  // rebind b and the suspended generator observes a's new binding on resume.
  const functions = Array.from({length: 4}, (_, j) => () => b[j % b.length] + c[j % 4]);
  a = [...a]; a[1] += p;
  const q = [next()!, next()!, next()!]; c[0] += q.reduce((x, y) => x + y, 0);
  const r = functions.reduce((total, f) => total + f(), 0); a.push(...q);
  const tail: number[] = []; for (let value = next(); value !== null; value = next()) tail.push(value);
  const sum = (x: number[]) => x.reduce((total, value) => total + value, 0);
  return r + sum(a) + 2 * sum(b) + 3 * sum(c) + sum(tail);
}
function challengeProgram(seed: number, id: string): GeneralReasoningTask {
  const draw = random(seed), initial = Array.from({length: 4}, () => 2 + draw(17)), iterations = 6 + draw(3);
  const value = generatorChallengeValue(initial, iterations);
  const code = `a = ${JSON.stringify(initial)}\nb = a\nc = a[:]\ndef stream():\n    for i in range(${iterations}):\n`
    + `        yield a[i % len(a)] + c[i % 4]\n        b.append(c[(i + 1) % 4] - b[i])\n`
    + `        if i % 2 == 0:\n            c[i % 4] += b[-1]\ng = stream()\np = next(g)\n`
    + `f = [lambda j=j, ref=b: ref[j % len(ref)] + c[j % 4] for j in range(4)]\na = a[:]\na[1] += p\n`
    + `q = [next(g) for _ in range(3)]\nc[0] += sum(q)\nr = sum(fn() for fn in f)\na.extend(q)\ns = list(g)\n`
    + `print(r + sum(a) + 2 * sum(b) + 3 * sum(c) + sum(s))`;
  return choice(seed, id, "PROGRAM_STATE", `Under standard Python 3 semantics, what integer is printed? `
    + `All arithmetic is exact. Account for generator suspension/resumption, global rebinding, captured default references `
    + `and mutations after the final yield.\n\n${code}`, String(value), [value + 1, value - 13, value + 29].map(String));
}

export function generalReasoningTasks(stage: GeneralReasoningStage): readonly GeneralReasoningTask[] {
  if (stage === "CHALLENGE") {
    const constructors = [challengeBayes, challengeCausal, challengeSymmetry, challengeProgram];
    const seeds = [81013, 82003, 83003, 84011, 85009, 86011, 87001, 88001, 89003, 90001, 91008, 92009];
    return Object.freeze(seeds.map((seed, index) => constructors[index % 4](seed, `GENERAL-CHALLENGE-${index + 1}`)));
  }
  if (stage !== "DEVELOPMENT" && stage !== "TRANSFER") throw Error("general_reasoning_stage_invalid");
  const constructors = [bayesTask, causalTask, symmetryTask, programTask];
  const seeds = stage === "DEVELOPMENT" ? [101, 509, 907, 1301] : [7919, 15401, 23549, 30869, 40009, 50021, 60013, 70001];
  return Object.freeze(seeds.map((seed, index) => constructors[index % constructors.length](seed,
    `GENERAL-${stage}-${index + 1}`)));
}

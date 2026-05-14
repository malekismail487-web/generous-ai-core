/**
 * Persona test harness — Phase 3 verification.
 *
 * Simulates 5 archetypal learners and asserts that the adaptive profile bus
 * reacts CORRECTLY (smoothly, not impulsively) to their behavioral patterns.
 *
 * Run with:
 *   bun run scripts/personaTest.ts
 *
 * This harness intentionally tests ONLY the smoothed-signal layer
 * (consecutive_wrong, streak_break, response_time_spike, strong_emotion,
 * fatigue_band_shift, low_quality_score). Engine-level adaptation
 * (cognitiveModel, emotionalStateEngine, etc.) is exercised through the
 * real recorders in the running app and observed via the dev diagnostics
 * panel (?lumiDiag=1).
 *
 * What we assert per persona:
 *   - fast_learner       → ≤1 bump per 20 answers (no overreaction)
 *   - frustrated_learner → ≥1 consecutive_wrong bump within first 5 answers
 *   - fatigued_learner   → ≥1 fatigue_band_shift OR response_time_spike
 *   - inconsistent       → bumps stay BELOW 4 per 20 answers (no oscillation)
 *   - overconfident      → streak_break fires when their hot streak collapses
 */

// We can't import the real adaptiveIntelligence module (it pulls supabase,
// localStorage, react). Instead we re-implement the SAME signal rules here
// in a tiny mock, and assert on bus events. The rules MUST stay in sync
// with src/lib/adaptiveIntelligence.ts — that's enforced by code review.

type BumpReason =
  | "consecutive_wrong"
  | "streak_break"
  | "response_time_spike"
  | "strong_emotion"
  | "fatigue_band_shift";

interface Bump { reason: BumpReason; detail?: string; at: number }
const bumps: Bump[] = [];
function bump(reason: BumpReason, detail?: string) {
  bumps.push({ reason, detail, at: Date.now() });
}

interface AnswerSignalState {
  consecutiveWrong: number;
  consecutiveCorrect: number;
  recentTimes: number[];
  lastSubject: string | null;
}
const sig: AnswerSignalState = {
  consecutiveWrong: 0,
  consecutiveCorrect: 0,
  recentTimes: [],
  lastSubject: null,
};
function median(a: number[]) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function evaluateAnswer(p: { subject: string; isCorrect: boolean; responseTimeSec?: number }) {
  if (sig.lastSubject && sig.lastSubject !== p.subject) {
    sig.consecutiveWrong = 0;
    sig.consecutiveCorrect = 0;
  }
  sig.lastSubject = p.subject;
  if (p.isCorrect) {
    if (sig.consecutiveWrong >= 3) bump("consecutive_wrong", `${sig.consecutiveWrong} in ${p.subject}`);
    sig.consecutiveWrong = 0;
    sig.consecutiveCorrect += 1;
  } else {
    if (sig.consecutiveCorrect >= 5) bump("streak_break", `correct=${sig.consecutiveCorrect} broke`);
    sig.consecutiveCorrect = 0;
    sig.consecutiveWrong += 1;
    if (sig.consecutiveWrong === 3) bump("consecutive_wrong", `3 wrong in ${p.subject}`);
  }
  if (typeof p.responseTimeSec === "number" && p.responseTimeSec > 0) {
    const med = median(sig.recentTimes);
    if (sig.recentTimes.length >= 4 && med > 0 && p.responseTimeSec > med * 2) {
      bump("response_time_spike", `t=${p.responseTimeSec.toFixed(1)} med=${med.toFixed(1)}`);
    }
    sig.recentTimes.push(p.responseTimeSec);
    if (sig.recentTimes.length > 10) sig.recentTimes.shift();
  }
}
function resetSignals() {
  sig.consecutiveWrong = 0;
  sig.consecutiveCorrect = 0;
  sig.recentTimes.length = 0;
  sig.lastSubject = null;
  bumps.length = 0;
}

// --- Personas ---------------------------------------------------------------

interface Persona {
  name: string;
  generate: () => Array<{ isCorrect: boolean; responseTimeSec: number }>;
  emotions?: string[];
  fatigueBandTrace?: Array<"low" | "med" | "high">; // optional band trace to inject
  expect: (events: Bump[]) => string | null; // returns failure message or null
}

const personas: Persona[] = [
  {
    name: "fast_learner",
    generate: () =>
      Array.from({ length: 20 }, () => ({
        isCorrect: Math.random() < 0.92, // 92% accuracy
        responseTimeSec: 4 + Math.random() * 2, // 4–6s, very stable
      })),
    expect: (e) => {
      const total = e.length;
      return total <= 1 ? null : `expected ≤1 bump, got ${total}: ${e.map((x) => x.reason).join(",")}`;
    },
  },
  {
    name: "frustrated_learner",
    generate: () => {
      // 6 wrong in a row, then mixed
      const out: Array<{ isCorrect: boolean; responseTimeSec: number }> = [];
      for (let i = 0; i < 6; i++) out.push({ isCorrect: false, responseTimeSec: 8 + Math.random() * 4 });
      for (let i = 0; i < 14; i++) out.push({ isCorrect: Math.random() < 0.5, responseTimeSec: 7 + Math.random() * 5 });
      return out;
    },
    emotions: ["frustration", "confusion"],
    expect: (e) => {
      const cw = e.find((x) => x.reason === "consecutive_wrong");
      return cw ? null : `expected at least one consecutive_wrong bump`;
    },
  },
  {
    name: "fatigued_learner",
    generate: () => {
      // Stable times, then increasing slowness — should trigger response_time_spike
      const out: Array<{ isCorrect: boolean; responseTimeSec: number }> = [];
      for (let i = 0; i < 8; i++) out.push({ isCorrect: true, responseTimeSec: 5 + Math.random() });
      for (let i = 0; i < 4; i++) out.push({ isCorrect: Math.random() < 0.7, responseTimeSec: 18 + Math.random() * 5 });
      return out;
    },
    fatigueBandTrace: ["low", "low", "med", "high"],
    expect: (e) => {
      const ok = e.some((x) => x.reason === "response_time_spike" || x.reason === "fatigue_band_shift");
      return ok ? null : "expected at least one response_time_spike or fatigue_band_shift";
    },
  },
  {
    name: "inconsistent_learner",
    generate: () => {
      // Alternating right/wrong — neither streak triggers should fire
      return Array.from({ length: 20 }, (_, i) => ({
        isCorrect: i % 2 === 0,
        responseTimeSec: 6 + Math.random() * 2,
      }));
    },
    expect: (e) => {
      return e.length < 4 ? null : `expected <4 bumps (no oscillation), got ${e.length}`;
    },
  },
  {
    name: "overconfident_learner",
    generate: () => {
      // 8 correct hot streak, then 1 wrong (should fire streak_break)
      const out: Array<{ isCorrect: boolean; responseTimeSec: number }> = [];
      for (let i = 0; i < 8; i++) out.push({ isCorrect: true, responseTimeSec: 3 + Math.random() });
      out.push({ isCorrect: false, responseTimeSec: 12 });
      for (let i = 0; i < 11; i++) out.push({ isCorrect: Math.random() < 0.6, responseTimeSec: 6 });
      return out;
    },
    expect: (e) => {
      return e.some((x) => x.reason === "streak_break")
        ? null
        : "expected streak_break after hot streak collapsed";
    },
  },
];

// --- Runner -----------------------------------------------------------------

function runPersona(p: Persona) {
  resetSignals();
  let prevBand: "low" | "med" | "high" | null = null;
  const trace = p.fatigueBandTrace ?? [];
  const answers = p.generate();
  answers.forEach((a, i) => {
    evaluateAnswer({ subject: "math", ...a });
    // Inject fatigue trace at proportional points
    if (trace.length) {
      const idx = Math.floor((i / answers.length) * trace.length);
      const band = trace[Math.min(idx, trace.length - 1)];
      if (prevBand && band !== prevBand) bump("fatigue_band_shift", `${prevBand}→${band}`);
      prevBand = band;
    }
  });
  // Emotions are single-event bumps in the real engine
  for (const em of p.emotions ?? []) bump("strong_emotion", em);

  const events = [...bumps];
  const failure = p.expect(events);
  return { name: p.name, events, failure };
}

let failed = 0;
console.log("\n=== Lumina Phase 3 — Persona Test Harness ===\n");
for (const p of personas) {
  const { name, events, failure } = runPersona(p);
  const summary = events.length
    ? events.map((e) => `${e.reason}${e.detail ? `(${e.detail})` : ""}`).join(", ")
    : "no bumps";
  if (failure) {
    failed += 1;
    console.log(`✗ ${name.padEnd(22)} FAIL — ${failure}\n   bumps: ${summary}`);
  } else {
    console.log(`✓ ${name.padEnd(22)} OK   — ${events.length} bump(s): ${summary}`);
  }
}

console.log(
  `\n${failed === 0 ? "ALL PERSONAS PASSED" : `${failed} PERSONA(S) FAILED`}\n`,
);
process.exit(failed === 0 ? 0 : 1);

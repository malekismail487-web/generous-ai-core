// ============================================================================
//  outputIntegrity.ts — Stage 12 · §3 (True Output Enforcement)
// ----------------------------------------------------------------------------
//  The Output Engine V3 prescribes a deterministic recipe; the prior
//  pipeline merely *logged* when the LLM omitted a mandatory step. With
//  Stage 12 the recipe becomes an enforced contract:
//
//   1. `analyseIntegrity` audits the generated content against the
//      regime/trajectory and produces a structured violation report.
//   2. `buildRepairPrompt` produces a targeted prompt that asks the LLM
//      to *amend* the existing answer to satisfy the missing constraints,
//      explicitly preserving everything that already passed.
//   3. The caller performs **at most one** repair pass — enforcement is
//      deterministic and bounded. If the repair still fails the original
//      content is returned with a clear `enforcement.status = "degraded"`
//      so that downstream telemetry can track the failure.
//
//  Pure functions only. No model calls, no IO. Repair invocation lives
//  in the edge function so the integrity module stays testable.
// ============================================================================

export type StepKind =
  | "hook" | "explain" | "worked_example"
  | "check" | "practice" | "reflect";

export interface IntegrityStep {
  kind: StepKind;
  mustVerify: boolean;
}

export interface IntegrityReport {
  ok: boolean;
  missingSteps: StepKind[];
  missingVerifications: StepKind[];
  /** Steps required to satisfy the runtimeConfig.outputMinMandatorySteps floor. */
  unmetFloor: boolean;
  details: string[];
}

// Per-step "evidence" tokens. The LLM is instructed to label each step
// with the canonical kind name; we accept light variants ("worked example",
// "worked-example") to avoid brittle string matching.
const STEP_TOKENS: Record<StepKind, string[]> = {
  hook:           ["hook"],
  explain:        ["explain", "explanation"],
  worked_example: ["worked example", "worked-example", "worked_example"],
  check:          ["check", "comprehension check"],
  practice:       ["practice", "exercise"],
  reflect:        ["reflect", "reflection"],
};

const VERIFY_HINTS = ["?", "your turn", "try it", "answer below", "verify"];

const has = (haystack: string, needles: string[]): boolean =>
  needles.some((n) => haystack.includes(n));

/**
 * Audit `content` against the trajectory. Returns structured violations
 * so downstream code can decide between repair, regenerate, or accept.
 */
export function analyseIntegrity(
  content: string,
  steps: IntegrityStep[],
  opts: { minMandatory: number },
): IntegrityReport {
  const lower = (content || "").toLowerCase();
  const missingSteps: StepKind[] = [];
  const missingVerifications: StepKind[] = [];
  const details: string[] = [];

  for (const step of steps) {
    const tokens = STEP_TOKENS[step.kind] ?? [step.kind];
    const present = has(lower, tokens);
    if (!present) {
      missingSteps.push(step.kind);
      details.push(`Missing step token for "${step.kind}".`);
      continue;
    }
    if (step.mustVerify) {
      // Search the window after the step token for any verification hint.
      const idx = tokens.map((t) => lower.indexOf(t)).filter((i) => i >= 0)
        .reduce((min, i) => Math.min(min, i), Number.MAX_SAFE_INTEGER);
      const window = lower.slice(idx, Math.min(lower.length, idx + 1200));
      if (!has(window, VERIFY_HINTS)) {
        missingVerifications.push(step.kind);
        details.push(`Step "${step.kind}" lacks a verification cue.`);
      }
    }
  }

  const presentCount = steps.length - missingSteps.length;
  const unmetFloor = presentCount < opts.minMandatory;
  if (unmetFloor) {
    details.push(
      `Only ${presentCount}/${steps.length} prescribed steps present; floor=${opts.minMandatory}.`,
    );
  }

  return {
    ok: missingSteps.length === 0 && missingVerifications.length === 0 && !unmetFloor,
    missingSteps,
    missingVerifications,
    unmetFloor,
    details,
  };
}

/**
 * Build a focused repair prompt. The prompt explicitly tells the model to
 * keep the parts that already work and only append/insert the missing
 * elements at the correct positions in the trajectory.
 */
export function buildRepairPrompt(
  originalContent: string,
  steps: IntegrityStep[],
  report: IntegrityReport,
): string {
  const requiredList = steps.map((s, i) =>
    `${i + 1}. ${s.kind}${s.mustVerify ? " (must end with a verification question)" : ""}`
  ).join("\n");

  return [
    "You produced an adaptive lesson that violates the deterministic teaching contract.",
    "Repair the lesson by amending the original output. PRESERVE everything that",
    "already complies — do not regenerate from scratch and do not change the regime.",
    "",
    "=== REQUIRED TRAJECTORY (in order) ===",
    requiredList,
    "",
    report.missingSteps.length
      ? `Missing step(s) to insert at the correct position: ${report.missingSteps.join(", ")}`
      : "",
    report.missingVerifications.length
      ? `Steps missing a verification cue (append one): ${report.missingVerifications.join(", ")}`
      : "",
    report.unmetFloor
      ? "The total number of present mandatory steps is below the contract floor — add the missing steps."
      : "",
    "",
    "=== ORIGINAL LESSON (amend this) ===",
    originalContent,
    "",
    "Return only the repaired lesson, fully formatted, with every required step",
    "labelled by its kind. Do not include meta commentary.",
  ].filter(Boolean).join("\n");
}

/** Cheap "did the repair help?" comparator. */
export function repairImproved(before: IntegrityReport, after: IntegrityReport): boolean {
  const beforeScore = before.missingSteps.length + before.missingVerifications.length + (before.unmetFloor ? 1 : 0);
  const afterScore  = after.missingSteps.length  + after.missingVerifications.length  + (after.unmetFloor  ? 1 : 0);
  return afterScore < beforeScore;
}

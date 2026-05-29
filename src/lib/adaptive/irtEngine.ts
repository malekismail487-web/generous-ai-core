/**
 * irtEngine.ts — client-side bridge to the server's Rasch/1PL ability engine.
 *
 * All math runs in the `ability-update` edge function under the service role
 * so a student cannot tamper with their own theta. This module just wraps the
 * call, applies basic caching, and exposes a "read current level" helper for
 * UI / prompt-injection code.
 *
 * Returned `level` is derived from theta:
 *   theta < -0.5  → "beginner"
 *   -0.5..+0.5    → "intermediate"
 *   theta >  0.5  → "advanced"
 *
 * Until SE drops below 0.4 the estimate is `provisional` — prompt builders
 * should widen their teaching range in that case rather than commit to a band.
 */

import { supabase } from "@/integrations/supabase/client";
import { bumpProfile } from "@/lib/adaptiveProfileBus";

export type DerivedLevel = "beginner" | "intermediate" | "advanced";

export interface AbilitySnapshot {
  theta: number;
  theta_se: number;
  provisional: boolean;
  graded_count: number;
  level: DerivedLevel;
}

export interface AbilityUpdateResult extends AbilitySnapshot {
  expected_p: number;
  question_id: string;
}

interface UpdateInput {
  subject: string;
  questionText: string;
  isCorrect: boolean;
  correctAnswer?: string | null;
  studentAnswer?: string | null;
  conceptId?: string | null;
  source?: "quiz" | "assignment" | "exam" | "probe";
  responseTimeMs?: number;
  difficultyHint?: "easy" | "medium" | "hard";
}

/**
 * Update the student's ability estimate after a graded answer.
 * Never call this for chat messages — chat is engagement, not assessment.
 */
export async function recordGradedAnswer(
  input: UpdateInput,
): Promise<AbilityUpdateResult | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ability-update`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          subject: input.subject,
          questionText: input.questionText,
          correctAnswer: input.correctAnswer ?? null,
          studentAnswer: input.studentAnswer ?? null,
          isCorrect: input.isCorrect,
          conceptId: input.conceptId ?? null,
          source: input.source ?? "quiz",
          responseTimeMs: input.responseTimeMs,
          difficultyHint: input.difficultyHint ?? "medium",
        }),
      },
    );

    if (!res.ok) {
      console.warn("[irtEngine] non-2xx from ability-update:", res.status);
      return null;
    }

    const json = (await res.json()) as AbilityUpdateResult;
    bumpProfile("graded_answer", input.subject);
    return json;
  } catch (err) {
    console.warn("[irtEngine] update failed:", err);
    return null;
  }
}

/**
 * Read the student's current ability snapshot for a subject.
 * Subject-level estimate (concept_id IS NULL). Returns null if the student
 * has no estimate yet — callers should treat that as cold-start.
 */
export async function getAbilitySnapshot(
  userId: string,
  subject: string,
): Promise<AbilitySnapshot | null> {
  const { data, error } = await supabase
    .from("ability_estimates")
    .select("theta, theta_se, provisional, graded_count")
    .eq("user_id", userId)
    .eq("subject", subject.toLowerCase())
    .is("concept_id", null)
    .maybeSingle();

  if (error || !data) return null;

  const theta = Number(data.theta);
  return {
    theta,
    theta_se: Number(data.theta_se),
    provisional: Boolean(data.provisional),
    graded_count: data.graded_count ?? 0,
    level: deriveLevel(theta),
  };
}

/** Pull every subject estimate for a student in one query. */
export async function getAllAbilitySnapshots(
  userId: string,
): Promise<Record<string, AbilitySnapshot>> {
  const { data } = await supabase
    .from("ability_estimates")
    .select("subject, theta, theta_se, provisional, graded_count, concept_id")
    .eq("user_id", userId)
    .is("concept_id", null);

  const out: Record<string, AbilitySnapshot> = {};
  for (const row of data ?? []) {
    const theta = Number(row.theta);
    out[row.subject] = {
      theta,
      theta_se: Number(row.theta_se),
      provisional: Boolean(row.provisional),
      graded_count: row.graded_count ?? 0,
      level: deriveLevel(theta),
    };
  }
  return out;
}

export function deriveLevel(theta: number): DerivedLevel {
  if (!Number.isFinite(theta)) return "intermediate";
  if (theta < -0.5) return "beginner";
  if (theta > 0.5) return "advanced";
  return "intermediate";
}

/**
 * Build a precise prompt fragment for AI features. When the estimate is still
 * provisional we deliberately tell the model to teach across a wider range
 * rather than over-commit to a level we don't yet trust.
 */
export function buildAbilityPromptFragment(snap: AbilitySnapshot | null): string {
  if (!snap) {
    return "The student has no measured ability yet — teach at an intermediate baseline and probe their level naturally as you go.";
  }
  if (snap.provisional) {
    const lo = deriveLevel(snap.theta - snap.theta_se);
    const hi = deriveLevel(snap.theta + snap.theta_se);
    if (lo === hi) {
      return `The student is provisionally at the ${snap.level.toUpperCase()} level (ability ${snap.theta.toFixed(2)}, confidence still building). Teach at this level but watch for signals that contradict it.`;
    }
    return `The student's level is still being measured. Their ability is somewhere between ${lo.toUpperCase()} and ${hi.toUpperCase()}. Teach toward the middle and adjust if you see clear evidence either way.`;
  }
  return `The student is confirmed at the ${snap.level.toUpperCase()} level (calibrated ability ${snap.theta.toFixed(2)}, SE ${snap.theta_se.toFixed(2)}, ${snap.graded_count} graded answers). Match their pace precisely — do not under- or over-explain.`;
}

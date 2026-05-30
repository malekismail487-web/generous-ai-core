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

export interface ConceptAbilitySnapshot extends AbilitySnapshot {
  concept_id: string;
  concept_name: string;
}

/**
 * Read every concept-level ability estimate the student has in a subject.
 * Returned sorted by graded_count desc so the most-evidenced concepts
 * surface first to the prompt builder.
 */
export async function getConceptAbilities(
  userId: string,
  subject: string,
): Promise<ConceptAbilitySnapshot[]> {
  const { data, error } = await supabase
    .from("ability_estimates")
    .select("concept_id, theta, theta_se, provisional, graded_count")
    .eq("user_id", userId)
    .eq("subject", subject.toLowerCase())
    .not("concept_id", "is", null);

  if (error || !data) return [];

  const out: ConceptAbilitySnapshot[] = [];
  for (const row of data) {
    const conceptId = row.concept_id as string;
    const theta = Number(row.theta);
    const name = conceptId.includes(":")
      ? conceptId.slice(conceptId.indexOf(":") + 1)
      : conceptId;
    out.push({
      concept_id: conceptId,
      concept_name: name,
      theta,
      theta_se: Number(row.theta_se),
      provisional: Boolean(row.provisional),
      graded_count: row.graded_count ?? 0,
      level: deriveLevel(theta),
    });
  }
  out.sort((a, b) => b.graded_count - a.graded_count);
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

/**
 * Build a per-concept fragment that calls out the student's relative strengths
 * and weaknesses inside a subject. Skipped silently when the student doesn't
 * have enough concept-level evidence yet (no concepts with >= 3 graded answers).
 *
 * Output is short and actionable so the model can use it directly without
 * having to mentally diff theta values:
 *   "Strong on linear equations (+0.81); weak on word problems (-0.62)."
 */
export function buildConceptAbilitiesFragment(
  concepts: ConceptAbilitySnapshot[],
  subjectTheta: number | null,
): string {
  if (!concepts.length) return "";

  // Only keep concepts with at least a little evidence — provisional ones
  // with 1-2 attempts are basically just the subject prior and add noise.
  const evidenced = concepts.filter((c) => c.graded_count >= 3);
  if (!evidenced.length) return "";

  const reference = subjectTheta ?? 0;
  // Strong = clearly above subject baseline; weak = clearly below.
  const strong = evidenced
    .filter((c) => c.theta - reference >= 0.4)
    .sort((a, b) => b.theta - a.theta)
    .slice(0, 3);
  const weak = evidenced
    .filter((c) => reference - c.theta >= 0.4)
    .sort((a, b) => a.theta - b.theta)
    .slice(0, 3);

  if (!strong.length && !weak.length) {
    // Student is evenly skilled across measured concepts — say so plainly.
    return `Student's measured concepts inside this subject are all clustered near their overall level (${reference.toFixed(2)}). No standout strengths or weaknesses yet.`;
  }

  const parts: string[] = [];
  if (strong.length) {
    parts.push(
      "Strong on " +
        strong
          .map((c) => `${c.concept_name} (${c.theta >= 0 ? "+" : ""}${c.theta.toFixed(2)})`)
          .join(", "),
    );
  }
  if (weak.length) {
    parts.push(
      "weak on " +
        weak
          .map((c) => `${c.concept_name} (${c.theta >= 0 ? "+" : ""}${c.theta.toFixed(2)})`)
          .join(", "),
    );
  }
  return parts.join("; ") + ". Lean into the strong concepts when bridging new material, and slow down or scaffold when touching the weak ones.";
}

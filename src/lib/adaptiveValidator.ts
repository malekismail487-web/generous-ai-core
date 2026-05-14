/**
 * Adaptive output validator (Phase 1 of the Lumina accuracy push).
 *
 * After any AI feature finishes generating content for a student, call
 * `validateAdaptation(...)` to score how well the output matched the student's
 * adaptive profile. The result is logged server-side to
 * `public.adaptive_quality_scores` and surfaced for optional regeneration.
 *
 * Design notes:
 *  - Fail OPEN. The validator never blocks user-facing flows. Network or model
 *    errors return `{ score: null, shouldRegenerate: false }`.
 *  - Skip validation for trivially short outputs (< 40 chars) — handled
 *    server-side, but we also short-circuit here to avoid a wasted call.
 *  - The caller is responsible for actually running the regeneration with
 *    `addendum` prepended to the system prompt. This module just judges.
 */

import { supabase } from "@/integrations/supabase/client";
import type { StudentIntelligenceProfile } from "@/lib/adaptiveIntelligence";
import { bumpProfile } from "@/lib/adaptiveProfileBus";

export interface AdaptiveProfileSnapshot {
  adaptiveLevel?: string;
  dominantStyle?: string;
  cognitiveLoad?: number;
  fatigueLevel?: number;
  forbiddenPatterns?: string[];
}

export interface ValidationResult {
  score: number | null;
  dimensions: {
    vocabulary_match: number;
    modality_match: number;
    density_match: number;
    forbidden_clean: number;
  } | null;
  failures: string[];
  addendum: string;
  shouldRegenerate: boolean;
  error?: string;
  skipped?: string;
}

/**
 * Build a compact profile snapshot from the full StudentIntelligenceProfile.
 * Only the fields the validator actually uses — keeps the round-trip small.
 */
export function snapshotFromProfile(
  profile: Partial<StudentIntelligenceProfile> | null | undefined,
  overrides: Partial<AdaptiveProfileSnapshot> = {},
): AdaptiveProfileSnapshot {
  const level =
    overrides.adaptiveLevel ||
    (profile as any)?.overallLevel ||
    "intermediate";
  const style =
    overrides.dominantStyle ||
    (profile as any)?.dominantStyle ||
    "balanced";
  return {
    adaptiveLevel: String(level),
    dominantStyle: String(style),
    cognitiveLoad: overrides.cognitiveLoad,
    fatigueLevel: overrides.fatigueLevel,
    forbiddenPatterns: overrides.forbiddenPatterns,
  };
}

/**
 * Score an AI output against the student's adaptive profile.
 *
 * @param params.output            The AI-generated text to judge.
 * @param params.feature           Short feature identifier (e.g. "subject_lecture", "study_buddy").
 * @param params.subject           Optional subject name.
 * @param params.profile           AdaptiveProfileSnapshot — see snapshotFromProfile().
 * @param params.regenerated       Set true on the *second* validation pass so it
 *                                 won't recommend yet another regeneration.
 */
export async function validateAdaptation(params: {
  output: string;
  feature: string;
  subject?: string;
  profile: AdaptiveProfileSnapshot;
  regenerated?: boolean;
}): Promise<ValidationResult> {
  const { output, feature, subject, profile, regenerated = false } = params;

  if (!output || output.trim().length < 40) {
    return {
      score: 1,
      dimensions: {
        vocabulary_match: 1,
        modality_match: 1,
        density_match: 1,
        forbidden_clean: 1,
      },
      failures: [],
      addendum: "",
      shouldRegenerate: false,
      skipped: "too_short",
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke("adaptive-validate", {
      body: {
        output,
        feature,
        subject: subject ?? null,
        profile_snapshot: profile,
        regenerated,
      },
    });

    if (error) {
      return failOpen(error.message);
    }
    if (!data || typeof data !== "object") {
      return failOpen("empty_response");
    }

    const result: ValidationResult = {
      score: typeof data.score === "number" ? data.score : null,
      dimensions: data.dimensions ?? null,
      failures: Array.isArray(data.failures) ? data.failures : [],
      addendum: typeof data.addendum === "string" ? data.addendum : "",
      shouldRegenerate: !!data.should_regenerate,
      error: data.error,
      skipped: data.skipped,
    };

    // Phase 1↔3 bridge: a low quality score means the profile we used to
    // shape the prompt was probably stale. Invalidate so the regeneration
    // (and any subsequent feature in this session) builds on fresh signals.
    if (
      !regenerated &&
      result.shouldRegenerate &&
      typeof result.score === "number" &&
      result.score < 0.85
    ) {
      try { bumpProfile("low_quality_score", `${feature}=${result.score.toFixed(2)}`); } catch { /* ignore */ }
    }

    return result;
  } catch (err) {
    return failOpen((err as Error).message);
  }
}

function failOpen(message: string): ValidationResult {
  return {
    score: null,
    dimensions: null,
    failures: [],
    addendum: "",
    shouldRegenerate: false,
    error: message,
  };
}

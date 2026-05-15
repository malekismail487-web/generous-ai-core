/**
 * helpfulnessSignal.ts — Phase 4
 *
 * Records per-output helpfulness signals (explicit thumbs / reason chips and
 * implicit dwell / regen / followup signals) into `ai_output_signals`.
 *
 * Side effects, by design:
 *   - Negative explicit signals invalidate the profile bus so the next
 *     generation re-reads a fresh profile (Phase 3 bridge).
 *   - When a topic is supplied, the recorded outcome is also fed into the
 *     teaching-strategy tracker, so subsequent strategy selection learns
 *     which approach actually helped this learner.
 *
 * Fail-open: every error path is swallowed. Helpfulness logging never blocks
 * a user-facing flow.
 */

import { supabase } from "@/integrations/supabase/client";
import { bumpProfile } from "@/lib/adaptiveProfileBus";
import { recordStrategyOutcome } from "@/lib/adaptive/teachingStrategyTracker";

export type HelpfulnessSignal =
  | "up"
  | "down"
  | "too_easy"
  | "too_hard"
  | "confusing"
  | "perfect"
  | "off_topic"
  | "implicit_dwell_positive"
  | "implicit_regen"
  | "implicit_followup_confused";

export const NEGATIVE_SIGNALS: ReadonlySet<HelpfulnessSignal> = new Set([
  "down",
  "too_hard",
  "confusing",
  "off_topic",
  "implicit_regen",
  "implicit_followup_confused",
]);

export const POSITIVE_SIGNALS: ReadonlySet<HelpfulnessSignal> = new Set([
  "up",
  "perfect",
  "implicit_dwell_positive",
]);

export interface RecordHelpfulnessParams {
  feature: string;
  subject?: string;
  topic?: string;
  output: string;
  signal: HelpfulnessSignal;
  reason?: string;
  profileSnapshot?: Record<string, unknown>;
}

/**
 * Cheap deterministic hash for the output text (32-bit FNV-1a, hex).
 * Keeps the same output collapsed under the same hash so we can detect
 * repeated signals about the same content.
 */
export function hashOutput(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Unsigned 32-bit hex
  return (h >>> 0).toString(16).padStart(8, "0");
}

export async function recordHelpfulness(
  params: RecordHelpfulnessParams,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const {
      feature,
      subject,
      topic,
      output,
      signal,
      reason,
      profileSnapshot,
    } = params;

    if (!output || output.trim().length < 1) {
      return { ok: false, error: "empty_output" };
    }

    // Resolve user + school for the row. RLS will reject if user_id mismatches.
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return { ok: false, error: "no_user" };

    let schoolId: string | null = null;
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("school_id")
        .eq("id", userId)
        .maybeSingle();
      schoolId = (prof as any)?.school_id ?? null;
    } catch { /* ignore — school is optional */ }

    const excerpt = output.slice(0, 500);
    const output_hash = hashOutput(output);

    const { data, error } = await supabase
      .from("ai_output_signals")
      .insert({
        user_id: userId,
        school_id: schoolId,
        feature,
        subject: subject ?? null,
        topic: topic ?? null,
        output_hash,
        output_excerpt: excerpt,
        signal,
        reason: reason ?? null,
        profile_snapshot: profileSnapshot ?? null,
      })
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };

    // Phase 3 bridge: a negative signal means whatever profile shaped this
    // output didn't actually help — invalidate so the next call re-reads.
    if (NEGATIVE_SIGNALS.has(signal)) {
      try { bumpProfile("helpfulness_negative", `${feature}=${signal}`); } catch { /* ignore */ }
    } else if (signal === "up" || signal === "perfect") {
      // Mild positive bump only on explicit thumbs-up / perfect. Implicit
      // dwell is too noisy to invalidate on.
      try { bumpProfile("helpfulness_positive", `${feature}=${signal}`); } catch { /* ignore */ }
    }

    // Teaching-strategy outcome: feed into the strategy tracker so it learns
    // which strategy worked for this learner. We use thumbs-up as "correct"
    // and any negative signal as "wrong" — matches the tracker's binary API.
    if (topic && subject) {
      try {
        recordStrategyOutcome({
          topic,
          subject,
          isCorrect: POSITIVE_SIGNALS.has(signal),
        });
      } catch { /* ignore */ }
    }

    return { ok: true, id: (data as any)?.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

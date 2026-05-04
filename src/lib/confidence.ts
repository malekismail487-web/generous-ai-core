import { supabase } from "@/integrations/supabase/client";
import { notifyMasteryUpdated } from "@/lib/mastery";

export type ConfidenceSource =
  | "assignment"
  | "exam"
  | "ai_quiz"
  | "lct"
  | "refresher";

export interface RecordConfidenceArgs {
  subject?: string | null;
  topic?: string | null;
  question_id?: string | null;
  question_text?: string | null;
  confidence_level: 1 | 2 | 3 | 4;
  was_correct: boolean;
  source: ConfidenceSource;
  update_mastery?: boolean;
}

/**
 * Records a confidence response. Fire-and-forget safe — never throws into UI.
 * Returns mastery_id when applicable.
 */
export async function recordConfidence(
  args: RecordConfidenceArgs,
): Promise<{ ok: boolean; mastery_id?: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke(
      "confidence-record",
      { body: args },
    );
    if (error) return { ok: false };
    return { ok: true, mastery_id: (data as any)?.mastery_id ?? null };
  } catch {
    return { ok: false };
  }
}

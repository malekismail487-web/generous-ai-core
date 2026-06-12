// ============================================================================
//  ktSequence.ts  —  shared helpers for maintaining `kt_sequence_state`.
//  Used by `ability-update` to push the latest interaction onto the rolling
//  window after every graded answer. Kept tiny and side-effect-free except
//  for the explicit DB call so it can be unit-tested.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { KtInteraction } from "./aktLite.ts";

export const KT_MAX_SEQ_LEN = 256;

/**
 * Append one interaction to the rolling window. Older entries beyond
 * KT_MAX_SEQ_LEN are dropped. Returns the new sequence length.
 *
 * Designed to be a no-throw helper — if anything goes wrong we swallow
 * the error and return null so the parent (ability-update) never fails
 * a grade just because the KT sidecar couldn't write.
 */
export async function pushKtInteraction(
  admin: SupabaseClient,
  args: {
    userId: string;
    schoolId: string | null;
    subject: string;
    interaction: KtInteraction;
  },
): Promise<number | null> {
  try {
    const { data: existing } = await admin
      .from("kt_sequence_state")
      .select("id, interactions, seq_len")
      .eq("user_id", args.userId).eq("subject", args.subject)
      .maybeSingle();

    const prev: KtInteraction[] = Array.isArray(existing?.interactions)
      ? (existing!.interactions as KtInteraction[])
      : [];
    const next = prev.concat(args.interaction).slice(-KT_MAX_SEQ_LEN);

    if (existing?.id) {
      const { error } = await admin
        .from("kt_sequence_state")
        .update({ interactions: next, seq_len: next.length })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await admin
        .from("kt_sequence_state")
        .insert({
          user_id: args.userId,
          school_id: args.schoolId,
          subject: args.subject,
          interactions: next,
          seq_len: next.length,
        });
      if (error) throw error;
    }
    return next.length;
  } catch (err) {
    console.error("[ktSequence] push failed (non-fatal):", err);
    return null;
  }
}

// ============================================================================
//  fsrsState.ts — load/persist FSRS-v5 card state for the ability-update loop.
//  Mirrors `ktSequence.ts` in spirit: tiny, no-throw, scoped to one (user,
//  subject, concept) triple.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { newFsrsCard, fsrsUpdate, fsrsNextInterval, type FsrsCard, type FsrsRating } from "./fsrs.ts";

export async function loadFsrsCard(
  admin: SupabaseClient,
  userId: string,
  subject: string,
  conceptId: string | null,
): Promise<{ card: FsrsCard; rowId: string | null }> {
  let q = admin.from("fsrs_card_state")
    .select("id, stability, difficulty, reps, lapses, last_review_at")
    .eq("user_id", userId).eq("subject", subject);
  q = conceptId === null ? q.is("concept_id", null) : q.eq("concept_id", conceptId);
  const { data } = await q.maybeSingle();
  if (!data) return { card: newFsrsCard(), rowId: null };
  return {
    card: {
      S: Number(data.stability ?? 0),
      D: Number(data.difficulty ?? 0),
      reps: data.reps ?? 0,
      lapses: data.lapses ?? 0,
      lastReviewMs: data.last_review_at ? new Date(data.last_review_at).getTime() : 0,
    },
    rowId: data.id,
  };
}

export async function persistFsrsCard(
  admin: SupabaseClient,
  args: {
    userId: string;
    schoolId: string | null;
    subject: string;
    conceptId: string | null;
    isCorrect: boolean;
    /** optional explicit rating override (1..4). */
    rating?: FsrsRating;
    fastResponse?: boolean;
    nowMs?: number;
  },
): Promise<FsrsCard | null> {
  try {
    const nowMs = args.nowMs ?? Date.now();
    const { card, rowId } = await loadFsrsCard(admin, args.userId, args.subject, args.conceptId);
    const rating: FsrsRating = args.rating
      ?? (args.isCorrect ? (args.fastResponse ? 4 : 3) : 1);
    const next = fsrsUpdate(card, rating, nowMs);
    const nextDays = fsrsNextInterval(next.S, 0.9);
    const nextReviewAt = new Date(nowMs + nextDays * 86400000).toISOString();
    const row = {
      user_id: args.userId,
      school_id: args.schoolId,
      subject: args.subject,
      concept_id: args.conceptId,
      stability: Number(next.S.toFixed(4)),
      difficulty: Number(next.D.toFixed(4)),
      reps: next.reps,
      lapses: next.lapses,
      last_review_at: new Date(nowMs).toISOString(),
      next_review_at: nextReviewAt,
      request_retention: 0.9,
      updated_at: new Date().toISOString(),
    };
    if (rowId) {
      const { error } = await admin.from("fsrs_card_state").update(row).eq("id", rowId);
      if (error) throw error;
    } else {
      const { error } = await admin.from("fsrs_card_state").insert(row);
      if (error) throw error;
    }
    return next;
  } catch (err) {
    console.error("[fsrsState] persist failed (non-fatal):", err);
    return null;
  }
}

// ============================================================================
//  fsrsState.ts — load/persist FSRS-v5 card state for the ability-update loop.
//  Stage 5: now applies the scheduler layer (Anki-style fuzz, leech detection,
//  priority precompute) so the get_fsrs_due_cards surface and the teaching
//  pipeline see a fully realistic schedule, not a brittle one-card optimum.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  newFsrsCard,
  fsrsUpdate,
  fsrsNextInterval,
  fsrsRetrievability,
  type FsrsCard,
  type FsrsRating,
} from "./fsrs.ts";
import {
  applyFuzz,
  detectLeech,
  priorityScore,
} from "./fsrsScheduler.ts";

export async function loadFsrsCard(
  admin: SupabaseClient,
  userId: string,
  subject: string,
  conceptId: string | null,
): Promise<{ card: FsrsCard; rowId: string | null; isLeech: boolean; suspendedUntilMs: number | null }> {
  let q = admin.from("fsrs_card_state")
    .select("id, stability, difficulty, reps, lapses, last_review_at, is_leech, suspended_until")
    .eq("user_id", userId).eq("subject", subject);
  q = conceptId === null ? q.is("concept_id", null) : q.eq("concept_id", conceptId);
  const { data } = await q.maybeSingle();
  if (!data) {
    return { card: newFsrsCard(), rowId: null, isLeech: false, suspendedUntilMs: null };
  }
  return {
    card: {
      S: Number(data.stability ?? 0),
      D: Number(data.difficulty ?? 0),
      reps: data.reps ?? 0,
      lapses: data.lapses ?? 0,
      lastReviewMs: data.last_review_at ? new Date(data.last_review_at).getTime() : 0,
    },
    rowId: data.id,
    isLeech: !!data.is_leech,
    suspendedUntilMs: data.suspended_until ? new Date(data.suspended_until).getTime() : null,
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
    /** optional override for request retention; default 0.9 (FSRS author). */
    requestRetention?: number;
  },
): Promise<FsrsCard | null> {
  try {
    const nowMs = args.nowMs ?? Date.now();
    const prev = await loadFsrsCard(admin, args.userId, args.subject, args.conceptId);

    const rating: FsrsRating = args.rating
      ?? (args.isCorrect ? (args.fastResponse ? 4 : 3) : 1);

    // 1. Roll the FSRS state forward.
    const next = fsrsUpdate(prev.card, rating, nowMs);

    // 2. Compute the *raw* interval, then apply Anki-style fuzz so we don't
    //    pile every review onto the same day.
    const retention = args.requestRetention ?? 0.9;
    const rawDays = fsrsNextInterval(next.S, retention);
    const seedKey = `${args.userId}:${args.conceptId ?? args.subject}:${next.reps}`;
    const fuzzedDays = applyFuzz(rawDays, seedKey);
    const nextReviewAt = new Date(nowMs + fuzzedDays * 86400000).toISOString();

    // 3. Leech detection. We only *promote* a card to leech state — we never
    //    auto-unflag, that's a human-in-the-loop decision (a teacher or the
    //    student themselves clearing the flag via the UI).
    const leech = detectLeech(next, nowMs);
    const isLeech = prev.isLeech || leech.isLeech;
    // Suspend only on a fresh-lapse-that-triggered-the-flag transition, so we
    // don't keep re-suspending an already-flagged card every review.
    const suspendedUntilMs =
      (!prev.isLeech && leech.isLeech) ? leech.suspendedUntilMs : (prev.suspendedUntilMs ?? null);

    // 4. Precompute the urgency score so the get_fsrs_due_cards index can
    //    surface it without per-row math.
    const priority = priorityScore({
      retrievability: fsrsRetrievability(next, nowMs + fuzzedDays * 86400000),
      overdueDays: 0,           // freshly scheduled
      stability: next.S,
      difficulty: next.D,
      lapses: next.lapses,
      isLeech,
    });

    const row = {
      user_id:               args.userId,
      school_id:             args.schoolId,
      subject:               args.subject,
      concept_id:            args.conceptId,
      stability:             Number(next.S.toFixed(4)),
      difficulty:            Number(next.D.toFixed(4)),
      reps:                  next.reps,
      lapses:                next.lapses,
      last_review_at:        new Date(nowMs).toISOString(),
      next_review_at:        nextReviewAt,
      request_retention:     retention,
      is_leech:              isLeech,
      suspended_until:       suspendedUntilMs ? new Date(suspendedUntilMs).toISOString() : null,
      fuzzed_interval_days:  Number(fuzzedDays.toFixed(4)),
      priority:              Number(priority.toFixed(6)),
      updated_at:            new Date().toISOString(),
    };
    if (prev.rowId) {
      const { error } = await admin.from("fsrs_card_state").update(row).eq("id", prev.rowId);
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

// ============================================================================
//  review-schedule — Stage 5 surface
// ----------------------------------------------------------------------------
//  Returns the student's prioritized FSRS review queue. The queue is the
//  product of:
//
//     1. `get_fsrs_due_cards` RPC                — DB-side filter + priority
//     2. Workload smoothing (server-side)         — keep daily load ≤ cap
//     3. Optional `mark_delivered` write-back     — so the same card isn't
//                                                   surfaced twice in a session
//
//  Two operations (selected via `?op=`):
//
//     GET  /review-schedule?op=due&limit=20&dailyCap=30
//        → { cards: [...], cappedAt, totalDue }
//
//     POST /review-schedule  { op: "delivered", cardId }
//        → { ok: true }
//
//  Auth: required (anon key is permitted, but JWT must validate). The RPCs
//  this function calls are SECURITY DEFINER and enforce per-user ownership.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { smoothWorkload } from "../_shared/fsrsScheduler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DueQuerySchema = z.object({
  limit:    z.coerce.number().int().min(1).max(200).default(20),
  dailyCap: z.coerce.number().int().min(1).max(500).default(40),
  schoolId: z.string().uuid().optional(),
});

const DeliveredSchema = z.object({
  op:     z.literal("delivered"),
  cardId: z.string().uuid(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing Authorization" }, 401);

  // RLS-respecting client that runs as the caller.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: "invalid token" }, 401);

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const parsed = DueQuerySchema.safeParse(Object.fromEntries(url.searchParams));
      if (!parsed.success) {
        return json({ error: parsed.error.flatten().fieldErrors }, 400);
      }
      const { limit, dailyCap, schoolId } = parsed.data;

      const { data, error } = await userClient.rpc("get_fsrs_due_cards", {
        p_user_id:   user.id,
        p_limit:     limit,
        p_school_id: schoolId ?? null,
      });
      if (error) return json({ error: error.message }, 400);

      const rows = (data ?? []) as Array<{
        card_id: string;
        subject: string;
        concept_id: string | null;
        concept_name: string;
        stability: number;
        difficulty: number;
        reps: number;
        lapses: number;
        is_leech: boolean;
        last_review_at: string | null;
        next_review_at: string | null;
        overdue_hours: number;
        retrievability: number;
        priority: number;
      }>;

      // Smooth the workload across days so we never dump 300 reviews on one
      // morning. Cards already in the past keep their priority — we only
      // defer the *least* urgent of the day.
      const now = Date.now();
      const smoothable = rows.map(r => ({
        cardId:    r.card_id,
        dueAtMs:   r.next_review_at ? new Date(r.next_review_at).getTime() : now,
        priority:  Number(r.priority ?? 0),
      }));
      const smoothed = smoothWorkload(smoothable, dailyCap, now);
      const dueAtById = new Map(smoothed.map(s => [s.cardId, s.dueAtMs]));

      const cards = rows.map(r => ({
        cardId:        r.card_id,
        subject:       r.subject,
        conceptId:     r.concept_id,
        conceptName:   r.concept_name,
        stability:     Number(r.stability),
        difficulty:    Number(r.difficulty),
        reps:          r.reps,
        lapses:        r.lapses,
        isLeech:       r.is_leech,
        retrievability: Number(r.retrievability),
        overdueHours:  Number(r.overdue_hours),
        priority:      Number(r.priority),
        // Effective next-review timestamp *after* workload smoothing.
        nextReviewAt:  new Date(dueAtById.get(r.card_id) ?? now).toISOString(),
      }));

      // Surface basic counters so a UI can render "X due today, Y deferred".
      const dueToday = cards.filter(c =>
        new Date(c.nextReviewAt).getTime() - now < 86_400_000
      ).length;

      return json({
        cards,
        totalDue:  cards.length,
        dueToday,
        cappedAt:  dailyCap,
        generatedAt: new Date().toISOString(),
      });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      const parsed = DeliveredSchema.safeParse(body);
      if (!parsed.success) {
        return json({ error: parsed.error.flatten().fieldErrors }, 400);
      }
      const { error } = await userClient.rpc("record_review_delivered", {
        p_card_id: parsed.data.cardId,
      });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "method not allowed" }, 405);
  } catch (err) {
    console.error("[review-schedule] fatal", err);
    // Service-role fallback only used to surface a clean error envelope; we
    // never bypass the user's RLS for actual data.
    void createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    return json({ error: (err as Error).message ?? "internal error" }, 500);
  }
});

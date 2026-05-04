// Grades a refresher answer and updates concept mastery.
// POST { refresher_id, selected_index, confidence_level? }
//   -> { was_correct, correct_index, mastery_score }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function getUser(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  try {
    const supa = admin();
    const { data: { user } } = await supa.auth.getUser(
      auth.replace("Bearer ", ""),
    );
    if (!user) return null;
    const { data: profile } = await supa.from("profiles")
      .select("school_id").eq("id", user.id).maybeSingle();
    return { id: user.id, schoolId: profile?.school_id ?? null };
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const user = await getUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const refresherId = String(body.refresher_id ?? "");
  const selected = Number(body.selected_index);
  const confidence = body.confidence_level !== undefined ? Number(body.confidence_level) : null;

  if (!refresherId || !Number.isInteger(selected) || selected < 0 || selected > 3) {
    return new Response(JSON.stringify({ error: "bad_request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supa = admin();
  const { data: ref, error: rErr } = await supa
    .from("decay_refreshers")
    .select("id, user_id, concept_mastery_id, correct_index, was_correct")
    .eq("id", refresherId)
    .maybeSingle();
  if (rErr || !ref || ref.user_id !== user.id) {
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (ref.was_correct !== null) {
    return new Response(JSON.stringify({ error: "already_answered" }), {
      status: 409,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const wasCorrect = selected === ref.correct_index;

  await supa.from("decay_refreshers")
    .update({
      selected_index: selected,
      was_correct: wasCorrect,
      answered_at: new Date().toISOString(),
    })
    .eq("id", refresherId);

  // Pull concept for subject/topic
  const { data: concept } = await supa.from("concept_mastery")
    .select("subject, topic, mastery_score").eq("id", ref.concept_mastery_id).maybeSingle();

  let newScore: number | null = concept?.mastery_score ?? null;
  if (concept) {
    await supa.rpc("update_concept_mastery", {
      p_user_id: user.id,
      p_school_id: user.schoolId,
      p_subject: concept.subject,
      p_topic: concept.topic,
      p_was_correct: wasCorrect,
    });
    const { data: updated } = await supa.from("concept_mastery")
      .select("mastery_score").eq("id", ref.concept_mastery_id).maybeSingle();
    newScore = updated?.mastery_score ?? newScore;

    if (confidence !== null && confidence >= 1 && confidence <= 4) {
      await supa.from("confidence_responses").insert({
        user_id: user.id,
        school_id: user.schoolId,
        subject: concept.subject,
        topic: concept.topic,
        question_id: refresherId,
        confidence_level: Math.round(confidence),
        was_correct: wasCorrect,
        source: "refresher",
      });
    }
  }

  return new Response(
    JSON.stringify({
      was_correct: wasCorrect,
      correct_index: ref.correct_index,
      mastery_score: newScore,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

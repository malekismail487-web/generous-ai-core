// Records a confidence response and (optionally) updates concept mastery.
// POST { subject?, topic?, question_id?, question_text?, confidence_level (1-4),
//        was_correct, source, update_mastery? }
//   -> { ok: true, mastery_id?: uuid }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_SOURCES = new Set([
  "assignment",
  "exam",
  "ai_quiz",
  "lct",
  "refresher",
]);

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
      .select("school_id")
      .eq("id", user.id).maybeSingle();
    return { id: user.id, schoolId: profile?.school_id ?? null };
  } catch {
    return null;
  }
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
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const confidence = Number(body.confidence_level);
  const wasCorrect = Boolean(body.was_correct);
  const source = String(body.source ?? "");
  const subject = body.subject ? String(body.subject).slice(0, 120) : null;
  const topic = body.topic ? String(body.topic).slice(0, 240) : null;
  const questionId = body.question_id ? String(body.question_id).slice(0, 120) : null;
  const questionText = body.question_text
    ? String(body.question_text).slice(0, 4000)
    : null;
  const updateMastery = body.update_mastery !== false;

  if (!Number.isFinite(confidence) || confidence < 1 || confidence > 4) {
    return new Response(
      JSON.stringify({ error: "confidence_level must be 1..4" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  if (!ALLOWED_SOURCES.has(source)) {
    return new Response(JSON.stringify({ error: "invalid_source" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supa = admin();

  const { error: insertErr } = await supa.from("confidence_responses").insert({
    user_id: user.id,
    school_id: user.schoolId,
    subject,
    topic,
    question_id: questionId,
    question_text: questionText,
    confidence_level: Math.round(confidence),
    was_correct: wasCorrect,
    source,
  });
  if (insertErr) {
    return new Response(JSON.stringify({ error: insertErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let masteryId: string | null = null;
  if (updateMastery && subject && topic) {
    const { data, error } = await supa.rpc("update_concept_mastery", {
      p_user_id: user.id,
      p_school_id: user.schoolId,
      p_subject: subject,
      p_topic: topic,
      p_was_correct: wasCorrect,
    });
    if (!error) masteryId = data as string;
  }

  return new Response(
    JSON.stringify({ ok: true, mastery_id: masteryId }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

// Generates a single MCQ refresher for a decaying concept.
// POST { concept_mastery_id }
//   -> { refresher_id, question_text, options: string[], correct_index }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function getUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  try {
    const supa = admin();
    const { data: { user } } = await supa.auth.getUser(
      auth.replace("Bearer ", ""),
    );
    return user?.id ?? null;
  } catch {
    return null;
  }
}

async function callAIWithRetry(payload: unknown): Promise<Response> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (r.status !== 429 && r.status !== 402) return r;
    await new Promise((res) => setTimeout(res, 500 + attempt * 800));
  }
  return await fetch(AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = await getUserId(req);
  if (!userId) {
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

  const masteryId = String(body.concept_mastery_id ?? "");
  if (!masteryId) {
    return new Response(JSON.stringify({ error: "concept_mastery_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supa = admin();
  const { data: concept, error: cErr } = await supa
    .from("concept_mastery")
    .select("id, user_id, subject, topic, mastery_score")
    .eq("id", masteryId)
    .maybeSingle();

  if (cErr || !concept || concept.user_id !== userId) {
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Anti-farming: max 3 refreshers per concept per 24h
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await supa
    .from("decay_refreshers")
    .select("id", { count: "exact", head: true })
    .eq("concept_mastery_id", masteryId)
    .gte("created_at", since);
  if ((count ?? 0) >= 3) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const aiRes = await callAIWithRetry({
    model: MODEL,
    temperature: 0.85,
    messages: [
      {
        role: "system",
        content:
          "You are a concise tutor. Generate ONE multiple-choice review question (4 options, exactly one correct). Return STRICT JSON: {\"question\":\"...\",\"options\":[\"a\",\"b\",\"c\",\"d\"],\"correct_index\":0}. No prose, no markdown.",
      },
      {
        role: "user",
        content:
          `Subject: ${concept.subject}\nTopic: ${concept.topic}\nWrite a short, clear review question that tests understanding (not trivia).`,
      },
    ],
  });

  if (!aiRes.ok) {
    return new Response(JSON.stringify({ error: "ai_failed" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const aiJson = await aiRes.json();
  const raw = aiJson?.choices?.[0]?.message?.content ?? "";
  let parsed: { question?: string; options?: string[]; correct_index?: number } = {};
  try {
    const cleaned = String(raw).replace(/```json|```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return new Response(JSON.stringify({ error: "ai_parse_failed" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const q = String(parsed.question ?? "").trim();
  const opts = Array.isArray(parsed.options)
    ? parsed.options.map((o) => String(o)).slice(0, 4)
    : [];
  const correctIdx = Number(parsed.correct_index);
  if (!q || opts.length !== 4 || !Number.isInteger(correctIdx) || correctIdx < 0 || correctIdx > 3) {
    return new Response(JSON.stringify({ error: "ai_invalid_shape" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: inserted, error: insErr } = await supa
    .from("decay_refreshers")
    .insert({
      user_id: userId,
      concept_mastery_id: masteryId,
      question_text: q,
      options_json: opts,
      correct_index: correctIdx,
    })
    .select("id")
    .single();

  if (insErr) {
    return new Response(JSON.stringify({ error: insErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      refresher_id: inserted.id,
      question_text: q,
      options: opts,
      // correct_index intentionally not returned to client; graded server-side
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

// Teach-Back Mode — student writes an explanation; AI grades on 4 rubrics (0-25 each).
// POST { subject, topic, explanation } -> { session_id, scores, total, feedback, completed }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

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
    const { data: { user } } = await supa.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return null;
    const { data: profile } = await supa.from("profiles")
      .select("school_id").eq("id", user.id).maybeSingle();
    return { id: user.id, schoolId: profile?.school_id ?? null };
  } catch { return null; }
}

async function callAIWithRetry(messages: any[], schema: any) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("missing_api_key");
  const body = {
    model: "google/gemini-2.5-flash",
    messages,
    tools: [{ type: "function", function: schema }],
    tool_choice: { type: "function", function: { name: schema.name } },
    temperature: 0.4,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 429 || res.status === 402) {
      if (attempt === 0) { await new Promise(r => setTimeout(r, 1500)); continue; }
      throw new Error(res.status === 429 ? "rate_limited" : "credits_exhausted");
    }
    if (!res.ok) throw new Error(`ai_error_${res.status}`);
    const data = await res.json();
    const tc = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!tc) throw new Error("no_tool_call");
    return JSON.parse(tc.function.arguments);
  }
  throw new Error("retry_exhausted");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), {
    status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  const user = await getUser(req);
  if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const subject = String(body.subject ?? "").slice(0, 120).trim();
  const topic = String(body.topic ?? "").slice(0, 240).trim();
  const explanation = String(body.explanation ?? "").slice(0, 8000).trim();

  if (!subject || !topic) {
    return new Response(JSON.stringify({ error: "subject_and_topic_required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (explanation.length < 40) {
    return new Response(JSON.stringify({ error: "explanation_too_short" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let result: any;
  try {
    result = await callAIWithRetry([
      {
        role: "system",
        content: "You are a strict but fair teacher grading a student's spoken-style explanation of a topic. Grade four rubrics, each 0-25:\n- clarity: how clearly written\n- accuracy: are the facts correct\n- completeness: does it cover the core concept\n- examples: does it use concrete examples or analogies\nReturn an integer for each plus a 2-3 sentence feedback that is specific and actionable.",
      },
      {
        role: "user",
        content: `Subject: ${subject}\nTopic: ${topic}\n\nStudent explanation:\n"""${explanation}"""`,
      },
    ], {
      name: "grade_teach_back",
      description: "Grade the student's teach-back explanation",
      parameters: {
        type: "object",
        properties: {
          clarity: { type: "integer", minimum: 0, maximum: 25 },
          accuracy: { type: "integer", minimum: 0, maximum: 25 },
          completeness: { type: "integer", minimum: 0, maximum: 25 },
          examples: { type: "integer", minimum: 0, maximum: 25 },
          feedback: { type: "string", maxLength: 600 },
        },
        required: ["clarity", "accuracy", "completeness", "examples", "feedback"],
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const scores = {
    clarity: Number(result.clarity) || 0,
    accuracy: Number(result.accuracy) || 0,
    completeness: Number(result.completeness) || 0,
    examples: Number(result.examples) || 0,
  };
  const total = scores.clarity + scores.accuracy + scores.completeness + scores.examples;
  const wasCorrect = total >= 70;
  const feedback = String(result.feedback ?? "");

  const supa = admin();
  const { data: session, error: insertErr } = await supa.from("learning_mode_sessions").insert({
    user_id: user.id, school_id: user.schoolId, mode: "teach_back",
    subject, topic, status: "completed", score: total,
    turns_json: [{ explanation, scores, feedback }],
    completed_at: new Date().toISOString(),
  }).select("id").single();

  if (insertErr) {
    return new Response(JSON.stringify({ error: insertErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await supa.rpc("update_concept_mastery", {
    p_user_id: user.id, p_school_id: user.schoolId,
    p_subject: subject, p_topic: topic, p_was_correct: wasCorrect,
  });

  return new Response(JSON.stringify({
    session_id: session.id, scores, total, feedback, completed: true,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

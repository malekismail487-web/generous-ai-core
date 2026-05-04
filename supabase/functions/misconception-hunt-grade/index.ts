// Grades Misconception Hunt: compares student marks vs server-stored truth + scores explanations.
// POST { session_id, marks: { [id]: boolean }, explanations: { [id]: string } }
// -> { score, results: [{ id, text, your_mark, truth, explanation_score, rationale }] }

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

async function gradeExplanation(item: any, studentMark: boolean, studentExpl: string) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey || !studentExpl?.trim()) return 0;
  const body = {
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: "Score how well a student's one-sentence reasoning matches the actual rationale. 0=wrong reasoning, 5=clearly correct reasoning. Return only an integer 0-5." },
      { role: "user", content: `Statement: ${item.text}\nActual truth: ${item.truth}\nActual rationale: ${item.rationale}\nStudent marked: ${studentMark}\nStudent reasoning: ${studentExpl}` },
    ],
    temperature: 0.2, max_tokens: 6,
  };
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(LOVABLE_AI_URL, {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 429 || res.status === 402) {
        if (attempt === 0) { await new Promise(r => setTimeout(r, 1200)); continue; }
        return 0;
      }
      if (!res.ok) return 0;
      const data = await res.json();
      const txt = String(data?.choices?.[0]?.message?.content ?? "0").trim();
      const m = txt.match(/[0-5]/);
      return m ? Number(m[0]) : 0;
    }
  } catch { return 0; }
  return 0;
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

  const sessionId = body.session_id ? String(body.session_id) : "";
  const marks = (body.marks && typeof body.marks === "object") ? body.marks : {};
  const explanations = (body.explanations && typeof body.explanations === "object") ? body.explanations : {};

  if (!sessionId) {
    return new Response(JSON.stringify({ error: "session_id_required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supa = admin();
  const { data: session, error } = await supa.from("learning_mode_sessions")
    .select("*").eq("id", sessionId).eq("user_id", user.id).maybeSingle();
  if (error || !session) {
    return new Response(JSON.stringify({ error: "session_not_found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (session.status !== "active" || session.mode !== "misconception_hunt") {
    return new Response(JSON.stringify({ error: "invalid_session_state" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const items = session.turns_json?.[0]?.items ?? [];
  if (!Array.isArray(items) || items.length === 0) {
    return new Response(JSON.stringify({ error: "no_items" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];
  let totalPoints = 0;
  const maxPoints = items.length * 15; // 10 for correct mark + 5 for reasoning

  for (const item of items) {
    const studentMark = Boolean(marks[item.id]);
    const studentExpl = String(explanations[item.id] ?? "").slice(0, 800);
    const correctMark = studentMark === item.truth;
    const explScore = correctMark ? await gradeExplanation(item, studentMark, studentExpl) : 0;
    const itemPoints = (correctMark ? 10 : 0) + explScore;
    totalPoints += itemPoints;
    results.push({
      id: item.id, text: item.text, your_mark: studentMark, truth: item.truth,
      explanation_score: explScore, rationale: item.rationale, correct: correctMark,
    });
  }

  const score = Math.round((totalPoints / maxPoints) * 100);
  const wasCorrect = score >= 70;

  await supa.from("learning_mode_sessions").update({
    status: "completed", score,
    completed_at: new Date().toISOString(),
    turns_json: [{ items, results, marks, explanations }],
  }).eq("id", sessionId);

  await supa.rpc("update_concept_mastery", {
    p_user_id: user.id, p_school_id: session.school_id,
    p_subject: session.subject, p_topic: session.topic, p_was_correct: wasCorrect,
  });

  return new Response(JSON.stringify({ score, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

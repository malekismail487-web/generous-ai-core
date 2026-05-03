// Dream Consolidation — generates a personalized morning briefing for the calling student.
// Pulls last 24h of activity, finds highest-leverage misconception, produces summary + 3-question mini-quiz,
// and seeds the recall_schedule. Idempotent per (user_id, date).
//
// POST /  -> { briefing }   (creates if missing, otherwise returns existing)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function getUser(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  try {
    const supa = admin();
    const { data: { user } } = await supa.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return null;
    const { data: profile } = await supa.from("profiles").select("school_id").eq("id", user.id).maybeSingle();
    return { id: user.id, schoolId: profile?.school_id ?? null };
  } catch { return null; }
}

function safeJson(s: string): any | null {
  try { return JSON.parse(s); } catch {}
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const user = await getUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supa = admin();
  const today = new Date().toISOString().slice(0, 10);

  // Idempotent: return existing if already generated today
  const { data: existing } = await supa.from("morning_briefings")
    .select("*").eq("user_id", user.id).eq("scheduled_for", today).maybeSingle();
  if (existing) {
    return new Response(JSON.stringify({ briefing: existing, cached: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Pull last-24h signals
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [gaps, mirror, profiles] = await Promise.all([
    supa.from("knowledge_gaps").select("subject, topic, gap_description, severity")
      .eq("user_id", user.id).eq("resolved", false).order("severity", { ascending: false }).limit(10),
    supa.from("cognitive_mirror_snapshots").select("subject, question, predicted_misconception, was_correct, prediction_matched, drift_score")
      .eq("user_id", user.id).gte("created_at", since).order("created_at", { ascending: false }).limit(20),
    supa.from("student_learning_profiles").select("subject, difficulty_level, recent_accuracy")
      .eq("user_id", user.id),
  ]);

  const dossier = [
    "## Open knowledge gaps",
    ...(gaps.data ?? []).map((g: any) => `- [${g.severity}] ${g.subject} > ${g.topic}: ${g.gap_description}`),
    "\n## Last-24h Cognitive Mirror snapshots",
    ...(mirror.data ?? []).map((m: any) => `- ${m.subject ?? "?"} | Q: ${(m.question ?? "").slice(0, 100)} | misconception: ${m.predicted_misconception ?? "—"} | correct: ${m.was_correct ?? "—"} | drift: ${m.drift_score ?? "—"}`),
    "\n## Subject performance",
    ...(profiles.data ?? []).map((p: any) => `- ${p.subject}: ${p.difficulty_level} (${p.recent_accuracy ?? "?"}%)`),
  ].join("\n");

  const sys = `You are LUMINA generating a 60-second personal MORNING BRIEFING for a single student.
Identify the SINGLE biggest leverage point — the one misconception or weak topic that, if fixed today, unlocks the most future learning.
Output VALID JSON ONLY with these keys:
{
  "key_insight": "one short sentence — the leverage point",
  "leverage_topic": "subject > topic",
  "briefing_md": "3-4 short paragraphs in markdown, warm, second-person, ending with a clear call-to-action",
  "mini_quiz": [
    { "q": "question text", "choices": ["A","B","C","D"], "answer_index": 0, "explanation": "1 sentence" },
    { "q": "...", "choices": [...], "answer_index": 1, "explanation": "..." },
    { "q": "...", "choices": [...], "answer_index": 2, "explanation": "..." }
  ],
  "recall_items": [
    { "subject": "...", "concept": "...", "reason": "...", "hours_until_due": 6 },
    { "subject": "...", "concept": "...", "reason": "...", "hours_until_due": 24 }
  ]
}
Mini-quiz must have EXACTLY 3 questions and target the leverage_topic. answer_index is 0-3.`;

  const userPrompt = `STUDENT DOSSIER (last 24h):
${dossier || "(no recent activity — produce a gentle warm-up briefing)"}

Today is ${today}. Produce the JSON briefing now.`;

  let aiText = "";
  try {
    const res = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.6,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: sys }, { role: "user", content: userPrompt }],
      }),
    });
    if (res.ok) {
      const j = await res.json();
      aiText = j.choices?.[0]?.message?.content ?? "";
    } else {
      console.warn("AI gateway", res.status);
    }
  } catch (e) {
    console.warn("AI fetch failed", e);
  }

  const parsed = safeJson(aiText) ?? {
    key_insight: "Pick one weak topic and review it for 10 minutes.",
    leverage_topic: "general > review",
    briefing_md: "Good morning! Today's focus: pick one topic you struggled with yesterday and spend 10 focused minutes on it. Small, daily wins compound.",
    mini_quiz: [],
    recall_items: [],
  };

  const miniQuiz = Array.isArray(parsed.mini_quiz) ? parsed.mini_quiz.slice(0, 3) : [];
  const recallItems = Array.isArray(parsed.recall_items) ? parsed.recall_items.slice(0, 5) : [];

  const { data: inserted, error } = await supa.from("morning_briefings").insert({
    user_id: user.id,
    school_id: user.schoolId,
    briefing_md: String(parsed.briefing_md ?? "").slice(0, 4000),
    key_insight: String(parsed.key_insight ?? "").slice(0, 500),
    leverage_topic: String(parsed.leverage_topic ?? "").slice(0, 200),
    mini_quiz: miniQuiz,
    scheduled_for: today,
  }).select("*").single();

  if (error) {
    // Likely race: another request inserted today's briefing. Return existing.
    const { data: race } = await supa.from("morning_briefings").select("*").eq("user_id", user.id).eq("scheduled_for", today).maybeSingle();
    if (race) {
      return new Response(JSON.stringify({ briefing: race, cached: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Seed recall schedule
  if (recallItems.length > 0) {
    const rows = recallItems.map((r: any) => ({
      user_id: user.id,
      school_id: user.schoolId,
      subject: String(r.subject ?? "general").slice(0, 100),
      concept: String(r.concept ?? "").slice(0, 300),
      reason: String(r.reason ?? "").slice(0, 500),
      due_at: new Date(Date.now() + Math.max(1, Math.min(72, Number(r.hours_until_due) || 12)) * 3600 * 1000).toISOString(),
    })).filter((r: any) => r.concept);
    if (rows.length) {
      await supa.from("recall_schedule").insert(rows);
    }
  }

  return new Response(JSON.stringify({ briefing: inserted, cached: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

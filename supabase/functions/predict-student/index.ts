// Cognitive Mirror — predicts how a specific student will answer a question
// before they answer it. Stores prediction silently, then later "reveals" it.
//
// POST /predict   { question, subject?, topic?, context? }
//   -> { snapshot_id, predicted_answer, predicted_reasoning, predicted_misconception }
//
// POST /reveal    { snapshot_id, actual_answer, was_correct? }
//   -> { matched, drift_score, predicted_answer, predicted_reasoning, predicted_misconception }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

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
      .select("school_id, full_name, grade_level")
      .eq("id", user.id).maybeSingle();
    return {
      id: user.id,
      schoolId: profile?.school_id ?? null,
      name: profile?.full_name ?? "",
      grade: profile?.grade_level ?? null,
    };
  } catch { return null; }
}

async function buildStudentDossier(userId: string): Promise<string> {
  const supa = admin();
  const [memories, gaps, profiles, recentMistakes] = await Promise.all([
    supa.from("student_memory").select("memory_type, content, subject, confidence")
      .eq("user_id", userId).order("confidence", { ascending: false }).limit(15),
    supa.from("knowledge_gaps").select("subject, topic, gap_description, severity")
      .eq("user_id", userId).eq("resolved", false).order("severity", { ascending: false }).limit(10),
    supa.from("student_learning_profiles").select("subject, difficulty_level, recent_accuracy")
      .eq("user_id", userId),
    supa.from("cognitive_mirror_snapshots")
      .select("question, predicted_misconception, actual_answer, was_correct, prediction_matched, subject")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
  ]);

  const lines: string[] = [];
  if (profiles.data?.length) {
    lines.push("## Subject performance");
    for (const p of profiles.data) {
      lines.push(`- ${p.subject}: ${p.difficulty_level} (${p.recent_accuracy ?? "?"}% accuracy)`);
    }
  }
  if (gaps.data?.length) {
    lines.push("\n## Open knowledge gaps");
    for (const g of gaps.data) {
      lines.push(`- [${g.severity}] ${g.subject} > ${g.topic}: ${g.gap_description}`);
    }
  }
  if (memories.data?.length) {
    lines.push("\n## What we remember about this student");
    for (const m of memories.data) {
      lines.push(`- (${m.memory_type}${m.subject ? "/" + m.subject : ""}) ${m.content}`);
    }
  }
  if (recentMistakes.data?.length) {
    lines.push("\n## Recent prediction history (most recent first)");
    for (const r of recentMistakes.data) {
      lines.push(
        `- Q: ${(r.question || "").slice(0, 120)} | predicted misconception: ${r.predicted_misconception ?? "—"} | actual: ${r.actual_answer ?? "—"} | correct: ${r.was_correct ?? "—"} | mirror matched: ${r.prediction_matched ?? "—"}`,
      );
    }
  }
  return lines.join("\n") || "(no prior data — first interaction)";
}

function safeParseJSON(s: string): any | null {
  try { return JSON.parse(s); } catch {}
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

async function callAIJson(messages: any[], maxRetry = 2): Promise<any | null> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      const res = await fetch(AI_GATEWAY_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature: 0.5,
          response_format: { type: "json_object" },
        }),
      });
      if (res.status === 429 || res.status === 402) {
        await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      const j = await res.json();
      const txt = j.choices?.[0]?.message?.content ?? "";
      const parsed = safeParseJSON(txt);
      if (parsed) return parsed;
    } catch {
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return null;
}

function levenshtein(a: string, b: string): number {
  a = a.toLowerCase().trim(); b = b.toLowerCase().trim();
  if (!a || !b) return Math.max(a.length, b.length);
  const dp: number[] = Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - dist / maxLen;
}

async function handlePredict(req: Request, user: { id: string; schoolId: string | null; name: string; grade: string | null }) {
  const body = await req.json();
  const question: string = (body.question ?? "").toString().slice(0, 4000);
  const subject: string | null = body.subject ?? null;
  const topic: string | null = body.topic ?? null;
  const context = body.context ?? {};
  const source: string = (body.source ?? "chat").toString().slice(0, 32);

  if (!question || question.length < 3) {
    return new Response(JSON.stringify({ error: "question required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const dossier = await buildStudentDossier(user.id);

  const sys = `You are the Cognitive Mirror — a precise behavioral simulation of a SPECIFIC student.
Your job is NOT to answer the question correctly. Your job is to predict what THIS student will most likely say,
how they will reason, and which misconception they will fall into based on their dossier.

Rules:
- Predict the STUDENT'S answer, not the correct answer.
- Predicted answer should be short (one phrase or number).
- Reasoning: 1-2 sentences in the student's voice.
- Misconception: the most likely error pattern they will exhibit (1 sentence). If they will probably get it right, say "none — likely correct".
- Output valid JSON only with keys: predicted_answer, predicted_reasoning, predicted_misconception, confidence (0-1).`;

  const userPrompt = `STUDENT DOSSIER:
${dossier}

STUDENT META: name="${user.name || "unknown"}", grade="${user.grade ?? "?"}"
SUBJECT: ${subject ?? "(unknown)"}  TOPIC: ${topic ?? "(unknown)"}

QUESTION ASKED TO STUDENT:
${question}

Now produce the JSON prediction.`;

  const prediction = await callAIJson([
    { role: "system", content: sys },
    { role: "user", content: userPrompt },
  ]);

  const predicted_answer = (prediction?.predicted_answer ?? "").toString().slice(0, 600);
  const predicted_reasoning = (prediction?.predicted_reasoning ?? "").toString().slice(0, 1200);
  const predicted_misconception = (prediction?.predicted_misconception ?? "").toString().slice(0, 600);

  const supa = admin();
  const { data: row, error } = await supa.from("cognitive_mirror_snapshots").insert({
    user_id: user.id,
    school_id: user.schoolId,
    subject,
    topic,
    question,
    predicted_answer,
    predicted_reasoning,
    predicted_misconception,
    context,
    source,
  }).select("id").single();

  if (error) {
    console.error("snapshot insert error", error);
    return new Response(JSON.stringify({ error: "insert failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    snapshot_id: row.id,
    predicted_answer,
    predicted_reasoning,
    predicted_misconception,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function handleReveal(req: Request, user: { id: string }) {
  const body = await req.json();
  const snapshot_id: string = body.snapshot_id;
  const actual_answer: string = (body.actual_answer ?? "").toString().slice(0, 4000);
  const was_correct: boolean | null = typeof body.was_correct === "boolean" ? body.was_correct : null;

  if (!snapshot_id || !actual_answer) {
    return new Response(JSON.stringify({ error: "snapshot_id + actual_answer required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supa = admin();
  const { data: snap } = await supa.from("cognitive_mirror_snapshots")
    .select("*").eq("id", snapshot_id).maybeSingle();
  if (!snap || snap.user_id !== user.id) {
    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sim = similarity(snap.predicted_answer || "", actual_answer);
  const matched = sim >= 0.65;
  const drift = +(((1 - sim) * 100).toFixed(2));

  await supa.from("cognitive_mirror_snapshots").update({
    actual_answer,
    was_correct,
    prediction_matched: matched,
    drift_score: drift,
    resolved_at: new Date().toISOString(),
  }).eq("id", snapshot_id);

  return new Response(JSON.stringify({
    matched,
    drift_score: drift,
    similarity: +sim.toFixed(3),
    predicted_answer: snap.predicted_answer,
    predicted_reasoning: snap.predicted_reasoning,
    predicted_misconception: snap.predicted_misconception,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const user = await getUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const path = url.pathname.split("/").filter(Boolean).pop();

  try {
    if (req.method === "POST" && (path === "reveal" || url.searchParams.get("action") === "reveal")) {
      return await handleReveal(req, user);
    }
    if (req.method === "POST") {
      return await handlePredict(req, user);
    }
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("predict-student error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

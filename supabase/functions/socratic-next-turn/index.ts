// Socratic Mode — generates next Socratic question + grades the previous student response.
// POST { session_id?, subject, topic, last_response?, turn_index } -> { session_id, question, prev_grade?, prev_feedback?, completed?, score? }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_TURNS = 5;
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
  } catch {
    return null;
  }
}

async function callAIWithRetry(messages: any[], schema: any) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("missing_api_key");
  const body = {
    model: "google/gemini-2.5-flash",
    messages,
    tools: [{ type: "function", function: schema }],
    tool_choice: { type: "function", function: { name: schema.name } },
    temperature: 0.8,
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
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
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
  const lastResponse = body.last_response ? String(body.last_response).slice(0, 4000) : null;
  let sessionId: string | null = body.session_id ? String(body.session_id) : null;

  if (!subject || !topic) {
    return new Response(JSON.stringify({ error: "subject_and_topic_required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supa = admin();

  // Load or create session
  let session: any;
  if (sessionId) {
    const { data, error } = await supa.from("learning_mode_sessions")
      .select("*").eq("id", sessionId).eq("user_id", user.id).maybeSingle();
    if (error || !data) {
      return new Response(JSON.stringify({ error: "session_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (data.status !== "active") {
      return new Response(JSON.stringify({ error: "session_not_active" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    session = data;
  } else {
    const { data, error } = await supa.from("learning_mode_sessions").insert({
      user_id: user.id, school_id: user.schoolId, mode: "socratic",
      subject, topic, status: "active", turns_json: [],
    }).select("*").single();
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    session = data;
    sessionId = session.id;
  }

  const turns: any[] = Array.isArray(session.turns_json) ? session.turns_json : [];
  let prevGrade: number | null = null;
  let prevFeedback: string | null = null;

  // Grade previous turn if there was one
  if (lastResponse && turns.length > 0) {
    const lastQ = turns[turns.length - 1]?.question;
    if (lastQ) {
      try {
        const grading = await callAIWithRetry([
          {
            role: "system",
            content: "You are a Socratic tutor. Grade the student's reasoning quality on a 1-5 scale (1 = no reasoning, 5 = excellent reasoning). Provide a one-sentence feedback. Do NOT reveal the answer.",
          },
          {
            role: "user",
            content: `Topic: ${subject} > ${topic}\nQuestion you asked: ${lastQ}\nStudent reply: ${lastResponse}`,
          },
        ], {
          name: "grade_socratic_turn",
          description: "Grade the student's Socratic reply",
          parameters: {
            type: "object",
            properties: {
              quality: { type: "integer", minimum: 1, maximum: 5 },
              feedback: { type: "string", maxLength: 280 },
            },
            required: ["quality", "feedback"],
          },
        });
        prevGrade = Number(grading.quality);
        prevFeedback = String(grading.feedback ?? "");
        turns[turns.length - 1].student_response = lastResponse;
        turns[turns.length - 1].quality = prevGrade;
        turns[turns.length - 1].feedback = prevFeedback;
      } catch (_e) {
        prevGrade = 3;
        prevFeedback = "Continue exploring this idea.";
        turns[turns.length - 1].student_response = lastResponse;
        turns[turns.length - 1].quality = prevGrade;
        turns[turns.length - 1].feedback = prevFeedback;
      }
    }
  }

  // Check if session is complete
  const turnsAnswered = turns.filter(t => typeof t.quality === "number").length;
  if (turnsAnswered >= MAX_TURNS) {
    const totalQuality = turns.reduce((s, t) => s + (Number(t.quality) || 0), 0);
    const score = Math.round((totalQuality / (MAX_TURNS * 5)) * 100);
    const wasCorrect = score >= 70;
    await supa.from("learning_mode_sessions").update({
      status: "completed", score, completed_at: new Date().toISOString(),
      turns_json: turns,
    }).eq("id", sessionId);
    await supa.rpc("update_concept_mastery", {
      p_user_id: user.id, p_school_id: user.schoolId,
      p_subject: subject, p_topic: topic, p_was_correct: wasCorrect,
    });
    return new Response(JSON.stringify({
      session_id: sessionId, completed: true, score,
      prev_grade: prevGrade, prev_feedback: prevFeedback,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Generate next Socratic question
  const turnContext = turns.map((t, i) =>
    `Q${i+1}: ${t.question}\nStudent: ${t.student_response ?? "(no answer)"}\nQuality: ${t.quality ?? "-"}`
  ).join("\n\n");

  let next: any;
  try {
    next = await callAIWithRetry([
      {
        role: "system",
        content: "You are a Socratic tutor. Ask one focused, open-ended question that probes the student's reasoning about the topic. NEVER give the answer. Each question should go one level deeper than the previous. Questions must be answerable in 2-4 sentences.",
      },
      {
        role: "user",
        content: `Topic: ${subject} > ${topic}\nTurn: ${turnsAnswered + 1} of ${MAX_TURNS}\n${turnContext ? "Previous turns:\n" + turnContext : "(first question)"}`,
      },
    ], {
      name: "next_socratic_question",
      description: "Generate the next Socratic question",
      parameters: {
        type: "object",
        properties: { question: { type: "string", minLength: 8, maxLength: 400 } },
        required: ["question"],
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  turns.push({ question: next.question });
  await supa.from("learning_mode_sessions").update({ turns_json: turns }).eq("id", sessionId);

  return new Response(JSON.stringify({
    session_id: sessionId,
    question: next.question,
    prev_grade: prevGrade,
    prev_feedback: prevFeedback,
    turn_index: turnsAnswered + 1,
    total_turns: MAX_TURNS,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

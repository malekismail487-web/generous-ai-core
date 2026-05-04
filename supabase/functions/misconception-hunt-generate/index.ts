// Misconception Hunt — AI generates 5 statements about a topic; some are subtly wrong.
// POST { subject, topic } -> { session_id, statements: [{ id, text }] }
// Truth array kept server-side in turns_json (not returned).

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
    temperature: 0.9,
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
  if (!subject || !topic) {
    return new Response(JSON.stringify({ error: "subject_and_topic_required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const seed = Math.floor(Math.random() * 1_000_000);

  let result: any;
  try {
    result = await callAIWithRetry([
      {
        role: "system",
        content: "You generate Misconception-Hunt items for school students. Produce EXACTLY 5 short statements about the topic. 2 or 3 of them must be subtly wrong (common misconceptions or near-truths), the rest correct. Each statement is one sentence, age-appropriate, no double-negatives. Mark each item with truth=true or truth=false. Provide a one-sentence rationale per item explaining why true or what the misconception is.",
      },
      {
        role: "user",
        content: `Subject: ${subject}\nTopic: ${topic}\nVariation seed: ${seed} (use to ensure freshness).`,
      },
    ], {
      name: "generate_misconception_items",
      description: "Generate 5 statements with truth labels",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            minItems: 5, maxItems: 5,
            items: {
              type: "object",
              properties: {
                text: { type: "string", minLength: 8, maxLength: 280 },
                truth: { type: "boolean" },
                rationale: { type: "string", maxLength: 280 },
              },
              required: ["text", "truth", "rationale"],
            },
          },
        },
        required: ["items"],
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const items = (result.items ?? []).slice(0, 5).map((it: any, i: number) => ({
    id: `m${i}`,
    text: String(it.text),
    truth: Boolean(it.truth),
    rationale: String(it.rationale ?? ""),
  }));

  const supa = admin();
  const { data: session, error } = await supa.from("learning_mode_sessions").insert({
    user_id: user.id, school_id: user.schoolId, mode: "misconception_hunt",
    subject, topic, status: "active",
    turns_json: [{ items }],
  }).select("id").single();
  if (error) return new Response(JSON.stringify({ error: error.message }), {
    status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  // Strip truth/rationale from client-facing payload
  const clientItems = items.map((it: any) => ({ id: it.id, text: it.text }));

  return new Response(JSON.stringify({
    session_id: session.id,
    statements: clientItems,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

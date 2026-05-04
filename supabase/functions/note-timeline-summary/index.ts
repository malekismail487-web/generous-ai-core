// Generates an AI "growth highlights" summary across a note's snapshots.
// POST { note_id }  ->  { summary_md, snapshots_count }

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
  } catch { return null; }
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
    await new Promise((res) => setTimeout(res, 600 + attempt * 900));
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

function trim(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
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

  const noteId = String(body.note_id ?? "");
  if (!noteId) {
    return new Response(JSON.stringify({ error: "note_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supa = admin();
  // Verify ownership
  const { data: note } = await supa.from("notes")
    .select("id, user_id, title").eq("id", noteId).maybeSingle();
  if (!note || note.user_id !== userId) {
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: snaps } = await supa.from("note_snapshots")
    .select("snapshot_at, content, word_count")
    .eq("note_id", noteId)
    .order("snapshot_at", { ascending: true });

  if (!snaps || snaps.length < 2) {
    return new Response(
      JSON.stringify({
        summary_md: "Not enough history yet — save this note again later to start tracking your growth.",
        snapshots_count: snaps?.length ?? 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Cache check (regenerate if newer snapshot exists)
  const { data: cached } = await supa.from("note_timeline_summaries")
    .select("summary_md, generated_at, snapshots_count").eq("note_id", noteId).maybeSingle();
  const latestSnap = snaps[snaps.length - 1].snapshot_at;
  if (cached && new Date(cached.generated_at) >= new Date(latestSnap) && cached.snapshots_count === snaps.length) {
    return new Response(
      JSON.stringify({ summary_md: cached.summary_md, snapshots_count: cached.snapshots_count }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const first = snaps[0];
  const last = snaps[snaps.length - 1];
  const middle = snaps.length > 2 ? snaps[Math.floor(snaps.length / 2)] : null;

  const prompt =
    `Note title: ${note.title}\n\n` +
    `EARLIEST VERSION (${first.snapshot_at}, ${first.word_count} words):\n${trim(first.content, 2500)}\n\n` +
    (middle ? `MIDDLE VERSION (${middle.snapshot_at}, ${middle.word_count} words):\n${trim(middle.content, 2000)}\n\n` : "") +
    `CURRENT VERSION (${last.snapshot_at}, ${last.word_count} words):\n${trim(last.content, 3000)}\n\n` +
    `Write a short, encouraging "growth highlights" summary in markdown. Sections:\n` +
    `- **What you understood early on**\n- **What you added or refined**\n- **Misconceptions you corrected**\n- **One question you still might explore**\n` +
    `Keep it under 220 words. Use second person ("you"). No fluff.`;

  const aiRes = await callAIWithRetry({
    model: MODEL,
    temperature: 0.6,
    messages: [
      {
        role: "system",
        content: "You are a reflective learning coach. Compare a student's note across time and highlight genuine growth.",
      },
      { role: "user", content: prompt },
    ],
  });

  if (!aiRes.ok) {
    return new Response(JSON.stringify({ error: "ai_failed" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const aiJson = await aiRes.json();
  const summary = String(aiJson?.choices?.[0]?.message?.content ?? "").trim();
  if (!summary) {
    return new Response(JSON.stringify({ error: "ai_empty" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await supa.from("note_timeline_summaries")
    .upsert({
      note_id: noteId,
      user_id: userId,
      summary_md: summary,
      snapshots_count: snaps.length,
      generated_at: new Date().toISOString(),
    }, { onConflict: "note_id" });

  return new Response(
    JSON.stringify({ summary_md: summary, snapshots_count: snaps.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

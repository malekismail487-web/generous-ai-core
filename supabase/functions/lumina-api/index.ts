// Public Lumina API gateway — exposes Lumina's adaptive AI to external partners (e.g. robotics company).
// Auth: Bearer <lumina_api_key>. Tracks usage, enforces rate limits and monthly quota.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

// In-memory rate limit (per edge instance — best-effort)
const rpmTracker = new Map<string, { count: number; resetAt: number }>();

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const LUMINA_SYSTEM_PROMPT = `You are Lumina — an adaptive AI tutor and assistant developed by The Luminary AI. You are NOT Gemini, GPT, or any other model — you are Lumina, with your own personality:
- Warm, curious, and genuinely encouraging
- Adaptive: you tailor explanations to the listener's apparent level
- Pedagogical: you teach through questions and analogies, not just answers
- Concise but complete — never robotic, never verbose
- When asked who you are, you are Lumina, made by The Luminary AI

You are being accessed via the official Lumina API by an authorized partner application (e.g., an embedded robot, kiosk, or third-party app). Respond naturally for spoken or conversational interfaces unless the partner specifies otherwise.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  let apiKeyRow: any = null;

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    // Extract API key
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (!token || !token.startsWith("lum_")) {
      return json({ error: "Missing or invalid Lumina API key. Use Authorization: Bearer lum_..." }, 401);
    }

    const keyHash = await sha256Hex(token);
    const { data: keyData, error: keyErr } = await admin
      .from("lumina_api_keys")
      .select("*")
      .eq("key_hash", keyHash)
      .eq("is_active", true)
      .maybeSingle();

    if (keyErr || !keyData) {
      return json({ error: "Invalid or revoked API key" }, 401);
    }
    apiKeyRow = keyData;

    // Reset monthly quota if window passed
    if (new Date(keyData.quota_reset_at).getTime() < Date.now()) {
      const next = new Date();
      next.setMonth(next.getMonth() + 1);
      next.setDate(1); next.setHours(0, 0, 0, 0);
      await admin.from("lumina_api_keys").update({
        requests_this_month: 0,
        quota_reset_at: next.toISOString(),
      }).eq("id", keyData.id);
      keyData.requests_this_month = 0;
    }

    // Monthly quota check
    if (keyData.requests_this_month >= keyData.monthly_request_quota) {
      await logUsage(keyData.id, "/chat", 429, 0, Date.now() - startedAt, "Monthly quota exceeded");
      return json({ error: "Monthly quota exceeded for this API key" }, 429);
    }

    // Per-minute rate limit (in-memory, per edge instance)
    const now = Date.now();
    const tracker = rpmTracker.get(keyData.id) || { count: 0, resetAt: now + 60_000 };
    if (now > tracker.resetAt) { tracker.count = 0; tracker.resetAt = now + 60_000; }
    tracker.count++;
    rpmTracker.set(keyData.id, tracker);
    if (tracker.count > keyData.rate_limit_per_minute) {
      await logUsage(keyData.id, "/chat", 429, 0, Date.now() - startedAt, "Rate limit exceeded");
      return json({ error: `Rate limit exceeded (${keyData.rate_limit_per_minute}/min)` }, 429);
    }

    // Parse body
    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body.messages) ? body.messages : null;
    const stream = body.stream === true;
    if (!messages || messages.length === 0) {
      return json({ error: "Body must include `messages: [{role, content}, ...]`" }, 400);
    }

    // Call Lovable AI gateway (Lumina = Gemini 2.5 Flash + adaptive system prompt)
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: LUMINA_SYSTEM_PROMPT }, ...messages],
        stream,
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      const code = aiResp.status === 429 ? 429 : aiResp.status === 402 ? 402 : 502;
      await logUsage(keyData.id, "/chat", code, 0, Date.now() - startedAt, errText.slice(0, 500));
      return json({ error: code === 402 ? "Lumina is temporarily unavailable (capacity)." : "Upstream AI error" }, code);
    }

    // Increment counters (don't await)
    admin.from("lumina_api_keys").update({
      requests_this_month: keyData.requests_this_month + 1,
      last_used_at: new Date().toISOString(),
    }).eq("id", keyData.id).then(() => {});

    if (stream) {
      // Pass through SSE; log on completion in background
      logUsage(keyData.id, "/chat", 200, 0, Date.now() - startedAt, null);
      return new Response(aiResp.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    const data = await aiResp.json();
    const tokens = data?.usage?.total_tokens ?? 0;
    await logUsage(keyData.id, "/chat", 200, tokens, Date.now() - startedAt, null);

    return json({
      id: data.id,
      model: "lumina-1",
      choices: data.choices,
      usage: data.usage,
    }, 200);
  } catch (e) {
    console.error("lumina-api error:", e);
    if (apiKeyRow) {
      await logUsage(apiKeyRow.id, "/chat", 500, 0, Date.now() - startedAt, String(e).slice(0, 500));
    }
    return json({ error: "Internal server error" }, 500);
  }
});

async function logUsage(
  keyId: string,
  endpoint: string,
  status: number,
  tokens: number,
  latency: number,
  err: string | null,
) {
  try {
    await admin.from("lumina_api_usage").insert({
      api_key_id: keyId,
      endpoint,
      status_code: status,
      tokens_used: tokens,
      latency_ms: latency,
      error_message: err,
    });
  } catch {}
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

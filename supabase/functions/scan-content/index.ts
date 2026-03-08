import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

function getGeminiKeys(): string[] {
  const keys: string[] = [];
  const key1 = Deno.env.get("GEMINI_API_KEY");
  if (key1 && key1.trim()) keys.push(key1.trim());
  const pool = Deno.env.get("GEMINI_API_KEY_POOL");
  if (pool) {
    for (const k of pool.split(",")) {
      const trimmed = k.trim();
      if (trimmed && !keys.includes(trimmed)) keys.push(trimmed);
    }
  }
  console.log(`Gemini key pool: ${keys.length} unique key(s) loaded [${keys.map((k, i) => `Key${i+1}:${k.substring(0,8)}...`).join(', ')}]`);
  return keys;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const geminiKeys = getGeminiKeys();

    if (geminiKeys.length === 0 || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { content, content_type, content_id, user_id, school_id } = await req.json();

    if (!content || !content_type || !user_id) {
      return new Response(JSON.stringify({ flagged: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const textToAnalyze = String(content).substring(0, 4000);

    const moderationMessages = [
      {
        role: "system",
        content: `You are a content moderation AI for an educational platform used by students and teachers. Analyze the following content and determine if it is inappropriate, malicious, or harmful. Consider:
- Profanity, hate speech, slurs, or offensive language
- Bullying, threats, or harassment
- Sexual or explicit content
- Violence or gore
- Misinformation that could be harmful in an educational context
- Spam or nonsensical content designed to disrupt
- Personal information sharing (phone numbers, addresses)
- Drug/alcohol references inappropriate for students

Respond with a JSON object:
{"flagged": boolean, "severity": "low"|"medium"|"high"|"critical", "reason": "brief explanation"}

If the content is normal educational material, respond with {"flagged": false}.
Be strict about content safety since this is a K-12 platform.`,
      },
      {
        role: "user",
        content: `Analyze this ${content_type.replace("_", " ")} content:\n\n${textToAnalyze}`,
      },
    ];

    // Wave-based key rotation with backoff
    let response: Response | null = null;
    const MAX_WAVES = 2; // Moderation is non-blocking, don't wait too long
    const WAVE_DELAYS = [10000, 20000];
    let success = false;

    for (let wave = 0; wave < MAX_WAVES && !success; wave++) {
      if (wave > 0) {
        const delay = WAVE_DELAYS[wave - 1];
        console.log(`All keys exhausted. Waiting ${delay / 1000}s (wave ${wave + 1})...`);
        await new Promise(r => setTimeout(r, delay));
      }
      for (let i = 0; i < geminiKeys.length; i++) {
        console.log(`Trying key ${i + 1}/${geminiKeys.length} (wave ${wave + 1})`);
        try {
          response = await fetch(GEMINI_API_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${geminiKeys[i]}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gemini-2.0-flash-lite",
              messages: moderationMessages,
              temperature: 0.1,
              max_tokens: 200,
            }),
          });
          if (response.status === 429) {
            console.log(`Key ${i + 1} rate limited, rotating...`);
            await response.text();
            continue;
          }
          success = true;
          break;
        } catch (e) {
          console.warn("Fetch error:", e);
        }
      }
    }

    if (!response || !response.ok) {
      console.error("All keys exhausted or error:", response?.status);
      await response?.text();
      return new Response(JSON.stringify({ flagged: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || "";

    let result = { flagged: false, severity: "low", reason: "" };
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      }
    } catch {
      return new Response(JSON.stringify({ flagged: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (result.flagged) {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await admin.from("content_flags").insert({
        content_type,
        content_id: content_id || null,
        content_text: textToAnalyze.substring(0, 2000),
        user_id,
        school_id: school_id || null,
        severity: result.severity || "medium",
        reason: result.reason || "Flagged by AI content scanner",
        status: "pending",
      });
    }

    return new Response(JSON.stringify({ flagged: result.flagged, severity: result.severity }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("scan-content error:", error);
    return new Response(
      JSON.stringify({ flagged: false, error: error instanceof Error ? error.message : "Unknown" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

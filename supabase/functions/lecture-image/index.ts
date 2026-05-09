import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, expertise = "intermediate" } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "prompt required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const styleSuffix = expertise === "basic"
      ? "Friendly textbook-style illustration. Bright clear colors. No text, no watermark, no labels."
      : expertise === "expert"
        ? "Highly detailed scientific visualization, near publication quality. Realistic, accurate proportions. No text, no watermark, no labels."
        : "Detailed photorealistic or polished educational illustration. Accurate, professional. No text, no watermark, no labels.";

    const fullPrompt = `${prompt}\n\nStyle: ${styleSuffix}`;

    // 25s timeout + 1 retry
    const callOnce = async (): Promise<Response> => {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 25000);
      try {
        return await fetch(AI_GATEWAY_URL, {
          method: "POST",
          signal: ac.signal,
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-image",
            messages: [{ role: "user", content: fullPrompt }],
            modalities: ["image", "text"],
          }),
        });
      } finally { clearTimeout(t); }
    };

    let aiRes: Response;
    try { aiRes = await callOnce(); }
    catch { aiRes = await callOnce(); }

    if (!aiRes.ok) {
      const txt = await aiRes.text().catch(() => "");
      console.error("lecture-image gateway error", aiRes.status, txt.slice(0, 200));
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "rate_limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "credits_exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "image_gen_failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await aiRes.json();
    const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) {
      console.error("No image in response", JSON.stringify(data).slice(0, 300));
      return new Response(JSON.stringify({ error: "no_image_returned" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ image: url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("lecture-image error", e);
    const msg = e instanceof Error ? e.message : "Unknown";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const SYSTEM_PROMPT = `You are Lumina's 3D Concept Planner. For a single lecture slide, decide what 3D object best
illustrates the concept and reply with a STRICT JSON object — no prose, no markdown.

You MUST pick ONE geometry from this fixed family (no other strings allowed):
  sphere_cluster | helix | wave_mesh | torus_ring | lattice | column_stack |
  orbit_system | arch | bust | tree | gear_train | flow_pipes

Choose so the object is pedagogically meaningful for the slide:
  - biology cell/organelle/molecule  -> sphere_cluster or lattice
  - DNA / RNA / springs              -> helix
  - physics waves / sound / terrain  -> wave_mesh
  - electrons / planets / atoms      -> orbit_system
  - crystal / cubic structure        -> lattice
  - statistics / data / monument     -> column_stack
  - history / architecture           -> arch
  - art / mythology / portrait       -> bust
  - hierarchy / classification       -> tree
  - mechanics / engineering          -> gear_train
  - chemistry process / pipeline     -> flow_pipes
  - default if nothing fits          -> orbit_system

Return JSON of shape:
{
  "geometry": "...",
  "colorScheme": ["#RRGGBB", "#RRGGBB", "#RRGGBB"],
  "structureParams": { ... small numeric/string params ... },
  "educationalBehavior": "1 short sentence on why this object teaches the concept",
  "animationParams": { "rotateY": 360, "loopMs": 6000 }
}

Color scheme must reflect the lecture palette provided. NEVER hardcode subject names.`;

interface Body {
  subject?: string;
  topic?: string;
  slide_heading?: string;
  slide_body?: string;
  palette?: { primary?: string; secondary?: string; accent?: string; surface?: string };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = (await req.json()) as Body;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const palette = [
      body.palette?.primary, body.palette?.secondary, body.palette?.accent, body.palette?.surface,
    ].filter(Boolean).join(", ");

    const user = [
      `Subject: ${body.subject || "general"}`,
      `Topic: ${body.topic || ""}`,
      `Slide heading: ${body.slide_heading || ""}`,
      `Slide body: ${(body.slide_body || "").slice(0, 600)}`,
      `Lecture palette (use as colorScheme inspiration): ${palette || "no palette provided"}`,
    ].join("\n");

    const resp = await fetch(AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      }),
    });

    if (resp.status === 429 || resp.status === 402) {
      return new Response(JSON.stringify({ error: "ai_rate_limited" }), {
        status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const txt = await resp.text();
      console.error("ai_gateway_error", resp.status, txt);
      throw new Error("ai_gateway_error");
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || "{}";
    let spec: Record<string, unknown> = {};
    try { spec = JSON.parse(content); } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) try { spec = JSON.parse(m[0]); } catch { spec = {}; }
    }

    const allowed = new Set(["sphere_cluster","helix","wave_mesh","torus_ring","lattice","column_stack","orbit_system","arch","bust","tree","gear_train","flow_pipes"]);
    if (!allowed.has(String(spec.geometry))) spec.geometry = "orbit_system";
    if (!Array.isArray(spec.colorScheme) || (spec.colorScheme as unknown[]).length === 0) {
      spec.colorScheme = [body.palette?.primary || "#cccccc", body.palette?.accent || "#888888", body.palette?.secondary || "#444444"];
    }

    return new Response(JSON.stringify({ spec }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("lecture-3d-spec error", e);
    return new Response(JSON.stringify({ error: (e as Error).message || "spec_failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

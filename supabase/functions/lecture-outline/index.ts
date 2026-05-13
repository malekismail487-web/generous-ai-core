import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  buildHardRoutedSystemPrompt,
  getTemplateSpec,
  normalizeLevel,
  normalizeStyle,
} from "../_shared/promptTemplates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      topic,
      subject,
      expertise = "intermediate",
      learning_style = "balanced",
      addendum = "",
    } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!topic || typeof topic !== "string") {
      return new Response(JSON.stringify({ error: "topic required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Phase 2 — hard routing. The (level × style) combo selects ONE template;
    // the validator addendum (Phase 1) is prepended verbatim on regeneration.
    const level = normalizeLevel(expertise);
    const style = normalizeStyle(learning_style);
    const spec = getTemplateSpec(level, style);
    const paragraphCount = spec.paragraphCount;

    const extraRules = [
      `SUBJECT FOCUS: ${subject || "general"}`,
      `- Produce a complete lecture outline with exactly ${paragraphCount} body paragraphs.`,
      "- Each paragraph: focused on ONE specific concept that builds on the previous one.",
      "- Each paragraph MUST include a self-contained image_prompt for a photorealistic / educational image. Image prompts must NOT contain text overlays, watermarks, or labels. Always specify 'no text, no watermark, photorealistic / detailed digital illustration, educational, high detail'.",
      "- For math/science, output RAW LaTeX delimited as $...$ inline or $$...$$ display. DO NOT pre-render LaTeX. The frontend renders it for the student.",
      "- Title must be specific to the topic, not generic.",
      "- key_takeaways: 5-7 short bullet sentences distilling the essential information.",
    ].join("\n");

    const systemPrompt = buildHardRoutedSystemPrompt({
      feature: "visual_lecture",
      level,
      style,
      addendum,
      extraRules,
    });

    const tool = {
      type: "function",
      function: {
        name: "emit_lecture",
        description: "Emit a structured lecture outline.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string" },
            intro: { type: "string", description: "Hook + why this matters + what they'll learn. 4-6 sentences." },
            paragraphs: {
              type: "array",
              minItems: 5,
              maxItems: 8,
              items: {
                type: "object",
                properties: {
                  heading: { type: "string", description: "Short section heading, 2-6 words." },
                  body: { type: "string", description: "4-7 sentence paragraph. Raw LaTeX allowed." },
                  image_prompt: { type: "string", description: "Self-contained, photorealistic prompt for the paragraph's image." },
                },
                required: ["heading", "body", "image_prompt"],
                additionalProperties: false,
              },
            },
            conclusion: { type: "string", description: "Strong summary reinforcing main points. 4-6 sentences." },
            key_takeaways: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 8 },
          },
          required: ["title", "intro", "paragraphs", "conclusion", "key_takeaways"],
          additionalProperties: false,
        },
      },
    };

    const userPrompt = `Generate a complete lecture on: "${topic}"${subject ? ` (subject: ${subject})` : ""}.
Produce ${paragraphCount} body paragraphs.`;

    const aiRes = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "emit_lecture" } },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error("lecture-outline gateway error", aiRes.status, txt);
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await aiRes.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response", JSON.stringify(data).slice(0, 500));
      return new Response(JSON.stringify({ error: "Invalid AI response shape" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let parsed: any;
    try { parsed = JSON.parse(toolCall.function.arguments); }
    catch (e) {
      console.error("Failed to parse tool args", e, toolCall.function.arguments?.slice(0, 300));
      return new Response(JSON.stringify({ error: "Failed to parse outline JSON" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("lecture-outline error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

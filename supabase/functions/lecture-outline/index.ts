import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const EXPERTISE_GUIDE: Record<string, string> = {
  basic: "8th grade reading level. Simple vocabulary, short sentences, concrete analogies. Avoid jargon. Image prompts should be friendly, clear, textbook-style illustrations.",
  intermediate: "High-school / early college level. Standard academic language, moderate technical depth, real examples. Image prompts should be polished educational illustrations or photographs.",
  advanced: "Upper-division college level. Precise technical language, detailed mechanisms, formal definitions. Image prompts should be detailed scientific or technical illustrations.",
  expert: "Graduate / specialist level. Domain-precise terminology, derivations, edge cases, current research framing. Image prompts should be sophisticated, near-publication quality scientific visualizations.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { topic, subject, expertise = "intermediate" } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!topic || typeof topic !== "string") {
      return new Response(JSON.stringify({ error: "topic required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const guide = EXPERTISE_GUIDE[expertise] || EXPERTISE_GUIDE.intermediate;
    const paragraphCount = expertise === "expert" ? 8 : expertise === "advanced" ? 7 : 6;

    const systemPrompt = `You are an expert educator generating a structured, visually-rich lecture.

EXPERTISE LEVEL: ${expertise.toUpperCase()}
${guide}

SUBJECT FOCUS: ${subject || "general"}

OUTPUT RULES:
- Produce a complete lecture outline with ${paragraphCount} substantive body paragraphs.
- Each paragraph: 4-7 sentences, focused on ONE specific concept that builds on the previous one.
- Each paragraph MUST include a self-contained image_prompt that, when sent to a photorealistic image model, produces a relevant, professional, educational image. Image prompts must NOT contain any text-overlay instructions, watermarks, or labels. Always specify "no text, no watermark, photorealistic / detailed digital illustration, educational, high detail".
- For math/science, use raw LaTeX delimited as $...$ inline or $$...$$ display. DO NOT pre-render LaTeX. Output the raw source.
- Keep language clear and engaging. Use the expertise level above to calibrate vocabulary.
- Title must be specific to the topic, not generic.
- key_takeaways: 5-7 short bullet sentences distilling the essential information.`;

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

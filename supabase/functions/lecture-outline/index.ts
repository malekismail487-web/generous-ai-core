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
      mode = "student", // "student" | "teacher"
      grade_level = "",
      duration_minutes = 45,
      design_hint = "", // free-text aesthetic hint from the user (optional)
    } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!topic || typeof topic !== "string") {
      return new Response(JSON.stringify({ error: "topic required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const level = normalizeLevel(expertise);
    const style = normalizeStyle(learning_style);
    const spec = getTemplateSpec(level, style);
    const paragraphCount = spec.paragraphCount;
    const isTeacher = mode === "teacher";

    const extraRules = [
      `SUBJECT FOCUS: ${subject || "general"}`,
      `- Produce a complete lecture outline with exactly ${paragraphCount} body paragraphs.`,
      "- Each paragraph: focused on ONE specific concept that builds on the previous one.",
      "- Each paragraph MUST include a self-contained image_prompt for a photorealistic / educational image. Image prompts must NOT contain text overlays, watermarks, or labels. Always specify 'no text, no watermark, photorealistic / detailed digital illustration, educational, high detail'.",
      "- When a labeled diagram (flowchart, cycle, comparison, anatomy, or simple chart) would genuinely help a student understand the concept, also include a diagram_spec for that paragraph. Diagrams must be schematic and information-bearing — NOT decorative. Skip diagram_spec when an illustration alone is enough.",
      "- For math/science, output RAW LaTeX delimited as $...$ inline or $$...$$ display. DO NOT pre-render LaTeX. The frontend renders it for the student.",
      "- Title must be specific to the topic, not generic.",
      "- key_takeaways: 5-7 short bullet sentences distilling the essential information.",
      "- bullet_points (per paragraph): 2-3 ultra-concise bullets (max 9 words each) summarising the paragraph for slides. NEVER copy the body sentences verbatim.",
      "- aesthetic: pick ONE design language that best matches the topic's mood. Choose from: scholarly_serif, modern_minimal, scientific_grid, humanist_warm, editorial_magazine, technical_blueprint, classical_textbook, vibrant_creative. If the user provided a design_hint, honor it and map it onto these tokens.",
      "- palette: 4 hex colors {primary, secondary, accent, surface} chosen to complement the aesthetic. Surface must read as a near-white background; primary is the dominant tone; accent is reserved for emphasis.",
      "- transition: ONE PowerPoint transition that fits the aesthetic. Choose from: morph, fade, push, wipe, split, reveal, cover, uncover, cut. Avoid gimmicks (airplane, vortex, curtain).",
    ];
    if (design_hint) {
      extraRules.push(`- USER DESIGN HINT (must follow): "${String(design_hint).slice(0, 240)}"`);
    }
    if (isTeacher) {
      extraRules.push(
        `- TEACHER MODE: also emit a lesson_plan object tailored to ${grade_level || "the given grade"} and a ${duration_minutes}-minute class. Sections: objectives (3-5 SMART), prerequisites, materials, warmup, guided_practice, independent_practice, closure, differentiation {struggling, on_level, advanced}, assessment, homework, teacher_notes.`,
      );
    }

    const systemPrompt = buildHardRoutedSystemPrompt({
      feature: "visual_lecture",
      level,
      style,
      addendum,
      extraRules: extraRules.join("\n"),
    });

    const paragraphProps: Record<string, unknown> = {
      heading: { type: "string", description: "Short section heading, 2-6 words." },
      body: { type: "string", description: "4-7 sentence paragraph. Raw LaTeX allowed." },
      image_prompt: { type: "string", description: "Self-contained, photorealistic prompt for the paragraph's image." },
      bullet_points: {
        type: "array",
        minItems: 2,
        maxItems: 3,
        items: { type: "string", description: "Ultra-concise slide bullet, <= 9 words." },
      },
      diagram_spec: {
        type: "object",
        description: "Optional. Include only when a labeled diagram would genuinely aid understanding.",
        properties: {
          kind: { type: "string", enum: ["flow", "cycle", "compare", "anatomy", "chart"] },
          caption: { type: "string" },
          nodes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                label: { type: "string" },
              },
              required: ["id", "label"],
              additionalProperties: false,
            },
          },
          edges: {
            type: "array",
            items: {
              type: "object",
              properties: {
                from: { type: "string" },
                to: { type: "string" },
                label: { type: "string" },
              },
              required: ["from", "to"],
              additionalProperties: false,
            },
          },
        },
        required: ["kind", "caption", "nodes"],
        additionalProperties: false,
      },
    };

    const properties: Record<string, unknown> = {
      title: { type: "string" },
      intro: { type: "string", description: "Hook + why this matters + what they'll learn. 4-6 sentences." },
      paragraphs: {
        type: "array",
        minItems: 5,
        maxItems: 8,
        items: {
          type: "object",
          properties: paragraphProps,
          required: ["heading", "body", "image_prompt", "bullet_points"],
          additionalProperties: false,
        },
      },
      conclusion: { type: "string", description: "Strong summary reinforcing main points. 4-6 sentences." },
      key_takeaways: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 8 },
      aesthetic: {
        type: "string",
        enum: [
          "scholarly_serif",
          "modern_minimal",
          "scientific_grid",
          "humanist_warm",
          "editorial_magazine",
          "technical_blueprint",
          "classical_textbook",
          "vibrant_creative",
        ],
      },
      palette: {
        type: "object",
        properties: {
          primary: { type: "string" },
          secondary: { type: "string" },
          accent: { type: "string" },
          surface: { type: "string" },
        },
        required: ["primary", "secondary", "accent", "surface"],
        additionalProperties: false,
      },
      transition: {
        type: "string",
        enum: ["morph", "fade", "push", "wipe", "split", "reveal", "cover", "uncover", "cut"],
      },
    };

    const required = ["title", "intro", "paragraphs", "conclusion", "key_takeaways", "aesthetic", "palette", "transition"];

    if (isTeacher) {
      (properties as any).lesson_plan = {
        type: "object",
        properties: {
          objectives: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
          prerequisites: { type: "array", items: { type: "string" } },
          materials: { type: "array", items: { type: "string" } },
          warmup: { type: "string" },
          guided_practice: { type: "string" },
          independent_practice: { type: "string" },
          closure: { type: "string" },
          differentiation: {
            type: "object",
            properties: {
              struggling: { type: "string" },
              on_level: { type: "string" },
              advanced: { type: "string" },
            },
            required: ["struggling", "on_level", "advanced"],
            additionalProperties: false,
          },
          assessment: { type: "string" },
          homework: { type: "string" },
          teacher_notes: { type: "string" },
        },
        required: [
          "objectives", "prerequisites", "materials", "warmup",
          "guided_practice", "independent_practice", "closure",
          "differentiation", "assessment", "homework", "teacher_notes",
        ],
        additionalProperties: false,
      };
      required.push("lesson_plan");
    }

    const tool = {
      type: "function",
      function: {
        name: "emit_lecture",
        description: "Emit a structured lecture outline with aesthetic metadata.",
        parameters: {
          type: "object",
          properties,
          required,
          additionalProperties: false,
        },
      },
    };

    const userPrompt = `Generate a complete lecture on: "${topic}"${subject ? ` (subject: ${subject})` : ""}.
Produce ${paragraphCount} body paragraphs.${isTeacher ? `\nMode: teacher. Grade: ${grade_level || "unspecified"}. Duration: ${duration_minutes} minutes.` : ""}${design_hint ? `\nUser design hint: ${design_hint}` : ""}`;

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

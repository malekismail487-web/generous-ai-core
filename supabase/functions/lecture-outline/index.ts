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
      mode = "student",
      grade_level = "",
      duration_minutes = 45,
      design_hint = "",
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
      "- concept_keyword (per paragraph): 1-3 word noun phrase naming the core idea (used as a slide motif).",
      "",
      "DECK DESIGN (read your own draft, then decide):",
      "- theme_tagline: ONE poetic line (max 10 words) capturing the deck's emotional throughline — derived from the actual content you just wrote.",
      "- aesthetic: pick ONE design language that best matches that theme. Choose from: cinematic_editorial, scholarly_serif, modern_minimal, scientific_grid, humanist_warm, editorial_magazine, technical_blueprint, classical_textbook, vibrant_creative. DEFAULT to cinematic_editorial for humanities, history, art, literature, philosophy, music, mythology. Use scientific_grid or technical_blueprint for STEM. Honor any user design_hint.",
      "- palette: 4 hex colors {primary, secondary, accent, surface} that match the aesthetic. For cinematic_editorial the surface MUST be near-black (#000000-#0A0A0A) and primary a warm off-white (#F5F1E8 / #EFE9DA). For light aesthetics surface is near-white.",
      "- transition: ONE PowerPoint transition that fits the aesthetic. Choose from: morph, fade, push, wipe, split, reveal, cover, uncover, cut. Prefer 'morph' for cinematic_editorial and editorial_magazine. Avoid gimmicks.",
      "",
      "HERO SUBJECT (recurring across all slides — this is the deck's anchor):",
      "- hero_subject_prompt: ONE self-contained prompt for a single iconic transparent-background subject that thematically anchors the WHOLE lecture (e.g. 'marble bust of Apollo' for Greek art, 'human brain anatomical model' for neuroscience, 'Roman Doric column' for classical architecture, 'DNA double helix' for genetics). MUST be a single object that can be photographed/rendered on pure transparent background and re-framed cinematically. Avoid scenes, multiple subjects, or text.",
      "- hero_subject_label: 2-4 word human label for that subject (e.g. 'Apollo Belvedere').",
      "",
      "PER-SLIDE LAYOUT (BALANCE IS MANDATORY — no slide may be word-heavy with no image, no slide may be image-heavy with no words):",
      "- For each paragraph, pick slide_layout from: ring_portrait, quadrant, half_bleed_left, half_bleed_right, stat_callout, iso_cube. VARY the layout across consecutive slides — never use the same layout twice in a row.",
      "  · ring_portrait: hero centered inside a thin ring, body text in a column to the side.",
      "  · quadrant: hero centered, 4 short bullet labels in the corners.",
      "  · half_bleed_left / half_bleed_right: hero fills half the slide, copy stack on the other half.",
      "  · stat_callout: ONE giant number or short phrase with brief supporting text and the hero small in a corner.",
      "  · iso_cube: 3-D isometric cube anchoring a single core concept — pick this for EXACTLY ONE paragraph (the most pivotal one).",
      "- hero_motion (per paragraph): the camera frame for the hero — {x, y, scale, rotate, opacity}. x,y are 0..1 centers, scale is 0.25..1.4 (fraction of slide height), rotate is -25..25 degrees, opacity is 0..1. VARY x/y/scale/rotate dramatically between consecutive slides so PowerPoint Morph creates cinematic motion. Never repeat the same hero_motion twice.",
      "",
      "EXACTLY ONE iso_cube slide is required across the deck. Place it at the most conceptually pivotal paragraph (NOT the first or last).",
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
      heading: { type: "string" },
      body: { type: "string" },
      image_prompt: { type: "string" },
      bullet_points: { type: "array", items: { type: "string" } },
      concept_keyword: { type: "string" },
      slide_layout: { type: "string" },
      hero_motion: {
        type: "object",
        properties: {
          x: { type: "number" },
          y: { type: "number" },
          scale: { type: "number" },
          rotate: { type: "number" },
          opacity: { type: "number" },
        },
        required: ["x", "y", "scale", "rotate"],
        additionalProperties: false,
      },
      diagram_spec: {
        type: "object",
        properties: {
          kind: { type: "string" },
          caption: { type: "string" },
          nodes: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "string" }, label: { type: "string" } },
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
      intro: { type: "string" },
      paragraphs: {
        type: "array",
        items: {
          type: "object",
          properties: paragraphProps,
          required: ["heading", "body", "image_prompt", "bullet_points", "concept_keyword", "slide_layout", "hero_motion"],
          additionalProperties: false,
        },
      },
      conclusion: { type: "string" },
      key_takeaways: { type: "array", items: { type: "string" } },
      theme_tagline: { type: "string" },
      hero_subject_prompt: { type: "string" },
      hero_subject_label: { type: "string" },
      aesthetic: { type: "string" },
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
      transition: { type: "string" },
    };

    const required = [
      "title", "intro", "paragraphs", "conclusion", "key_takeaways",
      "theme_tagline", "hero_subject_prompt", "hero_subject_label",
      "aesthetic", "palette", "transition",
    ];

    if (isTeacher) {
      (properties as any).lesson_plan = {
        type: "object",
        properties: {
          objectives: { type: "array", items: { type: "string" } },
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
        description: "Emit a structured lecture outline with aesthetic + cinematic deck metadata.",
        parameters: {
          type: "object",
          properties,
          required,
          additionalProperties: false,
        },
      },
    };

    const userPrompt = `Generate a complete, professional lecture on: "${topic}"${subject ? ` (subject: ${subject})` : ""}.
Produce ${paragraphCount} body paragraphs. Then READ YOUR OWN DRAFT and pick the aesthetic, palette, transition, hero subject, theme_tagline, and per-slide layouts/motions that best match what you just wrote. Balance every slide so words and visuals share weight.${isTeacher ? `\nMode: teacher. Grade: ${grade_level || "unspecified"}. Duration: ${duration_minutes} minutes.` : ""}${design_hint ? `\nUser design hint: ${design_hint}` : ""}`;

    const aiRes = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
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

    // ---- Server-side normalization to guarantee balance + exactly-one iso_cube ----
    try {
      const paragraphs: any[] = Array.isArray(parsed.paragraphs) ? parsed.paragraphs : [];
      const layouts = ["ring_portrait", "quadrant", "half_bleed_left", "half_bleed_right", "stat_callout"];
      let cubeCount = paragraphs.filter((p) => p?.slide_layout === "iso_cube").length;
      // Ensure exactly one iso_cube somewhere in the middle.
      if (cubeCount === 0 && paragraphs.length >= 3) {
        const mid = Math.floor(paragraphs.length / 2);
        paragraphs[mid].slide_layout = "iso_cube";
        cubeCount = 1;
      } else if (cubeCount > 1) {
        let seen = 0;
        for (const p of paragraphs) {
          if (p.slide_layout === "iso_cube") {
            if (seen > 0) p.slide_layout = "ring_portrait";
            seen += 1;
          }
        }
      }
      // No same layout twice in a row.
      for (let i = 1; i < paragraphs.length; i++) {
        if (paragraphs[i].slide_layout === paragraphs[i - 1].slide_layout && paragraphs[i].slide_layout !== "iso_cube") {
          const alt = layouts.find((l) => l !== paragraphs[i - 1].slide_layout) || "ring_portrait";
          paragraphs[i].slide_layout = alt;
        }
      }
      // Default hero_motion if missing — gentle camera arc across the deck.
      paragraphs.forEach((p, i) => {
        if (!p.hero_motion || typeof p.hero_motion !== "object") {
          const t = paragraphs.length > 1 ? i / (paragraphs.length - 1) : 0;
          p.hero_motion = {
            x: 0.3 + 0.4 * Math.sin(t * Math.PI),
            y: 0.45 + 0.1 * Math.cos(t * Math.PI * 1.3),
            scale: 0.55 + 0.35 * Math.cos(t * Math.PI),
            rotate: Math.round(-15 + 30 * t),
            opacity: 1,
          };
        }
      });
      parsed.paragraphs = paragraphs;
    } catch (e) {
      console.warn("normalize failed", e);
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

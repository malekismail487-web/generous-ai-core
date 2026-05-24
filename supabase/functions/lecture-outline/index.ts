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
      "- For math/science, output RAW LaTeX delimited as $...$ inline or $$...$$ display. DO NOT pre-render LaTeX.",
      "- Title must be specific to the topic, not generic.",
      "- key_takeaways: 5-7 short bullet sentences distilling the essential information.",
      "- bullet_points (per paragraph): 2-3 ultra-concise bullets (max 9 words each). NEVER copy body sentences verbatim.",
      "- concept_keyword (per paragraph): 1-3 word noun phrase naming the core idea.",
      "",
      "STEP 1 — THINK FIRST. CHOOSE A VISUAL IDENTITY FROM THE LECTURE, NOT FROM A TEMPLATE.",
      "Before writing paragraphs, decide what this specific lecture *looks like*. The identity must emerge from the actual subject matter — a chemistry lecture must not look the same as a poetry lecture or a history lecture. Different topics within the same subject should also feel distinct.",
      "",
      "Use these reference identities ONLY as inspiration for how committed an identity should feel. Do NOT pick one verbatim — generate the right one for THIS topic:",
      "  · Greek art / classical mythology → black background, ivory marble bust hero (e.g. Apollo Belvedere), cormorant serif, thin gold ring, morph transition",
      "  · Chemistry / atomic / molecular → deep navy + electron-glow accent, single floating molecule/atom hero with orbit rings, technical sans, morph transition (orbit-style)",
      "  · Biology / anatomy / genetics → warm parchment OR deep teal, hero is the relevant organic structure (heart, DNA helix, neuron, cell), humanist serif",
      "  · Physics / waves / mechanics → graphite charcoal, hero is the relevant apparatus or wavefront, monospace technical labels, push/wipe transition for forward motion",
      "  · Pure mathematics → near-black or paper-white, hero is the central geometric form (icosahedron, parabola surface, fractal), precise grid background, morph for geometric reveal",
      "  · Computer science / algorithms → dark slate, hero is a 3-D abstraction of the data structure (tree, graph, hash table), monospace, morph",
      "  · History / civilizations → aged parchment OR midnight oil-painting palette, hero is the iconic artifact/figure of the period, classical serif, fade for archival reveal",
      "  · Literature / poetry → cream paper, ink-black, hero is a sculptural emblem from the work (a quill, a mask, a chess piece — never a book cover), editorial serif",
      "  · Religion / Islamic studies → cream + deep emerald or indigo, hero is a relevant architectural element (mihrab, dome, geometric pattern), no figurative human subjects",
      "  · Business / economics → off-white minimal, hero is a precise 3-D infographic object (bar tower, axis, ledger), modern sans, push transition",
      "  · Geography / earth science → deep blue or terracotta, hero is the relevant terrain/globe/strata, humanist sans",
      "Every other topic: invent an equally committed identity from first principles. The hero must be a real sculpted 3-D OBJECT that any educated person would associate with this exact lecture — not a generic cube, not a stock illustration.",
      "",
      "STEP 2 — EMIT THE IDENTITY:",
      "- hero_subject_prompt: ONE rich self-contained prompt (40-80 words) for a single sculpted 3-D subject that anchors THIS lecture. MUST be a single dimensional object suitable for a transparent-background cutout, premium museum/gallery side-lighting, photoreal materials, no text, no labels, no background scene. Specify the exact subject (e.g. 'a polished white marble bust of Apollo Belvedere, three-quarter view'). Different lecture, different subject — never reuse 'cube', 'sphere', 'abstract shape'.",
      "- hero_subject_label: 2-4 word human label for that subject.",
      "- theme_tagline: ONE poetic line (max 10 words) capturing the deck's emotional throughline.",
      "- aesthetic: pick ONE from: cinematic_editorial, scholarly_serif, modern_minimal, scientific_grid, humanist_warm, editorial_magazine, technical_blueprint, classical_textbook, vibrant_creative. The choice MUST be defensible from the topic.",
      "- palette: 4 hex colors {primary, secondary, accent, surface} that match the identity. Dark identities → near-black surface (#000000-#0A0A0A) + warm off-white primary. Light identities → near-white surface + deep ink primary. Accent is the single saturated color used for emphasis only.",
      "- transition: pick ONE PowerPoint transition that fits the topic's motion vocabulary. Choose from: morph, fade, push, wipe, split, reveal, cover, uncover, cut. Prefer 'morph' for anything where the hero subject can rotate/expand/reveal continuously (art, biology, chemistry, geometry, architecture). Use 'fade' for archival/historical. Avoid gimmicks.",
      "",
      "STEP 3 — PER-PARAGRAPH SLIDE VISUALS (each slide needs its OWN unique 3-D figure tied to that specific concept):",
      "- image_prompt (per paragraph): a UNIQUE sculpted 3-D object for THIS slide's concept, in the same material/lighting family as the hero so the deck feels cohesive but never repetitive. Example: a lecture about Apollo can have the bust as hero, then per-slide figures of a marble lyre, a laurel wreath, an arrow quiver, a sun disc — all in the same ivory marble + black backdrop language. Always specify: transparent-background cutout, premium museum lighting, dimensional materials, no text, no labels, no watermark, professional presentation asset.",
      "- diagram_spec (per paragraph, OPTIONAL): include ONLY when a schematic genuinely teaches the concept (flow, cycle, comparison, anatomy, chart). Never decorative.",
      "",
      "STEP 4 — PER-SLIDE LAYOUT (vary aggressively, never feel template-driven):",
      "- For each paragraph, pick slide_layout from: ring_portrait, quadrant, half_bleed_left, half_bleed_right, stat_callout, iso_cube. NEVER use the same layout twice in a row.",
      "  · ring_portrait: hero centered inside a thin ring, body text in a side column.",
      "  · quadrant: hero centered, 4 short bullet labels in the corners.",
      "  · half_bleed_left / half_bleed_right: figure fills one half, copy on the other.",
      "  · stat_callout: ONE giant number/phrase + brief support, figure small in a corner.",
      "  · iso_cube: rebranded — a concept slide where the slide's own sculpted 3-D figure dominates the right half against a continuity ring. Use at most ONCE per deck for the most pivotal concept.",
      "- hero_motion (per paragraph): {x, y, scale, rotate, opacity}. x,y are 0..1 centers, scale 0.25..1.4, rotate -25..25, opacity 0..1. VARY dramatically between consecutive slides so PowerPoint Morph creates real cinematic motion of the hero — never repeat the same motion twice. Think of it as a camera arc: open wide → drift in → frame the subject → pull back for the takeaway.",
      "",
      "CRITICAL: The hero subject is NOT decorative. It is the single 3-D object that visually represents this lecture across every slide, morphing position/scale/rotation between slides. Each slide also has its own unique per-concept 3-D figure. No fake cubes. No stock geometry. Every figure must be defensibly tied to the specific concept it illustrates.",
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

    const gatewayBody = (model: string) => ({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "emit_lecture" } },
    });

    let aiRes: Response | null = null;
    let lastGatewayText = "";
    for (const model of ["google/gemini-3.5-flash", "google/gemini-2.5-flash", "openai/gpt-5-mini"]) {
      aiRes = await fetch(AI_GATEWAY_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(gatewayBody(model)),
      });
      if (aiRes.ok || aiRes.status === 429 || aiRes.status === 402) break;
      lastGatewayText = await aiRes.text().catch(() => "");
      console.error("lecture-outline gateway retry", model, aiRes.status, lastGatewayText.slice(0, 500));
    }

    if (!aiRes?.ok) {
      const txt = lastGatewayText || await aiRes?.text().catch(() => "") || "";
      const status = aiRes?.status || 500;
      console.error("lecture-outline gateway error", status, txt);
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limit. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

      // ---- Server-side normalization to guarantee balance + varied sculpted 3-D visuals ----
    try {
      const paragraphs: any[] = Array.isArray(parsed.paragraphs) ? parsed.paragraphs : [];
      const layouts = ["ring_portrait", "quadrant", "half_bleed_left", "half_bleed_right", "stat_callout"];
      let cubeCount = paragraphs.filter((p) => p?.slide_layout === "iso_cube").length;
        // Keep at most one cube. It should never become the visual default.
        if (cubeCount > 1) {
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
        const basePrompt = typeof p.image_prompt === "string" ? p.image_prompt : `${p.heading || parsed.title} sculpted 3-D educational figure`;
        const concept = p.concept_keyword || p.heading || `concept ${i + 1}`;
        p.image_prompt = `${basePrompt}\nCreate a unique sculpted 3-D figure/object for this exact slide concept: ${concept}. Make it the dominant visual for the slide: premium cinematic museum lighting, transparent background cutout, dimensional materials and depth, professional presentation asset, balanced with text space, no text, no labels, no watermark. Do not reuse the same subject as other slides.`;
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

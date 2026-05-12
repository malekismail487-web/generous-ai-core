// adaptive-validate — scores an AI output against the student's adaptive profile.
// POST { output, feature, subject?, profile_snapshot } -> { score, dimensions, failures, should_regenerate, addendum }
//
// Uses Gemini Flash Lite via Lovable AI Gateway with tool calling for a fast structured response.
// Logs every score to public.adaptive_quality_scores (best-effort; failures don't block the response).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
// Fast + cheap; we only need a small structured judgment, not deep reasoning.
const VALIDATOR_MODEL = "google/gemini-2.5-flash-lite";
const SCORE_THRESHOLD = 0.85;
const OUTPUT_SAMPLE_CHARS = 4000; // cap forwarded text to keep validator fast

interface ProfileSnapshot {
  adaptiveLevel?: string;        // basic | intermediate | advanced | expert
  dominantStyle?: string;        // visual | verbal | kinesthetic | logical
  cognitiveLoad?: number;        // 0..1
  fatigueLevel?: number;         // 0..1
  forbiddenPatterns?: string[];  // e.g. ["no jargon", "no baby talk"]
}

const VALIDATOR_TOOL = {
  type: "function" as const,
  function: {
    name: "score_adaptation",
    description:
      "Score how well an AI output matches a student's adaptive profile across four dimensions.",
    parameters: {
      type: "object",
      properties: {
        vocabulary_match: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description:
            "1.0 = vocabulary perfectly fits the adaptive level; 0 = mismatched (too simple or too advanced).",
        },
        modality_match: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description:
            "1.0 = explanation modality (analogies/diagrams/steps/code) matches dominant learning style.",
        },
        density_match: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description:
            "1.0 = length and density match cognitive load + fatigue (high fatigue ⇒ shorter, simpler).",
        },
        forbidden_clean: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description:
            "1.0 = no forbidden patterns present (jargon for Basic, baby talk for Expert, etc.).",
        },
        failures: {
          type: "array",
          items: { type: "string" },
          description: "Short bullet phrases describing any dimension that scored below 0.8.",
        },
        addendum: {
          type: "string",
          description:
            "If overall score < 0.85, a single corrective instruction to prepend to a regeneration prompt. Empty string otherwise.",
        },
      },
      required: [
        "vocabulary_match",
        "modality_match",
        "density_match",
        "forbidden_clean",
        "failures",
        "addendum",
      ],
      additionalProperties: false,
    },
  },
};

function buildSystemPrompt(profile: ProfileSnapshot, feature: string, subject?: string): string {
  const level = profile.adaptiveLevel || "intermediate";
  const style = profile.dominantStyle || "balanced";
  const load = typeof profile.cognitiveLoad === "number" ? profile.cognitiveLoad.toFixed(2) : "0.50";
  const fatigue = typeof profile.fatigueLevel === "number" ? profile.fatigueLevel.toFixed(2) : "0.30";
  const forbidden = (profile.forbiddenPatterns || []).join("; ") || "none specified";

  return [
    "You are an adaptive-learning quality auditor.",
    "Given a student's profile and an AI tutor's output, you judge how well the output matches the profile.",
    "Be strict but fair. Score each dimension 0..1 to two decimal places.",
    "",
    `FEATURE: ${feature}`,
    subject ? `SUBJECT: ${subject}` : "",
    "",
    "STUDENT PROFILE:",
    `- adaptive level: ${level}`,
    `- dominant learning style: ${style}`,
    `- cognitive load (0 low – 1 high): ${load}`,
    `- fatigue level (0 fresh – 1 tired): ${fatigue}`,
    `- forbidden patterns: ${forbidden}`,
    "",
    "Rubric:",
    "- vocabulary_match: word choice, abstraction, jargon density appropriate for the level.",
    "- modality_match: visual ⇒ diagrams/spatial language; verbal ⇒ definitions/prose; kinesthetic ⇒ steps/examples; logical ⇒ structure/proofs.",
    "- density_match: high fatigue or load ⇒ shorter, more whitespace, fewer simultaneous concepts.",
    "- forbidden_clean: penalize any forbidden patterns (1 = none present).",
    "Call the score_adaptation tool exactly once.",
  ].filter(Boolean).join("\n");
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function getUser(req: Request): Promise<{ id: string; schoolId: string | null } | null> {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  try {
    const supa = admin();
    const { data: { user } } = await supa.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return null;
    const { data: profile } = await supa
      .from("profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle();
    return { id: user.id, schoolId: profile?.school_id ?? null };
  } catch {
    return null;
  }
}

async function callValidator(
  systemPrompt: string,
  output: string,
): Promise<{
  vocabulary_match: number;
  modality_match: number;
  density_match: number;
  forbidden_clean: number;
  failures: string[];
  addendum: string;
}> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("missing_api_key");

  const body = {
    model: VALIDATOR_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `OUTPUT TO JUDGE (excerpt):\n"""\n${output.slice(0, OUTPUT_SAMPLE_CHARS)}\n"""`,
      },
    ],
    tools: [VALIDATOR_TOOL],
    tool_choice: { type: "function", function: { name: "score_adaptation" } },
    temperature: 0.2,
  };

  // One retry on 429 with backoff (per project edge-function convention)
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429 || res.status === 402) {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }
      throw new Error(res.status === 429 ? "rate_limited" : "credits_exhausted");
    }
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`validator_${res.status}: ${txt.slice(0, 200)}`);
    }

    const data = await res.json();
    const tc = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!tc?.function?.arguments) throw new Error("no_tool_call");
    return JSON.parse(tc.function.arguments);
  }
  throw new Error("retry_exhausted");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const user = await getUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const output = typeof body.output === "string" ? body.output : "";
  const feature = typeof body.feature === "string" ? body.feature.slice(0, 80) : "";
  const subject = body.subject ? String(body.subject).slice(0, 120) : null;
  const profile: ProfileSnapshot = body.profile_snapshot && typeof body.profile_snapshot === "object"
    ? body.profile_snapshot
    : {};
  const regenerated = !!body.regenerated;

  if (!output || !feature) {
    return new Response(JSON.stringify({ error: "output_and_feature_required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Very short outputs aren't worth validating — assume they are fine.
  if (output.trim().length < 40) {
    return new Response(
      JSON.stringify({
        score: 1,
        dimensions: { vocabulary_match: 1, modality_match: 1, density_match: 1, forbidden_clean: 1 },
        failures: [],
        addendum: "",
        should_regenerate: false,
        skipped: "too_short",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const systemPrompt = buildSystemPrompt(profile, feature, subject ?? undefined);

  let result;
  try {
    result = await callValidator(systemPrompt, output);
  } catch (e) {
    const msg = (e as Error).message || "validator_failed";
    // Fail OPEN: never block the user-facing flow on validator errors.
    return new Response(
      JSON.stringify({
        score: null,
        dimensions: null,
        failures: [],
        addendum: "",
        should_regenerate: false,
        error: msg,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Composite score: equal-weighted mean (kept simple; tweak later if needed).
  const dims = {
    vocabulary_match: clamp01(result.vocabulary_match),
    modality_match: clamp01(result.modality_match),
    density_match: clamp01(result.density_match),
    forbidden_clean: clamp01(result.forbidden_clean),
  };
  const score = Number(
    ((dims.vocabulary_match + dims.modality_match + dims.density_match + dims.forbidden_clean) / 4).toFixed(3),
  );
  const shouldRegenerate = !regenerated && score < SCORE_THRESHOLD;

  // Persist (best-effort). Use service role to bypass any RLS friction; we set user_id explicitly.
  try {
    await admin().from("adaptive_quality_scores").insert({
      user_id: user.id,
      school_id: user.schoolId,
      feature,
      subject,
      score,
      dimensions: dims,
      failures: Array.isArray(result.failures) ? result.failures.slice(0, 8) : [],
      regenerated,
      profile_snapshot: profile,
      output_excerpt: output.slice(0, 500),
    });
  } catch (e) {
    console.warn("[adaptive-validate] log insert failed:", (e as Error).message);
  }

  return new Response(
    JSON.stringify({
      score,
      dimensions: dims,
      failures: result.failures || [],
      addendum: shouldRegenerate ? (result.addendum || "") : "",
      should_regenerate: shouldRegenerate,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

function clamp01(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

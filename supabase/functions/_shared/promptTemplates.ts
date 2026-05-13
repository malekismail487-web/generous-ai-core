// Deno-compatible mirror of src/lib/promptTemplates.ts
// Edge functions can't import from src/, so this is the canonical server-side copy.
// Keep these two files in sync if either changes.

export type AdaptiveLevel = "basic" | "intermediate" | "advanced" | "expert";
export type LearningStyle = "visual" | "verbal" | "kinesthetic" | "logical" | "balanced";

export interface TemplateSpec {
  paragraphCount: number;
  sentenceBudget: string;
  vocabulary: string;
  modality: string;
  forbidden: string[];
}

const LEVEL_SPECS: Record<AdaptiveLevel, Omit<TemplateSpec, "modality">> = {
  basic: {
    paragraphCount: 6,
    sentenceBudget: "3-5 SHORT sentences (avg 12-16 words). Whitespace between concepts.",
    vocabulary:
      "8th-grade vocabulary. Concrete nouns. NO jargon — if a domain term is unavoidable, immediately define it in plain words and follow with a familiar analogy.",
    forbidden: ["jargon-without-definition", "long compound sentences", "passive voice chains", "abstract framing without an example"],
  },
  intermediate: {
    paragraphCount: 6,
    sentenceBudget: "4-6 sentences per paragraph (avg 18-22 words).",
    vocabulary:
      "High-school / early-college vocabulary. Standard academic register. Introduce one or two precise domain terms per paragraph, defined in context.",
    forbidden: ["baby talk", "over-simplification", "graduate-level jargon dumps"],
  },
  advanced: {
    paragraphCount: 7,
    sentenceBudget: "5-7 sentences per paragraph; precise and information-dense.",
    vocabulary:
      "Upper-division undergraduate. Use the field's standard technical terminology without re-defining basics. Quantitative claims preferred over hand-waving.",
    forbidden: ["analogies that replace mechanism", "padding", "encyclopedia-tone summaries"],
  },
  expert: {
    paragraphCount: 8,
    sentenceBudget: "6-9 sentences per paragraph. Tight, citation-aware prose.",
    vocabulary:
      "Graduate / specialist register. Domain-precise terminology, derivations, edge cases, and current research framing. Assume the reader knows the prerequisites.",
    forbidden: ["explaining first-principles a specialist already knows", "wikipedia tone", "marketing adjectives"],
  },
};

const MODALITY_FRAGMENTS: Record<LearningStyle, string> = {
  visual:
    "Lean into spatial / diagrammatic language. Describe shapes, layouts, before/after states, and 'imagine a figure where…' framings. Every paragraph should suggest something the reader can visualize.",
  verbal:
    "Lean into precise definitions, named principles, and well-formed prose. Build understanding through chained reasoning sentences rather than diagrams.",
  kinesthetic:
    "Lean into stepwise procedures, worked examples, and 'try this' framings. Show the mechanism through sequenced actions, not just outcomes.",
  logical:
    "Lean into structured argumentation: premises → derivation → consequence. Use enumerated structure where it clarifies. Surface causal chains explicitly.",
  balanced:
    "Mix definitions, one quick visual analogy, and a worked example per major concept. Don't over-index on any single modality.",
};

export function getTemplateSpec(
  level: AdaptiveLevel = "intermediate",
  style: LearningStyle = "balanced",
): TemplateSpec {
  const base = LEVEL_SPECS[level] ?? LEVEL_SPECS.intermediate;
  return { ...base, modality: MODALITY_FRAGMENTS[style] ?? MODALITY_FRAGMENTS.balanced };
}

export function buildHardRoutedSystemPrompt(params: {
  feature: string;
  level: AdaptiveLevel;
  style: LearningStyle;
  addendum?: string;
  extraRules?: string;
}): string {
  const { feature, level, style, addendum, extraRules } = params;
  const spec = getTemplateSpec(level, style);

  const correction = addendum && addendum.trim()
    ? `STRICT CORRECTION (from quality auditor — your previous attempt failed adaptation. OBEY THIS BEFORE EVERYTHING ELSE):\n${addendum.trim()}\n\n`
    : "";

  return [
    correction,
    `FEATURE: ${feature}`,
    `ADAPTIVE LEVEL: ${level.toUpperCase()}`,
    `DOMINANT LEARNING STYLE: ${style.toUpperCase()}`,
    "",
    "VOCABULARY DIRECTIVE:",
    spec.vocabulary,
    "",
    "DENSITY DIRECTIVE:",
    spec.sentenceBudget,
    `Produce exactly ${spec.paragraphCount} body paragraphs unless the output schema constrains otherwise.`,
    "",
    "MODALITY DIRECTIVE:",
    spec.modality,
    "",
    "FORBIDDEN PATTERNS (penalized by automated audit):",
    ...spec.forbidden.map((f) => `- ${f}`),
    extraRules ? "\nFEATURE-SPECIFIC RULES:\n" + extraRules : "",
  ].join("\n").trim();
}

export function normalizeLevel(input: unknown): AdaptiveLevel {
  const v = String(input ?? "").toLowerCase();
  if (v === "basic" || v === "beginner") return "basic";
  if (v === "advanced") return "advanced";
  if (v === "expert" || v === "graduate") return "expert";
  return "intermediate";
}

export function normalizeStyle(input: unknown): LearningStyle {
  const v = String(input ?? "").toLowerCase();
  if (v.includes("visual")) return "visual";
  if (v.includes("verbal") || v.includes("read") || v.includes("write")) return "verbal";
  if (v.includes("kines") || v.includes("hands")) return "kinesthetic";
  if (v.includes("logic") || v.includes("analyt")) return "logical";
  return "balanced";
}

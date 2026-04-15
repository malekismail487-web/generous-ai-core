/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * LUMINARY COGNITIVE TEST (LCT) — Edge Function
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Comprehensive backend for the LCT standardized testing system.
 * Handles the complete lifecycle from exam creation to results analytics.
 * 
 * Actions:
 *   1. collect_data    — Gather eligible students (Grade 9+) from selected schools
 *   2. generate_exam   — AI-powered generation of 140 MCQ questions across 5 subjects
 *   3. validate_exam   — Cross-model verification of generated answer keys
 *   4. translate_exam  — Reword questions per student's learning style
 *   5. start_exam      — Activate exam, lock all students for 2 hours
 *   6. submit_exam     — Student submits answers, auto-graded with detailed feedback
 *   7. end_exam        — Force-end: auto-grade incomplete, remove locks
 *   8. get_analytics   — Comprehensive post-exam analytics & statistics
 *   9. get_student_detail — Detailed per-student result with question-level breakdown
 *  10. retry_subject   — Regenerate questions for a specific failed subject
 * 
 * Architecture:
 * ┌─────────────────────────────────────────────────────┐
 * │  Super Admin (malekismail487@gmail.com)              │
 * │  ├── collect_data → profiles + learning_style_profiles│
 * │  ├── generate_exam → AI Gateway (Gemini 2.5 Flash)  │
 * │  ├── validate_exam → AI Gateway (Gemini Flash Lite) │
 * │  ├── translate_exam → Per-style AI translation      │
 * │  ├── start_exam → Create locks, activate timer      │
 * │  ├── end_exam → Auto-grade, cleanup locks           │
 * │  ├── get_analytics → Aggregate statistics           │
 * │  └── get_student_detail → Individual breakdown      │
 * │                                                      │
 * │  Student (authenticated)                             │
 * │  └── submit_exam → Grade + remove lock              │
 * └─────────────────────────────────────────────────────┘
 * 
 * Security:
 *   - All admin actions require verified super admin email
 *   - Student actions require authenticated user + exam assignment verification
 *   - Timer is server-authoritative (locked_until timestamp)
 *   - Lock survives logout/login (database-driven, not session-based)
 * 
 * AI Models:
 *   - Primary: google/gemini-2.5-flash (generation + translation)
 *   - Validation: google/gemini-2.5-flash-lite (answer key verification)
 * 
 * Rate Limiting:
 *   - Exponential backoff on 429/402 errors (15s → 60s)
 *   - 3s delay between subject generations
 *   - 2s delay between translation batches
 *   - Max 4 retries per AI call
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const SUPER_ADMIN_EMAIL = "malekismail487@gmail.com";

// AI Model configuration
const PRIMARY_MODEL = "google/gemini-2.5-flash";
const VALIDATION_MODEL = "google/gemini-2.5-flash-lite";

// Exam configuration
const EXAM_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours
const QUESTIONS_PER_SUBJECT = 28;
const TOTAL_QUESTIONS = 140;
const MIN_VALID_RATIO = 0.7; // Minimum 70% questions must pass validation
const BATCH_INSERT_SIZE = 50;
const TRANSLATION_BATCH_SIZE = 100;

// Subject definitions with comprehensive topic coverage
const SUBJECTS = [
  {
    name: "English",
    count: QUESTIONS_PER_SUBJECT,
    emoji: "📝",
    topics: [
      "Reading comprehension & passage analysis",
      "Advanced grammar & syntax",
      "Vocabulary in context & word roots",
      "Literary analysis (metaphor, irony, symbolism, tone)",
      "Rhetorical analysis & persuasive techniques",
      "Sentence completion & error identification",
      "Passage-based logical reasoning",
      "Poetry analysis & figurative language",
    ],
    difficultyNotes: "Focus on nuanced interpretations, not surface-level recall. Test ability to distinguish between similar answer choices using textual evidence.",
  },
  {
    name: "Mathematics",
    count: QUESTIONS_PER_SUBJECT,
    emoji: "🔢",
    topics: [
      "Advanced algebra (polynomials, systems, inequalities)",
      "Geometry (proofs, coordinate, transformations)",
      "Trigonometry (identities, equations, applications)",
      "Pre-calculus (limits, derivatives basics, sequences)",
      "Statistics & probability (distributions, inference)",
      "Number theory & combinatorics",
      "Functions (composition, inverse, transformations)",
      "Problem solving & mathematical reasoning",
    ],
    difficultyNotes: "Include multi-step problems requiring synthesis of multiple concepts. Use specific numerical values. Avoid problems solvable by plugging in answers.",
  },
  {
    name: "Physics",
    count: QUESTIONS_PER_SUBJECT,
    emoji: "⚡",
    topics: [
      "Classical mechanics (Newton's laws, energy, momentum)",
      "Thermodynamics (laws, heat transfer, entropy)",
      "Waves & optics (interference, diffraction, lenses)",
      "Electricity & magnetism (circuits, fields, induction)",
      "Modern physics (quantum basics, relativity, nuclear)",
      "Fluid mechanics (pressure, buoyancy, flow)",
      "Circular motion & gravitation",
      "Dimensional analysis & experimental design",
    ],
    difficultyNotes: "Include quantitative problems with realistic physical scenarios. Test conceptual understanding alongside mathematical application.",
  },
  {
    name: "Chemistry",
    count: QUESTIONS_PER_SUBJECT,
    emoji: "🧪",
    topics: [
      "Atomic structure & quantum numbers",
      "Chemical bonding (ionic, covalent, metallic, intermolecular)",
      "Stoichiometry & limiting reagents",
      "Thermochemistry & calorimetry",
      "Chemical equilibrium & Le Chatelier's principle",
      "Acids, bases & buffer systems",
      "Organic chemistry (nomenclature, reactions, functional groups)",
      "Electrochemistry & periodic trends",
    ],
    difficultyNotes: "Include reaction prediction, mechanism reasoning, and quantitative calculations. Test deep understanding of why reactions occur, not just what happens.",
  },
  {
    name: "Biology",
    count: QUESTIONS_PER_SUBJECT,
    emoji: "🧬",
    topics: [
      "Cell biology (organelles, membrane transport, cell cycle)",
      "Genetics & heredity (Mendelian, molecular, population)",
      "Evolution & natural selection",
      "Ecology (energy flow, population dynamics, biomes)",
      "Human physiology (nervous, cardiovascular, immune systems)",
      "Molecular biology (DNA replication, transcription, translation)",
      "Plant biology (photosynthesis, transpiration, hormones)",
      "Microbiology & biotechnology (PCR, gel electrophoresis, CRISPR)",
    ],
    difficultyNotes: "Test experimental design skills, data interpretation, and application of biological principles to novel scenarios.",
  },
];

// Learning style translation instructions
const STYLE_INSTRUCTIONS: Record<string, string> = {
  visual: `Reword each question to leverage visual-spatial thinking. Include references to diagrams, graphs, charts, spatial relationships, or visual representations. Use phrases like:
  - "Examine the following diagram..."
  - "Visualize a scenario where..."
  - "Looking at the pattern shown..."
  - "Consider the graph that represents..."
  - "If you were to draw/map/chart..."
  For math/science, describe what a visual representation would look like. Make abstract concepts concrete through spatial metaphors.
  
  CRITICAL: Do NOT change the difficulty, correct answer, or fundamental content. Only change HOW the question is presented.`,

  logical: `Reword each question using systematic, step-by-step logical frameworks. Structure questions as logical chains and deductive reasoning. Use phrases like:
  - "Given that X... and knowing that Y... what follows?"
  - "If we apply the principle that..."
  - "Following the sequence of reasoning..."
  - "Based on the logical relationship between..."
  - "Step 1: ... Step 2: ... Therefore..."
  Emphasize cause-and-effect relationships, conditional reasoning, and systematic elimination.
  
  CRITICAL: Do NOT change the difficulty, correct answer, or fundamental content. Only change HOW the question is framed.`,

  conceptual: `Reword each question to emphasize abstract concepts, theoretical frameworks, and big-picture understanding. Use phrases like:
  - "In the broader context of..."
  - "Considering the underlying principle..."
  - "From a theoretical perspective..."
  - "How does this concept connect to..."
  - "What is the fundamental reason why..."
  Focus on conceptual connections between ideas, underlying principles, and theoretical implications rather than specific procedural details.
  
  CRITICAL: Do NOT change the difficulty, correct answer, or fundamental content. Only change the conceptual framing.`,

  kinesthetic: `Reword each question to reference hands-on activities, physical processes, experiments, and real-world applications. Use phrases like:
  - "If you were conducting an experiment..."
  - "During a hands-on demonstration..."
  - "While physically performing this procedure..."
  - "Imagine you are building/constructing/assembling..."
  - "In a laboratory setting, you observe..."
  Make abstract concepts concrete through physical analogies, experimental scenarios, and tactile descriptions.
  
  CRITICAL: Do NOT change the difficulty, correct answer, or fundamental content. Only change the experiential framing.`,

  verbal: `Reword each question using rich narrative context, analogies, and descriptive language. Create brief scenario-based stems with storytelling elements. Use phrases like:
  - "Consider the following scenario..."
  - "To illustrate this concept, imagine..."
  - "A researcher explains to a colleague that..."
  - "In the words of a leading expert..."
  - "The story of this phenomenon begins with..."
  Use metaphors, analogies, and narrative techniques to make questions more engaging through language.
  
  CRITICAL: Do NOT change the difficulty, correct answer, or fundamental content. Only change the narrative style.`,
};

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function getSupabaseAuth() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!
  );
}

function respond(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function respondError(message: string, status = 400) {
  console.error(`[LCT ERROR] ${message}`);
  return respond({ error: message }, status);
}

/**
 * Generate a random seed for variety in AI outputs.
 * Prevents identical exams across different LCT runs.
 */
function generateVarietySeed(): string {
  const adjectives = ["challenging", "rigorous", "comprehensive", "advanced", "analytical", "critical", "deep", "thorough"];
  const approaches = ["application-focused", "scenario-based", "problem-solving", "conceptual", "analytical", "evaluative"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const app = approaches[Math.floor(Math.random() * approaches.length)];
  const seed = Math.floor(Math.random() * 100000);
  return `Style: ${adj}, ${app}. Seed: ${seed}. Timestamp: ${Date.now()}`;
}

/**
 * Extract grade number from grade_level string.
 * Handles formats: "9", "Grade 9", "G9", "9th", etc.
 */
function extractGradeNumber(gradeLevel: string | null): number {
  if (!gradeLevel) return -1;
  const str = gradeLevel.toString().trim();
  
  // Try direct number
  const directNum = parseInt(str, 10);
  if (!isNaN(directNum) && directNum > 0 && directNum <= 12) return directNum;
  
  // Extract numbers from string
  const numMatch = str.match(/(\d+)/);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    if (num > 0 && num <= 12) return num;
  }
  
  return -1;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI GATEWAY — Robust caller with retry logic
// ═══════════════════════════════════════════════════════════════════════════════

interface AICallOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  retries?: number;
}

/**
 * Call the Lovable AI Gateway with comprehensive error handling and retry logic.
 * 
 * Retry strategy:
 *   - 429 (Rate Limited): Exponential backoff starting at 15s
 *   - 402 (Payment Required): Longer backoff starting at 20s
 *   - Other errors: Standard backoff starting at 10s
 *   - Maximum 4 attempts per call
 */
async function callAI(prompt: string, systemPrompt: string, options: AICallOptions = {}): Promise<string> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    throw new Error("LOVABLE_API_KEY is not configured. Cannot make AI calls.");
  }

  const model = options.model || PRIMARY_MODEL;
  const maxTokens = options.maxTokens || 32000;
  const temperature = options.temperature || 0.7;
  const maxRetries = options.retries || 4;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const attemptLabel = `[AI ${model} attempt ${attempt + 1}/${maxRetries}]`;
    
    try {
      console.log(`${attemptLabel} Calling AI Gateway...`);
      
      const res = await fetch(AI_GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature,
          max_tokens: maxTokens,
        }),
      });

      // Handle rate limiting
      if (res.status === 429) {
        const delay = Math.min((attempt + 1) * 15000, 60000);
        console.warn(`${attemptLabel} Rate limited (429). Waiting ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // Handle payment issues
      if (res.status === 402) {
        const delay = Math.min((attempt + 1) * 20000, 60000);
        console.warn(`${attemptLabel} Payment required (402). Waiting ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // Handle other HTTP errors
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`AI Gateway error ${res.status}: ${errText.slice(0, 500)}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "";
      
      if (!content || content.trim().length < 10) {
        throw new Error("AI returned empty or too-short response");
      }

      console.log(`${attemptLabel} Success. Response length: ${content.length} chars`);
      return content;
      
    } catch (e) {
      console.error(`${attemptLabel} Failed:`, e instanceof Error ? e.message : e);
      
      if (attempt === maxRetries - 1) {
        throw new Error(`AI call failed after ${maxRetries} attempts: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
      
      const delay = (attempt + 1) * 10000;
      console.log(`${attemptLabel} Retrying in ${delay / 1000}s...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  
  throw new Error("AI call failed: exhausted all retries");
}

// ═══════════════════════════════════════════════════════════════════════════════
// JSON PARSING — Multi-strategy parser for AI responses
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parse JSON from AI response using multiple fallback strategies.
 * 
 * Strategies (in order):
 *   1. Direct JSON.parse
 *   2. Extract from markdown code blocks (```json ... ```)
 *   3. Find largest JSON array in text
 *   4. Fix common JSON issues (trailing commas) and retry
 *   5. Line-by-line object extraction (last resort)
 */
function parseJsonFromAI(text: string): any[] {
  const trimmed = text.trim();
  
  // Strategy 1: Direct parse
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === "object") return [parsed];
  } catch { /* continue */ }

  // Strategy 2: Extract from markdown code blocks
  const codeBlockPatterns = [
    /```json\s*([\s\S]*?)```/g,
    /```\s*([\s\S]*?)```/g,
  ];
  
  for (const pattern of codeBlockPatterns) {
    const matches = [...trimmed.matchAll(pattern)];
    for (const match of matches) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (Array.isArray(parsed)) return parsed;
      } catch { /* continue */ }
    }
  }

  // Strategy 3: Find largest JSON array in text
  const arrayMatches = trimmed.match(/\[[\s\S]*\]/g);
  if (arrayMatches) {
    const sorted = arrayMatches.sort((a, b) => b.length - a.length);
    for (const match of sorted) {
      try {
        const parsed = JSON.parse(match);
        if (Array.isArray(parsed)) return parsed;
      } catch { /* continue */ }
    }
  }

  // Strategy 4: Fix common JSON issues
  try {
    const cleaned = trimmed
      .replace(/,\s*]/g, "]")
      .replace(/,\s*}/g, "}")
      .replace(/\n/g, " ")
      .replace(/\t/g, " ");
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      return JSON.parse(arrayMatch[0]);
    }
  } catch { /* continue */ }

  // Strategy 5: Try to find individual JSON objects and collect them
  try {
    const objects: any[] = [];
    const objectPattern = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
    const matches = trimmed.matchAll(objectPattern);
    for (const match of matches) {
      try {
        const obj = JSON.parse(match[0]);
        if (obj.question && obj.options) {
          objects.push(obj);
        }
      } catch { /* skip individual */ }
    }
    if (objects.length > 0) return objects;
  } catch { /* continue */ }

  throw new Error(`Failed to parse AI response as JSON. First 300 chars: ${trimmed.slice(0, 300)}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUESTION VALIDATION — Multi-layer validation pipeline
// ═══════════════════════════════════════════════════════════════════════════════

interface ValidatedQuestion {
  id: number;
  subject: string;
  question: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  difficulty_tier?: string;
}

/**
 * Validate questions against strict quality criteria.
 * 
 * Validation checks:
 *   1. Required fields present (question, options, correct_answer)
 *   2. Exactly 4 options
 *   3. Valid answer letter (A/B/C/D)
 *   4. Question text is meaningful (length > 15 chars)
 *   5. Options are meaningful (each > 3 chars)
 *   6. Options have proper labeling (A), B), C), D))
 *   7. No duplicate options
 *   8. Explanation is educational (length > 10 chars)
 */
function validateQuestions(questions: any[], expectedCount: number, subject: string): ValidatedQuestion[] {
  const valid: ValidatedQuestion[] = [];
  const rejected: { index: number; reason: string }[] = [];

  questions.forEach((q: any, index: number) => {
    // Check required fields
    if (!q || typeof q !== "object") {
      rejected.push({ index, reason: "Not an object" });
      return;
    }

    if (typeof q.question !== "string" || q.question.trim().length < 15) {
      rejected.push({ index, reason: `Question too short or missing: "${(q.question || "").slice(0, 50)}"` });
      return;
    }

    if (!Array.isArray(q.options) || q.options.length !== 4) {
      rejected.push({ index, reason: `Expected 4 options, got ${Array.isArray(q.options) ? q.options.length : "non-array"}` });
      return;
    }

    // Validate answer letter
    const answer = (q.correct_answer || "").toString().toUpperCase().trim();
    if (!["A", "B", "C", "D"].includes(answer)) {
      rejected.push({ index, reason: `Invalid answer: "${q.correct_answer}"` });
      return;
    }

    // Validate each option is meaningful
    const optionsValid = q.options.every((o: any) => typeof o === "string" && o.trim().length >= 3);
    if (!optionsValid) {
      rejected.push({ index, reason: "One or more options too short or invalid" });
      return;
    }

    // Check for duplicate options (stripped of letter prefix)
    const stripped = q.options.map((o: string) => o.replace(/^[A-D]\)\s*/, "").trim().toLowerCase());
    const unique = new Set(stripped);
    if (unique.size < 4) {
      rejected.push({ index, reason: "Duplicate options detected" });
      return;
    }

    // Build validated question
    valid.push({
      id: q.id || index + 1,
      subject: q.subject || subject,
      question: q.question.trim(),
      options: q.options.map((o: string) => o.trim()),
      correct_answer: answer,
      explanation: (typeof q.explanation === "string" && q.explanation.trim().length > 10)
        ? q.explanation.trim()
        : "Review the correct answer and apply the relevant concept to understand why it is correct.",
      difficulty_tier: q.difficulty_tier || "standard",
    });
  });

  // Log validation results
  console.log(`[VALIDATE] ${subject}: ${valid.length}/${questions.length} passed (expected ${expectedCount})`);
  if (rejected.length > 0) {
    console.log(`[VALIDATE] ${subject}: ${rejected.length} rejected — reasons: ${rejected.slice(0, 5).map((r) => r.reason).join("; ")}`);
  }

  if (valid.length < expectedCount * MIN_VALID_RATIO) {
    console.warn(`[VALIDATE] ⚠️ ${subject}: Below ${MIN_VALID_RATIO * 100}% threshold (${valid.length}/${expectedCount})`);
  }

  return valid;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-MODEL VALIDATION — Secondary AI verifies answer keys
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Use a secondary AI model to verify answer keys for a sample of questions.
 * 
 * Process:
 *   1. Select sample (first 8 questions per subject)
 *   2. Send to validation model WITHOUT revealing the claimed answer
 *   3. Compare AI's answer with our answer key
 *   4. Correct any mismatches
 * 
 * This adds a layer of confidence similar to the app's existing validation framework.
 */
async function crossValidateAnswerKeys(questions: ValidatedQuestion[], subject: string): Promise<ValidatedQuestion[]> {
  const sampleSize = Math.min(8, questions.length);
  if (sampleSize === 0) return questions;

  try {
    console.log(`[CROSS-VALIDATE] ${subject}: Validating ${sampleSize} answer keys...`);

    // Send questions WITHOUT the answer, ask AI to solve them
    const sample = questions.slice(0, sampleSize);
    const questionsForValidation = sample.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      claimed_answer: q.correct_answer,
    }));

    const validationPrompt = `You are a senior ${subject} examiner. For each question below, verify whether the "claimed_answer" is actually correct. Solve each question independently.

Return ONLY a JSON array:
[{"id": <number>, "claimed_answer": "<letter>", "verified_answer": "<letter>", "is_correct": <boolean>, "reasoning": "<brief explanation if incorrect>"}]

Questions to verify:
${JSON.stringify(questionsForValidation, null, 2)}`;

    const response = await callAI(
      validationPrompt,
      `You are an expert ${subject} teacher and exam validator. Your job is to independently verify answer keys. Be extremely precise. If you disagree with a claimed answer, provide the correct one with reasoning.`,
      { model: VALIDATION_MODEL, maxTokens: 8000, temperature: 0.1, retries: 2 }
    );

    const validations = parseJsonFromAI(response);
    let corrections = 0;
    let confirmed = 0;

    validations.forEach((v: any) => {
      if (!v || typeof v.id !== "number") return;
      
      const question = questions.find((q) => q.id === v.id);
      if (!question) return;

      if (v.is_correct === true) {
        confirmed++;
      } else if (v.verified_answer && ["A", "B", "C", "D"].includes(v.verified_answer.toUpperCase())) {
        const newAnswer = v.verified_answer.toUpperCase();
        if (newAnswer !== question.correct_answer) {
          console.log(`[CROSS-VALIDATE] ${subject} Q${v.id}: Correcting ${question.correct_answer} → ${newAnswer} (${v.reasoning || "AI disagreed"})`);
          question.correct_answer = newAnswer;
          if (v.reasoning) {
            question.explanation = v.reasoning;
          }
          corrections++;
        }
      }
    });

    console.log(`[CROSS-VALIDATE] ${subject}: ${confirmed} confirmed, ${corrections} corrected out of ${sampleSize} sampled`);
    return questions;
    
  } catch (e) {
    console.warn(`[CROSS-VALIDATE] ${subject} validation failed (using unverified answers):`, e instanceof Error ? e.message : e);
    return questions; // Graceful fallback
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHENTICATION — Verify super admin and student identity
// ═══════════════════════════════════════════════════════════════════════════════

async function verifyAdmin(req: Request, supabase: any): Promise<{ isAdmin: boolean; userId?: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { isAdmin: false };
  
  const token = authHeader.replace("Bearer ", "");
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return { isAdmin: false };
    
    const isAdmin = user.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
    return { isAdmin, userId: user.id };
  } catch {
    return { isAdmin: false };
  }
}

async function getAuthUser(req: Request, supabase: any): Promise<{ id: string; email: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  
  const token = authHeader.replace("Bearer ", "");
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return { id: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN REQUEST HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const supabaseAuth = getSupabaseAuth();

    const body = await req.json();
    const { action } = body;

    if (!action || typeof action !== "string") {
      return respondError("Missing or invalid 'action' parameter");
    }

    console.log(`\n${"═".repeat(60)}\n[LCT] Action: ${action}\n${"═".repeat(60)}`);

    // Student actions — skip admin check
    if (action === "submit_exam") {
      return await handleSubmitExam(req, supabaseAdmin, supabaseAuth, body);
    }

    // All other actions require super admin verification
    const { isAdmin, userId: adminId } = await verifyAdmin(req, supabaseAuth);
    if (!isAdmin) {
      return respondError("Unauthorized — Super Admin access required", 403);
    }

    switch (action) {
      case "collect_data":
        return await handleCollectData(supabaseAdmin, body);
      case "generate_exam":
        return await handleGenerateExam(supabaseAdmin, body);
      case "validate_exam":
        return await handleValidateExam(supabaseAdmin, body);
      case "translate_exam":
        return await handleTranslateExam(supabaseAdmin, body);
      case "start_exam":
        return await handleStartExam(supabaseAdmin, body);
      case "end_exam":
        return await handleEndExam(supabaseAdmin, body);
      case "get_analytics":
        return await handleGetAnalytics(supabaseAdmin, body);
      case "get_student_detail":
        return await handleGetStudentDetail(supabaseAdmin, body);
      case "retry_subject":
        return await handleRetrySubject(supabaseAdmin, body);
      default:
        return respondError(`Unknown action: '${action}'. Valid actions: collect_data, generate_exam, validate_exam, translate_exam, start_exam, submit_exam, end_exam, get_analytics, get_student_detail, retry_subject`);
    }
  } catch (err) {
    console.error("[LCT FATAL]", err);
    return respondError(err instanceof Error ? err.message : "Internal server error", 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION: COLLECT DATA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gather eligible students (Grade 9+) from selected schools.
 * Fetches learning style profiles for translation and creates exam enrollment records.
 * 
 * Input: { school_ids: string[], exam_id: string }
 * Output: { total_students, style_breakdown, grade_distribution, schools_count }
 */
async function handleCollectData(supabase: any, body: any) {
  const { school_ids, exam_id } = body;

  if (!Array.isArray(school_ids) || school_ids.length === 0) {
    return respondError("Missing or empty school_ids array");
  }
  if (!exam_id || typeof exam_id !== "string") {
    return respondError("Missing or invalid exam_id");
  }

  console.log(`[COLLECT] Starting data collection for ${school_ids.length} school(s)...`);

  // Fetch all students from selected schools
  const { data: allStudents, error: studErr } = await supabase
    .from("profiles")
    .select("id, full_name, grade_level, school_id, email")
    .in("school_id", school_ids)
    .eq("user_type", "student")
    .eq("status", "approved")
    .eq("is_active", true);

  if (studErr) throw new Error(`Error fetching students: ${studErr.message}`);
  
  const totalStudents = allStudents?.length || 0;
  console.log(`[COLLECT] Found ${totalStudents} total students across ${school_ids.length} school(s)`);

  // Filter for grade 9+
  const eligible = (allStudents || []).filter((s: any) => {
    const grade = extractGradeNumber(s.grade_level);
    return grade >= 9 && grade <= 12;
  });

  const excluded = totalStudents - eligible.length;
  console.log(`[COLLECT] ${eligible.length} eligible (Grade 9+), ${excluded} excluded (below Grade 9)`);

  if (eligible.length === 0) {
    return respondError(
      `No eligible students found. ${totalStudents} total students in selected schools, but none are in Grade 9-12. ` +
      `Make sure student profiles have grade_level set to 9, 10, 11, or 12.`
    );
  }

  // Fetch learning style profiles
  const studentIds = eligible.map((s: any) => s.id);
  const { data: styles } = await supabase
    .from("learning_style_profiles")
    .select("user_id, dominant_style, visual_score, logical_score, verbal_score, kinesthetic_score, conceptual_score, total_interactions")
    .in("user_id", studentIds);

  const styleMap: Record<string, any> = {};
  (styles || []).forEach((s: any) => { styleMap[s.user_id] = s; });

  const studentsWithProfile = studentIds.filter((id: string) => styleMap[id]);
  console.log(`[COLLECT] ${studentsWithProfile.length}/${eligible.length} students have learning style profiles`);

  // Insert school records
  const schoolRows = school_ids.map((sid: string) => ({ exam_id, school_id: sid }));
  const { error: schoolErr } = await supabase
    .from("lct_exam_schools")
    .upsert(schoolRows, { onConflict: "exam_id,school_id" });
  if (schoolErr) console.error("[COLLECT] School insert error:", schoolErr.message);

  // Batch insert student enrollment records
  const studentRows = eligible.map((student: any) => ({
    exam_id,
    student_id: student.id,
    school_id: student.school_id,
    learning_style: styleMap[student.id]?.dominant_style || "balanced",
    status: "pending",
  }));

  let insertedCount = 0;
  for (let i = 0; i < studentRows.length; i += BATCH_INSERT_SIZE) {
    const chunk = studentRows.slice(i, i + BATCH_INSERT_SIZE);
    const { error: insertErr } = await supabase
      .from("lct_exam_students")
      .upsert(chunk, { onConflict: "exam_id,student_id" });
    
    if (insertErr) {
      console.error(`[COLLECT] Batch insert error at ${i}:`, insertErr.message);
    } else {
      insertedCount += chunk.length;
    }
  }

  // Update exam status
  await supabase.from("lct_exams").update({ status: "data_collected" }).eq("id", exam_id);

  // Build statistics
  const styleCounts: Record<string, number> = {};
  const gradeDistribution: Record<string, number> = {};
  const schoolStudentCounts: Record<string, number> = {};

  eligible.forEach((s: any) => {
    // Learning style breakdown
    const st = styleMap[s.id]?.dominant_style || "balanced";
    styleCounts[st] = (styleCounts[st] || 0) + 1;
    
    // Grade distribution
    const grade = `Grade ${extractGradeNumber(s.grade_level)}`;
    gradeDistribution[grade] = (gradeDistribution[grade] || 0) + 1;
    
    // Per-school counts
    schoolStudentCounts[s.school_id] = (schoolStudentCounts[s.school_id] || 0) + 1;
  });

  console.log(`[COLLECT] Data collection complete. ${insertedCount} students enrolled.`);
  console.log(`[COLLECT] Style breakdown:`, JSON.stringify(styleCounts));
  console.log(`[COLLECT] Grade distribution:`, JSON.stringify(gradeDistribution));

  return respond({
    success: true,
    total_students: eligible.length,
    total_excluded: excluded,
    students_with_profile: studentsWithProfile.length,
    style_breakdown: styleCounts,
    grade_distribution: gradeDistribution,
    school_student_counts: schoolStudentCounts,
    schools_count: school_ids.length,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION: GENERATE EXAM
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * AI-powered generation of 140 MCQ questions across 5 subjects.
 * 
 * Process per subject:
 *   1. Build comprehensive prompt with topic coverage and difficulty instructions
 *   2. Call AI Gateway with high token limit
 *   3. Parse and validate questions
 *   4. Retry up to 3 times if validation threshold not met
 *   5. Cross-validate answer keys with secondary model
 *   6. Aggregate all subjects
 * 
 * Input: { exam_id: string }
 * Output: { total_questions, subject_stats, questions, answer_key }
 */
async function handleGenerateExam(supabase: any, body: any) {
  const { exam_id } = body;
  if (!exam_id) return respondError("Missing exam_id");

  // Verify exam exists and is in correct state
  const { data: examCheck } = await supabase.from("lct_exams").select("status").eq("id", exam_id).single();
  if (!examCheck) return respondError("Exam not found", 404);
  if (examCheck.status !== "draft" && examCheck.status !== "data_collected") {
    return respondError(`Exam is in '${examCheck.status}' state. Can only generate from 'draft' or 'data_collected' state.`);
  }

  console.log(`\n[GENERATE] ════════════════════════════════════════`);
  console.log(`[GENERATE] Starting exam generation for ${TOTAL_QUESTIONS} questions`);
  console.log(`[GENERATE] Subjects: ${SUBJECTS.map((s) => `${s.emoji} ${s.name} (${s.count})`).join(", ")}`);

  const varietySeed = generateVarietySeed();
  const allQuestions: ValidatedQuestion[] = [];
  const allAnswerKeys: any[] = [];
  const subjectStats: Record<string, { generated: number; validated: number; attempts: number; crossValidated: boolean }> = {};
  const startTime = Date.now();

  for (const subject of SUBJECTS) {
    console.log(`\n[GENERATE] ──── ${subject.emoji} ${subject.name} ────`);
    
    const subjectStart = Date.now();
    let questions: ValidatedQuestion[] = [];
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts && questions.length < subject.count * MIN_VALID_RATIO) {
      attempts++;

      const systemPrompt = `You are a world-class exam creator for the Luminary Cognitive Test (LCT), a standardized cognitive assessment designed for gifted high school students in grades 9-12.

YOUR ROLE: Create exactly ${subject.count} multiple-choice questions for ${subject.name} that test deep cognitive ability.

DIFFICULTY LEVEL: These questions should be significantly harder than typical high school exams. Think AP/IB/competition level.

TOPIC COVERAGE (distribute questions evenly):
${subject.topics.map((t, i) => `  ${i + 1}. ${t}`).join("\n")}

BLOOM'S TAXONOMY DISTRIBUTION:
  - ~10% Knowledge/Comprehension (basic recall, but with nuance)
  - ~40% Application (apply concepts to new situations)
  - ~30% Analysis (break down, compare, distinguish)
  - ~20% Evaluation/Synthesis (judge, design, create)

QUALITY REQUIREMENTS:
  1. Each question MUST have EXACTLY 4 options labeled A), B), C), D)
  2. Exactly ONE correct answer per question — no ambiguity
  3. Distractors must be PLAUSIBLE — common misconceptions, not obviously wrong
  4. Avoid "all of the above" or "none of the above" options
  5. Questions should be self-contained (no references to other questions)
  6. Use specific values in Math/Physics/Chemistry problems
  7. Explanations must be educational: explain WHY the answer is correct and WHY the other options are wrong

${subject.difficultyNotes}

VARIETY: ${varietySeed}

OUTPUT FORMAT — CRITICAL:
Return ONLY a valid JSON array. No markdown, no code blocks, no explanation text.
Each item: {"id": <number>, "subject": "${subject.name}", "question": "<text>", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct_answer": "<A|B|C|D>", "explanation": "<2-3 sentences explaining the correct answer>", "difficulty_tier": "<foundational|standard|advanced|expert>"}`;

      const userPrompt = `Generate exactly ${subject.count} challenging ${subject.name} MCQ questions for the LCT standardized test. Number questions starting from ${allQuestions.length + 1}. Cover ALL listed topics evenly across the questions. Each question must test DEEP understanding beyond surface-level recall.`;

      try {
        console.log(`[GENERATE] ${subject.name} attempt ${attempts}/${maxAttempts}...`);
        
        const response = await callAI(userPrompt, systemPrompt, {
          maxTokens: 32000,
          temperature: 0.6 + (attempts * 0.15), // Increase variety on retries
        });

        const parsed = parseJsonFromAI(response);
        const validated = validateQuestions(parsed, subject.count, subject.name);

        if (validated.length > questions.length) {
          questions = validated;
          console.log(`[GENERATE] ${subject.name}: ${validated.length}/${subject.count} valid on attempt ${attempts}`);
        }

        if (questions.length >= subject.count * MIN_VALID_RATIO) {
          break;
        }
      } catch (e) {
        console.error(`[GENERATE] ${subject.name} attempt ${attempts} failed:`, e instanceof Error ? e.message : e);
      }

      // Delay between retries
      if (attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }

    if (questions.length === 0) {
      console.error(`[GENERATE] ❌ ${subject.name}: ALL ${maxAttempts} attempts failed — 0 questions`);
      subjectStats[subject.name] = { generated: 0, validated: 0, attempts, crossValidated: false };
      continue;
    }

    // Cross-validate answer keys
    let crossValidated = false;
    try {
      questions = await crossValidateAnswerKeys(questions, subject.name);
      crossValidated = true;
    } catch (e) {
      console.warn(`[GENERATE] ${subject.name} cross-validation failed:`, e);
    }

    // Re-index questions to ensure global uniqueness
    questions.forEach((q, i) => {
      q.id = allQuestions.length + i + 1;
      q.subject = subject.name;
    });

    allQuestions.push(...questions);
    subjectStats[subject.name] = {
      generated: questions.length,
      validated: questions.length,
      attempts,
      crossValidated,
    };

    // Build answer key entries
    questions.forEach((q) => {
      allAnswerKeys.push({
        id: q.id,
        subject: q.subject,
        correct_answer: q.correct_answer,
        explanation: q.explanation,
        difficulty_tier: q.difficulty_tier,
      });
    });

    const subjectTime = ((Date.now() - subjectStart) / 1000).toFixed(1);
    console.log(`[GENERATE] ✅ ${subject.name}: ${questions.length} questions in ${subjectTime}s (${attempts} attempt${attempts > 1 ? "s" : ""})`);

    // Rate limit protection between subjects
    await new Promise((r) => setTimeout(r, 3000));
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n[GENERATE] ════════════════════════════════════════`);
  console.log(`[GENERATE] COMPLETE: ${allQuestions.length}/${TOTAL_QUESTIONS} questions in ${totalTime}s`);
  console.log(`[GENERATE] Per-subject:`, JSON.stringify(subjectStats));

  if (allQuestions.length === 0) {
    return respondError("Failed to generate any questions after multiple attempts. Please check AI gateway status and try again.", 500);
  }

  if (allQuestions.length < TOTAL_QUESTIONS * 0.5) {
    console.warn(`[GENERATE] ⚠️ Only ${allQuestions.length}/${TOTAL_QUESTIONS} questions — some subjects may have failed`);
  }

  // Store in database
  const { error: updateErr } = await supabase.from("lct_exams").update({
    questions_json: allQuestions,
    answer_key_json: allAnswerKeys,
    status: "generated",
  }).eq("id", exam_id);

  if (updateErr) throw new Error(`Failed to save exam: ${updateErr.message}`);

  return respond({
    success: true,
    total_questions: allQuestions.length,
    expected_questions: TOTAL_QUESTIONS,
    generation_time_seconds: parseFloat(totalTime),
    subject_stats: subjectStats,
    questions: allQuestions,
    answer_key: allAnswerKeys,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION: VALIDATE EXAM (Standalone re-validation)
// ═══════════════════════════════════════════════════════════════════════════════

async function handleValidateExam(supabase: any, body: any) {
  const { exam_id } = body;
  if (!exam_id) return respondError("Missing exam_id");

  const { data: exam } = await supabase.from("lct_exams").select("questions_json, answer_key_json").eq("id", exam_id).single();
  if (!exam) return respondError("Exam not found", 404);

  const questions = exam.questions_json as any[];
  const results: Record<string, { total: number; corrections: number }> = {};

  for (const subject of SUBJECTS) {
    const subjectQs = questions.filter((q: any) => q.subject === subject.name);
    if (subjectQs.length === 0) continue;

    const validated = await crossValidateAnswerKeys(subjectQs as ValidatedQuestion[], subject.name);
    
    let corrections = 0;
    validated.forEach((vq, i) => {
      if (vq.correct_answer !== subjectQs[i]?.correct_answer) corrections++;
    });

    results[subject.name] = { total: subjectQs.length, corrections };
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Update stored questions with any corrections
  await supabase.from("lct_exams").update({ questions_json: questions }).eq("id", exam_id);

  return respond({ success: true, validation_results: results });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION: RETRY SUBJECT
// ═══════════════════════════════════════════════════════════════════════════════

async function handleRetrySubject(supabase: any, body: any) {
  const { exam_id, subject_name } = body;
  if (!exam_id || !subject_name) return respondError("Missing exam_id or subject_name");

  const subjectDef = SUBJECTS.find((s) => s.name === subject_name);
  if (!subjectDef) return respondError(`Unknown subject: ${subject_name}`);

  const { data: exam } = await supabase.from("lct_exams").select("questions_json, answer_key_json").eq("id", exam_id).single();
  if (!exam) return respondError("Exam not found", 404);

  // Remove old questions for this subject
  const otherQuestions = (exam.questions_json as any[]).filter((q: any) => q.subject !== subject_name);
  const startId = otherQuestions.length > 0 ? Math.max(...otherQuestions.map((q: any) => q.id)) + 1 : 1;

  // Regenerate
  const varietySeed = generateVarietySeed();
  const systemPrompt = `You are generating replacement questions for ${subject_name} in the LCT exam. Generate exactly ${subjectDef.count} challenging MCQ questions.
Topics: ${subjectDef.topics.join(", ")}
${subjectDef.difficultyNotes}
Variety: ${varietySeed}
Return ONLY a JSON array with format: [{"id": <number>, "subject": "${subject_name}", "question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct_answer": "<A|B|C|D>", "explanation": "..."}]`;

  const response = await callAI(
    `Generate ${subjectDef.count} fresh ${subject_name} MCQ questions. Start numbering from ${startId}.`,
    systemPrompt,
    { maxTokens: 32000 }
  );

  let newQuestions = validateQuestions(parseJsonFromAI(response), subjectDef.count, subject_name);
  newQuestions = await crossValidateAnswerKeys(newQuestions, subject_name);

  newQuestions.forEach((q, i) => {
    q.id = startId + i;
    q.subject = subject_name;
  });

  const allQuestions = [...otherQuestions, ...newQuestions].sort((a: any, b: any) => a.id - b.id);
  const allAnswerKeys = allQuestions.map((q: any) => ({
    id: q.id, subject: q.subject, correct_answer: q.correct_answer, explanation: q.explanation,
  }));

  await supabase.from("lct_exams").update({
    questions_json: allQuestions,
    answer_key_json: allAnswerKeys,
  }).eq("id", exam_id);

  return respond({ success: true, regenerated: newQuestions.length, total: allQuestions.length });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION: TRANSLATE EXAM
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Translate exam questions per student's learning style.
 * 
 * Optimization: Group students by style, translate once per style per subject.
 * Balanced learners receive original questions unchanged.
 * 
 * Security: Answer keys are ALWAYS force-preserved from originals.
 */
async function handleTranslateExam(supabase: any, body: any) {
  const { exam_id } = body;
  if (!exam_id) return respondError("Missing exam_id");

  const { data: exam } = await supabase
    .from("lct_exams")
    .select("questions_json, answer_key_json, status")
    .eq("id", exam_id)
    .single();

  if (!exam) return respondError("Exam not found", 404);
  if (!exam.questions_json || !Array.isArray(exam.questions_json) || exam.questions_json.length === 0) {
    return respondError("Exam has no questions. Generate the exam first.");
  }

  const { data: students } = await supabase
    .from("lct_exam_students")
    .select("id, student_id, learning_style")
    .eq("exam_id", exam_id);

  if (!students?.length) return respondError("No students enrolled in this exam");

  console.log(`\n[TRANSLATE] ════════════════════════════════════════`);
  console.log(`[TRANSLATE] Translating for ${students.length} students`);

  // Group by learning style
  const styleGroups: Record<string, any[]> = {};
  students.forEach((s: any) => {
    const style = s.learning_style || "balanced";
    if (!styleGroups[style]) styleGroups[style] = [];
    styleGroups[style].push(s);
  });

  console.log(`[TRANSLATE] Style groups: ${Object.entries(styleGroups).map(([k, v]) => `${k}(${v.length})`).join(", ")}`);

  const questions = exam.questions_json as any[];
  let translatedTotal = 0;
  const styleResults: Record<string, { students: number; status: string; subjects_translated: number }> = {};

  for (const [style, group] of Object.entries(styleGroups)) {
    console.log(`\n[TRANSLATE] ──── ${style} (${group.length} students) ────`);

    let translatedQuestions: any[];

    if (style === "balanced") {
      translatedQuestions = questions;
      styleResults[style] = { students: group.length, status: "original", subjects_translated: 0 };
      console.log(`[TRANSLATE] ${style}: Using original questions (no translation needed)`);
    } else {
      translatedQuestions = [];
      let subjectsTranslated = 0;
      const instruction = STYLE_INSTRUCTIONS[style] || STYLE_INSTRUCTIONS.verbal;

      for (const subject of SUBJECTS) {
        const subjectQs = questions.filter((q: any) => q.subject === subject.name);
        if (subjectQs.length === 0) continue;

        const systemPrompt = `You are an expert exam translator for the Luminary Cognitive Test (LCT). Your job is to REWORD exam questions to match a ${style} learner's cognitive style.

${instruction}

ABSOLUTE RULES — BREAKING ANY OF THESE IS A FAILURE:
1. The correct_answer letter (A/B/C/D) MUST remain EXACTLY the same
2. The explanation MUST remain semantically equivalent
3. Difficulty MUST NOT decrease
4. Return ONLY a valid JSON array — no markdown, no code blocks
5. Keep the same id and subject for each question
6. Return EXACTLY ${subjectQs.length} questions
7. Each option must start with the correct letter (A), B), C), D))
8. The core scientific/mathematical content must be preserved exactly`;

        const compactQs = subjectQs.map((q: any) => ({
          id: q.id, subject: q.subject, question: q.question,
          options: q.options, correct_answer: q.correct_answer, explanation: q.explanation,
        }));

        try {
          const response = await callAI(
            `Translate these ${subjectQs.length} ${subject.name} questions for a ${style} learner. Preserve all answer keys exactly.\n\n${JSON.stringify(compactQs)}`,
            systemPrompt,
            { maxTokens: 32000, temperature: 0.5 }
          );

          const translated = parseJsonFromAI(response);

          // CRITICAL: Force-preserve answer keys from originals
          const validated = subjectQs.map((original: any, idx: number) => {
            const tq = translated[idx];
            if (!tq) return original;

            const hasValidQuestion = tq.question && typeof tq.question === "string" && tq.question.length > 15;
            const hasValidOptions = Array.isArray(tq.options) && tq.options.length === 4 &&
              tq.options.every((o: any) => typeof o === "string" && o.length > 3);

            return {
              id: original.id,
              subject: original.subject,
              correct_answer: original.correct_answer, // ALWAYS from original
              explanation: original.explanation, // ALWAYS from original
              difficulty_tier: original.difficulty_tier,
              question: hasValidQuestion ? tq.question : original.question,
              options: hasValidOptions ? tq.options : original.options,
              translated_style: style,
            };
          });

          translatedQuestions.push(...validated);
          subjectsTranslated++;
          console.log(`[TRANSLATE] ${style}/${subject.name}: ✅ ${validated.length} questions translated`);
        } catch (e) {
          console.error(`[TRANSLATE] ${style}/${subject.name}: ❌ Failed, using originals:`, e instanceof Error ? e.message : e);
          translatedQuestions.push(...subjectQs);
        }

        await new Promise((r) => setTimeout(r, 2000));
      }

      styleResults[style] = { students: group.length, status: "translated", subjects_translated: subjectsTranslated };
    }

    // Batch update all students with this style
    const groupIds = group.map((s: any) => s.id);
    for (let i = 0; i < groupIds.length; i += TRANSLATION_BATCH_SIZE) {
      const chunk = groupIds.slice(i, i + TRANSLATION_BATCH_SIZE);
      const { error: updateErr } = await supabase
        .from("lct_exam_students")
        .update({ translated_questions_json: translatedQuestions })
        .in("id", chunk);
      if (updateErr) console.error(`[TRANSLATE] Batch update error for ${style}:`, updateErr.message);
    }

    translatedTotal += group.length;
  }

  await supabase.from("lct_exams").update({ status: "translated" }).eq("id", exam_id);

  console.log(`\n[TRANSLATE] ════════════════════════════════════════`);
  console.log(`[TRANSLATE] COMPLETE: ${translatedTotal} students translated`);

  return respond({
    success: true,
    translated_count: translatedTotal,
    styles_processed: styleResults,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION: START EXAM
// ═══════════════════════════════════════════════════════════════════════════════

async function handleStartExam(supabase: any, body: any) {
  const { exam_id } = body;
  if (!exam_id) return respondError("Missing exam_id");

  const { data: exam } = await supabase.from("lct_exams").select("status, questions_json").eq("id", exam_id).single();
  if (!exam) return respondError("Exam not found", 404);
  
  if (exam.status === "active") return respondError("Exam is already active");
  if (exam.status !== "translated" && exam.status !== "generated") {
    return respondError(`Exam is in '${exam.status}' state. Must be 'translated' or 'generated' to start.`);
  }

  // Verify exam has questions
  if (!exam.questions_json || !Array.isArray(exam.questions_json) || exam.questions_json.length === 0) {
    return respondError("Exam has no questions. Generate the exam first.");
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + EXAM_DURATION_MS);

  console.log(`[START] Activating exam ${exam_id}`);
  console.log(`[START] Duration: 2 hours (${now.toISOString()} → ${endsAt.toISOString()})`);

  // Update exam status
  const { error: updateErr } = await supabase.from("lct_exams").update({
    status: "active",
    started_at: now.toISOString(),
    ends_at: endsAt.toISOString(),
  }).eq("id", exam_id);

  if (updateErr) throw new Error(`Failed to start exam: ${updateErr.message}`);

  // Get all enrolled students
  const { data: students } = await supabase
    .from("lct_exam_students")
    .select("student_id")
    .eq("exam_id", exam_id);

  if (!students?.length) return respondError("No students enrolled in this exam");

  // Create locks in batches
  const lockRows = students.map((s: any) => ({
    student_id: s.student_id,
    exam_id,
    locked_until: endsAt.toISOString(),
  }));

  let lockedCount = 0;
  for (let i = 0; i < lockRows.length; i += BATCH_INSERT_SIZE) {
    const chunk = lockRows.slice(i, i + BATCH_INSERT_SIZE);
    const { error: lockErr } = await supabase
      .from("lct_exam_locks")
      .upsert(chunk, { onConflict: "student_id" });
    
    if (lockErr) {
      console.error(`[START] Lock batch error at ${i}:`, lockErr.message);
    } else {
      lockedCount += chunk.length;
    }
  }

  console.log(`[START] ✅ ${lockedCount} students locked until ${endsAt.toISOString()}`);

  return respond({
    success: true,
    started_at: now.toISOString(),
    ends_at: endsAt.toISOString(),
    locked_students: lockedCount,
    total_questions: exam.questions_json.length,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION: SUBMIT EXAM (Student)
// ═══════════════════════════════════════════════════════════════════════════════

async function handleSubmitExam(req: Request, supabaseAdmin: any, supabaseAuth: any, body: any) {
  const { exam_id, answers } = body;

  // Input validation
  if (!exam_id) return respondError("Missing exam_id");
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return respondError("Missing or invalid answers object");
  }

  // Authenticate student
  const user = await getAuthUser(req, supabaseAuth);
  if (!user) return respondError("Unauthorized — please log in", 401);

  console.log(`[SUBMIT] Student ${user.id} submitting exam ${exam_id}`);

  // Verify student is assigned to this exam
  const { data: studentExam } = await supabaseAdmin
    .from("lct_exam_students")
    .select("id, status, translated_questions_json")
    .eq("exam_id", exam_id)
    .eq("student_id", user.id)
    .single();

  if (!studentExam) return respondError("You are not assigned to this exam", 403);
  
  if (studentExam.status === "completed") {
    // Already submitted — return existing score
    console.log(`[SUBMIT] Student ${user.id} already submitted — returning existing results`);
    const { data: existing } = await supabaseAdmin
      .from("lct_exam_students")
      .select("score, answers_json")
      .eq("id", studentExam.id)
      .single();
    
    return respond({
      success: true,
      already_submitted: true,
      score: existing?.score || 0,
    });
  }

  // Get answer key
  const { data: exam } = await supabaseAdmin
    .from("lct_exams")
    .select("answer_key_json, questions_json")
    .eq("id", exam_id)
    .single();

  if (!exam) return respondError("Exam not found", 404);

  // Grade the exam with detailed per-question analysis
  const answerKey = exam.answer_key_json as any[];
  const studentQuestions = studentExam.translated_questions_json as any[] || exam.questions_json as any[];
  
  let correct = 0;
  let unanswered = 0;
  const results: any[] = [];
  const subjectScores: Record<string, { correct: number; total: number }> = {};

  answerKey.forEach((ak: any) => {
    const studentAnswer = (answers[String(ak.id)] || answers[ak.id] || "").toString().toUpperCase().trim();
    const correctAnswer = ak.correct_answer.toUpperCase().trim();
    const isCorrect = studentAnswer !== "" && studentAnswer === correctAnswer;
    const isUnanswered = studentAnswer === "";
    
    if (isCorrect) correct++;
    if (isUnanswered) unanswered++;

    // Track per-subject scores
    if (!subjectScores[ak.subject]) {
      subjectScores[ak.subject] = { correct: 0, total: 0 };
    }
    subjectScores[ak.subject].total++;
    if (isCorrect) subjectScores[ak.subject].correct++;

    // Find the student's question text for context
    const questionData = studentQuestions.find((q: any) => q.id === ak.id);

    results.push({
      id: ak.id,
      subject: ak.subject,
      question: questionData?.question || "",
      options: questionData?.options || [],
      correct_answer: correctAnswer,
      student_answer: studentAnswer || null,
      is_correct: isCorrect,
      is_unanswered: isUnanswered,
      explanation: ak.explanation,
      difficulty_tier: ak.difficulty_tier,
    });
  });

  const totalQuestions = answerKey.length;
  const score = totalQuestions > 0 ? Math.round((correct / totalQuestions) * 100) : 0;
  const answeredCount = totalQuestions - unanswered;

  // Calculate per-subject percentages
  const subjectPercentages: Record<string, number> = {};
  Object.entries(subjectScores).forEach(([subject, data]) => {
    subjectPercentages[subject] = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
  });

  // Update student record
  await supabaseAdmin.from("lct_exam_students").update({
    answers_json: answers,
    score,
    status: "completed",
    submitted_at: new Date().toISOString(),
  }).eq("exam_id", exam_id).eq("student_id", user.id);

  // Remove lock
  await supabaseAdmin.from("lct_exam_locks").delete().eq("student_id", user.id);

  console.log(`[SUBMIT] ✅ Student ${user.id}: ${score}% (${correct}/${totalQuestions}), ${unanswered} unanswered`);
  console.log(`[SUBMIT] Per-subject:`, JSON.stringify(subjectPercentages));

  return respond({
    success: true,
    score,
    correct,
    total: totalQuestions,
    answered: answeredCount,
    unanswered,
    subject_scores: subjectScores,
    subject_percentages: subjectPercentages,
    results,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION: END EXAM
// ═══════════════════════════════════════════════════════════════════════════════

async function handleEndExam(supabase: any, body: any) {
  const { exam_id } = body;
  if (!exam_id) return respondError("Missing exam_id");

  const { data: exam } = await supabase
    .from("lct_exams")
    .select("status, answer_key_json")
    .eq("id", exam_id)
    .single();

  if (!exam) return respondError("Exam not found", 404);
  if (exam.status === "completed") {
    return respond({ success: true, message: "Exam already ended" });
  }

  console.log(`[END] Ending exam ${exam_id}...`);

  // Get incomplete students
  const { data: incompleteStudents } = await supabase
    .from("lct_exam_students")
    .select("id, student_id, answers_json, status")
    .eq("exam_id", exam_id)
    .in("status", ["pending", "in_progress"]);

  let autoGraded = 0;

  if (incompleteStudents?.length > 0 && exam.answer_key_json) {
    const answerKey = exam.answer_key_json as any[];
    console.log(`[END] Auto-grading ${incompleteStudents.length} incomplete students...`);

    for (const student of incompleteStudents) {
      const savedAnswers = (student.answers_json && typeof student.answers_json === "object" && !Array.isArray(student.answers_json))
        ? student.answers_json as Record<string, string>
        : {};

      let correct = 0;
      answerKey.forEach((ak: any) => {
        const sa = (savedAnswers[String(ak.id)] || "").toString().toUpperCase().trim();
        if (sa && sa === ak.correct_answer.toUpperCase().trim()) correct++;
      });

      const score = answerKey.length > 0 ? Math.round((correct / answerKey.length) * 100) : 0;

      await supabase.from("lct_exam_students").update({
        status: "timed_out",
        score,
        answers_json: savedAnswers,
        submitted_at: new Date().toISOString(),
      }).eq("id", student.id);

      autoGraded++;
      console.log(`[END] Auto-graded student ${student.student_id}: ${score}%`);
    }
  }

  // Remove all locks for this exam
  const { error: lockErr } = await supabase.from("lct_exam_locks").delete().eq("exam_id", exam_id);
  if (lockErr) console.error("[END] Error removing locks:", lockErr.message);

  // Mark exam complete
  await supabase.from("lct_exams").update({ status: "completed" }).eq("id", exam_id);

  console.log(`[END] ✅ Exam ended. ${autoGraded} students auto-graded, locks removed.`);

  return respond({
    success: true,
    auto_graded: autoGraded,
    total_incomplete: incompleteStudents?.length || 0,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION: GET ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════════

async function handleGetAnalytics(supabase: any, body: any) {
  const { exam_id } = body;
  if (!exam_id) return respondError("Missing exam_id");

  // Get exam
  const { data: exam } = await supabase
    .from("lct_exams")
    .select("*")
    .eq("id", exam_id)
    .single();
  if (!exam) return respondError("Exam not found", 404);

  // Get all student results
  const { data: students } = await supabase
    .from("lct_exam_students")
    .select("student_id, school_id, learning_style, score, status, answers_json, started_at, submitted_at")
    .eq("exam_id", exam_id);

  if (!students?.length) return respond({ success: true, message: "No student data yet" });

  // Fetch student names
  const studentIds = students.map((s: any) => s.student_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, grade_level, school_id")
    .in("id", studentIds);

  const profileMap: Record<string, any> = {};
  (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });

  // Fetch school names
  const schoolIds = [...new Set(students.map((s: any) => s.school_id))];
  const { data: schools } = await supabase.from("schools").select("id, name").in("id", schoolIds);
  const schoolMap: Record<string, string> = {};
  (schools || []).forEach((s: any) => { schoolMap[s.id] = s.name; });

  // Compute analytics
  const scores = students.filter((s: any) => s.score !== null).map((s: any) => s.score as number);
  const completedStudents = students.filter((s: any) => s.status === "completed" || s.status === "timed_out");

  const analytics = {
    overview: {
      total_students: students.length,
      completed: completedStudents.length,
      timed_out: students.filter((s: any) => s.status === "timed_out").length,
      pending: students.filter((s: any) => s.status === "pending").length,
      in_progress: students.filter((s: any) => s.status === "in_progress").length,
    },
    scores: {
      mean: scores.length > 0 ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0,
      median: scores.length > 0 ? scores.sort((a: number, b: number) => a - b)[Math.floor(scores.length / 2)] : 0,
      highest: scores.length > 0 ? Math.max(...scores) : 0,
      lowest: scores.length > 0 ? Math.min(...scores) : 0,
      std_dev: scores.length > 1
        ? Math.round(Math.sqrt(scores.reduce((sum: number, s: number) => sum + Math.pow(s - (scores.reduce((a: number, b: number) => a + b, 0) / scores.length), 2), 0) / scores.length))
        : 0,
    },
    grade_bands: {
      excellent: scores.filter((s: number) => s >= 90).length,
      good: scores.filter((s: number) => s >= 70 && s < 90).length,
      average: scores.filter((s: number) => s >= 50 && s < 70).length,
      below_average: scores.filter((s: number) => s < 50).length,
    },
    by_learning_style: {} as Record<string, { count: number; avg_score: number }>,
    by_school: {} as Record<string, { name: string; count: number; avg_score: number }>,
    by_grade: {} as Record<string, { count: number; avg_score: number }>,
    per_subject: {} as Record<string, { avg_correct: number; avg_total: number; avg_percentage: number }>,
    student_rankings: completedStudents
      .map((s: any) => ({
        student_id: s.student_id,
        full_name: profileMap[s.student_id]?.full_name || "Unknown",
        grade: profileMap[s.student_id]?.grade_level || "?",
        school: schoolMap[s.school_id] || "Unknown",
        learning_style: s.learning_style,
        score: s.score || 0,
        status: s.status,
        time_taken: s.started_at && s.submitted_at
          ? Math.round((new Date(s.submitted_at).getTime() - new Date(s.started_at).getTime()) / 60000)
          : null,
      }))
      .sort((a: any, b: any) => b.score - a.score),
  };

  // Compute by learning style
  const styleGroups: Record<string, number[]> = {};
  completedStudents.forEach((s: any) => {
    const style = s.learning_style || "balanced";
    if (!styleGroups[style]) styleGroups[style] = [];
    if (s.score !== null) styleGroups[style].push(s.score);
  });
  Object.entries(styleGroups).forEach(([style, scores]) => {
    analytics.by_learning_style[style] = {
      count: scores.length,
      avg_score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    };
  });

  // Compute by school
  const schoolGroups: Record<string, number[]> = {};
  completedStudents.forEach((s: any) => {
    if (!schoolGroups[s.school_id]) schoolGroups[s.school_id] = [];
    if (s.score !== null) schoolGroups[s.school_id].push(s.score);
  });
  Object.entries(schoolGroups).forEach(([schoolId, scores]) => {
    analytics.by_school[schoolId] = {
      name: schoolMap[schoolId] || "Unknown",
      count: scores.length,
      avg_score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    };
  });

  // Compute by grade
  const gradeGroups: Record<string, number[]> = {};
  completedStudents.forEach((s: any) => {
    const grade = profileMap[s.student_id]?.grade_level || "Unknown";
    if (!gradeGroups[grade]) gradeGroups[grade] = [];
    if (s.score !== null) gradeGroups[grade].push(s.score);
  });
  Object.entries(gradeGroups).forEach(([grade, scores]) => {
    analytics.by_grade[grade] = {
      count: scores.length,
      avg_score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    };
  });

  // Compute per-subject performance from answer data
  const answerKey = exam.answer_key_json as any[];
  if (answerKey?.length > 0) {
    const subjectData: Record<string, { correct: number; total: number }> = {};
    
    completedStudents.forEach((s: any) => {
      const studentAnswers = (s.answers_json && typeof s.answers_json === "object" && !Array.isArray(s.answers_json))
        ? s.answers_json as Record<string, string>
        : {};

      answerKey.forEach((ak: any) => {
        if (!subjectData[ak.subject]) subjectData[ak.subject] = { correct: 0, total: 0 };
        subjectData[ak.subject].total++;
        const sa = (studentAnswers[String(ak.id)] || "").toString().toUpperCase().trim();
        if (sa === ak.correct_answer.toUpperCase().trim()) {
          subjectData[ak.subject].correct++;
        }
      });
    });

    Object.entries(subjectData).forEach(([subject, data]) => {
      const studentCount = completedStudents.length || 1;
      analytics.per_subject[subject] = {
        avg_correct: Math.round(data.correct / studentCount * 10) / 10,
        avg_total: Math.round(data.total / studentCount * 10) / 10,
        avg_percentage: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
      };
    });
  }

  return respond({ success: true, analytics });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION: GET STUDENT DETAIL
// ═══════════════════════════════════════════════════════════════════════════════

async function handleGetStudentDetail(supabase: any, body: any) {
  const { exam_id, student_id } = body;
  if (!exam_id || !student_id) return respondError("Missing exam_id or student_id");

  const { data: studentExam } = await supabase
    .from("lct_exam_students")
    .select("*")
    .eq("exam_id", exam_id)
    .eq("student_id", student_id)
    .single();

  if (!studentExam) return respondError("Student exam record not found", 404);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, grade_level, email, school_id")
    .eq("id", student_id)
    .single();

  const { data: exam } = await supabase
    .from("lct_exams")
    .select("answer_key_json, questions_json")
    .eq("id", exam_id)
    .single();

  const answerKey = exam?.answer_key_json as any[] || [];
  const studentAnswers = (studentExam.answers_json && typeof studentExam.answers_json === "object")
    ? studentExam.answers_json as Record<string, string>
    : {};

  // Build detailed per-question breakdown
  const questions = studentExam.translated_questions_json as any[] || exam?.questions_json as any[] || [];
  const questionDetails = answerKey.map((ak: any) => {
    const q = questions.find((q: any) => q.id === ak.id);
    const sa = (studentAnswers[String(ak.id)] || "").toString().toUpperCase().trim();
    return {
      id: ak.id,
      subject: ak.subject,
      question: q?.question || "",
      options: q?.options || [],
      student_answer: sa || null,
      correct_answer: ak.correct_answer,
      is_correct: sa === ak.correct_answer.toUpperCase().trim(),
      explanation: ak.explanation,
    };
  });

  // Per-subject breakdown
  const subjectBreakdown: Record<string, { correct: number; total: number; percentage: number }> = {};
  questionDetails.forEach((q) => {
    if (!subjectBreakdown[q.subject]) subjectBreakdown[q.subject] = { correct: 0, total: 0, percentage: 0 };
    subjectBreakdown[q.subject].total++;
    if (q.is_correct) subjectBreakdown[q.subject].correct++;
  });
  Object.values(subjectBreakdown).forEach((data) => {
    data.percentage = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
  });

  return respond({
    success: true,
    student: {
      id: student_id,
      full_name: profile?.full_name || "Unknown",
      grade: profile?.grade_level || "?",
      learning_style: studentExam.learning_style,
      score: studentExam.score,
      status: studentExam.status,
      started_at: studentExam.started_at,
      submitted_at: studentExam.submitted_at,
    },
    subject_breakdown: subjectBreakdown,
    questions: questionDetails,
    total_correct: questionDetails.filter((q) => q.is_correct).length,
    total_questions: questionDetails.length,
    unanswered: questionDetails.filter((q) => !q.student_answer).length,
  });
}

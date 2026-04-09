import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const SUPER_ADMIN_EMAIL = "malekismail487@gmail.com";

// Primary model for generation, secondary for validation
const PRIMARY_MODEL = "google/gemini-2.5-flash";
const VALIDATION_MODEL = "google/gemini-2.5-flash-lite";

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function respond(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── AI CALL WITH RETRY + PROPER API KEY ────────────────────────────────────
async function callAI(
  prompt: string,
  systemPrompt: string,
  options: { model?: string; maxTokens?: number; temperature?: number } = {}
): Promise<string> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  const model = options.model || PRIMARY_MODEL;
  const maxTokens = options.maxTokens || 32000;
  const temperature = options.temperature || 0.7;
  const maxRetries = 4;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
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

      if (res.status === 429) {
        const delay = Math.min((attempt + 1) * 15000, 60000);
        console.warn(`Rate limited (429), retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (res.status === 402) {
        const delay = Math.min((attempt + 1) * 20000, 60000);
        console.warn(`Payment required (402), retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`AI Gateway error ${res.status}: ${errText}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || "";
    } catch (e) {
      console.error(`AI call attempt ${attempt + 1} failed:`, e);
      if (attempt === maxRetries - 1) throw e;
      await new Promise((r) => setTimeout(r, (attempt + 1) * 10000));
    }
  }
  throw new Error("AI call failed after all retries");
}

// ─── ROBUST JSON PARSER ─────────────────────────────────────────────────────
function parseJsonFromAI(text: string): any[] {
  // Strategy 1: Direct parse
  try {
    const parsed = JSON.parse(text.trim());
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch { /* continue */ }

  // Strategy 2: Extract from markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch { /* continue */ }
  }

  // Strategy 3: Find largest JSON array in text
  const arrayMatches = text.match(/\[[\s\S]*\]/g);
  if (arrayMatches) {
    // Try the longest match first (most likely the full array)
    const sorted = arrayMatches.sort((a, b) => b.length - a.length);
    for (const match of sorted) {
      try {
        const parsed = JSON.parse(match);
        if (Array.isArray(parsed)) return parsed;
      } catch { /* continue */ }
    }
  }

  // Strategy 4: Try to fix common JSON issues (trailing commas, etc.)
  try {
    const cleaned = text
      .replace(/,\s*]/g, ']')
      .replace(/,\s*}/g, '}')
      .replace(/\n/g, ' ');
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      return JSON.parse(arrayMatch[0]);
    }
  } catch { /* continue */ }

  throw new Error(`Failed to parse AI response as JSON. First 300 chars: ${text.slice(0, 300)}`);
}

// ─── QUESTION VALIDATOR ─────────────────────────────────────────────────────
function validateQuestions(questions: any[], expectedCount: number, subject: string): any[] {
  const valid = questions.filter((q: any) => {
    if (!q || typeof q.question !== 'string' || q.question.length < 10) return false;
    if (!Array.isArray(q.options) || q.options.length !== 4) return false;
    if (typeof q.correct_answer !== 'string' || !['A', 'B', 'C', 'D'].includes(q.correct_answer.toUpperCase())) return false;
    // Ensure options are meaningful (not empty strings)
    if (q.options.some((o: any) => typeof o !== 'string' || o.trim().length < 2)) return false;
    return true;
  });

  // Normalize
  valid.forEach((q: any) => {
    q.correct_answer = q.correct_answer.toUpperCase();
    if (!q.subject) q.subject = subject;
    if (!q.explanation || q.explanation.length < 5) q.explanation = "Review the correct answer and its reasoning.";
  });

  if (valid.length < expectedCount * 0.7) {
    console.warn(`[VALIDATE] ${subject}: Only ${valid.length}/${expectedCount} passed validation — below 70% threshold`);
  } else {
    console.log(`[VALIDATE] ${subject}: ${valid.length}/${expectedCount} questions valid`);
  }

  return valid;
}

// ─── CROSS-MODEL VALIDATION ─────────────────────────────────────────────────
async function validateAnswerKeys(questions: any[], subject: string): Promise<any[]> {
  try {
    // Send a sample (first 5 questions) for cross-validation
    const sample = questions.slice(0, Math.min(5, questions.length));
    const sampleForValidation = sample.map((q: any) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      claimed_answer: q.correct_answer,
    }));

    const validationResponse = await callAI(
      `Verify these ${subject} exam questions. For each, confirm if the claimed correct answer is actually correct. Return ONLY a JSON array: [{"id": 1, "claimed_answer": "A", "verified_answer": "A", "is_correct": true, "fix_explanation": ""}]

Questions: ${JSON.stringify(sampleForValidation)}`,
      `You are an expert ${subject} teacher. Verify MCQ answers with 100% accuracy. If a claimed answer is wrong, provide the correct one.`,
      { model: VALIDATION_MODEL, maxTokens: 4000, temperature: 0.1 }
    );

    const validations = parseJsonFromAI(validationResponse);
    let corrections = 0;

    validations.forEach((v: any) => {
      if (!v.is_correct && v.verified_answer) {
        const q = questions.find((q: any) => q.id === v.id);
        if (q && ['A', 'B', 'C', 'D'].includes(v.verified_answer.toUpperCase())) {
          console.log(`[CROSS-VALIDATE] ${subject} Q${v.id}: Corrected ${q.correct_answer} → ${v.verified_answer}`);
          q.correct_answer = v.verified_answer.toUpperCase();
          if (v.fix_explanation) q.explanation = v.fix_explanation;
          corrections++;
        }
      }
    });

    if (corrections > 0) {
      console.log(`[CROSS-VALIDATE] ${subject}: ${corrections} answer key corrections applied`);
    }

    return questions;
  } catch (e) {
    console.warn(`[CROSS-VALIDATE] ${subject} validation failed, using unverified answers:`, e);
    return questions; // Graceful fallback — return unverified
  }
}

// ─── AUTH VERIFICATION ──────────────────────────────────────────────────────
async function verifyAdmin(req: Request, supabase: any): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  const { data: { user } } = await supabase.auth.getUser(token);
  return user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    const body = await req.json();
    const { action } = body;

    if (!action || typeof action !== 'string') {
      return respond({ error: "Missing or invalid action" }, 400);
    }

    // Student action — skip admin check
    if (action === "submit_exam") {
      return await handleSubmitExam(req, supabaseAdmin, supabaseAuth, body);
    }

    // All other actions require super admin
    const isAdmin = await verifyAdmin(req, supabaseAuth);
    if (!isAdmin) {
      return respond({ error: "Unauthorized — Super Admin only" }, 403);
    }

    switch (action) {
      case "collect_data":
        return await handleCollectData(supabaseAdmin, body);
      case "generate_exam":
        return await handleGenerateExam(supabaseAdmin, body);
      case "translate_exam":
        return await handleTranslateExam(supabaseAdmin, body);
      case "start_exam":
        return await handleStartExam(supabaseAdmin, body);
      case "end_exam":
        return await handleEndExam(supabaseAdmin, body);
      default:
        return respond({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("LCT Error:", err);
    return respond({ error: err.message || "Internal server error" }, 500);
  }
});

// ─── COLLECT DATA ───────────────────────────────────────────────────────────
async function handleCollectData(supabase: any, body: any) {
  const { school_ids, exam_id } = body;

  if (!Array.isArray(school_ids) || school_ids.length === 0) {
    return respond({ error: "Missing school_ids array" }, 400);
  }
  if (!exam_id) return respond({ error: "Missing exam_id" }, 400);

  // Get students from selected schools (grade 9+)
  const { data: students, error: studErr } = await supabase
    .from("profiles")
    .select("id, full_name, grade_level, school_id")
    .in("school_id", school_ids)
    .eq("user_type", "student")
    .eq("status", "approved")
    .eq("is_active", true);

  if (studErr) throw new Error(`Error fetching students: ${studErr.message}`);

  // Filter for grade 9+ using numeric extraction
  const eligible = (students || []).filter((s: any) => {
    const g = (s.grade_level || "").toString();
    const num = parseInt(g.replace(/\D/g, ""), 10);
    return !isNaN(num) && num >= 9;
  });

  if (eligible.length === 0) {
    return respond({ error: "No eligible students found (Grade 9+) in the selected schools." }, 400);
  }

  // Fetch learning style profiles for ALL eligible students
  const studentIds = eligible.map((s: any) => s.id);
  const { data: styles } = await supabase
    .from("learning_style_profiles")
    .select("user_id, dominant_style, visual_score, logical_score, verbal_score, kinesthetic_score, conceptual_score")
    .in("user_id", studentIds);

  const styleMap: Record<string, any> = {};
  (styles || []).forEach((s: any) => { styleMap[s.user_id] = s; });

  // Batch insert schools
  const schoolRows = school_ids.map((sid: string) => ({ exam_id, school_id: sid }));
  const { error: schoolErr } = await supabase.from("lct_exam_schools").upsert(schoolRows, { onConflict: "exam_id,school_id" });
  if (schoolErr) console.error("School insert error:", schoolErr);

  // Batch insert students (chunks of 50)
  const studentRows = eligible.map((student: any) => ({
    exam_id,
    student_id: student.id,
    school_id: student.school_id,
    learning_style: styleMap[student.id]?.dominant_style || "balanced",
    status: "pending",
  }));

  for (let i = 0; i < studentRows.length; i += 50) {
    const chunk = studentRows.slice(i, i + 50);
    const { error: insertErr } = await supabase
      .from("lct_exam_students")
      .upsert(chunk, { onConflict: "exam_id,student_id" });
    if (insertErr) console.error(`Student batch insert error at chunk ${i}:`, insertErr);
  }

  // Update exam status
  await supabase.from("lct_exams").update({ status: "data_collected" }).eq("id", exam_id);

  // Count by learning style
  const styleCounts: Record<string, number> = {};
  const gradeDistribution: Record<string, number> = {};
  eligible.forEach((s: any) => {
    const st = styleMap[s.id]?.dominant_style || "balanced";
    styleCounts[st] = (styleCounts[st] || 0) + 1;
    const grade = s.grade_level || "unknown";
    gradeDistribution[grade] = (gradeDistribution[grade] || 0) + 1;
  });

  return respond({
    success: true,
    total_students: eligible.length,
    style_breakdown: styleCounts,
    grade_distribution: gradeDistribution,
    schools_count: school_ids.length,
  });
}

// ─── GENERATE EXAM ──────────────────────────────────────────────────────────
async function handleGenerateExam(supabase: any, body: any) {
  const { exam_id } = body;
  if (!exam_id) return respond({ error: "Missing exam_id" }, 400);

  const subjects = [
    { name: "English", count: 28, topics: "reading comprehension, grammar, vocabulary in context, literary analysis, rhetorical analysis, sentence completion, error identification, passage-based reasoning" },
    { name: "Mathematics", count: 28, topics: "algebra, geometry, trigonometry, calculus basics, statistics, probability, number theory, problem solving, mathematical reasoning, functions and graphs" },
    { name: "Physics", count: 28, topics: "mechanics, thermodynamics, waves and optics, electricity and magnetism, modern physics, energy and work, circular motion, fluid mechanics" },
    { name: "Chemistry", count: 28, topics: "atomic structure, chemical bonding, stoichiometry, thermochemistry, equilibrium, acids and bases, organic chemistry basics, electrochemistry, periodic trends" },
    { name: "Biology", count: 28, topics: "cell biology, genetics and heredity, evolution, ecology, human physiology, molecular biology, plant biology, microbiology, biotechnology" },
  ];

  const allQuestions: any[] = [];
  const allAnswerKeys: any[] = [];
  const subjectStats: Record<string, number> = {};

  // Generate a random seed for variety
  const randomSeed = Math.floor(Math.random() * 100000);

  for (const subject of subjects) {
    console.log(`[GENERATE] Starting ${subject.name}...`);

    const systemPrompt = `You are a world-class exam creator for the Luminary Cognitive Test (LCT), a standardized cognitive assessment for gifted students in grades 9-12. Your questions must be:

1. CHALLENGING — significantly harder than typical high school exams
2. DEEP — test critical thinking, application, analysis, and evaluation (Bloom's taxonomy levels 3-6)
3. VARIED — cover all major topics within the subject
4. PRECISE — each question has exactly ONE unambiguous correct answer
5. REALISTIC — distractors should be plausible misconceptions, not obviously wrong

Topics to cover: ${subject.topics}

Distribution: ~40% application, ~30% analysis, ~20% evaluation, ~10% knowledge/comprehension

FORMATTING RULES:
- Return ONLY a valid JSON array — NO markdown, NO explanation, NO text before/after
- Each question object: {"id": <number>, "subject": "${subject.name}", "question": "<text>", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct_answer": "<A|B|C|D>", "explanation": "<2-3 sentence explanation of why this answer is correct>"}
- Exactly 4 options per question, labeled A) B) C) D)
- Explanations must be educational and specific
- For Math/Physics/Chemistry: include specific numerical values where appropriate
- Variety seed: ${randomSeed} — use this to vary your question selection`;

    const prompt = `Generate exactly ${subject.count} challenging ${subject.name} MCQ questions for the LCT. Number questions starting from ${allQuestions.length + 1}. Cover all listed topics evenly. Make each question test DEEP understanding, not surface-level recall.`;

    let questions: any[] = [];
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        console.log(`[GENERATE] ${subject.name} attempt ${attempts}/${maxAttempts}`);
        const response = await callAI(prompt, systemPrompt, {
          maxTokens: 32000,
          temperature: 0.7 + (attempts * 0.1), // Increase creativity on retries
        });
        
        const parsed = parseJsonFromAI(response);
        questions = validateQuestions(parsed, subject.count, subject.name);

        if (questions.length >= subject.count * 0.7) {
          console.log(`[GENERATE] ${subject.name}: ${questions.length}/${subject.count} questions validated on attempt ${attempts}`);
          break;
        } else {
          console.warn(`[GENERATE] ${subject.name}: Only ${questions.length} valid, retrying...`);
        }
      } catch (e) {
        console.error(`[GENERATE] ${subject.name} attempt ${attempts} failed:`, e);
        if (attempts === maxAttempts) {
          console.error(`[GENERATE] ${subject.name}: ALL ${maxAttempts} attempts failed`);
        }
      }

      // Rate limit protection between retries
      if (attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }

    if (questions.length === 0) {
      console.error(`[GENERATE] CRITICAL: ${subject.name} produced 0 questions after ${maxAttempts} attempts`);
      continue;
    }

    // Cross-model validation of answer keys
    console.log(`[GENERATE] Cross-validating ${subject.name} answer keys...`);
    questions = await validateAnswerKeys(questions, subject.name);

    // Re-index
    questions.forEach((q: any, i: number) => {
      q.id = allQuestions.length + i + 1;
      q.subject = subject.name;
    });

    allQuestions.push(...questions);
    subjectStats[subject.name] = questions.length;

    questions.forEach((q: any) => {
      allAnswerKeys.push({
        id: q.id,
        subject: q.subject,
        correct_answer: q.correct_answer,
        explanation: q.explanation,
      });
    });

    // Rate limit protection between subjects (longer delay)
    await new Promise((r) => setTimeout(r, 3000));
  }

  if (allQuestions.length === 0) {
    return respond({ error: "Failed to generate any questions after multiple attempts. Please try again." }, 500);
  }

  if (allQuestions.length < 100) {
    console.warn(`[GENERATE] WARNING: Only ${allQuestions.length}/140 questions generated. Some subjects may have failed.`);
  }

  // Store in DB
  const { error: updateErr } = await supabase.from("lct_exams").update({
    questions_json: allQuestions,
    answer_key_json: allAnswerKeys,
    status: "generated",
  }).eq("id", exam_id);

  if (updateErr) throw new Error(`Failed to save exam: ${updateErr.message}`);

  console.log(`[GENERATE] Exam saved: ${allQuestions.length} total questions`);

  return respond({
    success: true,
    total_questions: allQuestions.length,
    subject_stats: subjectStats,
    questions: allQuestions,
    answer_key: allAnswerKeys,
  });
}

// ─── TRANSLATE EXAM ─────────────────────────────────────────────────────────
async function handleTranslateExam(supabase: any, body: any) {
  const { exam_id } = body;
  if (!exam_id) return respond({ error: "Missing exam_id" }, 400);

  // Get exam questions
  const { data: exam, error: examErr } = await supabase
    .from("lct_exams")
    .select("questions_json, answer_key_json")
    .eq("id", exam_id)
    .single();

  if (examErr || !exam) return respond({ error: "Exam not found" }, 404);

  // Get all students for this exam
  const { data: students, error: studErr } = await supabase
    .from("lct_exam_students")
    .select("id, student_id, learning_style")
    .eq("exam_id", exam_id);

  if (studErr || !students?.length) return respond({ error: "No students found for this exam" }, 400);

  // Group students by learning style (translate once per style, not per student)
  const styleGroups: Record<string, any[]> = {};
  students.forEach((s: any) => {
    const style = s.learning_style || "balanced";
    if (!styleGroups[style]) styleGroups[style] = [];
    styleGroups[style].push(s);
  });

  const questions = exam.questions_json as any[];
  const answerKey = exam.answer_key_json as any[];
  let translatedCount = 0;
  const styleResults: Record<string, { students: number; status: string }> = {};

  const styleInstructions: Record<string, string> = {
    visual: `Reword each question to leverage visual-spatial thinking. Include references to diagrams, graphs, charts, spatial relationships, color patterns, or visual representations. Use phrases like "Examine the following diagram...", "Visualize a scenario where...", "Looking at the pattern...". For math/science, describe what a visual representation would show. Keep the core content, difficulty, and correct answer EXACTLY the same.`,
    
    logical: `Reword each question using systematic, step-by-step logical frameworks. Structure questions as logical chains: "Given that X... and knowing that Y... what follows?", "If we apply the principle that...", "Following the sequence of reasoning...". Emphasize cause-and-effect relationships and deductive reasoning. Keep the core content, difficulty, and correct answer EXACTLY the same.`,
    
    conceptual: `Reword each question to emphasize abstract concepts, theoretical frameworks, and big-picture understanding. Use phrases like "In the broader context of...", "Considering the underlying principle...", "From a theoretical perspective...". Focus on conceptual connections between ideas rather than specific details. Keep the core content, difficulty, and correct answer EXACTLY the same.`,
    
    kinesthetic: `Reword each question to reference hands-on activities, physical processes, experiments, and real-world applications. Use phrases like "If you were conducting an experiment...", "During a hands-on demonstration...", "While physically performing...". Make abstract concepts concrete through physical analogies. Keep the core content, difficulty, and correct answer EXACTLY the same.`,
    
    verbal: `Reword each question using rich narrative context, analogies, and descriptive language. Create brief scenario-based stems, use storytelling elements, and employ metaphors where appropriate. Use phrases like "Consider the following scenario...", "To illustrate this concept...". Keep the core content, difficulty, and correct answer EXACTLY the same.`,
  };

  for (const [style, group] of Object.entries(styleGroups)) {
    console.log(`[TRANSLATE] Processing ${style} style (${group.length} students)...`);

    let translatedQuestions: any[];

    if (style === "balanced") {
      // Balanced students get original questions
      translatedQuestions = questions;
      styleResults[style] = { students: group.length, status: "original (no translation needed)" };
    } else {
      // Translate per subject to stay within token limits
      translatedQuestions = [];
      const subjects = ["English", "Mathematics", "Physics", "Chemistry", "Biology"];

      for (const subject of subjects) {
        const subjectQs = questions.filter((q: any) => q.subject === subject);
        if (subjectQs.length === 0) continue;

        const instruction = styleInstructions[style] || styleInstructions.verbal;

        const systemPrompt = `You are an expert exam translator for the Luminary Cognitive Test (LCT). Your job is to REWORD exam questions to match a ${style} learner's cognitive style, WITHOUT changing the difficulty, correct answer, or fundamental content.

${instruction}

ABSOLUTE RULES — VIOLATION = FAILURE:
1. The correct_answer letter (A/B/C/D) MUST remain EXACTLY the same as provided
2. The explanation MUST remain semantically the same
3. Difficulty MUST NOT decrease — if anything, maintain or slightly increase
4. Return ONLY a valid JSON array — no markdown, no explanation text, no code blocks
5. Keep the same id and subject for each question
6. Return EXACTLY ${subjectQs.length} questions — no more, no less
7. Each option must still start with the correct letter (A), B), C), D))`;

        // Only send essential fields to reduce tokens
        const compactQs = subjectQs.map((q: any) => ({
          id: q.id,
          subject: q.subject,
          question: q.question,
          options: q.options,
          correct_answer: q.correct_answer,
          explanation: q.explanation,
        }));

        try {
          const response = await callAI(
            `Translate these ${subjectQs.length} ${subject} questions for a ${style} learner. Preserve all answer keys exactly.\n\n${JSON.stringify(compactQs)}`,
            systemPrompt,
            { maxTokens: 32000, temperature: 0.5 }
          );

          const translated = parseJsonFromAI(response);

          // CRITICAL: Force-preserve answer keys from originals
          const validated = subjectQs.map((original: any, idx: number) => {
            const tq = translated[idx];
            if (!tq) return original; // Fallback to original if missing

            return {
              id: original.id,
              subject: original.subject,
              correct_answer: original.correct_answer, // ALWAYS from original
              explanation: original.explanation, // ALWAYS from original
              question: (tq.question && tq.question.length > 10) ? tq.question : original.question,
              options: (Array.isArray(tq.options) && tq.options.length === 4 && tq.options.every((o: any) => typeof o === 'string' && o.length > 2))
                ? tq.options
                : original.options,
            };
          });

          translatedQuestions.push(...validated);
          console.log(`[TRANSLATE] ${style}/${subject}: ${validated.length} questions translated`);
        } catch (e) {
          console.error(`[TRANSLATE] ${style}/${subject} failed, using originals:`, e);
          translatedQuestions.push(...subjectQs);
        }

        // Rate limit protection between subjects
        await new Promise((r) => setTimeout(r, 2000));
      }

      styleResults[style] = { students: group.length, status: "translated" };
    }

    // BATCH update all students with this style using a single SQL filter
    const groupIds = group.map((s: any) => s.id);
    
    // Process in chunks of 100 for efficiency
    for (let i = 0; i < groupIds.length; i += 100) {
      const chunk = groupIds.slice(i, i + 100);
      const { error: updateErr } = await supabase
        .from("lct_exam_students")
        .update({ translated_questions_json: translatedQuestions })
        .in("id", chunk);
      
      if (updateErr) {
        console.error(`[TRANSLATE] Batch update error for ${style} chunk ${i}:`, updateErr);
      }
    }

    translatedCount += group.length;
  }

  // Update exam status
  await supabase.from("lct_exams").update({ status: "translated" }).eq("id", exam_id);

  console.log(`[TRANSLATE] Complete: ${translatedCount} students across ${Object.keys(styleGroups).length} styles`);

  return respond({
    success: true,
    translated_count: translatedCount,
    styles_processed: styleResults,
  });
}

// ─── START EXAM ─────────────────────────────────────────────────────────────
async function handleStartExam(supabase: any, body: any) {
  const { exam_id } = body;
  if (!exam_id) return respond({ error: "Missing exam_id" }, 400);

  // Verify exam state
  const { data: exam } = await supabase
    .from("lct_exams")
    .select("status")
    .eq("id", exam_id)
    .single();

  if (!exam) return respond({ error: "Exam not found" }, 404);
  if (exam.status === "active") return respond({ error: "Exam is already active" }, 400);
  if (exam.status !== "translated" && exam.status !== "generated") {
    return respond({ error: `Exam is in '${exam.status}' state and cannot be started. Must be 'translated' or 'generated'.` }, 400);
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // Exactly 2 hours

  // Update exam to active
  const { error: updateErr } = await supabase.from("lct_exams").update({
    status: "active",
    started_at: now.toISOString(),
    ends_at: endsAt.toISOString(),
  }).eq("id", exam_id);

  if (updateErr) throw new Error(`Failed to start exam: ${updateErr.message}`);

  // Get all students
  const { data: students } = await supabase
    .from("lct_exam_students")
    .select("student_id")
    .eq("exam_id", exam_id);

  if (!students?.length) {
    return respond({ error: "No students found for this exam" }, 400);
  }

  // Create locks in batches
  const lockRows = students.map((s: any) => ({
    student_id: s.student_id,
    exam_id,
    locked_until: endsAt.toISOString(),
  }));

  for (let i = 0; i < lockRows.length; i += 50) {
    const chunk = lockRows.slice(i, i + 50);
    const { error: lockErr } = await supabase
      .from("lct_exam_locks")
      .upsert(chunk, { onConflict: "student_id" });
    if (lockErr) console.error(`Lock batch error at ${i}:`, lockErr);
  }

  console.log(`[START] Exam ${exam_id} started. ${students.length} students locked until ${endsAt.toISOString()}`);

  return respond({
    success: true,
    started_at: now.toISOString(),
    ends_at: endsAt.toISOString(),
    locked_students: students.length,
  });
}

// ─── SUBMIT EXAM (Student) ─────────────────────────────────────────────────
async function handleSubmitExam(req: Request, supabaseAdmin: any, supabaseAuth: any, body: any) {
  const { exam_id, answers } = body;

  if (!exam_id) return respond({ error: "Missing exam_id" }, 400);
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return respond({ error: "Missing or invalid answers object" }, 400);
  }

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return respond({ error: "Unauthorized" }, 401);

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token);
  if (authErr || !user) return respond({ error: "Unauthorized" }, 401);

  // Verify student assignment
  const { data: studentExam } = await supabaseAdmin
    .from("lct_exam_students")
    .select("id, status")
    .eq("exam_id", exam_id)
    .eq("student_id", user.id)
    .single();

  if (!studentExam) return respond({ error: "You are not assigned to this exam" }, 403);
  if (studentExam.status === "completed") {
    // Already submitted — return existing results
    const { data: existing } = await supabaseAdmin
      .from("lct_exam_students")
      .select("score")
      .eq("id", studentExam.id)
      .single();
    return respond({ success: true, score: existing?.score, already_submitted: true });
  }

  // Get answer key
  const { data: exam } = await supabaseAdmin
    .from("lct_exams")
    .select("answer_key_json")
    .eq("id", exam_id)
    .single();

  if (!exam) return respond({ error: "Exam not found" }, 404);

  // Grade
  const answerKey = exam.answer_key_json as any[];
  let correct = 0;
  const results: any[] = [];

  answerKey.forEach((ak: any) => {
    const studentAnswer = answers[String(ak.id)] || answers[ak.id] || null;
    const isCorrect = studentAnswer !== null && studentAnswer.toUpperCase() === ak.correct_answer.toUpperCase();
    if (isCorrect) correct++;
    results.push({
      id: ak.id,
      subject: ak.subject,
      correct_answer: ak.correct_answer,
      student_answer: studentAnswer,
      is_correct: isCorrect,
      explanation: ak.explanation,
    });
  });

  const score = answerKey.length > 0 ? Math.round((correct / answerKey.length) * 100) : 0;

  // Update student record
  await supabaseAdmin.from("lct_exam_students").update({
    answers_json: answers,
    score,
    status: "completed",
    submitted_at: new Date().toISOString(),
  }).eq("exam_id", exam_id).eq("student_id", user.id);

  // Remove lock
  await supabaseAdmin.from("lct_exam_locks").delete().eq("student_id", user.id);

  console.log(`[SUBMIT] Student ${user.id} submitted exam ${exam_id}: ${score}% (${correct}/${answerKey.length})`);

  return respond({
    success: true,
    score,
    correct,
    total: answerKey.length,
    results,
  });
}

// ─── END EXAM ───────────────────────────────────────────────────────────────
async function handleEndExam(supabase: any, body: any) {
  const { exam_id } = body;
  if (!exam_id) return respond({ error: "Missing exam_id" }, 400);

  const { data: exam } = await supabase
    .from("lct_exams")
    .select("status")
    .eq("id", exam_id)
    .single();

  if (!exam) return respond({ error: "Exam not found" }, 404);
  if (exam.status === "completed") {
    return respond({ success: true, message: "Exam already ended" });
  }

  // Grade any in-progress students who haven't submitted (auto-grade their saved answers)
  const { data: incompleteStudents } = await supabase
    .from("lct_exam_students")
    .select("id, student_id, answers_json")
    .eq("exam_id", exam_id)
    .in("status", ["pending", "in_progress"]);

  if (incompleteStudents?.length > 0) {
    // Get answer key for auto-grading
    const { data: examData } = await supabase
      .from("lct_exams")
      .select("answer_key_json")
      .eq("id", exam_id)
      .single();

    if (examData) {
      const answerKey = examData.answer_key_json as any[];
      
      for (const student of incompleteStudents) {
        const savedAnswers = (student.answers_json && typeof student.answers_json === 'object' && !Array.isArray(student.answers_json))
          ? student.answers_json as Record<string, string>
          : {};

        let correct = 0;
        answerKey.forEach((ak: any) => {
          const sa = savedAnswers[String(ak.id)] || null;
          if (sa && sa.toUpperCase() === ak.correct_answer.toUpperCase()) correct++;
        });

        const score = answerKey.length > 0 ? Math.round((correct / answerKey.length) * 100) : 0;

        await supabase.from("lct_exam_students").update({
          status: "timed_out",
          score,
          submitted_at: new Date().toISOString(),
        }).eq("id", student.id);
      }
    } else {
      // Can't grade — just mark as timed_out
      await supabase.from("lct_exam_students")
        .update({ status: "timed_out", submitted_at: new Date().toISOString() })
        .eq("exam_id", exam_id)
        .in("status", ["pending", "in_progress"]);
    }
  }

  // Remove all locks
  await supabase.from("lct_exam_locks").delete().eq("exam_id", exam_id);

  // Mark exam complete
  await supabase.from("lct_exams").update({ status: "completed" }).eq("id", exam_id);

  console.log(`[END] Exam ${exam_id} ended. ${incompleteStudents?.length || 0} students auto-graded.`);

  return respond({ success: true, auto_graded: incompleteStudents?.length || 0 });
}

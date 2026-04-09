import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const SUPER_ADMIN_EMAIL = "malekismail487@gmail.com";

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

async function callAI(prompt: string, systemPrompt: string, apiKey: string): Promise<string> {
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(AI_GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 16000,
        }),
      });

      if (res.status === 429 || res.status === 402) {
        const delay = res.status === 402 
          ? (attempt + 1) * 20000 
          : (attempt + 1) * 15000;
        console.warn(`AI rate limited (${res.status}), retrying in ${delay}ms...`);
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
      if (attempt === maxRetries - 1) throw e;
      await new Promise((r) => setTimeout(r, (attempt + 1) * 10000));
    }
  }
  throw new Error("AI call failed after retries");
}

function parseJsonFromAI(text: string): any[] {
  try {
    // Try direct parse first
    const parsed = JSON.parse(text.trim());
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // Try extracting from markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // Fall through
      }
    }
    
    // Try finding array in text
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch {
        // Fall through
      }
    }
    
    throw new Error(`Failed to parse AI response as JSON. Response starts with: ${text.slice(0, 200)}`);
  }
}

function validateQuestions(questions: any[], expectedCount: number, subject: string): any[] {
  // Validate each question has required fields
  const valid = questions.filter((q: any) => {
    return q && 
      typeof q.question === 'string' && q.question.length > 0 &&
      Array.isArray(q.options) && q.options.length === 4 &&
      typeof q.correct_answer === 'string' && ['A', 'B', 'C', 'D'].includes(q.correct_answer);
  });

  if (valid.length < expectedCount * 0.8) {
    console.warn(`${subject}: Only ${valid.length}/${expectedCount} valid questions generated`);
  }

  // Ensure all have subject and explanation
  valid.forEach((q: any) => {
    if (!q.subject) q.subject = subject;
    if (!q.explanation) q.explanation = "See the answer key for details.";
  });

  return valid;
}

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
      return respond({ error: "Unauthorized" }, 403);
    }

    const apiKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    switch (action) {
      case "collect_data":
        return await handleCollectData(supabaseAdmin, body);
      case "generate_exam":
        return await handleGenerateExam(supabaseAdmin, body, apiKey);
      case "translate_exam":
        return await handleTranslateExam(supabaseAdmin, body, apiKey);
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

  if (!Array.isArray(school_ids) || school_ids.length === 0 || !exam_id) {
    return respond({ error: "Missing school_ids (array) or exam_id" }, 400);
  }

  // Get students from selected schools
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

  // Fetch learning style profiles
  const studentIds = eligible.map((s: any) => s.id);
  const { data: styles } = await supabase
    .from("learning_style_profiles")
    .select("user_id, dominant_style, visual_score, logical_score, verbal_score, kinesthetic_score, conceptual_score")
    .in("user_id", studentIds);

  const styleMap: Record<string, any> = {};
  (styles || []).forEach((s: any) => { styleMap[s.user_id] = s; });

  // Batch insert schools
  const schoolRows = school_ids.map((sid: string) => ({ exam_id, school_id: sid }));
  await supabase.from("lct_exam_schools").upsert(schoolRows, { onConflict: "exam_id,school_id" });

  // Batch insert students (chunks of 50 to avoid payload limits)
  const studentRows = eligible.map((student: any) => ({
    exam_id,
    student_id: student.id,
    school_id: student.school_id,
    learning_style: styleMap[student.id]?.dominant_style || "balanced",
    status: "pending",
  }));

  for (let i = 0; i < studentRows.length; i += 50) {
    const chunk = studentRows.slice(i, i + 50);
    const { error: insertErr } = await supabase.from("lct_exam_students").upsert(chunk, { onConflict: "exam_id,student_id" });
    if (insertErr) console.error(`Batch insert error at chunk ${i}:`, insertErr);
  }

  // Update exam status
  await supabase.from("lct_exams").update({ status: "data_collected" }).eq("id", exam_id);

  // Count by style
  const styleCounts: Record<string, number> = {};
  eligible.forEach((s: any) => {
    const st = styleMap[s.id]?.dominant_style || "balanced";
    styleCounts[st] = (styleCounts[st] || 0) + 1;
  });

  return respond({
    success: true,
    total_students: eligible.length,
    style_breakdown: styleCounts,
    schools_count: school_ids.length,
  });
}

// ─── GENERATE EXAM ──────────────────────────────────────────────────────────
async function handleGenerateExam(supabase: any, body: any, apiKey: string) {
  const { exam_id } = body;
  if (!exam_id) return respond({ error: "Missing exam_id" }, 400);

  const subjects = [
    { name: "English", count: 28 },
    { name: "Mathematics", count: 28 },
    { name: "Physics", count: 28 },
    { name: "Chemistry", count: 28 },
    { name: "Biology", count: 28 },
  ];

  const allQuestions: any[] = [];
  const allAnswerKeys: any[] = [];

  for (const subject of subjects) {
    const systemPrompt = `You are an expert exam creator for a standardized cognitive test called the Luminary Cognitive Test (LCT). This test is meant to be CHALLENGING — harder than typical high school exams. It targets students in grades 9-12.

Generate exactly ${subject.count} multiple-choice questions for ${subject.name}.

Requirements:
- Each question MUST have exactly 4 options labeled A), B), C), D)
- Exactly one correct answer per question
- Test deep understanding, critical thinking, and application — not mere memorization
- Mix difficulty levels but lean towards challenging
- For Math/Physics/Chemistry: include numerical problems with specific values
- Make distractors plausible — avoid obviously wrong answers

CRITICAL: Return ONLY a valid JSON array. No markdown code blocks, no explanation text.
Each item must have this EXACT format:
[{"id":1,"subject":"${subject.name}","question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correct_answer":"A","explanation":"Brief explanation"}]`;

    const prompt = `Generate ${subject.count} challenging ${subject.name} MCQ questions for the LCT standardized test. Questions should span the full grade 9-12 curriculum. Include: conceptual understanding, application, analysis, and evaluation. Number questions starting from ${allQuestions.length + 1}.`;

    let questions: any[] = [];
    try {
      const response = await callAI(prompt, systemPrompt, apiKey);
      questions = parseJsonFromAI(response);
      questions = validateQuestions(questions, subject.count, subject.name);
    } catch (e) {
      console.error(`Failed to generate ${subject.name} questions:`, e);
      // If one subject fails, don't fail the entire exam — log and continue
      continue;
    }

    // Re-index to ensure uniqueness
    questions.forEach((q: any, i: number) => {
      q.id = allQuestions.length + i + 1;
      q.subject = subject.name;
    });

    allQuestions.push(...questions);
    questions.forEach((q: any) => {
      allAnswerKeys.push({
        id: q.id,
        subject: q.subject,
        correct_answer: q.correct_answer,
        explanation: q.explanation || "See answer key.",
      });
    });

    // Rate limit protection between subjects
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (allQuestions.length === 0) {
    return respond({ error: "Failed to generate any questions. Please try again." }, 500);
  }

  // Store in DB
  const { error: updateErr } = await supabase.from("lct_exams").update({
    questions_json: allQuestions,
    answer_key_json: allAnswerKeys,
    status: "generated",
  }).eq("id", exam_id);

  if (updateErr) throw new Error(`Failed to save exam: ${updateErr.message}`);

  return respond({
    success: true,
    total_questions: allQuestions.length,
    questions: allQuestions,
    answer_key: allAnswerKeys,
  });
}

// ─── TRANSLATE EXAM ─────────────────────────────────────────────────────────
async function handleTranslateExam(supabase: any, body: any, apiKey: string) {
  const { exam_id } = body;
  if (!exam_id) return respond({ error: "Missing exam_id" }, 400);

  // Get exam questions
  const { data: exam, error: examErr } = await supabase
    .from("lct_exams")
    .select("questions_json")
    .eq("id", exam_id)
    .single();

  if (examErr || !exam) return respond({ error: "Exam not found" }, 404);

  // Get all students for this exam
  const { data: students, error: studErr } = await supabase
    .from("lct_exam_students")
    .select("id, student_id, learning_style")
    .eq("exam_id", exam_id);

  if (studErr || !students?.length) return respond({ error: "No students found for this exam" }, 400);

  // Group students by learning style for efficiency (translate once per style, not per student)
  const styleGroups: Record<string, any[]> = {};
  students.forEach((s: any) => {
    const style = s.learning_style || "balanced";
    if (!styleGroups[style]) styleGroups[style] = [];
    styleGroups[style].push(s);
  });

  let translatedCount = 0;
  const questions = exam.questions_json as any[];

  for (const [style, group] of Object.entries(styleGroups)) {
    let translatedQuestions: any[];

    if (style === "balanced") {
      // Balanced students get original questions
      translatedQuestions = questions;
    } else {
      // Translate per subject to stay within token limits
      translatedQuestions = [];
      const subjects = ["English", "Mathematics", "Physics", "Chemistry", "Biology"];
      
      for (const subject of subjects) {
        const subjectQs = questions.filter((q: any) => q.subject === subject);
        if (subjectQs.length === 0) continue;

        const styleInstructions: Record<string, string> = {
          visual: `Reword each question to include visual descriptions, spatial references, or diagram-based thinking. For math/science, describe what a graph, chart, or diagram would look like. Add phrases like "Imagine a diagram showing..." or "Consider the following visual representation...". Do NOT change the difficulty, correct answer, or core content.`,
          logical: `Reword each question using step-by-step logical framing. Use phrases like "Given that... and knowing that... what follows?" or "If we apply the rule that...". Structure questions as logical chains. Do NOT change the difficulty, correct answer, or core content.`,
          conceptual: `Reword each question to emphasize abstract concepts, big-picture understanding, and theoretical frameworks. Use phrases like "In the broader context of..." or "Considering the underlying principle...". Do NOT change the difficulty, correct answer, or core content.`,
          kinesthetic: `Reword each question to reference hands-on activities, experiments, or physical processes. Use phrases like "If you were to physically..." or "During an experiment...". Do NOT change the difficulty, correct answer, or core content.`,
          verbal: `Reword each question using rich descriptive language, analogies, and narrative context. Use phrases like "To put it another way..." or create brief scenario-based stems. Do NOT change the difficulty, correct answer, or core content.`,
        };

        const instruction = styleInstructions[style] || styleInstructions.verbal;

        const systemPrompt = `You are an expert exam translator for the Luminary Cognitive Test (LCT). Reword exam questions to match a ${style} learning style WITHOUT changing difficulty or correct answers.

${instruction}

CRITICAL RULES:
1. The correct_answer letter (A/B/C/D) MUST remain EXACTLY the same
2. The explanation MUST remain the same
3. The difficulty MUST NOT decrease
4. Return ONLY a valid JSON array — no markdown, no explanation text
5. Keep the same id and subject for each question
6. Return the SAME number of questions you received`;

        // Send only essential fields to reduce token usage
        const compactQs = subjectQs.map((q: any) => ({
          id: q.id, subject: q.subject, question: q.question,
          options: q.options, correct_answer: q.correct_answer, explanation: q.explanation,
        }));

        try {
          const response = await callAI(
            `Translate these ${subjectQs.length} ${subject} questions for a ${style} learner:\n${JSON.stringify(compactQs)}`,
            systemPrompt,
            apiKey
          );
          const translated = parseJsonFromAI(response);
          
          // Validate translated questions preserve answer keys
          const validated = translated.map((tq: any, idx: number) => {
            const original = subjectQs[idx];
            if (!original) return tq;
            // Force-preserve critical fields from original
            return {
              ...tq,
              id: original.id,
              subject: original.subject,
              correct_answer: original.correct_answer,
              explanation: original.explanation,
              // Keep translated question and options
              question: tq.question || original.question,
              options: Array.isArray(tq.options) && tq.options.length === 4 ? tq.options : original.options,
            };
          });
          
          translatedQuestions.push(...validated);
        } catch (e) {
          console.error(`Translation failed for ${style}/${subject}, using originals:`, e);
          translatedQuestions.push(...subjectQs);
        }

        // Rate limit protection between subjects
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    // Batch update all students with this style
    const studentIds = group.map((s: any) => s.id);
    for (let i = 0; i < studentIds.length; i += 50) {
      const chunk = studentIds.slice(i, i + 50);
      for (const sid of chunk) {
        await supabase.from("lct_exam_students").update({
          translated_questions_json: translatedQuestions,
        }).eq("id", sid);
      }
    }
    translatedCount += group.length;
  }

  // Update exam status
  await supabase.from("lct_exams").update({ status: "translated" }).eq("id", exam_id);

  return respond({
    success: true,
    translated_count: translatedCount,
    styles_processed: Object.keys(styleGroups),
  });
}

// ─── START EXAM ─────────────────────────────────────────────────────────────
async function handleStartExam(supabase: any, body: any) {
  const { exam_id } = body;
  if (!exam_id) return respond({ error: "Missing exam_id" }, 400);

  // Verify exam is in translated state
  const { data: exam } = await supabase.from("lct_exams").select("status").eq("id", exam_id).single();
  if (!exam || (exam.status !== "translated" && exam.status !== "generated")) {
    return respond({ error: `Exam is in '${exam?.status}' state and cannot be started.` }, 400);
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours

  // Update exam
  const { error: updateErr } = await supabase.from("lct_exams").update({
    status: "active",
    started_at: now.toISOString(),
    ends_at: endsAt.toISOString(),
  }).eq("id", exam_id);

  if (updateErr) throw new Error(`Failed to start exam: ${updateErr.message}`);

  // Get all students for this exam
  const { data: students } = await supabase
    .from("lct_exam_students")
    .select("student_id")
    .eq("exam_id", exam_id);

  if (!students?.length) {
    return respond({ error: "No students found for this exam" }, 400);
  }

  // Batch create locks (chunks of 50)
  const lockRows = students.map((s: any) => ({
    student_id: s.student_id,
    exam_id,
    locked_until: endsAt.toISOString(),
  }));

  for (let i = 0; i < lockRows.length; i += 50) {
    const chunk = lockRows.slice(i, i + 50);
    const { error: lockErr } = await supabase.from("lct_exam_locks").upsert(chunk, { onConflict: "student_id" });
    if (lockErr) console.error(`Lock batch error at ${i}:`, lockErr);
  }

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
  if (!answers || typeof answers !== 'object') return respond({ error: "Missing or invalid answers" }, 400);

  // Get user from auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return respond({ error: "Unauthorized" }, 401);

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token);
  if (authErr || !user) return respond({ error: "Unauthorized" }, 401);

  // Verify student is actually assigned to this exam
  const { data: studentExam } = await supabaseAdmin
    .from("lct_exam_students")
    .select("id, status")
    .eq("exam_id", exam_id)
    .eq("student_id", user.id)
    .single();

  if (!studentExam) return respond({ error: "You are not assigned to this exam" }, 403);
  if (studentExam.status === "completed") return respond({ error: "Exam already submitted" }, 400);

  // Get answer key
  const { data: exam } = await supabaseAdmin
    .from("lct_exams")
    .select("answer_key_json")
    .eq("id", exam_id)
    .single();

  if (!exam) return respond({ error: "Exam not found" }, 404);

  // Grade the exam
  const answerKey = exam.answer_key_json as any[];
  let correct = 0;
  const results: any[] = [];

  answerKey.forEach((ak: any) => {
    const studentAnswer = answers[String(ak.id)] || answers[ak.id];
    const isCorrect = studentAnswer === ak.correct_answer;
    if (isCorrect) correct++;
    results.push({
      id: ak.id,
      subject: ak.subject,
      correct_answer: ak.correct_answer,
      student_answer: studentAnswer || null,
      is_correct: isCorrect,
      explanation: ak.explanation,
    });
  });

  const score = answerKey.length > 0 ? Math.round((correct / answerKey.length) * 100) : 0;

  // Update student record
  const { error: updateErr } = await supabaseAdmin.from("lct_exam_students").update({
    answers_json: answers,
    score,
    status: "completed",
    submitted_at: new Date().toISOString(),
  }).eq("exam_id", exam_id).eq("student_id", user.id);

  if (updateErr) console.error("Failed to update student record:", updateErr);

  // Remove lock
  const { error: lockErr } = await supabaseAdmin.from("lct_exam_locks").delete().eq("student_id", user.id);
  if (lockErr) console.error("Failed to remove lock:", lockErr);

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

  // Verify exam exists and is active
  const { data: exam } = await supabase.from("lct_exams").select("status").eq("id", exam_id).single();
  if (!exam) return respond({ error: "Exam not found" }, 404);
  if (exam.status === "completed") return respond({ success: true, message: "Exam already ended" });

  // Mark incomplete students as timed_out
  await supabase.from("lct_exam_students")
    .update({ status: "timed_out", submitted_at: new Date().toISOString() })
    .eq("exam_id", exam_id)
    .in("status", ["pending", "in_progress"]);

  // Remove all locks for this exam
  await supabase.from("lct_exam_locks").delete().eq("exam_id", exam_id);

  // Update exam status
  await supabase.from("lct_exams").update({ status: "completed" }).eq("id", exam_id);

  return respond({ success: true });
}

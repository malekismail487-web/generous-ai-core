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

      if (res.status === 429) {
        const delay = (attempt + 1) * 15000;
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

function parseJsonFromAI(text: string): any {
  // Try to extract JSON from markdown code blocks
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = jsonMatch ? jsonMatch[1].trim() : text.trim();
  return JSON.parse(raw);
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

    // For student actions, skip admin check
    if (action === "submit_exam") {
      return await handleSubmitExam(req, supabaseAdmin, supabaseAuth, body);
    }

    // All other actions require super admin
    const isAdmin = await verifyAdmin(req, supabaseAuth);
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    switch (action) {
      case "collect_data":
        return await handleCollectData(supabaseAdmin, body, apiKey);
      case "generate_exam":
        return await handleGenerateExam(supabaseAdmin, body, apiKey);
      case "translate_exam":
        return await handleTranslateExam(supabaseAdmin, body, apiKey);
      case "start_exam":
        return await handleStartExam(supabaseAdmin, body);
      case "end_exam":
        return await handleEndExam(supabaseAdmin, body);
      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (err) {
    console.error("LCT Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleCollectData(supabase: any, body: any, _apiKey: string) {
  const { school_ids, exam_id } = body;

  if (!school_ids?.length || !exam_id) {
    return new Response(JSON.stringify({ error: "Missing school_ids or exam_id" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get students grade 9+ from selected schools
  const { data: students, error: studErr } = await supabase
    .from("profiles")
    .select("id, full_name, grade_level, school_id")
    .in("school_id", school_ids)
    .eq("user_type", "student")
    .eq("status", "approved")
    .eq("is_active", true);

  if (studErr) throw new Error(`Error fetching students: ${studErr.message}`);

  // Filter for grade 9+
  const gradeFilter = ["9", "10", "11", "12", "Grade 9", "Grade 10", "Grade 11", "Grade 12", "grade 9", "grade 10", "grade 11", "grade 12"];
  const eligible = (students || []).filter((s: any) => {
    const g = s.grade_level || "";
    const num = g.replace(/\D/g, "");
    return parseInt(num) >= 9 || gradeFilter.some(f => g.toLowerCase().includes(f.toLowerCase()));
  });

  // Fetch learning style profiles
  const studentIds = eligible.map((s: any) => s.id);
  const { data: styles } = await supabase
    .from("learning_style_profiles")
    .select("user_id, dominant_style, visual_score, logical_score, verbal_score, kinesthetic_score, conceptual_score")
    .in("user_id", studentIds);

  const styleMap: Record<string, any> = {};
  (styles || []).forEach((s: any) => { styleMap[s.user_id] = s; });

  // Insert into lct_exam_schools
  for (const sid of school_ids) {
    await supabase.from("lct_exam_schools").upsert({
      exam_id, school_id: sid
    }, { onConflict: "exam_id,school_id" });
  }

  // Insert eligible students into lct_exam_students
  for (const student of eligible) {
    const style = styleMap[student.id];
    await supabase.from("lct_exam_students").upsert({
      exam_id,
      student_id: student.id,
      school_id: student.school_id,
      learning_style: style?.dominant_style || "balanced",
      status: "pending",
    }, { onConflict: "exam_id,student_id" });
  }

  // Update exam status
  await supabase.from("lct_exams").update({ status: "data_collected" }).eq("id", exam_id);

  // Count by style
  const styleCounts: Record<string, number> = {};
  eligible.forEach((s: any) => {
    const st = styleMap[s.id]?.dominant_style || "balanced";
    styleCounts[st] = (styleCounts[st] || 0) + 1;
  });

  return new Response(JSON.stringify({
    success: true,
    total_students: eligible.length,
    style_breakdown: styleCounts,
    schools_count: school_ids.length,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleGenerateExam(supabase: any, body: any, apiKey: string) {
  const { exam_id } = body;
  if (!exam_id) {
    return new Response(JSON.stringify({ error: "Missing exam_id" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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
    const systemPrompt = `You are an expert exam creator for a standardized cognitive test called the Luminary Cognitive Test (LCT). This test is meant to be CHALLENGING — harder than typical high school exams. It targets students in grades 9-12. Generate exactly ${subject.count} multiple-choice questions for ${subject.name}. Each question MUST have exactly 4 options (A, B, C, D) and one correct answer. The questions should test deep understanding, critical thinking, and application — not mere memorization. Mix difficulty levels but lean towards challenging.

CRITICAL: Return ONLY valid JSON array, no markdown, no explanation. Each item must have this EXACT format:
[
  {
    "id": 1,
    "subject": "${subject.name}",
    "question": "...",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "correct_answer": "A",
    "explanation": "Brief explanation of why this is correct"
  }
]`;

    const prompt = `Generate ${subject.count} challenging ${subject.name} MCQ questions for the LCT standardized test. Questions should span the full grade 9-12 curriculum. Include a mix of: conceptual understanding, application problems, analysis, and evaluation. For Math/Physics/Chemistry include numerical problems. Make the distractors plausible. Number questions starting from ${allQuestions.length + 1}.`;

    const response = await callAI(prompt, systemPrompt, apiKey);
    const questions = parseJsonFromAI(response);

    // Re-index
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
        explanation: q.explanation,
      });
    });
  }

  // Store in DB
  await supabase.from("lct_exams").update({
    questions_json: allQuestions,
    answer_key_json: allAnswerKeys,
    status: "generated",
  }).eq("id", exam_id);

  return new Response(JSON.stringify({
    success: true,
    total_questions: allQuestions.length,
    questions: allQuestions,
    answer_key: allAnswerKeys,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleTranslateExam(supabase: any, body: any, apiKey: string) {
  const { exam_id } = body;
  if (!exam_id) {
    return new Response(JSON.stringify({ error: "Missing exam_id" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get exam questions
  const { data: exam } = await supabase
    .from("lct_exams")
    .select("questions_json")
    .eq("id", exam_id)
    .single();

  if (!exam) throw new Error("Exam not found");

  // Get all students for this exam
  const { data: students } = await supabase
    .from("lct_exam_students")
    .select("id, student_id, learning_style")
    .eq("exam_id", exam_id);

  if (!students?.length) throw new Error("No students found");

  // Group students by learning style for efficiency
  const styleGroups: Record<string, any[]> = {};
  students.forEach((s: any) => {
    const style = s.learning_style || "balanced";
    if (!styleGroups[style]) styleGroups[style] = [];
    styleGroups[style].push(s);
  });

  const translatedByStyle: Record<string, any[]> = {};
  let translatedCount = 0;

  for (const [style, group] of Object.entries(styleGroups)) {
    if (style === "balanced") {
      // Balanced students get the original questions
      translatedByStyle[style] = exam.questions_json;
      for (const student of group) {
        await supabase.from("lct_exam_students").update({
          translated_questions_json: exam.questions_json,
        }).eq("id", student.id);
        translatedCount++;
      }
      continue;
    }

    // Translate for this learning style - process in chunks of 28 (per subject)
    const questions = exam.questions_json as any[];
    const translatedQuestions: any[] = [];

    // Process per subject to stay within token limits
    const subjects = ["English", "Mathematics", "Physics", "Chemistry", "Biology"];
    for (const subject of subjects) {
      const subjectQs = questions.filter((q: any) => q.subject === subject);

      const styleInstructions: Record<string, string> = {
        visual: `Reword each question to include visual descriptions, spatial references, or diagram-based thinking. For math/science, describe what a graph, chart, or diagram would look like. Add phrases like "Imagine a diagram showing..." or "Consider the following visual representation...". Do NOT change the difficulty, correct answer, or core content. Keep all 4 options identical in meaning but reword them with visual context where appropriate.`,
        logical: `Reword each question using step-by-step logical framing. Use phrases like "Given that... and knowing that... what follows?" or "If we apply the rule that...". Structure questions as logical chains. Do NOT change the difficulty, correct answer, or core content. Keep all 4 options identical in meaning but frame them in logical/analytical language.`,
        conceptual: `Reword each question to emphasize abstract concepts, big-picture understanding, and theoretical frameworks. Use phrases like "In the broader context of..." or "Considering the underlying principle...". Do NOT change the difficulty, correct answer, or core content. Keep all 4 options identical in meaning but frame them conceptually.`,
        kinesthetic: `Reword each question to reference hands-on activities, experiments, or physical processes. Use phrases like "If you were to physically..." or "During an experiment...". Do NOT change the difficulty, correct answer, or core content. Keep all 4 options identical in meaning but frame them in experiential/kinesthetic language.`,
        verbal: `Reword each question using rich descriptive language, analogies, and narrative context. Use phrases like "To put it another way..." or create brief scenario-based stems. Do NOT change the difficulty, correct answer, or core content. Keep all 4 options identical in meaning but use more elaborate verbal framing.`,
      };

      const instruction = styleInstructions[style] || styleInstructions.verbal;

      const systemPrompt = `You are an expert exam translator for the Luminary Cognitive Test (LCT). Your job is to REWORD exam questions to match a specific learning style WITHOUT changing difficulty, correct answers, or core content.

${instruction}

CRITICAL RULES:
1. The correct_answer letter (A/B/C/D) MUST remain the same
2. The explanation MUST remain the same
3. The difficulty MUST NOT decrease
4. Return ONLY valid JSON array, no markdown
5. Keep the same id, subject for each question`;

      const prompt = `Translate these ${subject} questions for a ${style} learner:\n${JSON.stringify(subjectQs)}`;

      try {
        const response = await callAI(prompt, systemPrompt, apiKey);
        const translated = parseJsonFromAI(response);
        translatedQuestions.push(...translated);
      } catch (e) {
        console.error(`Translation failed for ${style}/${subject}, using originals:`, e);
        translatedQuestions.push(...subjectQs);
      }

      // Rate limit protection between subjects
      await new Promise((r) => setTimeout(r, 2000));
    }

    translatedByStyle[style] = translatedQuestions;

    // Save for each student with this style
    for (const student of group) {
      await supabase.from("lct_exam_students").update({
        translated_questions_json: translatedQuestions,
      }).eq("id", student.id);
      translatedCount++;
    }
  }

  // Update exam status
  await supabase.from("lct_exams").update({ status: "translated" }).eq("id", exam_id);

  return new Response(JSON.stringify({
    success: true,
    translated_count: translatedCount,
    styles_processed: Object.keys(styleGroups),
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleStartExam(supabase: any, body: any) {
  const { exam_id } = body;
  if (!exam_id) {
    return new Response(JSON.stringify({ error: "Missing exam_id" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours

  // Update exam
  await supabase.from("lct_exams").update({
    status: "active",
    started_at: now.toISOString(),
    ends_at: endsAt.toISOString(),
  }).eq("id", exam_id);

  // Get all students for this exam
  const { data: students } = await supabase
    .from("lct_exam_students")
    .select("student_id")
    .eq("exam_id", exam_id);

  // Create locks for all students
  for (const student of (students || [])) {
    await supabase.from("lct_exam_locks").upsert({
      student_id: student.student_id,
      exam_id,
      locked_until: endsAt.toISOString(),
    }, { onConflict: "student_id" });
  }

  return new Response(JSON.stringify({
    success: true,
    started_at: now.toISOString(),
    ends_at: endsAt.toISOString(),
    locked_students: students?.length || 0,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleSubmitExam(req: Request, supabaseAdmin: any, supabaseAuth: any, body: any) {
  const { exam_id, answers } = body;

  // Get user from auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.replace("Bearer ", "");
  const { data: { user } } = await supabaseAuth.auth.getUser(token);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get answer key
  const { data: exam } = await supabaseAdmin
    .from("lct_exams")
    .select("answer_key_json")
    .eq("id", exam_id)
    .single();

  if (!exam) {
    return new Response(JSON.stringify({ error: "Exam not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Grade the exam
  const answerKey = exam.answer_key_json as any[];
  let correct = 0;
  const results: any[] = [];

  answerKey.forEach((ak: any) => {
    const studentAnswer = answers?.[ak.id];
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

  const score = Math.round((correct / answerKey.length) * 100);

  // Update student record
  await supabaseAdmin.from("lct_exam_students").update({
    answers_json: answers,
    score,
    status: "completed",
    submitted_at: new Date().toISOString(),
  }).eq("exam_id", exam_id).eq("student_id", user.id);

  // Remove lock
  await supabaseAdmin.from("lct_exam_locks").delete().eq("student_id", user.id);

  return new Response(JSON.stringify({
    success: true,
    score,
    correct,
    total: answerKey.length,
    results,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleEndExam(supabase: any, body: any) {
  const { exam_id } = body;
  if (!exam_id) {
    return new Response(JSON.stringify({ error: "Missing exam_id" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Mark incomplete students as timed_out
  await supabase.from("lct_exam_students")
    .update({ status: "timed_out", submitted_at: new Date().toISOString() })
    .eq("exam_id", exam_id)
    .in("status", ["pending", "in_progress"]);

  // Remove all locks for this exam
  await supabase.from("lct_exam_locks").delete().eq("exam_id", exam_id);

  // Update exam status
  await supabase.from("lct_exams").update({ status: "completed" }).eq("id", exam_id);

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

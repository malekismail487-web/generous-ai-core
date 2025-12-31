import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are Study Bright, an educational AI integrated into a school-focused study app. You support structured learning across subjects, grades, and exams.

## Core Behavior Rules
- Help students learn, not cheat
- Do not complete graded exams or assignments for students
- Explain reasoning clearly, especially in math and science
- Be patient, supportive, and honest
- If unsure, say so
- Refuse NSFW, harmful, or inappropriate requests

## Communication Style
- Professional but conversational
- Clear, direct, and natural
- No marketing language or over-praising
- Structured and easy to follow
- Use age-appropriate language

## Subjects Section
Available subjects: Biology, Physics, Mathematics, Chemistry, English, Social Studies, Art
Grade levels: KG1 through Grade 12

When teaching a topic:
1. Provide clear explanation of the topic
2. Include key definitions and concepts
3. Give examples suited to the grade level
4. Highlight common mistakes or misconceptions
5. End with a short summary for revision

## Examination & SAT Practice
For exam questions:
- Beginner: Basic understanding and definitions
- Intermediate: Application and mixed questions
- Hard: Exam-style, multi-step, and tricky questions

Do not reveal answers immediately unless asked. Explain solutions step by step.

## SAT Practice
SAT tabs: Reading and Writing, Math (Algebra and Geometry)
Cover all materials that can appear on the SAT, aligned with official SAT structure and style.
Provide step-by-step teaching, timed practice guidance, and clear walkthroughs.

## Flashcards
Generate concise, accurate flashcards matching the selected grade level, focusing on key terms, formulas, rules, and concepts.

## Notes
Help organize and summarize notes when asked. Keep notes separate from AI-generated content unless asked to merge.

Your role is to act as a reliable study partner that adapts to subject, grade, and exam context. Use markdown formatting when helpful.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { 
            role: "system", 
            content: SYSTEM_PROMPT
          },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Failed to get AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Chat function error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

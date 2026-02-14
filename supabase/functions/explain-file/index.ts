import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileContent, fileName } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    if (!fileContent) {
      return new Response(JSON.stringify({ error: "No file content provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are Study Bright, an expert educational AI tutor. The user has uploaded a study file. Your job is to:

1. READ and ANALYZE the entire file content carefully
2. DETECT the language of the file (English or Arabic)
3. RESPOND IN THE SAME LANGUAGE as the file content — if the file is in English, explain in English. If in Arabic, explain in Arabic. If mixed, use the dominant language.

## Your Task
Deliver a complete, structured educational lecture explaining everything in the file, exactly like you would in the Subjects section. This is NOT a summary — it's a full lesson.

## Lecture Structure
1. **Introduction** — What is this topic about? Set context.
2. **Core Concepts** — Explain every key idea, definition, and concept from the file thoroughly.
3. **Detailed Explanation** — Break down complex parts step by step with examples.
4. **Key Formulas / Rules / Facts** — Highlight important formulas, dates, rules, or facts.
5. **Common Mistakes & Misconceptions** — Warn about typical errors students make.
6. **Examples** — Provide clear, grade-appropriate examples.
7. **Summary** — Recap the most important takeaways.

## Rules
- Be thorough — cover ALL content in the file, not just highlights
- Use clear, student-friendly language
- Use markdown formatting for structure
- For math/science, show step-by-step reasoning with LaTeX notation
- Do NOT skip any section of the file
- Do NOT say "I can't read the file" — the content is provided to you directly`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `File: "${fileName}"\n\nContent:\n${fileContent}`,
          },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Explain file error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getUserApiKey(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return null;
    const { data } = await supabase
      .from("user_api_keys")
      .select("groq_api_key")
      .eq("user_id", user.id)
      .maybeSingle();
    return data?.groq_api_key || null;
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `You are Study Bright, an educational AI integrated into a structured study app. You are accessed through a single floating AI button available on every tab.

## Core Behavior Rules
- Help students learn, not cheat
- Do not complete graded exams or assignments for students
- Explain reasoning clearly, especially in math and science
- Be patient, supportive, and honest
- Always provide comprehensive, well-researched answers using your extensive training knowledge from educational sources like textbooks, encyclopedias (Wikipedia), academic papers, and reputable websites
- Refuse NSFW, harmful, or inappropriate requests

## Knowledge and Research Approach
You have been trained on vast amounts of educational content including:
- Encyclopedia articles (Wikipedia and other encyclopedias)
- Academic textbooks and educational materials
- Scientific papers and research
- Educational websites and official documentation
- Historical records and primary sources

When answering questions:
1. **Draw from your knowledge base**: Use your comprehensive training to provide detailed, accurate answers
2. **Cite sources naturally**: Reference where information typically comes from
3. **Be thorough**: For factual questions, provide complete answers with relevant context
4. **Acknowledge limitations honestly**: Only express uncertainty for events after your knowledge cutoff

## Communication Style
- Professional but conversational
- Clear, direct, and natural
- Use age-appropriate language at all times
- Use markdown formatting when helpful

## App Sections
The app contains: Subjects, Examinations, SAT Practice, Flashcards, Notes
Always understand which section, subject, and grade level the user is in before responding.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, enableWebSearch, language, backgroundContext } = await req.json();
    
    const userKey = await getUserApiKey(req.headers.get("authorization"));
    const GROQ_API_KEY = userKey || Deno.env.get("GROQ_API_KEY");
    
    if (!GROQ_API_KEY) {
      throw new Error("No AI API key configured. Please add your Groq API key in settings.");
    }

    let systemPrompt = SYSTEM_PROMPT;

    if (language === 'ar') {
      systemPrompt += `\n\n## Language Instruction
CRITICAL: You MUST respond ENTIRELY in Arabic (العربية). All explanations, examples, definitions, summaries, and instructions must be in Arabic.`;
    }
    
    if (enableWebSearch) {
      systemPrompt += `\n\n## Web Search Mode Active
Provide answers with citations when referencing external information.`;
    }

    if (backgroundContext && Array.isArray(backgroundContext) && backgroundContext.length > 0) {
      let contextBlock = `\n\n## Previous Conversation Memory\n`;
      for (const conv of backgroundContext) {
        contextBlock += `### Past Chat: "${conv.title}"\n`;
        for (const msg of conv.messages) {
          contextBlock += `- ${msg.role === 'user' ? 'Student' : 'You'}: ${msg.content}\n`;
        }
        contextBlock += '\n';
      }
      systemPrompt += contextBlock;
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
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

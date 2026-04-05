import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("No auth header");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) throw new Error("Unauthorized");

    const { messages, knowledgeGapData } = await req.json();

    // 1) Extract memories from conversation
    if (messages && messages.length > 0) {
      const conversationText = messages
        .map((m: any) => `${m.role}: ${m.content}`)
        .join("\n");

      const extractionPrompt = `Analyze this tutoring conversation and extract key facts about the student. Return a JSON array of memory objects.

Each memory should have:
- "memory_type": one of "fact", "preference", "struggle", "strength", "personal", "personality"
- "content": a concise statement (max 100 chars)
- "subject": the academic subject if applicable, or null
- "confidence": 0.5-1.0 based on how certain this inference is

Rules:
- Only extract genuinely useful, non-obvious facts
- "struggle": topics/concepts the student is struggling with
- "strength": topics the student excels at or understands well
- "preference": learning preferences (e.g., "prefers visual examples")
- "fact": factual info about the student (e.g., "is in Grade 10")
- "personal": personal context (e.g., "has exam next week")
- "personality": personality traits observed (e.g., "asks follow-up questions", "gets frustrated easily")
- Return [] if nothing noteworthy to extract
- Max 5 memories per conversation
- Be selective — only meaningful patterns, not every detail

Conversation:
${conversationText}

Respond with ONLY a JSON array, no markdown:`;

      try {
        const aiResponse = await fetch(AI_GATEWAY_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [{ role: "user", content: extractionPrompt }],
            temperature: 0.1,
          }),
        });

        if (aiResponse.ok) {
          const data = await aiResponse.json();
          const content = data.choices?.[0]?.message?.content || "[]";
          // Parse JSON from response, handling markdown code blocks
          let cleanContent = content.trim();
          if (cleanContent.startsWith("```")) {
            cleanContent = cleanContent.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
          }

          const memories = JSON.parse(cleanContent);

          if (Array.isArray(memories) && memories.length > 0) {
            // Fetch existing memories for deduplication
            const { data: existing } = await supabase
              .from("student_memory")
              .select("content, id, confidence")
              .eq("user_id", user.id);

            for (const mem of memories) {
              if (!mem.content || !mem.memory_type) continue;

              // Semantic dedup: normalize and compare word overlap
              const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
              const memWords = new Set(normalize(mem.content).split(/\s+/).filter(w => w.length > 3));
              const duplicate = existing?.find((e) => {
                const existingWords = new Set(normalize(e.content).split(/\s+/).filter(w => w.length > 3));
                if (memWords.size === 0 || existingWords.size === 0) return false;
                const overlap = [...memWords].filter(w => existingWords.has(w)).length;
                const similarity = overlap / Math.min(memWords.size, existingWords.size);
                return similarity >= 0.6;
              });

              if (duplicate) {
                // Boost confidence of existing memory
                const newConf = Math.min(0.99, (Number(duplicate.confidence) || 0.8) + 0.05);
                await supabase
                  .from("student_memory")
                  .update({ confidence: newConf, updated_at: new Date().toISOString() })
                  .eq("id", duplicate.id);
              } else {
                await supabase.from("student_memory").insert({
                  user_id: user.id,
                  memory_type: mem.memory_type,
                  content: mem.content.slice(0, 200),
                  subject: mem.subject || null,
                  confidence: Math.max(0.5, Math.min(1.0, mem.confidence || 0.8)),
                });
              }
            }
          }
        }
      } catch (e) {
        console.warn("Memory extraction failed (non-blocking):", e);
      }
    }

    // 2) Process knowledge gaps from quiz/exam/assignment data
    if (knowledgeGapData) {
      const { subject, wrongAnswers, source } = knowledgeGapData;
      if (wrongAnswers && wrongAnswers.length > 0) {
        for (const wa of wrongAnswers) {
          // Check if gap already exists
          const { data: existingGap } = await supabase
            .from("knowledge_gaps")
            .select("id, severity")
            .eq("user_id", user.id)
            .eq("subject", subject)
            .eq("topic", wa.topic || "General")
            .eq("resolved", false)
            .maybeSingle();

          if (existingGap) {
            // Escalate severity if repeated
            const severityOrder = ["minor", "moderate", "critical"];
            const currentIdx = severityOrder.indexOf(existingGap.severity);
            const newSeverity = severityOrder[Math.min(currentIdx + 1, 2)];
            await supabase
              .from("knowledge_gaps")
              .update({ severity: newSeverity, updated_at: new Date().toISOString() })
              .eq("id", existingGap.id);
          } else {
            await supabase.from("knowledge_gaps").insert({
              user_id: user.id,
              subject,
              topic: wa.topic || "General",
              gap_description: wa.description || `Incorrect: ${wa.question?.slice(0, 100)}`,
              severity: "minor",
              detected_from: source || "chat",
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Extract memories error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

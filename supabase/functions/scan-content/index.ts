import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { content, content_type, content_id, user_id, school_id } = await req.json();

    if (!content || !content_type || !user_id) {
      return new Response(JSON.stringify({ flagged: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Truncate content for analysis
    const textToAnalyze = String(content).substring(0, 4000);

    // Use Gemini via Lovable AI Gateway for content moderation
    const response = await fetch(LOVABLE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You are a content moderation AI for an educational platform used by students and teachers. Analyze the following content and determine if it is inappropriate, malicious, or harmful. Consider:
- Profanity, hate speech, slurs, or offensive language
- Bullying, threats, or harassment
- Sexual or explicit content
- Violence or gore
- Misinformation that could be harmful in an educational context
- Spam or nonsensical content designed to disrupt
- Personal information sharing (phone numbers, addresses)
- Drug/alcohol references inappropriate for students

Respond with a JSON object:
{"flagged": boolean, "severity": "low"|"medium"|"high"|"critical", "reason": "brief explanation"}

If the content is normal educational material, respond with {"flagged": false}.
Be strict about content safety since this is a K-12 platform.`,
          },
          {
            role: "user",
            content: `Analyze this ${content_type.replace("_", " ")} content:\n\n${textToAnalyze}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      console.error("AI moderation error:", response.status);
      return new Response(JSON.stringify({ flagged: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || "";

    let result = { flagged: false, severity: "low", reason: "" };
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // If can't parse, assume safe
      return new Response(JSON.stringify({ flagged: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If flagged, insert into content_flags table
    if (result.flagged) {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await admin.from("content_flags").insert({
        content_type,
        content_id: content_id || null,
        content_text: textToAnalyze.substring(0, 2000),
        user_id,
        school_id: school_id || null,
        severity: result.severity || "medium",
        reason: result.reason || "Flagged by AI content scanner",
        status: "pending",
      });
    }

    return new Response(JSON.stringify({ flagged: result.flagged, severity: result.severity }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("scan-content error:", error);
    return new Response(
      JSON.stringify({ flagged: false, error: error instanceof Error ? error.message : "Unknown" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

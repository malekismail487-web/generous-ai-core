import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { subject, topic, grade, count } = await req.json();

    const ZENMUX_API_KEY = Deno.env.get("ZENMUX_API_KEY");
    if (!ZENMUX_API_KEY) {
      throw new Error("ZENMUX_API_KEY is not configured");
    }

    // Note: Ling-1T is a text model. For diagram generation, we'll generate
    // detailed text-based diagrams (ASCII art, mermaid syntax, etc.) instead of images.
    // Image generation would require a separate image model API.
    
    const diagramCount = Math.min(count || 2, 3);
    const images: string[] = [];

    // Since Ling-1T is a text model, we return an empty images array.
    // The frontend should handle this gracefully.
    // If you need image generation, you'd need a separate image generation API.

    return new Response(
      JSON.stringify({ images }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-diagram error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        images: [],
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

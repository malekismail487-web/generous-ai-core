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
    const { fileContent, fileName, language } = await req.json();
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

    const isArabic = language === 'ar';

    const systemPrompt = isArabic
      ? `أنت معلم ذكي متخصص في شرح المحتوى التعليمي. المستخدم رفع ملفاً ويريد منك شرحه بطريقة واضحة ومفصلة كأنك تقدم حلقة بودكاست تعليمية.

## القواعد:
- اشرح المحتوى بالكامل بالعربية
- استخدم لغة بسيطة ومفهومة
- قسّم الشرح إلى أقسام واضحة
- أضف أمثلة توضيحية عند الحاجة
- اختم بملخص سريع لأهم النقاط
- اجعل الشرح كأنك تتحدث مباشرة للطالب`
      : `You are an expert educational tutor. The user has uploaded a file and wants you to explain its content clearly and thoroughly, as if you're delivering an educational podcast episode.

## Rules:
- Explain the entire content in a clear, engaging way
- Use simple, accessible language
- Break the explanation into clear sections
- Add examples where helpful
- End with a quick summary of the key takeaways
- Speak as if talking directly to the student in a conversational podcast style`;

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
            content: `${isArabic ? 'الملف' : 'File'}: "${fileName}"\n\n${isArabic ? 'المحتوى' : 'Content'}:\n${fileContent}`,
          },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: isArabic ? "تم تجاوز حد الطلبات. حاول مرة أخرى." : "Rate limit exceeded. Please try again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: isArabic ? "انتهت الأرصدة. أضف رصيداً للمتابعة." : "Usage limit reached." }), {
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

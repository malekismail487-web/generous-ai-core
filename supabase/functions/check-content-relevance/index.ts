// Soft AI relevance check — returns a verdict but never blocks.
// The hard guard lives in the DB trigger `enforce_teacher_category`.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const MODEL = 'google/gemini-2.5-flash-lite';
const GATEWAY = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MAX_TEXT = 8000; // chars sent to the model

type Body = {
  category_name: string;
  title?: string;
  description?: string;
  file_name?: string;
  file_url?: string; // optional: server-side fetch & extract text
  inline_text?: string; // already-extracted text (PDF/Doc parsed client-side, optional)
};

async function fetchFileText(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) return '';
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    // Plain text / html / json → take as text
    if (ct.includes('text') || ct.includes('json') || ct.includes('xml')) {
      const t = await res.text();
      return t.slice(0, MAX_TEXT);
    }
    // PDF/Doc binary: read first chunk as latin1 and strip non-printable.
    // This is a very lightweight extractor — enough to catch the topic words
    // embedded in PDFs even when we can't fully decode the file.
    const buf = new Uint8Array(await res.arrayBuffer());
    const slice = buf.slice(0, 200_000);
    let s = '';
    for (let i = 0; i < slice.length; i++) {
      const c = slice[i];
      if ((c >= 32 && c < 127) || c === 10 || c === 13) s += String.fromCharCode(c);
      else s += ' ';
    }
    // collapse whitespace, keep only word-ish runs
    s = s.replace(/[^A-Za-z\u0600-\u06FF0-9 .,;:?!\-]+/g, ' ').replace(/\s+/g, ' ').trim();
    return s.slice(0, MAX_TEXT);
  } catch {
    return '';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ relevant: true, confidence: 0, reason: 'AI unavailable', skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      });
    }

    const body = await req.json() as Body;
    const category = (body.category_name || '').trim();
    if (!category) {
      return new Response(JSON.stringify({ error: 'category_name required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      });
    }

    let fileText = (body.inline_text || '').slice(0, MAX_TEXT);
    if (!fileText && body.file_url) fileText = await fetchFileText(body.file_url);

    const prompt = [
      `Teacher's assigned subject category: "${category}".`,
      body.file_name ? `File name: ${body.file_name}` : '',
      body.title ? `Title: ${body.title}` : '',
      body.description ? `Description: ${body.description}` : '',
      fileText ? `Content excerpt:\n${fileText}` : '',
      '',
      `Question: Does this content plausibly belong in a "${category}" class?`,
      `Be LENIENT. If borderline, related, or you cannot tell → relevant=true.`,
      `Only mark relevant=false when the content is clearly about a different subject (e.g. teacher is "Arabic" but content is clearly about Biology/Physics/etc.).`,
      `Respond with strict JSON: {"relevant": boolean, "confidence": number 0..1, "detected_topic": string, "reason": string (max 140 chars)}.`,
    ].filter(Boolean).join('\n');

    const aiRes = await fetch(GATEWAY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: 'You classify whether educational content matches a teacher subject category. Reply ONLY with JSON.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiRes.ok) {
      // Soft-fail — never block teacher
      const status = aiRes.status;
      return new Response(JSON.stringify({ relevant: true, confidence: 0, reason: `AI ${status}`, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      });
    }

    const data = await aiRes.json();
    const text: string = data?.choices?.[0]?.message?.content ?? '{}';
    let parsed: any = {};
    try { parsed = JSON.parse(text); } catch { parsed = {}; }

    const relevant = parsed.relevant !== false; // default to relevant on weird output
    const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;
    const detected_topic = typeof parsed.detected_topic === 'string' ? parsed.detected_topic.slice(0, 80) : '';
    const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200) : '';

    return new Response(JSON.stringify({ relevant, confidence, detected_topic, reason }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  } catch (err) {
    return new Response(JSON.stringify({ relevant: true, confidence: 0, reason: 'check failed', skipped: true, error: String(err) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  }
});

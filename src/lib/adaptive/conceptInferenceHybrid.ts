/**
 * conceptInferenceHybrid.ts — keyword-first, embedding-fallback inference.
 *
 * Calls the local keyword scorer first (free, sync). When the dominant raw
 * score is weak but the text is rich enough that there should be a concept,
 * falls back to the server-side embeddings endpoint. Network failures degrade
 * silently to the keyword result so the IRT pipeline is never blocked.
 */

import { supabase } from "@/integrations/supabase/client";
import { inferConceptDistribution, type ConceptWeight } from "@/lib/adaptive/conceptInference";

const KEYWORD_STRONG_THRESHOLD = 36; // 6² — at least one solid keyword hit
const MIN_TEXT_LENGTH_FOR_EMBEDDING = 40;

export async function inferConceptDistributionHybrid(
  subject: string,
  questionText: string,
  topK = 2,
): Promise<ConceptWeight[]> {
  const keyword = inferConceptDistribution(subject, questionText, topK);
  const topScore = keyword[0]?.rawScore ?? 0;

  if (topScore >= KEYWORD_STRONG_THRESHOLD) return keyword;
  if (questionText.trim().length < MIN_TEXT_LENGTH_FOR_EMBEDDING) return keyword;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return keyword;
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/infer-concept`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ subject, text: questionText, topK }),
      },
    );
    if (!res.ok) return keyword;
    const json = await res.json() as { distribution?: { conceptId: string; weight: number }[] };
    const embed = json.distribution ?? [];
    if (!embed.length) return keyword;
    return embed.map((e) => ({ conceptId: e.conceptId, weight: e.weight, rawScore: 0 }));
  } catch {
    return keyword;
  }
}

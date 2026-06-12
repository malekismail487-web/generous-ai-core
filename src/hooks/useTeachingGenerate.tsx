/**
 * useTeachingGenerate
 * -------------------
 * Thin client wrapper around the /teaching/generate edge function.
 * Closes the adaptation ↔ output loop: after a teaching session is
 * rendered, the next recordAnswer for the same concept is correlated
 * back through `recordTeachingEvent` so the Adaptation Engine knows
 * which trajectory produced the response.
 *
 * No business logic lives here — the deterministic pipeline is the
 * canonical module in src/lib/adaptive/teachingOutputV2.ts; the edge
 * function mirrors it verbatim.
 */

import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdaptiveIntelligence } from "@/hooks/useAdaptiveIntelligence";
import { computeCognitiveState } from "@/lib/adaptive/cognitiveModel";
import type {
  TeachingTrajectoryDTO,
} from "@/lib/adaptive/teachingOutputV2";

export interface TeachingGenerateRequest {
  studentId: string;
  lectureId?: string;
  conceptId?: string;
  context?: string;
  /** Optional override; if absent the hook reads it from the local cognitive engine. */
  fatigue?: number;
}

export interface TeachingGenerateResponse extends TeachingTrajectoryDTO {
  content: string;
  missingSteps: string[];
  theta: number;
  standardError: number;
  conceptMastery: number;
  lectureMastery: number;
}

export function useTeachingGenerate() {
  const { recordTeaching } = useAdaptiveIntelligence();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSessionRef = useRef<{
    correlationId: string;
    conceptId?: string;
    lectureId?: string;
  } | null>(null);

  const generate = useCallback(async (
    req: TeachingGenerateRequest,
  ): Promise<TeachingGenerateResponse | null> => {
    setLoading(true);
    setError(null);
    try {
      // Read fatigue from the local cognitive engine (0..100 → 0..1) unless
      // the caller passed an explicit value. This is the bridge that makes
      // the deterministic teaching pipeline aware of real-time affect.
      let fatigue = req.fatigue;
      if (fatigue === undefined) {
        try {
          const cog = computeCognitiveState();
          fatigue = Math.max(0, Math.min(1, (cog.fatigueLevel ?? 0) / 100));
        } catch {
          fatigue = 0;
        }
      }
      const { data, error: invokeError } = await supabase.functions.invoke(
        "teaching-generate",
        { body: { ...req, fatigue } },
      );
      if (invokeError) {
        setError(invokeError.message || "Teaching generation failed");
        return null;
      }
      const resp = data as TeachingGenerateResponse;
      // Close the loop: log the teaching event into the adaptation engine
      recordTeaching({
        topic: req.conceptId || req.lectureId || "concept",
        subject: "",
        feature: "teaching-generate",
        content: resp?.content?.slice(0, 500) ?? "",
      });
      lastSessionRef.current = {
        correlationId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conceptId: req.conceptId,
        lectureId: req.lectureId,
      };
      return resp;
    } catch (e: any) {
      setError(e?.message || "Unknown error");
      return null;
    } finally {
      setLoading(false);
    }
  }, [recordTeaching]);

  return { generate, loading, error, lastSession: lastSessionRef.current };
}

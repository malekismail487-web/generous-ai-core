/**
 * coldStartBootstrap.ts — Phase 5
 *
 * Gives the adaptive engine a *meaningful first answer* before the student
 * has produced behavioral signals. We map two pre-existing onboarding
 * artifacts into an initial profile shape:
 *
 *   1. `iq_test_results` — 7 subscales + estimated_iq + learning_pace
 *   2. `profiles.grade_level` — coarse curriculum floor / ceiling
 *
 * Output is a *seed* (not a full profile). It is only consumed by
 * `buildIntelligenceProfile` when historical signals are thin
 * (no answers AND <20 behavioral data points). Once real data arrives,
 * the live engines win — the seed is just there so the very first
 * lecture/chat/quiz a student ever sees is already tuned.
 *
 * Design rules:
 *   - Fail-open: any DB error returns `null`, never throws.
 *   - Stays inside the existing ContentModality vocabulary so the rest
 *     of the engine can consume the scores unchanged.
 *   - Confidence floor of 35 — above the `<30 = unknown` cutoff in
 *     `getStyleInstruction`, so directives actually fire — but well below
 *     anything earned by real behavioral data so it's quickly overwritten.
 */

import { supabase } from '@/integrations/supabase/client';
import type { ContentModality } from '@/hooks/useActivityTracker';

export interface ColdStartSeed {
  /** Source of the seed — useful for diagnostics and the dev panel. */
  source: 'iq+grade' | 'iq' | 'grade' | 'none';
  /** Best-guess initial difficulty before any answers exist. */
  seedLevel: 'beginner' | 'intermediate' | 'advanced';
  /** Style scores normalized to sum=100 over the 5 ContentModality keys. */
  seedStyleScores: Record<ContentModality, number>;
  /** Dominant + secondary derived from `seedStyleScores`. */
  seedDominantStyle: ContentModality | 'balanced';
  seedSecondaryStyle: ContentModality | null;
  /** Always 35 — see header. */
  seedConfidence: number;
  /** Free-form notes for the dev panel. */
  notes: string[];
  /** Raw inputs (for diagnostics / future replay). */
  iq: {
    estimated_iq: number | null;
    learning_pace: string | null;
    completed_at: string;
  } | null;
  gradeLevel: string | null;
}

const SEED_CONFIDENCE = 35;
const ALL_STYLES: ContentModality[] = ['visual', 'logical', 'verbal', 'kinesthetic', 'conceptual'];

function normalizeStyleScores(raw: Record<ContentModality, number>): Record<ContentModality, number> {
  const total = ALL_STYLES.reduce((s, k) => s + Math.max(0, raw[k] || 0), 0);
  if (total <= 0) {
    return { visual: 20, logical: 20, verbal: 20, kinesthetic: 20, conceptual: 20 };
  }
  const out: Record<ContentModality, number> = { visual: 0, logical: 0, verbal: 0, kinesthetic: 0, conceptual: 0 };
  for (const k of ALL_STYLES) out[k] = Math.round((Math.max(0, raw[k] || 0) / total) * 100);
  // Fix rounding drift to exactly 100
  const drift = 100 - ALL_STYLES.reduce((s, k) => s + out[k], 0);
  if (drift !== 0) {
    const k = ALL_STYLES.reduce((best, cur) => (out[cur] > out[best] ? cur : best), 'visual' as ContentModality);
    out[k] = Math.max(0, out[k] + drift);
  }
  return out;
}

function pickDominantSecondary(scores: Record<ContentModality, number>): {
  dominant: ContentModality | 'balanced';
  secondary: ContentModality | null;
} {
  const sorted = [...ALL_STYLES].sort((a, b) => scores[b] - scores[a]);
  const [top, second] = sorted;
  // If spread is too tight, treat as balanced.
  if (scores[top] - scores[second] < 5) {
    return { dominant: 'balanced', secondary: null };
  }
  return { dominant: top, secondary: scores[second] >= 15 ? second : null };
}

/**
 * Maps IQ subscale scores → style scores using a transparent rubric:
 *   visual      = spatial_reasoning + pattern_recognition
 *   logical     = logical_reasoning + mathematical_ability
 *   verbal      = verbal_reasoning
 *   kinesthetic = processing_speed       (fast-doer proxy)
 *   conceptual  = abstract_thinking
 *
 * Missing subscales contribute 0 — `normalizeStyleScores` handles the
 * all-null edge case by returning an even split.
 */
function mapIQToStyleScores(iq: {
  processing_speed_score: number | null;
  logical_reasoning_score: number | null;
  pattern_recognition_score: number | null;
  spatial_reasoning_score: number | null;
  verbal_reasoning_score: number | null;
  mathematical_ability_score: number | null;
  abstract_thinking_score: number | null;
}): Record<ContentModality, number> {
  const raw: Record<ContentModality, number> = {
    visual: (iq.spatial_reasoning_score ?? 0) + (iq.pattern_recognition_score ?? 0),
    logical: (iq.logical_reasoning_score ?? 0) + (iq.mathematical_ability_score ?? 0),
    verbal: iq.verbal_reasoning_score ?? 0,
    kinesthetic: iq.processing_speed_score ?? 0,
    conceptual: iq.abstract_thinking_score ?? 0,
  };
  return normalizeStyleScores(raw);
}

function mapIQToLevel(estimated_iq: number | null, learning_pace: string | null): 'beginner' | 'intermediate' | 'advanced' {
  if (learning_pace === 'fast' || (estimated_iq != null && estimated_iq >= 115)) return 'advanced';
  if (learning_pace === 'slow' || (estimated_iq != null && estimated_iq <= 85)) return 'beginner';
  return 'intermediate';
}

/**
 * Fetches the seed for a user. Returns null if neither IQ nor grade data
 * is available (the engine will fall back to its existing defaults).
 */
export async function fetchColdStartSeed(userId: string): Promise<ColdStartSeed | null> {
  if (!userId) return null;

  // Two cheap reads in parallel; both are user-scoped via RLS.
  // Casts avoid the deeply-nested generic explosion of the supabase
  // query builder under `Promise.all` — we own the column list above.
  const iqQuery = (supabase as any)
    .from('iq_test_results')
    .select('processing_speed_score, logical_reasoning_score, pattern_recognition_score, spatial_reasoning_score, verbal_reasoning_score, mathematical_ability_score, abstract_thinking_score, estimated_iq, learning_pace, completed_at')
    .eq('user_id', userId)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const profileQuery = (supabase as any)
    .from('profiles')
    .select('grade_level')
    .eq('user_id', userId)
    .maybeSingle();
  const [iqRes, profileRes] = await Promise.all([iqQuery, profileQuery]);

  const iq = iqRes.data ?? null;
  const gradeLevel = (profileRes.data?.grade_level as string | null) ?? null;

  if (!iq && !gradeLevel) return null;

  const notes: string[] = [];
  let seedStyleScores: Record<ContentModality, number>;
  let seedLevel: 'beginner' | 'intermediate' | 'advanced';

  if (iq) {
    seedStyleScores = mapIQToStyleScores(iq);
    seedLevel = mapIQToLevel(iq.estimated_iq, iq.learning_pace);
    notes.push(`IQ seed: pace=${iq.learning_pace ?? '—'}, est=${iq.estimated_iq ?? '—'}`);
  } else {
    seedStyleScores = normalizeStyleScores({ visual: 0, logical: 0, verbal: 0, kinesthetic: 0, conceptual: 0 });
    seedLevel = 'intermediate';
  }

  // Grade-level guardrails. Very young / very senior grades nudge the
  // baseline without overriding a confident IQ-derived level.
  if (gradeLevel) {
    const n = parseInt(String(gradeLevel).replace(/[^\d]/g, ''), 10);
    if (!Number.isNaN(n)) {
      if (n <= 3 && seedLevel === 'advanced') seedLevel = 'intermediate';
      if (n <= 1) seedLevel = 'beginner';
      if (n >= 11 && seedLevel === 'beginner' && !iq) seedLevel = 'intermediate';
      notes.push(`grade=${gradeLevel}`);
    }
  }

  const { dominant, secondary } = pickDominantSecondary(seedStyleScores);

  return {
    source: iq && gradeLevel ? 'iq+grade' : iq ? 'iq' : 'grade',
    seedLevel,
    seedStyleScores,
    seedDominantStyle: dominant,
    seedSecondaryStyle: secondary,
    seedConfidence: SEED_CONFIDENCE,
    notes,
    iq: iq
      ? {
          estimated_iq: iq.estimated_iq,
          learning_pace: iq.learning_pace,
          completed_at: iq.completed_at,
        }
      : null,
    gradeLevel,
  };
}

/**
 * Decide whether the seed should actually be applied. We only override
 * when the engine genuinely has nothing to say yet — once real signals
 * accumulate, the live engines win.
 */
export function shouldApplyColdStart(opts: {
  answerCount: number;
  behaviorDataPoints: number;
  hadExplicitLevelOverride: boolean;
}): boolean {
  if (opts.hadExplicitLevelOverride) return false;
  return opts.answerCount < 5 && opts.behaviorDataPoints < 20;
}

/**
 * Lumina AI effort tiers.
 *
 * Every AI surface in Lumina runs at one of four levels of deliberation.
 * The tier decides how much the model reasons before it answers, and whether
 * the student sees that reasoning happen.
 */

export type AiEffort = 'low' | 'medium' | 'high' | 'extreme';

export const AI_EFFORT_DEFAULT: AiEffort = 'medium';

export interface AiEffortSpec {
  id: AiEffort;
  label: string;
  labelAr: string;
  blurb: string;
  blurbAr: string;
  /** What the AI Gateway receives as `reasoning_effort`. */
  reasoningEffort: 'none' | 'low' | 'medium' | 'high';
  /** Whether Lumina streams and renders its thinking for this tier. */
  showsThinking: boolean;
  /** Rough visual weight, used by the selector's meter. */
  bars: number;
}

export const AI_EFFORT_TIERS: Record<AiEffort, AiEffortSpec> = {
  low: {
    id: 'low',
    label: 'Quick',
    labelAr: 'سريع',
    blurb: 'Fastest answers. No deliberation.',
    blurbAr: 'أسرع الإجابات، بدون تفكير مطول.',
    reasoningEffort: 'none',
    showsThinking: false,
    bars: 1,
  },
  medium: {
    id: 'medium',
    label: 'Balanced',
    labelAr: 'متوازن',
    blurb: 'Best for everyday study. Recommended.',
    blurbAr: 'الأفضل للاستخدام اليومي. موصى به.',
    reasoningEffort: 'low',
    showsThinking: false,
    bars: 2,
  },
  high: {
    id: 'high',
    label: 'Thinking',
    labelAr: 'تفكير',
    blurb: 'Reasons through every answer, and shows its work.',
    blurbAr: 'يفكر في كل إجابة ويعرض خطوات تفكيره.',
    reasoningEffort: 'medium',
    showsThinking: true,
    bars: 3,
  },
  extreme: {
    id: 'extreme',
    label: 'Maximum',
    labelAr: 'أقصى',
    blurb: 'Full model power. Slowest, deepest, most thorough.',
    blurbAr: 'أقصى قوة للنموذج. الأبطأ والأعمق.',
    reasoningEffort: 'high',
    showsThinking: true,
    bars: 4,
  },
};

export const AI_EFFORT_ORDER: AiEffort[] = ['low', 'medium', 'high', 'extreme'];

export function isAiEffort(value: unknown): value is AiEffort {
  return typeof value === 'string' && AI_EFFORT_ORDER.includes(value as AiEffort);
}

export function effortSpec(effort: AiEffort | undefined): AiEffortSpec {
  return AI_EFFORT_TIERS[effort && isAiEffort(effort) ? effort : AI_EFFORT_DEFAULT];
}

/** Storage keys: one global default, one optional override per AI surface. */
export const AI_EFFORT_GLOBAL_KEY = 'lumina-ai-effort';
export const aiEffortSurfaceKey = (surface: string) => `lumina-ai-effort:${surface}`;

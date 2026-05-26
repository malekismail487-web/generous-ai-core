/**
 * Adaptive layout: classify each paragraph's pedagogical intent and pick the renderer layout.
 * We map LayoutMode -> existing SlideLayout strings so the current renderers work unchanged,
 * but the choice is now content-driven instead of a fixed sequence.
 */
import type { Paragraph } from '../types';
import type { LayoutIntent, LayoutMode, PersistedObject3D } from './types';

const PROCESS_HINTS = /\b(step|stage|phase|process|cycle|first|then|finally|next)\b/i;
const COMPARE_HINTS = /\b(versus|vs\.?|compared|whereas|on the other hand|contrast)\b/i;
const STAT_HINTS    = /\b(\d{2,}%|\d{4,}|approximately|over \d+|less than \d+)\b/i;

export function classifyIntent(p: Paragraph): LayoutMode {
  const text = `${p.heading} ${p.body}`;
  if (p.diagram_spec) return 'Diagram';
  if (STAT_HINTS.test(text)) return 'Concept';
  if (PROCESS_HINTS.test(text)) return 'Process';
  if (COMPARE_HINTS.test(text)) return 'Split';
  if ((p.bullet_points?.length || 0) >= 4) return 'Recap';
  return 'Immersive';
}

function modeToRenderer(mode: LayoutMode, idx: number): LayoutIntent['rendererLayout'] {
  switch (mode) {
    case 'Process':   return 'quadrant';
    case 'Split':     return idx % 2 === 0 ? 'half_bleed_left' : 'half_bleed_right';
    case 'Concept':   return 'iso_cube';
    case 'Recap':     return 'quadrant';
    case 'Diagram':   return 'ring_portrait';
    case 'Minimal':   return 'stat_callout';
    case 'Immersive':
    default:          return idx % 3 === 0 ? 'iso_cube' : idx % 2 === 0 ? 'half_bleed_right' : 'ring_portrait';
  }
}

export function generateAdaptiveLayout(
  paragraph: Paragraph,
  idx: number,
  slideObjects: PersistedObject3D[],
): LayoutIntent {
  // Prefer what the model already chose if present and valid.
  const preset = paragraph.slide_layout;
  const allowed: LayoutIntent['rendererLayout'][] = ['ring_portrait','quadrant','half_bleed_left','half_bleed_right','stat_callout','iso_cube'];
  if (preset && (allowed as string[]).includes(preset)) {
    return {
      mode: classifyIntent(paragraph),
      rendererLayout: preset as LayoutIntent['rendererLayout'],
      focusObjectId: slideObjects.find((o) => o.role === 'figure' || o.role === 'hero')?.id,
    };
  }
  const mode = classifyIntent(paragraph);
  return {
    mode,
    rendererLayout: modeToRenderer(mode, idx),
    focusObjectId: slideObjects.find((o) => o.role === 'figure' || o.role === 'hero')?.id,
  };
}

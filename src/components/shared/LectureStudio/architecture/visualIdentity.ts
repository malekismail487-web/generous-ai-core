/**
 * Visual identity evolves from the lecture content — palette, texture, accents.
 * Derived from the Outline that lecture-outline already returns; we don't override
 * the AI's palette, we *enrich* it into a full StyleTokens set the exporter can use.
 */
import type { Outline } from '../types';
import type { StyleTokens } from './types';

function pickTexture(aesthetic: Outline['aesthetic']): StyleTokens['bgTexture'] {
  switch (aesthetic) {
    case 'technical_blueprint': return 'blueprint';
    case 'scientific_grid':     return 'grid';
    case 'classical_textbook':
    case 'humanist_warm':       return 'parchment';
    case 'cinematic_editorial':
    case 'vibrant_creative':    return 'gradient';
    case 'editorial_magazine':  return 'flat';
    default:                    return 'flat';
  }
}

function pickMotif(aesthetic: Outline['aesthetic'], heroLabel?: string): string {
  if (heroLabel) return heroLabel.toLowerCase().replace(/\s+/g, '_');
  switch (aesthetic) {
    case 'technical_blueprint': return 'orbital_ring';
    case 'classical_textbook':  return 'marble_arch';
    case 'scientific_grid':     return 'lattice_grid';
    default:                    return 'soft_ring';
  }
}

export function evolveVisualIdentity(outline: Outline): StyleTokens {
  return {
    palette: outline.palette,
    bgTexture: pickTexture(outline.aesthetic),
    accentZone: 'frame',
    sceneFog: outline.aesthetic === 'cinematic_editorial' ? 0.55 : 0.1,
    signatureMotif: pickMotif(outline.aesthetic, outline.hero_subject_label),
  };
}

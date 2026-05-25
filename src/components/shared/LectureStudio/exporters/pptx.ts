import type { Outline, ImageState, Palette, SlideTransition, Paragraph, HeroMotion } from '../types';
import { AESTHETIC_THEMES, DEFAULT_PALETTE } from '../types';
import { renderDiagramSVG, svgToPngDataUrl } from '../diagram';
import { patchPptxForMorph, downloadBlob } from './pptxMorphPatch';

// ---------- helpers ----------
function strip(text: string): string {
  return (text || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`{1,3}(.*?)`{1,3}/gs, '$1')
    .replace(/\$\$(.*?)\$\$/gs, '$1')
    .replace(/\$(.*?)\$/g, '$1')
    .trim();
}
const noHash = (h: string) => (h || '').replace('#', '').toUpperCase().padEnd(6, '0').slice(0, 6);
async function urlToBase64(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    const blob = await r.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onloadend = () => resolve(fr.result as string);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch { return null; }
}
const W = 13.333;
const H = 7.5;
interface ThemeCtx {
  headingFace: string;
  bodyFace: string;
  bg: string;
  fg: string;
  primary: string;
  secondary: string;
  accent: string;
  surface: string;
  transition: SlideTransition;
  isDark: boolean;
}
function buildTheme(outline: Outline): ThemeCtx {
  // Phase 2: ONLY use provided outline.aesthetic and outline.palette (from aesthetic generator)
  const palette: Palette = outline.palette || DEFAULT_PALETTE;
  const aTheme = AESTHETIC_THEMES[outline.aesthetic] || AESTHETIC_THEMES.cinematic_editorial;
  const bg = noHash(aTheme.bgHex);
  const isDark = parseInt(bg, 16) < 0x808080;
  const fg = noHash(aTheme.fgHex);
  return {
    headingFace: aTheme.fontFace,
    bodyFace: aTheme.bodyFontFace,
    bg, fg,
    primary: noHash(palette.primary),
    secondary: noHash(palette.secondary),
    accent: noHash(palette.accent),
    surface: noHash(palette.surface),
    transition: outline.transition || 'morph',
    isDark
  };
}
function applyTransition(slide: any, theme: ThemeCtx) {
  if (theme.transition === 'morph') return;
  try { slide.transition = { type: theme.transition }; } catch { /* ignore */ }
}
function paintMaster(slide: any, theme: ThemeCtx, opts: { footer?: string; page?: string } = {}) {
  slide.background = { color: theme.bg };
  slide.addShape('rect' as any, {
    x: 0.35, y: 0.35, w: W - 0.7, h: H - 0.7,
    line: { color: theme.fg, width: 0.5, transparency: 70 }, fill: { type: 'none' } as any,
  });
  if (opts.footer) {
    slide.addText(opts.footer, {
      x: 0.5, y: H - 0.4, w: 6, h: 0.3, fontSize: 9, color: theme.fg, fontFace: theme.bodyFace,
      transparency: 50,
    });
  }
  if (opts.page) {
    slide.addText(opts.page, {
      x: W - 2, y: H - 0.4, w: 1.5, h: 0.3, fontSize: 9, color: theme.fg, fontFace: theme.bodyFace,
      align: 'right', transparency: 50,
    });
  }
}
// ...
// (NOTE: See commit for full context—continued below with slide renderers and hero wiring to finish the actual refactor)

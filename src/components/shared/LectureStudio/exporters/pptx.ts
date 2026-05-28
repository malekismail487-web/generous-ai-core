import type { Outline, ImageState, Palette, SlideTransition, Paragraph, HeroMotion } from '../types';
import { AESTHETIC_THEMES, DEFAULT_PALETTE } from '../types';
import { renderDiagramSVG, svgToPngDataUrl } from '../diagram';
import { patchPptxForMorph, downloadBlob } from './pptxMorphPatch';
import { buildSlideGraph } from '../architecture/slideGraph';

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

/**
 * Flatten any transparent / checkered AI image onto an opaque background
 * so PowerPoint never renders the editor checkerboard. Returns a clean PNG
 * data URL. Falls back to the original input on any failure.
 */
async function flattenOnBackground(dataUrl: string | null, bgHex: string): Promise<string | null> {
  if (!dataUrl) return null;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('img load'));
      el.src = dataUrl;
    });
    const w = img.naturalWidth || 1024;
    const h = img.naturalHeight || 1024;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    const bg = (bgHex || 'FFFFFF').replace('#', '').padEnd(6, '0').slice(0, 6);
    // Paint solid background first, then composite the image on top.
    ctx.fillStyle = `#${bg}`;
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    // Some image models bake a grey checkerboard into the PNG instead of true alpha.
    // Replace edge-connected low-chroma checker pixels so PowerPoint never shows it.
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    const br = parseInt(bg.slice(0, 2), 16), bgc = parseInt(bg.slice(2, 4), 16), bb = parseInt(bg.slice(4, 6), 16);
    const seen = new Uint8Array(w * h);
    const stack: number[] = [];
    const isChecker = (idx: number) => {
      const o = idx * 4, r = px[o], g = px[o + 1], b = px[o + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      return max - min < 18 && max > 145;
    };
    for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
    for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
    while (stack.length) {
      const idx = stack.pop()!;
      if (idx < 0 || idx >= w * h || seen[idx] || !isChecker(idx)) continue;
      seen[idx] = 1;
      const o = idx * 4; px[o] = br; px[o + 1] = bgc; px[o + 2] = bb; px[o + 3] = 255;
      const x = idx % w;
      if (x > 0) stack.push(idx - 1);
      if (x < w - 1) stack.push(idx + 1);
      stack.push(idx - w, idx + w);
    }
    ctx.putImageData(data, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch {
    return dataUrl;
  }
}

const W = 13.333;
const H = 7.5;
const MAX_BODY_CHARS_PER_SLIDE = 720;

interface ThemeCtx {
  headingFace: string;
  bodyFace: string;
  bg: string;        // no-hash
  fg: string;        // no-hash
  primary: string;
  secondary: string;
  accent: string;
  surface: string;
  transition: SlideTransition;
  isDark: boolean;
}

function pickReadableFg(bgHex: string, candidates: string[]): string {
  const lum = (hex: string) => {
    const n = parseInt(hex, 16);
    const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  };
  const bgL = lum(bgHex);
  let best = candidates[0]; let bestDelta = -1;
  for (const c of candidates) {
    const d = Math.abs(lum(c) - bgL);
    if (d > bestDelta) { bestDelta = d; best = c; }
  }
  if (bestDelta < 0.35) best = bgL < 0.5 ? 'F5F1E8' : '0A0A0A';
  return best;
}

function buildTheme(outline: Outline): ThemeCtx {
  const palette: Palette = outline.palette || DEFAULT_PALETTE;
  const aTheme = AESTHETIC_THEMES[outline.aesthetic] || AESTHETIC_THEMES.cinematic_editorial;
  // PRIORITIZE the AI-generated palette: surface = background, primary = ink/foreground.
  // Fall back to the aesthetic preset only when palette is missing.
  const bg = noHash(palette.surface || aTheme.bgHex);
  const fg = pickReadableFg(bg, [
    noHash(palette.primary),
    noHash(palette.secondary),
    aTheme.fgHex,
  ]);
  const isDark = parseInt(bg, 16) < 0x808080;
  return {
    headingFace: aTheme.fontFace,
    bodyFace: aTheme.bodyFontFace,
    bg, fg,
    primary: noHash(palette.primary),
    secondary: noHash(palette.secondary),
    accent: noHash(palette.accent),
    surface: noHash(palette.surface),
    transition: outline.transition || 'morph',
    isDark,
  };
}

function applyTransition(slide: any, theme: ThemeCtx) {
  // Morph is injected post-write via pptxMorphPatch (pptxgenjs cannot emit it).
  // For non-morph transitions, pptxgenjs DOES support them — pass through.
  if (theme.transition === 'morph') return;
  try { slide.transition = { type: theme.transition }; } catch { /* ignore */ }
}

/** Cinematic master: pure bg + accent-tinted frame + footer chip */
function paintMaster(slide: any, theme: ThemeCtx, opts: { footer?: string; page?: string } = {}) {
  slide.background = { color: theme.bg };
  // Hairline frame in the AI-chosen accent color for editorial feel
  slide.addShape('rect' as any, {
    x: 0.35, y: 0.35, w: W - 0.7, h: H - 0.7,
    line: { color: theme.accent, width: 0.75, transparency: 55 }, fill: { type: 'none' } as any,
  });
  // Thin accent bar on the left edge (topic-specific color signature)
  slide.addShape('rect' as any, {
    x: 0, y: 0, w: 0.08, h: H,
    fill: { type: 'solid', color: theme.accent }, line: { type: 'none' } as any,
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

/** Hero placement options derived from a normalized HeroMotion + a fallback motion. */
function heroRect(motion: HeroMotion | undefined, fallbackIdx: number, total: number) {
  const t = total > 1 ? fallbackIdx / (total - 1) : 0;
  const m: HeroMotion = motion || {
    x: 0.3 + 0.4 * Math.sin(t * Math.PI),
    y: 0.45 + 0.1 * Math.cos(t * Math.PI * 1.3),
    scale: 0.55 + 0.35 * Math.cos(t * Math.PI),
    rotate: Math.round(-15 + 30 * t),
    opacity: 1,
  };
  const heightIn = Math.max(2, Math.min(H * 1.4, H * m.scale));
  const widthIn = heightIn; // square framing; transparent cutout keeps proportions
  const cx = m.x * W;
  const cy = m.y * H;
  return {
    x: cx - widthIn / 2, y: cy - heightIn / 2, w: widthIn, h: heightIn,
    rotate: m.rotate || 0,
    opacity: typeof m.opacity === 'number' ? m.opacity : 1,
  };
}

function subtleHeroMotion(motion: HeroMotion | undefined, fallback: HeroMotion): HeroMotion {
  const m = motion || fallback;
  return {
    x: m.x,
    y: m.y,
    scale: Math.max(0.14, Math.min(0.24, (m.scale || fallback.scale) * 0.22)),
    rotate: m.rotate || 0,
    opacity: Math.min(0.22, typeof m.opacity === 'number' ? m.opacity : 0.18),
  };
}

function addHero(slide: any, heroData: string | null, motion: HeroMotion | undefined, fallbackIdx: number, total: number) {
  if (!heroData) return;
  const r = heroRect(motion, fallbackIdx, total);
  const opts: any = {
    data: heroData,
    x: Math.max(-2, r.x), y: Math.max(-2, r.y), w: r.w, h: r.h,
    rotate: r.rotate,
    sizing: { type: 'contain', w: r.w, h: r.h },
    // Shared name is what unlocks PowerPoint Morph between slides.
    name: 'lumina_hero',
    altText: 'lumina_hero',
  };
  if (r.opacity < 1) opts.transparency = Math.round((1 - r.opacity) * 100);
  try { slide.addImage(opts); } catch (e) { console.warn('addHero failed', e); }
}

function addSlideFigure(slide: any, figureData: string | null, opts: { x: number; y: number; w: number; h: number; rotate?: number; transparency?: number }) {
  if (!figureData) return;
  try {
    slide.addImage({
      data: figureData,
      x: opts.x, y: opts.y, w: opts.w, h: opts.h,
      rotate: opts.rotate || 0,
      transparency: opts.transparency,
      sizing: { type: 'contain', w: opts.w, h: opts.h },
      name: 'lumina_slide_figure',
      altText: 'lumina_slide_figure',
    } as any);
  } catch (e) { console.warn('addSlideFigure failed', e); }
}

function addRing(slide: any, theme: ThemeCtx, cx: number, cy: number, diameter: number) {
  slide.addShape('ellipse' as any, {
    x: cx - diameter / 2, y: cy - diameter / 2, w: diameter, h: diameter,
    line: { color: theme.accent, width: 1.25, transparency: 30 }, fill: { type: 'none' } as any,
    name: 'lumina_ring',
    altText: 'lumina_ring',
  });
}

function splitBodyIntoBalancedChunks(body: string): string[] {
  const clean = strip(body).replace(/\s+/g, ' ');
  if (!clean) return [''];
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) || [clean];
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > MAX_BODY_CHARS_PER_SLIDE && current.length > 180) {
      chunks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [clean];
}

function textSizeFor(chars: number, base = 14): number {
  if (chars > 620) return Math.max(11.5, base - 2.5);
  if (chars > 480) return Math.max(12, base - 2);
  if (chars > 340) return Math.max(12.5, base - 1);
  return base;
}

function withContinuation(p: Paragraph, body: string, part: number, totalParts: number): Paragraph {
  return {
    ...p,
    body,
    heading: totalParts > 1 ? `${p.heading} (${part + 1}/${totalParts})` : p.heading,
    bullet_points: part === 0 ? (p.bullet_points || []) : [],
    diagram_spec: part === 0 ? p.diagram_spec : undefined,
  };
}

function splitTextForBoxes(text: string, count: number): string[] {
  const sentences = strip(text).match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) || [strip(text)];
  const boxes = Array.from({ length: count }, () => '');
  sentences.forEach((sentence, i) => {
    const target = i % count;
    boxes[target] = boxes[target] ? `${boxes[target]} ${sentence}` : sentence;
  });
  return boxes;
}

// ---------- layout renderers ----------

function renderCover(slide: any, theme: ThemeCtx, outline: Outline, heroData: string | null) {
  paintMaster(slide, theme);
  addHero(slide, heroData, { x: 0.72, y: 0.55, scale: 1.15, rotate: -6, opacity: 1 }, 0, 1);

  slide.addText(strip(outline.title), {
    x: 0.7, y: H / 2 - 1.2, w: W * 0.55, h: 2.4,
    fontSize: 56, bold: true, color: theme.fg, fontFace: theme.headingFace,
    valign: 'middle', align: 'left', lineSpacingMultiple: 0.95,
  });
  if (outline.theme_tagline) {
    slide.addText(strip(outline.theme_tagline), {
      x: 0.7, y: H / 2 + 1.3, w: W * 0.55, h: 0.5,
      fontSize: 16, italic: true, color: theme.fg, fontFace: theme.bodyFace, transparency: 30,
    });
  }
  slide.addText('A LUMINA LECTURE', {
    x: 0.7, y: 0.55, w: 4, h: 0.4, fontSize: 10, bold: true, color: theme.fg,
    fontFace: theme.bodyFace, charSpacing: 6, transparency: 40,
  });
  applyTransition(slide, theme);
}

function renderRingPortrait(slide: any, theme: ThemeCtx, p: Paragraph, idx: number, total: number, heroData: string | null, illustration: string | null) {
  paintMaster(slide, theme, { footer: 'LUMINA', page: `${idx + 1} / ${total}` });
  const cx = W * 0.3, cy = H * 0.55, diameter = 4.6;
  addRing(slide, theme, cx, cy, diameter);
  addHero(slide, heroData, subtleHeroMotion(p.hero_motion, { x: 0.16, y: 0.82, scale: 0.22, rotate: 0, opacity: 0.2 }), idx, total);
  addSlideFigure(slide, illustration, { x: 1.05, y: 1.25, w: 5.7, h: 5.2, rotate: -2 });

  slide.addText(`0${(idx % 9) + 1}`, {
    x: W * 0.55, y: 0.7, w: 2, h: 0.5, fontSize: 12, color: theme.fg, transparency: 50,
    fontFace: theme.bodyFace, charSpacing: 4,
  });
  slide.addText(strip(p.heading), {
    x: W * 0.55, y: 1.3, w: W * 0.4, h: 1.5,
    fontSize: 34, bold: true, color: theme.fg, fontFace: theme.headingFace, valign: 'top',
    lineSpacingMultiple: 1.0,
  });
  const body = strip(p.body);
  const text = p.bullet_points?.length
    ? `${body}\n\n${p.bullet_points.map((b) => `• ${strip(b)}`).join('\n')}`
    : body;
  slide.addText(text, {
    x: W * 0.55, y: 3.0, w: W * 0.4, h: H - 3.7, valign: 'top',
    fontSize: textSizeFor(text.length, 14), color: theme.fg, fontFace: theme.bodyFace,
    breakLine: false, fit: 'shrink', margin: 0.05, lineSpacingMultiple: 1.18,
  });
  applyTransition(slide, theme);
}

function renderQuadrant(slide: any, theme: ThemeCtx, p: Paragraph, idx: number, total: number, heroData: string | null, illustration: string | null) {
  paintMaster(slide, theme, { footer: 'LUMINA', page: `${idx + 1} / ${total}` });
  const cx = W / 2, cy = H / 2;
  addRing(slide, theme, cx, cy, 3.6);
  addHero(slide, heroData, subtleHeroMotion(p.hero_motion, { x: 0.12, y: 0.86, scale: 0.18, rotate: 4, opacity: 0.18 }), idx, total);
  addSlideFigure(slide, illustration, { x: W / 2 - 2.0, y: H / 2 - 2.0, w: 4.0, h: 4.0, rotate: 3 });

  slide.addText(strip(p.heading), {
    x: 0.7, y: 0.55, w: W - 1.4, h: 0.6,
    fontSize: 22, bold: true, color: theme.fg, fontFace: theme.headingFace, align: 'center',
  });

  const bullets = p.bullet_points?.length ? p.bullet_points.slice(0, 4) : splitTextForBoxes(p.body, 4);
  while (bullets.length < 4) bullets.push(...splitTextForBoxes(p.body, 4).slice(0, 4 - bullets.length));

  const quads: Array<{ x: number; y: number; align: 'left' | 'right' }> = [
    { x: 0.7,            y: 1.4,            align: 'left'  },
    { x: W - 4.0 - 0.3,  y: 1.4,            align: 'right' },
    { x: 0.7,            y: H - 1.8,        align: 'left'  },
    { x: W - 4.0 - 0.3,  y: H - 1.8,        align: 'right' },
  ];
  quads.forEach((q, i) => {
    slide.addText(`0${i + 1}`, {
      x: q.x, y: q.y, w: 0.5, h: 0.35, fontSize: 10, color: theme.fg, transparency: 50, align: q.align,
      fontFace: theme.bodyFace, charSpacing: 4,
    });
    slide.addText(strip(bullets[i]), {
      x: q.x, y: q.y + 0.4, w: 4.0, h: 1.2,
      fontSize: textSizeFor(strip(bullets[i]).length, 15), color: theme.fg, fontFace: theme.bodyFace, align: q.align, valign: 'top',
      lineSpacingMultiple: 1.1, fit: 'shrink', margin: 0.03,
    });
  });
  applyTransition(slide, theme);
}

function renderHalfBleed(slide: any, theme: ThemeCtx, p: Paragraph, idx: number, total: number, heroData: string | null, illustration: string | null, side: 'left' | 'right') {
  paintMaster(slide, theme, { footer: 'LUMINA', page: `${idx + 1} / ${total}` });
  const heroX = side === 'left' ? 0.28 : 0.72;
  addHero(slide, heroData, subtleHeroMotion(p.hero_motion, { x: side === 'left' ? 0.08 : 0.92, y: 0.86, scale: 0.18, rotate: side === 'left' ? 6 : -6, opacity: 0.2 }), idx, total);
  addSlideFigure(slide, illustration, { x: side === 'left' ? 0.45 : W * 0.52, y: 0.85, w: 5.6, h: 5.85, rotate: side === 'left' ? 3 : -3 });

  const textX = side === 'left' ? W * 0.5 + 0.2 : 0.7;
  slide.addText(strip(p.heading), {
    x: textX, y: 1.0, w: W * 0.45, h: 1.6,
    fontSize: 30, bold: true, color: theme.fg, fontFace: theme.headingFace, valign: 'top',
    lineSpacingMultiple: 1.0,
  });
  const text = p.bullet_points?.length
    ? `${strip(p.body)}\n\n${p.bullet_points.map((b) => `• ${strip(b)}`).join('\n')}`
    : strip(p.body);
  slide.addText(text, {
    x: textX, y: 2.8, w: W * 0.45, h: H - 3.5, valign: 'top',
    fontSize: textSizeFor(text.length, 14), color: theme.fg, fontFace: theme.bodyFace,
    fit: 'shrink', margin: 0.05, lineSpacingMultiple: 1.18,
  });
  applyTransition(slide, theme);
}

function renderStatCallout(slide: any, theme: ThemeCtx, p: Paragraph, idx: number, total: number, heroData: string | null, illustration: string | null) {
  paintMaster(slide, theme, { footer: 'LUMINA', page: `${idx + 1} / ${total}` });
  addHero(slide, heroData, subtleHeroMotion(p.hero_motion, { x: 0.92, y: 0.87, scale: 0.2, rotate: -10, opacity: 0.18 }), idx, total);
  addSlideFigure(slide, illustration, { x: W * 0.64, y: 1.25, w: 3.9, h: 4.2, rotate: -4 });

  slide.addText(strip(p.concept_keyword || p.heading).toUpperCase(), {
    x: 0.7, y: 1.0, w: W - 1.4, h: 0.5, fontSize: 12, color: theme.fg, transparency: 40,
    fontFace: theme.bodyFace, charSpacing: 6,
  });
  slide.addText(strip(p.heading), {
    x: 0.7, y: 1.7, w: W * 0.65, h: 3.0,
    fontSize: 96, bold: true, color: theme.fg, fontFace: theme.headingFace, valign: 'top',
    lineSpacingMultiple: 0.9,
  });
  const supporting = strip(p.body);
  slide.addText(strip(supporting), {
    x: 0.7, y: H - 2.2, w: W * 0.55, h: 1.6,
    fontSize: textSizeFor(strip(supporting).length, 14), color: theme.fg, fontFace: theme.bodyFace, valign: 'top', transparency: 15,
    fit: 'shrink', margin: 0.04, lineSpacingMultiple: 1.15,
  });
  applyTransition(slide, theme);
}

/** Concept slide: the AI-generated 3D figure IS the centerpiece. No fake geometry. */
function renderIsoCube(slide: any, theme: ThemeCtx, p: Paragraph, idx: number, total: number, heroData: string | null, illustration: string | null) {
  paintMaster(slide, theme, { footer: 'LUMINA · CONCEPT', page: `${idx + 1} / ${total}` });
  addHero(slide, heroData, subtleHeroMotion(p.hero_motion, { x: 0.92, y: 0.85, scale: 0.2, rotate: -8, opacity: 0.18 }), idx, total);

  slide.addText('CORE CONCEPT', {
    x: 0.7, y: 0.7, w: 4, h: 0.4, fontSize: 11, color: theme.fg, transparency: 40,
    fontFace: theme.bodyFace, charSpacing: 6,
  });
  slide.addText(strip(p.heading), {
    x: 0.7, y: 1.2, w: W * 0.42, h: 1.8,
    fontSize: 40, bold: true, color: theme.fg, fontFace: theme.headingFace, lineSpacingMultiple: 1.0,
  });
  const body = strip(p.body);
  slide.addText(body, {
    x: 0.7, y: 3.4, w: W * 0.42, h: 3.0,
    fontSize: textSizeFor(body.length, 14), color: theme.fg, fontFace: theme.bodyFace, valign: 'top', transparency: 15,
    lineSpacingMultiple: 1.18, fit: 'shrink', margin: 0.05,
  });
  if (p.concept_keyword) {
    slide.addText(strip(p.concept_keyword).toUpperCase(), {
      x: 0.7, y: H - 1.2, w: W * 0.42, h: 0.4,
      fontSize: 12, bold: true, color: theme.fg, fontFace: theme.bodyFace, charSpacing: 8, transparency: 30,
    });
  }

  // The generated topic-specific 3D figure dominates the right half — no geometric placeholder.
  addSlideFigure(slide, illustration, { x: W * 0.48, y: 0.85, w: W * 0.48, h: H - 1.7, rotate: 0 });

  // Thin ring as continuity element (morph anchor) behind the figure.
  const cx = W * 0.72, cy = H * 0.52;
  addRing(slide, theme, cx, cy, 5.0);

  applyTransition(slide, theme);
}

function renderChapter(slide: any, theme: ThemeCtx, label: string, heroData: string | null) {
  paintMaster(slide, theme);
  addHero(slide, heroData, { x: 0.85, y: 0.5, scale: 1.3, rotate: 8, opacity: 0.6 }, 0, 1);
  slide.addText(label.toUpperCase(), {
    x: 0.7, y: 0.7, w: 4, h: 0.4, fontSize: 11, color: theme.fg, transparency: 40,
    fontFace: theme.bodyFace, charSpacing: 6,
  });
  slide.addText(label, {
    x: 0.7, y: H / 2 - 1.0, w: W * 0.6, h: 2,
    fontSize: 64, bold: true, color: theme.fg, fontFace: theme.headingFace, valign: 'middle',
    lineSpacingMultiple: 0.9,
  });
  applyTransition(slide, theme);
}

function renderNarrativeSlide(slide: any, theme: ThemeCtx, label: string, title: string, body: string, heroData: string | null) {
  paintMaster(slide, theme, { footer: 'LUMINA' });
  addHero(slide, heroData, { x: 0.88, y: 0.78, scale: 0.32, rotate: 5, opacity: 0.22 }, 0, 1);
  slide.addText(label.toUpperCase(), {
    x: 0.7, y: 0.7, w: 4, h: 0.4, fontSize: 11, color: theme.fg, transparency: 40,
    fontFace: theme.bodyFace, charSpacing: 6,
  });
  slide.addText(strip(title), {
    x: 0.7, y: 1.2, w: W * 0.52, h: 1.1,
    fontSize: 34, bold: true, color: theme.fg, fontFace: theme.headingFace, lineSpacingMultiple: 1.0,
  });
  const clean = strip(body);
  slide.addText(clean, {
    x: 0.7, y: 2.55, w: W * 0.72, h: H - 3.25,
    fontSize: textSizeFor(clean.length, 15), color: theme.fg, fontFace: theme.bodyFace,
    valign: 'top', fit: 'shrink', margin: 0.05, lineSpacingMultiple: 1.18,
  });
  applyTransition(slide, theme);
}

function renderTakeaways(slide: any, theme: ThemeCtx, outline: Outline, heroData: string | null) {
  paintMaster(slide, theme);
  addHero(slide, heroData, { x: 0.85, y: 0.5, scale: 0.9, rotate: -4, opacity: 0.35 }, 0, 1);
  slide.addText('KEY TAKEAWAYS', {
    x: 0.7, y: 0.7, w: 5, h: 0.4, fontSize: 11, color: theme.fg, transparency: 40,
    fontFace: theme.bodyFace, charSpacing: 6,
  });
  slide.addText('What to remember', {
    x: 0.7, y: 1.2, w: W * 0.6, h: 1.0,
    fontSize: 40, bold: true, color: theme.fg, fontFace: theme.headingFace,
  });
  const items = (outline.key_takeaways || []).map((t) => ({
    text: strip(t),
    options: { bullet: { code: '25A0' }, color: theme.fg, fontSize: 18, fontFace: theme.bodyFace, breakLine: true },
  }));
  slide.addText(items as any, {
    x: 0.7, y: 2.6, w: W * 0.55, h: H - 3.4, valign: 'top', paraSpaceAfter: 10,
  });
  applyTransition(slide, theme);
}

// ---------- dispatcher ----------

function renderContentSlide(pptx: any, theme: ThemeCtx, p: Paragraph, idx: number, total: number, heroData: string | null, illustration: string | null) {
  const slide = pptx.addSlide();
  switch (p.slide_layout) {
    case 'quadrant':         return renderQuadrant(slide, theme, p, idx, total, heroData, illustration);
    case 'half_bleed_left':  return renderHalfBleed(slide, theme, p, idx, total, heroData, illustration, 'left');
    case 'half_bleed_right': return renderHalfBleed(slide, theme, p, idx, total, heroData, illustration, 'right');
    case 'stat_callout':     return renderStatCallout(slide, theme, p, idx, total, heroData, illustration);
    // iso_cube intentionally collapses to ring_portrait: the fake 3D cube
    // wasted space and the real GLB pipeline is disabled for now.
    case 'iso_cube':
    case 'ring_portrait':
    default:                 return renderRingPortrait(slide, theme, p, idx, total, heroData, illustration);
  }
}

// ---------- public API ----------

export async function exportLectureAsPPTX(
  outline: Outline,
  images: ImageState[],
  heroSubjectDataUrl?: string | null,
  /** Optional aligned list of GLB data URLs (one per paragraph). When present, the
   *  corresponding slide gets a real <p:graphicFrame> 3D model embedded. */
  perSlideGlbDataUrls: (string | null | undefined)[] = [],
): Promise<void> {
  const pptxgen = (await import('pptxgenjs')).default;
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = outline.title;
  pptx.author = 'Lumina';

  const theme = buildTheme(outline);

  const rawHero = heroSubjectDataUrl
    ? (heroSubjectDataUrl.startsWith('data:') ? heroSubjectDataUrl : await urlToBase64(heroSubjectDataUrl))
    : null;
  // Flatten transparent AI images onto the slide background so PowerPoint
  // never displays the checkered transparency canvas as a real background.
  const heroData = await flattenOnBackground(rawHero, theme.bg);

  const paragraphChunks = outline.paragraphs.map((p) => splitBodyIntoBalancedChunks(p.body));
  const bodySlideTotal = paragraphChunks.reduce((sum, chunks) => sum + chunks.length, 0);

  // Pre-resolve illustration data URLs and build a semantic slide graph so layout,
  // morph plan and identity are wired from the same source the exporter renders.
  const total = outline.paragraphs.length;
  const perSlideImageDataUrls: (string | null)[] = await Promise.all(
    images.map(async (s) => {
      if (!(s?.status === 'done' && s.url)) return null;
      const raw = await urlToBase64(s.url);
      return await flattenOnBackground(raw, theme.bg);
    }),
  );
  const payload = buildSlideGraph({
    outline,
    heroImageDataUrl: heroData,
    perSlideImageDataUrls,
    // GLB embedding is disabled until the three.js pipeline is production-stable.
    perSlideGlbDataUrls: perSlideImageDataUrls.map(() => null),
  });

  // ----- Cover -----
  const cover = pptx.addSlide();
  renderCover(cover, theme, outline, heroData);

  // ----- Chapter divider -----
  const chap = pptx.addSlide();
  renderChapter(chap, theme, outline.hero_subject_label || strip(outline.title).split(/[:—-]/)[0], heroData);

  splitBodyIntoBalancedChunks(outline.intro).forEach((chunk, part, arr) => {
    const intro = pptx.addSlide();
    renderNarrativeSlide(intro, theme, arr.length > 1 ? `Introduction ${part + 1}/${arr.length}` : 'Introduction', outline.title, chunk, heroData);
  });

  // ----- Body slides -----
  let contentSlideIndex = 0;
  for (let i = 0; i < total; i++) {
    const p = outline.paragraphs[i];
    const illustration = perSlideImageDataUrls[i];
    const chunks = paragraphChunks[i];
    chunks.forEach((chunk, part) => {
      const slideParagraph = withContinuation(p, chunk, part, chunks.length);
      const layout = part === 0
        ? payload.graph[i].layout.rendererLayout
        : (part % 2 === 0 ? 'half_bleed_right' : 'ring_portrait');
      const adapted: Paragraph = { ...slideParagraph, slide_layout: layout };
      renderContentSlide(pptx, theme, adapted, contentSlideIndex, bodySlideTotal, heroData, illustration);
      contentSlideIndex += 1;
    });

    if (p.diagram_spec) {
      try {
        const svg = renderDiagramSVG(p.diagram_spec, outline.palette);
        const png = await svgToPngDataUrl(svg);
        const ds = pptx.addSlide();
        paintMaster(ds, theme, { footer: 'LUMINA · DIAGRAM', page: `${i + 1} / ${total}` });
        ds.addText(`${strip(p.heading)} — diagram`, {
          x: 0.7, y: 0.7, w: W - 1.4, h: 0.7,
          fontSize: 22, bold: true, color: theme.fg, fontFace: theme.headingFace,
        });
        ds.addImage({ data: png, x: 1.5, y: 1.6, w: W - 3, h: H - 2.6 });
        ds.addText(p.diagram_spec.caption || '', {
          x: 0.7, y: H - 0.9, w: W - 1.4, h: 0.4,
          fontSize: 11, italic: true, color: theme.fg, transparency: 30,
          fontFace: theme.bodyFace, align: 'center',
        });
        applyTransition(ds, theme);
      } catch { /* skip */ }
    }
  }

  splitBodyIntoBalancedChunks(outline.conclusion).forEach((chunk, part, arr) => {
    const conclusion = pptx.addSlide();
    renderNarrativeSlide(conclusion, theme, arr.length > 1 ? `Conclusion ${part + 1}/${arr.length}` : 'Conclusion', 'Conclusion', chunk, heroData);
  });

  // ----- Takeaways -----
  if (outline.key_takeaways?.length) {
    const kt = pptx.addSlide();
    renderTakeaways(kt, theme, outline, heroData);
  }

  // ----- Teacher lesson plan -----
  if (outline.lesson_plan) {
    const lp = outline.lesson_plan;
    const lpTitle = pptx.addSlide();
    renderChapter(lpTitle, theme, 'Lesson Plan', heroData);

    const addPlanSlide = (label: string, content: string | string[]) => {
      const s = pptx.addSlide();
      paintMaster(s, theme, { footer: 'LUMINA · LESSON PLAN' });
      s.addText(label.toUpperCase(), {
        x: 0.7, y: 0.7, w: 5, h: 0.4, fontSize: 11, color: theme.fg, transparency: 40,
        fontFace: theme.bodyFace, charSpacing: 6,
      });
      s.addText(label, {
        x: 0.7, y: 1.2, w: W - 1.4, h: 0.9,
        fontSize: 32, bold: true, color: theme.fg, fontFace: theme.headingFace,
      });
      if (Array.isArray(content)) {
        s.addText(content.map((c) => ({
          text: strip(c),
          options: { bullet: { code: '25A0' }, color: theme.fg, fontSize: 16, fontFace: theme.bodyFace, breakLine: true },
        })) as any, {
          x: 0.7, y: 2.4, w: W - 1.4, h: H - 3.2, paraSpaceAfter: 8, valign: 'top',
        });
      } else {
        s.addText(strip(content), {
          x: 0.7, y: 2.4, w: W - 1.4, h: H - 3.2,
          fontSize: 16, color: theme.fg, fontFace: theme.bodyFace, valign: 'top', lineSpacingMultiple: 1.3,
        });
      }
      applyTransition(s, theme);
    };

    addPlanSlide('Objectives', lp.objectives);
    addPlanSlide('Prerequisites & materials', [...lp.prerequisites.map((p) => `Pre: ${p}`), ...lp.materials.map((m) => `Mat: ${m}`)]);
    addPlanSlide('Warm-up', lp.warmup);
    addPlanSlide('Guided practice', lp.guided_practice);
    addPlanSlide('Independent practice', lp.independent_practice);
    addPlanSlide('Closure', lp.closure);
    addPlanSlide('Differentiation', [
      `Struggling: ${lp.differentiation.struggling}`,
      `On level: ${lp.differentiation.on_level}`,
      `Advanced: ${lp.differentiation.advanced}`,
    ]);
    addPlanSlide('Assessment', lp.assessment);
    addPlanSlide('Homework', lp.homework);
    addPlanSlide('Teacher notes', lp.teacher_notes);
  }

  // Write to ArrayBuffer. GLB 3D embedding is deliberately disabled — the
  // three.js → .glb pipeline silently failed and produced broken decks with
  // dangling relationships. Once that pipeline is hardened, re-enable here.
  // Morph transitions still run on the hero image, which has a stable shared
  // shape name across every slide and is the only thing that needs to morph.
  const arrayBuf = (await pptx.write({ outputType: 'arraybuffer' } as any)) as ArrayBuffer;

  const shouldUseMorph = payload.transition === 'morph' || outline.transition === 'morph';
  const patched = shouldUseMorph
    ? await patchPptxForMorph(arrayBuf, { skipFirstSlide: true })
    : new Blob([arrayBuf], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  const fileName = `${strip(outline.title).replace(/[^a-z0-9]+/gi, '_').slice(0, 60) || 'lecture'}.pptx`;
  downloadBlob(patched, fileName);
}


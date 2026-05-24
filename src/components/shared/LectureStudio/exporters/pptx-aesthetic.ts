/**
 * PHASE 2: Aesthetic-Driven PPTX Exporter
 * 
 * Applies the generated aesthetic to every slide:
 * - Color schemes (primary, secondary, accent, surface)
 * - Typography locked to aesthetic
 * - Background treatments
 * - Hero image positioning and styling
 * - Meaningful transitions between slides
 * 
 * This file replaces the generic slide painting with aesthetic-aware rendering.
 */

import type { Outline, ImageState, Palette, SlideTransition } from '../types';
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

/**
 * Enhanced theme context that incorporates generated aesthetic + palette.
 */
interface AestheticThemeCtx {
  headingFace: string;
  bodyFace: string;
  bg: string;        // no-hash
  fg: string;        // no-hash
  primary: string;   // from palette
  secondary: string; // from palette
  accent: string;    // from palette
  surface: string;   // from palette
  transition: SlideTransition;
  isDark: boolean;
  vignette: number;
  rule: 'thin' | 'block' | 'dotted' | 'double';
}

/**
 * Build enhanced theme from outline's aesthetic + palette.
 * Merges AESTHETIC_THEMES (typography, rules, vignette) with user palette.
 */
function buildAestheticTheme(outline: Outline): AestheticThemeCtx {
  const palette: Palette = outline.palette || DEFAULT_PALETTE;
  const aTheme = AESTHETIC_THEMES[outline.aesthetic] || AESTHETIC_THEMES.cinematic_editorial;
  const bg = noHash(aTheme.bgHex);
  const isDark = parseInt(bg, 16) < 0x808080;
  const fg = noHash(aTheme.fgHex);
  
  return {
    headingFace: aTheme.fontFace,
    bodyFace: aTheme.bodyFontFace,
    bg,
    fg,
    primary: noHash(palette.primary),
    secondary: noHash(palette.secondary),
    accent: noHash(palette.accent),
    surface: noHash(palette.surface),
    transition: outline.transition || 'morph',
    isDark,
    vignette: aTheme.vignette,
    rule: aTheme.rule,
  };
}

/**
 * Paint the master background with aesthetic styling.
 * Incorporates palette colors, rules, and vignette effects.
 */
function paintAestheticMaster(slide: any, theme: AestheticThemeCtx) {
  // Base background from palette surface
  slide.background = { color: theme.surface };
  
  // Aesthetic-specific decorative frame
  const frameWidth = 0.4;
  const frameColor = theme.primary;
  
  // Top and bottom accent bars
  slide.addShape('rect' as any, {
    x: 0, y: 0, w: W, h: 0.15,
    fill: { color: frameColor },
    line: { type: 'none' },
  });
  
  slide.addShape('rect' as any, {
    x: 0, y: H - 0.15, w: W, h: 0.15,
    fill: { color: frameColor },
    line: { type: 'none' },
  });
  
  // Side accent lines (thin for minimal, thick for editorial)
  const sideThickness = theme.rule === 'block' ? 0.08 : 0.04;
  slide.addShape('rect' as any, {
    x: 0, y: 0.15, w: sideThickness, h: H - 0.3,
    fill: { color: theme.accent },
    line: { type: 'none' },
  });
  
  slide.addShape('rect' as any, {
    x: W - sideThickness, y: 0.15, w: sideThickness, h: H - 0.3,
    fill: { color: theme.accent },
    line: { type: 'none' },
  });
}

/**
 * Position hero image with aesthetic-aware framing.
 * Different aesthetics use different hero placement strategies.
 */
function positionHeroImage(
  slide: any,
  heroUrl: string,
  heroMotion: { x: number; y: number; scale: number; rotate: number; opacity?: number },
  theme: AestheticThemeCtx
) {
  if (!heroUrl) return;
  
  const heroW = 2.5 * heroMotion.scale;
  const heroH = 3.5 * heroMotion.scale;
  const heroX = heroMotion.x * W - heroW / 2;
  const heroY = heroMotion.y * H - heroH / 2;
  
  // Add hero with name for morph tracking
  slide.addImage({
    path: heroUrl,
    x: heroX,
    y: heroY,
    w: heroW,
    h: heroH,
    transparency: 100 - ((heroMotion.opacity ?? 1) * 100),
    name: 'lumina_hero',
    altText: 'lumina_hero',
    rorate: heroMotion.rotate,
  });
  
  // Optional: frame the hero with accent color
  if (theme.rule === 'block') {
    slide.addShape('rect' as any, {
      x: heroX - 0.1,
      y: heroY - 0.1,
      w: heroW + 0.2,
      h: heroH + 0.2,
      fill: { type: 'solid', color: 'FFFFFF', transparency: 100 },
      line: { color: theme.accent, width: 1.5, dashType: 'solid' },
    });
  }
}

/**
 * Render a content slide with aesthetic styling.
 * Title, body, and optional image with palette-aware colors.
 */
function paintContentSlide(
  slide: any,
  heading: string,
  bodyText: string,
  imageUrl: string | undefined,
  theme: AestheticThemeCtx,
  heroUrl: string | undefined,
  heroMotion: { x: number; y: number; scale: number; rotate: number; opacity?: number }
) {
  paintAestheticMaster(slide, theme);
  
  const contentX = 0.5;
  const contentW = W - 1.0;
  const titleY = 0.8;
  const bodyY = 1.8;
  const bodyH = 4.5;
  
  // Title with aesthetic typography
  slide.addText(strip(heading), {
    x: contentX,
    y: titleY,
    w: contentW,
    h: 0.8,
    fontSize: 32,
    bold: true,
    color: theme.primary,
    fontFace: theme.headingFace,
    align: 'left',
  });
  
  // Decorative underline (varies by aesthetic)
  const underlineY = titleY + 0.85;
  const underlineLen = Math.min(3, heading.length * 0.08);
  slide.addShape('rect' as any, {
    x: contentX,
    y: underlineY,
    w: underlineLen,
    h: theme.rule === 'double' ? 0.08 : 0.04,
    fill: { color: theme.accent },
    line: { type: 'none' },
  });
  
  // Body text
  slide.addText(strip(bodyText), {
    x: contentX,
    y: bodyY,
    w: contentW - 0.5,
    h: bodyH,
    fontSize: 14,
    color: theme.fg || theme.primary,
    fontFace: theme.bodyFace,
    align: 'left',
    valign: 'top',
    wrap: true,
  });
  
  // Slide image (if provided, right side)
  if (imageUrl) {
    const imgW = 3.5;
    const imgH = 2.5;
    const imgX = W - imgW - 0.5;
    const imgY = 2.0;
    
    slide.addImage({
      path: imageUrl,
      x: imgX,
      y: imgY,
      w: imgW,
      h: imgH,
    });
    
    // Frame the image with palette accent
    slide.addShape('rect' as any, {
      x: imgX - 0.05,
      y: imgY - 0.05,
      w: imgW + 0.1,
      h: imgH + 0.1,
      fill: { type: 'solid', color: 'FFFFFF', transparency: 100 },
      line: { color: theme.secondary, width: 1 },
    });
  }
  
  // Hero image positioning
  if (heroUrl) {
    positionHeroImage(slide, heroUrl, heroMotion, theme);
  }
}

/**
 * Render cover slide with aesthetic branding.
 */
function paintCoverSlide(
  slide: any,
  title: string,
  subtitle: string,
  theme: AestheticThemeCtx
) {
  slide.background = { color: theme.surface };
  
  // Large accent block on one side
  slide.addShape('rect' as any, {
    x: 0,
    y: 0,
    w: W * 0.3,
    h: H,
    fill: { color: theme.primary },
    line: { type: 'none' },
  });
  
  // Title
  slide.addText(strip(title), {
    x: W * 0.35,
    y: H / 2 - 1.2,
    w: W * 0.6,
    h: 1.5,
    fontSize: 44,
    bold: true,
    color: theme.primary,
    fontFace: theme.headingFace,
    align: 'left',
    valign: 'bottom',
    wrap: true,
  });
  
  // Subtitle
  slide.addText(subtitle, {
    x: W * 0.35,
    y: H / 2 + 0.3,
    w: W * 0.6,
    h: 1.0,
    fontSize: 16,
    color: theme.secondary,
    fontFace: theme.bodyFace,
    align: 'left',
    valign: 'top',
    wrap: true,
    italic: true,
  });
  
  // Accent line
  slide.addShape('rect' as any, {
    x: W * 0.35,
    y: H / 2 + 0.15,
    w: 1.5,
    h: 0.08,
    fill: { color: theme.accent },
    line: { type: 'none' },
  });
}

/**
 * Apply transition to slide based on aesthetic preference.
 */
function applyAestheticTransition(slide: any, theme: AestheticThemeCtx) {
  // Morph is injected post-write via pptxMorphPatch
  // For non-morph transitions, pptxgenjs DOES support them — pass through.
  if (theme.transition === 'morph') return;
  
  const transitionMap: Record<SlideTransition, any> = {
    morph: undefined, // handled post-write
    fade: { type: 'fade', duration: 0.5 },
    push: { type: 'push', duration: 0.75 },
    wipe: { type: 'wipe', duration: 0.75 },
    split: { type: 'wipe', duration: 0.5 },
    reveal: { type: 'push', duration: 0.75 },
    cover: { type: 'cover', duration: 0.75 },
    uncover: { type: 'uncover', duration: 0.75 },
    cut: { type: 'cut', duration: 0.2 },
  };
  
  try {
    const trans = transitionMap[theme.transition];
    if (trans) slide.transition = trans;
  } catch { /* ignore */ }
}

export async function exportLectureAsPPTX(
  outline: Outline,
  images: ImageState[],
  heroUrl: string | null,
): Promise<void> {
  const pptxgenjs = await import('pptxgenjs');
  const PptxGenJS = pptxgenjs.default;
  const prs = new PptxGenJS();
  
  prs.defineLayout({ name: 'LUMINA_16x9', width: 13.333, height: 7.5 });
  prs.layout = 'LUMINA_16x9';
  
  // Build aesthetic theme from outline
  const theme = buildAestheticTheme(outline);
  
  // ---------- Cover Slide ----------
  const coverSlide = prs.addSlide();
  paintCoverSlide(
    coverSlide,
    outline.title,
    `${outline.theme_tagline || 'A Lumina-generated lecture'}`,
    theme
  );
  applyAestheticTransition(coverSlide, theme);
  
  // ---------- Intro Slide ----------
  const introSlide = prs.addSlide();
  paintContentSlide(
    introSlide,
    'Introduction',
    outline.intro,
    undefined,
    theme,
    heroUrl || undefined,
    outline.paragraphs[0]?.hero_motion || { x: 0.8, y: 0.5, scale: 0.8, rotate: 0 }
  );
  applyAestheticTransition(introSlide, theme);
  
  // ---------- Content Slides ----------
  for (let i = 0; i < outline.paragraphs.length; i++) {
    const p = outline.paragraphs[i];
    const img = images[i];
    const imgUrl = img?.status === 'done' ? img.url : undefined;
    
    const slide = prs.addSlide();
    
    // Hero motion for this slide (or default)
    const heroMotion = p.hero_motion || {
      x: 0.5 + (i % 2) * 0.3,
      y: 0.3 + (Math.sin(i) * 0.2),
      scale: 0.6 + (i % 3) * 0.1,
      rotate: (i * 15) % 360,
    };
    
    paintContentSlide(
      slide,
      p.heading,
      p.body,
      imgUrl || undefined,
      theme,
      heroUrl || undefined,
      heroMotion
    );
    
    applyAestheticTransition(slide, theme);
  }
  
  // ---------- Conclusion Slide ----------
  const conclusionSlide = prs.addSlide();
  paintContentSlide(
    conclusionSlide,
    'Conclusion',
    outline.conclusion,
    undefined,
    theme,
    heroUrl || undefined,
    { x: 0.5, y: 0.5, scale: 1.0, rotate: 0 }
  );
  applyAestheticTransition(conclusionSlide, theme);
  
  // ---------- Key Takeaways Slide ----------
  if (outline.key_takeaways?.length > 0) {
    const takeawaysSlide = prs.addSlide();
    paintAestheticMaster(takeawaysSlide, theme);
    
    takeawaysSlide.addText('Key Takeaways', {
      x: 0.5,
      y: 0.8,
      w: W - 1.0,
      h: 0.6,
      fontSize: 32,
      bold: true,
      color: theme.primary,
      fontFace: theme.headingFace,
    });
    
    const bulletY = 1.6;
    const bulletSpacing = 0.7;
    
    outline.key_takeaways.forEach((takeaway, idx) => {
      takeawaysSlide.addText(`• ${takeaway}`, {
        x: 1.0,
        y: bulletY + idx * bulletSpacing,
        w: W - 2.0,
        h: bulletSpacing * 0.8,
        fontSize: 14,
        color: theme.fg || theme.primary,
        fontFace: theme.bodyFace,
        wrap: true,
      });
    });
    
    applyAestheticTransition(takeawaysSlide, theme);
  }
  
  // ---------- Export with Morph Patch ----------
  const buf = await prs.write({ outputType: 'arraybuffer' });
  const patchedBlob = await patchPptxForMorph(buf, { skipFirstSlide: true });
  downloadBlob(patchedBlob, `${outline.title || 'lecture'}.pptx`);
}

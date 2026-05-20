import type { Outline, ImageState, Palette, SlideTransition, Aesthetic } from '../types';
import { AESTHETIC_THEMES, DEFAULT_PALETTE } from '../types';
import { renderDiagramSVG, svgToPngDataUrl } from '../diagram';

function strip(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`{1,3}(.*?)`{1,3}/gs, '$1')
    .replace(/\$\$(.*?)\$\$/gs, '$1')
    .replace(/\$(.*?)\$/g, '$1')
    .trim();
}

const noHash = (h: string) => h.replace('#', '').toUpperCase();

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

/** Pick a per-slide layout variant index so the deck doesn't feel monotonous. */
function variantFor(i: number, aesthetic: Aesthetic): 'image_right' | 'image_left' | 'image_full' | 'image_top' {
  // editorial / vibrant aesthetics tolerate more variation; minimal stays steadier.
  const cycle = (aesthetic === 'modern_minimal' || aesthetic === 'scholarly_serif')
    ? ['image_right', 'image_left']
    : ['image_right', 'image_left', 'image_full', 'image_top'];
  return cycle[i % cycle.length] as any;
}

export async function exportLectureAsPPTX(
  outline: Outline,
  images: ImageState[],
): Promise<void> {
  const pptxgen = (await import('pptxgenjs')).default;
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 inches
  const W = 13.333, H = 7.5;

  const palette: Palette = outline.palette || DEFAULT_PALETTE;
  const theme = AESTHETIC_THEMES[outline.aesthetic] || AESTHETIC_THEMES.scholarly_serif;
  const fontFace = theme.fontFace;
  const transition: SlideTransition = outline.transition || 'fade';
  const primary = noHash(palette.primary);
  const secondary = noHash(palette.secondary);
  const accent = noHash(palette.accent);
  const surface = noHash(palette.surface);

  const applyTransition = (slide: any) => {
    // pptxgenjs supports transition on recent versions; wrap defensively.
    try { slide.transition = { type: transition }; } catch { /* ignore */ }
  };

  // ----- Cover slide -----
  const cover = pptx.addSlide();
  cover.background = { color: primary };
  cover.addShape('rect' as any, { x: 0, y: 0, w: 0.18, h: H, fill: { color: accent } });
  cover.addText(strip(outline.title), {
    x: 0.8, y: H / 2 - 1.6, w: W - 1.6, h: 2,
    fontSize: 48, bold: true, color: 'FFFFFF', fontFace,
    align: 'left', valign: 'middle',
  });
  cover.addText('A Lumina-generated lecture', {
    x: 0.8, y: H / 2 + 0.6, w: W - 1.6, h: 0.6,
    fontSize: 18, italic: true, color: surface, fontFace,
  });
  cover.addShape('rect' as any, {
    x: 0.8, y: H / 2 + 1.4, w: 1.5, h: 0.05, fill: { color: accent },
  });
  applyTransition(cover);

  // ----- Intro slide -----
  const introSlide = pptx.addSlide();
  introSlide.background = { color: surface };
  introSlide.addText('Introduction', {
    x: 0.7, y: 0.5, w: W - 1.4, h: 0.8,
    fontSize: 32, bold: true, color: primary, fontFace,
  });
  introSlide.addShape('rect' as any, { x: 0.7, y: 1.3, w: 1.2, h: 0.05, fill: { color: accent } });
  introSlide.addText(strip(outline.intro), {
    x: 0.7, y: 1.6, w: W - 1.4, h: H - 2.2,
    fontSize: 20, color: '333333', fontFace, valign: 'top',
    paraSpaceAfter: 8,
  });
  applyTransition(introSlide);

  // ----- Section slides -----
  for (let i = 0; i < outline.paragraphs.length; i++) {
    const p = outline.paragraphs[i];
    const variant = variantFor(i, outline.aesthetic);
    const slide = pptx.addSlide();
    slide.background = { color: surface };

    // Header
    slide.addShape('rect' as any, { x: 0, y: 0, w: W, h: 0.18, fill: { color: primary } });
    slide.addText(`${i + 1} · ${strip(p.heading)}`, {
      x: 0.5, y: 0.32, w: W - 1, h: 0.7,
      fontSize: 26, bold: true, color: primary, fontFace,
    });
    slide.addShape('rect' as any, { x: 0.5, y: 1.0, w: 0.8, h: 0.04, fill: { color: accent } });

    const bullets = (p.bullet_points && p.bullet_points.length
      ? p.bullet_points
      : [strip(p.body).slice(0, 140)]
    ).map((b) => ({ text: strip(b), options: { bullet: { code: '25A0' }, color: '222222', fontSize: 18, fontFace } }));

    const imgState = images[i];
    const dataUrl = (imgState?.status === 'done' && imgState.url)
      ? await urlToBase64(imgState.url) : null;

    if (variant === 'image_full' && dataUrl) {
      // image fills right 55%, bullets compact on left
      slide.addImage({ data: dataUrl, x: W * 0.45, y: 1.2, w: W * 0.5, h: H - 1.6 });
      slide.addText(bullets as any, {
        x: 0.6, y: 1.3, w: W * 0.4 - 0.5, h: H - 1.8,
        valign: 'top', paraSpaceAfter: 8,
      });
    } else if (variant === 'image_top' && dataUrl) {
      slide.addImage({ data: dataUrl, x: 0.6, y: 1.2, w: W - 1.2, h: H * 0.45 });
      slide.addText(bullets as any, {
        x: 0.6, y: H * 0.45 + 1.4, w: W - 1.2, h: H - (H * 0.45 + 1.6),
        valign: 'top', paraSpaceAfter: 6,
      });
    } else if (variant === 'image_left' && dataUrl) {
      slide.addImage({ data: dataUrl, x: 0.6, y: 1.3, w: W * 0.45, h: H - 1.8 });
      slide.addText(bullets as any, {
        x: W * 0.5, y: 1.3, w: W * 0.45, h: H - 1.8,
        valign: 'top', paraSpaceAfter: 8,
      });
    } else {
      // image_right (default) or no image -> bullets left, image right (if any)
      if (dataUrl) {
        slide.addImage({ data: dataUrl, x: W * 0.5, y: 1.3, w: W * 0.45, h: H - 1.8 });
        slide.addText(bullets as any, {
          x: 0.6, y: 1.3, w: W * 0.4, h: H - 1.8,
          valign: 'top', paraSpaceAfter: 8,
        });
      } else {
        slide.addText(bullets as any, {
          x: 0.6, y: 1.3, w: W - 1.2, h: H - 1.8,
          valign: 'top', paraSpaceAfter: 10,
        });
      }
    }

    // Footer
    slide.addText(strip(outline.title), {
      x: 0.5, y: H - 0.4, w: W / 2, h: 0.3, fontSize: 10, color: secondary, fontFace,
    });
    slide.addText(`${i + 1} / ${outline.paragraphs.length}`, {
      x: W - 1.5, y: H - 0.4, w: 1, h: 0.3, fontSize: 10, color: secondary, fontFace, align: 'right',
    });

    applyTransition(slide);

    // Diagram on its own slide
    if (p.diagram_spec) {
      try {
        const svg = renderDiagramSVG(p.diagram_spec, palette);
        const png = await svgToPngDataUrl(svg);
        const ds = pptx.addSlide();
        ds.background = { color: surface };
        ds.addText(`${strip(p.heading)} — diagram`, {
          x: 0.5, y: 0.4, w: W - 1, h: 0.7,
          fontSize: 22, bold: true, color: primary, fontFace,
        });
        ds.addImage({ data: png, x: 1, y: 1.3, w: W - 2, h: H - 2.2 });
        ds.addText(p.diagram_spec.caption || '', {
          x: 0.5, y: H - 0.7, w: W - 1, h: 0.4,
          fontSize: 12, italic: true, color: secondary, fontFace, align: 'center',
        });
        applyTransition(ds);
      } catch { /* skip */ }
    }
  }

  // ----- Key takeaways -----
  if (outline.key_takeaways?.length) {
    const kt = pptx.addSlide();
    kt.background = { color: primary };
    kt.addText('Key Takeaways', {
      x: 0.7, y: 0.6, w: W - 1.4, h: 0.8,
      fontSize: 34, bold: true, color: 'FFFFFF', fontFace,
    });
    kt.addShape('rect' as any, { x: 0.7, y: 1.5, w: 1.2, h: 0.05, fill: { color: accent } });
    kt.addText(
      outline.key_takeaways.map((t) => ({
        text: strip(t),
        options: { bullet: { code: '25A0' }, color: 'FFFFFF', fontSize: 20, fontFace },
      })) as any,
      { x: 0.9, y: 1.9, w: W - 1.8, h: H - 2.5, paraSpaceAfter: 10, valign: 'top' },
    );
    applyTransition(kt);
  }

  // ----- Teacher lesson plan -----
  if (outline.lesson_plan) {
    const lp = outline.lesson_plan;
    const planTitle = pptx.addSlide();
    planTitle.background = { color: surface };
    planTitle.addText('Lesson Plan', {
      x: 0.7, y: H / 2 - 0.6, w: W - 1.4, h: 1.2,
      fontSize: 44, bold: true, color: primary, fontFace, align: 'center',
    });
    planTitle.addShape('rect' as any, { x: W / 2 - 0.6, y: H / 2 + 0.8, w: 1.2, h: 0.05, fill: { color: accent } });
    applyTransition(planTitle);

    const addPlanSlide = (label: string, content: string | string[]) => {
      const s = pptx.addSlide();
      s.background = { color: surface };
      s.addShape('rect' as any, { x: 0, y: 0, w: W, h: 0.18, fill: { color: primary } });
      s.addText(label, {
        x: 0.6, y: 0.35, w: W - 1.2, h: 0.7,
        fontSize: 26, bold: true, color: primary, fontFace,
      });
      s.addShape('rect' as any, { x: 0.6, y: 1.0, w: 0.8, h: 0.04, fill: { color: accent } });
      if (Array.isArray(content)) {
        s.addText(
          content.map((c) => ({ text: c, options: { bullet: { code: '25A0' }, color: '222222', fontSize: 18, fontFace } })) as any,
          { x: 0.7, y: 1.3, w: W - 1.4, h: H - 1.8, paraSpaceAfter: 8, valign: 'top' },
        );
      } else {
        s.addText(content, {
          x: 0.7, y: 1.3, w: W - 1.4, h: H - 1.8,
          fontSize: 18, color: '222222', fontFace, valign: 'top', paraSpaceAfter: 6,
        });
      }
      applyTransition(s);
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

  await pptx.writeFile({ fileName: `${strip(outline.title).replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}.pptx` });
}

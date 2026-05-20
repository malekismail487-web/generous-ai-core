import type { Outline, ImageState, Palette } from '../types';
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

async function urlToUint8(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url);
    const buf = await r.arrayBuffer();
    return new Uint8Array(buf);
  } catch { return null; }
}

async function dataUrlToUint8(dataUrl: string): Promise<Uint8Array> {
  const b64 = dataUrl.split(',')[1] || '';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export async function exportLectureAsDOCX(
  outline: Outline,
  images: ImageState[],
): Promise<void> {
  const docx = await import('docx');
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
    ImageRun, PageBreak, Footer, PageNumber, BorderStyle,
  } = docx;

  const palette: Palette = outline.palette || DEFAULT_PALETTE;
  const theme = AESTHETIC_THEMES[outline.aesthetic] || AESTHETIC_THEMES.scholarly_serif;
  const fontFace = theme.fontFace;

  const children: any[] = [];

  // Cover
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 240 },
      children: [new TextRun({ text: strip(outline.title), bold: true, size: 56, font: fontFace, color: noHash(palette.primary) })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 1200 },
      children: [new TextRun({ text: 'A Lumina-generated lecture', italics: true, size: 22, font: fontFace, color: noHash(palette.secondary) })],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // Intro
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: 'Introduction', font: fontFace, color: noHash(palette.primary), bold: true, size: 32 })],
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: noHash(palette.accent), space: 1 } },
    }),
    new Paragraph({
      spacing: { after: 200, line: 320 },
      children: [new TextRun({ text: strip(outline.intro), font: fontFace, size: 22 })],
    }),
  );

  // Sections
  for (let i = 0; i < outline.paragraphs.length; i++) {
    const p = outline.paragraphs[i];
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 360, after: 120 },
        children: [new TextRun({ text: `${i + 1}. ${strip(p.heading)}`, font: fontFace, bold: true, size: 28, color: noHash(palette.primary) })],
      }),
      new Paragraph({
        spacing: { after: 200, line: 320 },
        children: [new TextRun({ text: strip(p.body), font: fontFace, size: 22 })],
      }),
    );

    const imgState = images[i];
    if (imgState?.status === 'done' && imgState.url) {
      const bytes = await urlToUint8(imgState.url);
      if (bytes) {
        try {
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [new ImageRun({ type: 'png', data: bytes as any, transformation: { width: 520, height: 320 } } as any)],
          }));
        } catch { /* skip bad image */ }
      }
    }

    if (p.diagram_spec) {
      try {
        const svg = renderDiagramSVG(p.diagram_spec, palette);
        const dataUrl = await svgToPngDataUrl(svg);
        const bytes = await dataUrlToUint8(dataUrl);
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [new ImageRun({ type: 'png', data: bytes as any, transformation: { width: 520, height: 260 } } as any)],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({ text: p.diagram_spec.caption || '', italics: true, size: 18, color: noHash(palette.secondary), font: fontFace })],
          }),
        );
      } catch { /* skip */ }
    }
  }

  // Conclusion
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 360, after: 120 },
      children: [new TextRun({ text: 'Conclusion', font: fontFace, bold: true, size: 32, color: noHash(palette.primary) })],
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: noHash(palette.accent), space: 1 } },
    }),
    new Paragraph({
      spacing: { after: 200, line: 320 },
      children: [new TextRun({ text: strip(outline.conclusion), font: fontFace, size: 22 })],
    }),
  );

  if (outline.key_takeaways?.length) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: 'Key Takeaways', font: fontFace, bold: true, size: 26, color: noHash(palette.primary) })],
    }));
    outline.key_takeaways.forEach((t) => {
      children.push(new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 60 },
        children: [new TextRun({ text: strip(t), font: fontFace, size: 22 })],
      }));
    });
  }

  // Teacher lesson plan
  if (outline.lesson_plan) {
    const lp = outline.lesson_plan;
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 200, after: 200 },
      children: [new TextRun({ text: 'Lesson Plan', font: fontFace, bold: true, size: 32, color: noHash(palette.primary) })],
    }));
    const block = (label: string, content: string | string[]) => {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 80 },
        children: [new TextRun({ text: label, font: fontFace, bold: true, size: 24, color: noHash(palette.primary) })],
      }));
      if (Array.isArray(content)) {
        content.forEach((c) => children.push(new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: c, font: fontFace, size: 22 })],
        })));
      } else {
        children.push(new Paragraph({
          spacing: { after: 120, line: 300 },
          children: [new TextRun({ text: content, font: fontFace, size: 22 })],
        }));
      }
    };
    block('Objectives', lp.objectives);
    block('Prerequisites', lp.prerequisites);
    block('Materials', lp.materials);
    block('Warm-up', lp.warmup);
    block('Guided practice', lp.guided_practice);
    block('Independent practice', lp.independent_practice);
    block('Closure', lp.closure);
    block('Differentiation — struggling', lp.differentiation.struggling);
    block('Differentiation — on level', lp.differentiation.on_level);
    block('Differentiation — advanced', lp.differentiation.advanced);
    block('Assessment', lp.assessment);
    block('Homework', lp.homework);
    block('Teacher notes', lp.teacher_notes);
  }

  const doc = new Document({
    creator: 'Lumina',
    title: strip(outline.title),
    styles: {
      default: { document: { run: { font: fontFace, size: 22 } } },
    },
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: 'Page ', size: 18, color: noHash(palette.secondary) }),
              new TextRun({ children: [PageNumber.CURRENT], size: 18, color: noHash(palette.secondary) }),
            ],
          })],
        }),
      },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${strip(outline.title).replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

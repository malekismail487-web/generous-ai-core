import jsPDF from 'jspdf';
import type { Outline, ImageState, Palette } from './types';
import { AESTHETIC_THEMES, DEFAULT_PALETTE } from './types';
import { renderDiagramSVG, svgToPngDataUrl } from './diagram';

function strip(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`{1,3}(.*?)`{1,3}/gs, '$1')
    .replace(/\$\$(.*?)\$\$/gs, '$1')
    .replace(/\$(.*?)\$/g, '$1')
    .trim();
}

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

async function urlToDataUrl(url: string): Promise<string | null> {
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

export async function exportLectureAsPDF(
  outline: Outline,
  images: ImageState[],
): Promise<void> {
  const palette: Palette = outline.palette || DEFAULT_PALETTE;
  const theme = AESTHETIC_THEMES[outline.aesthetic] || AESTHETIC_THEMES.scholarly_serif;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 22;
  const maxW = pageW - margin * 2;
  const titleFont = theme.titleStyle === 'serif' || theme.titleStyle === 'display' ? 'times' : 'helvetica';
  const bodyFont = 'helvetica';
  const [pr, pg, pb] = hexToRgb(palette.primary);
  const [ar, ag, ab] = hexToRgb(palette.accent);
  const [sr, sg, sb] = hexToRgb(palette.secondary);

  // ---------------- Cover page ----------------
  pdf.setFillColor(...hexToRgb(palette.surface));
  pdf.rect(0, 0, pageW, pageH, 'F');
  pdf.setFillColor(pr, pg, pb);
  pdf.rect(0, 0, pageW, 6, 'F');
  pdf.rect(0, pageH - 6, pageW, 6, 'F');

  pdf.setTextColor(pr, pg, pb);
  pdf.setFont(titleFont, 'bold');
  pdf.setFontSize(32);
  const titleLines = pdf.splitTextToSize(outline.title, maxW);
  pdf.text(titleLines, pageW / 2, pageH / 2 - 20, { align: 'center' });

  pdf.setFont(bodyFont, 'normal');
  pdf.setFontSize(12);
  pdf.setTextColor(sr, sg, sb);
  pdf.text('A Lumina-generated lecture', pageW / 2, pageH / 2 + 4, { align: 'center' });

  pdf.setDrawColor(ar, ag, ab);
  pdf.setLineWidth(0.8);
  pdf.line(pageW / 2 - 18, pageH / 2 + 12, pageW / 2 + 18, pageH / 2 + 12);

  // ---------------- Table of contents ----------------
  pdf.addPage();
  let y = margin;
  pdf.setTextColor(pr, pg, pb);
  pdf.setFont(titleFont, 'bold');
  pdf.setFontSize(20);
  pdf.text('Contents', margin, y);
  y += 12;
  pdf.setFont(bodyFont, 'normal');
  pdf.setFontSize(12);
  pdf.setTextColor(40, 40, 40);
  outline.paragraphs.forEach((p, i) => {
    const line = `${i + 1}. ${strip(p.heading)}`;
    const wrapped = pdf.splitTextToSize(line, maxW);
    if (y + wrapped.length * 6 > pageH - margin) { pdf.addPage(); y = margin; }
    pdf.text(wrapped, margin, y);
    y += wrapped.length * 6 + 1;
  });

  // ---------------- Intro ----------------
  pdf.addPage();
  y = margin;
  await writeHeading(pdf, 'Introduction', titleFont, palette, margin, y); y += 12;
  y = await writeParagraph(pdf, strip(outline.intro), bodyFont, margin, y, maxW, pageH);

  // ---------------- Sections ----------------
  for (let i = 0; i < outline.paragraphs.length; i++) {
    const p = outline.paragraphs[i];
    pdf.addPage(); y = margin;
    await writeHeading(pdf, `${i + 1}. ${strip(p.heading)}`, titleFont, palette, margin, y);
    y += 12;
    y = await writeParagraph(pdf, strip(p.body), bodyFont, margin, y, maxW, pageH);

    // Image
    const imgState = images[i];
    if (imgState?.status === 'done' && imgState.url) {
      const dataUrl = await urlToDataUrl(imgState.url);
      if (dataUrl) {
        try {
          const props = pdf.getImageProperties(dataUrl);
          const ratio = props.height / props.width;
          const imgW = maxW;
          const imgH = imgW * ratio;
          if (y + imgH + 10 > pageH - margin) { pdf.addPage(); y = margin; }
          pdf.addImage(dataUrl, 'JPEG', margin, y, imgW, Math.min(imgH, pageH - margin - y - 8));
          y += Math.min(imgH, pageH - margin - y - 8) + 5;
        } catch { /* skip */ }
      }
    }

    // Diagram
    if (p.diagram_spec) {
      try {
        const svg = renderDiagramSVG(p.diagram_spec, palette);
        const dataUrl = await svgToPngDataUrl(svg);
        const imgW = maxW * 0.85;
        const imgH = imgW * (360 / 720);
        if (y + imgH + 10 > pageH - margin) { pdf.addPage(); y = margin; }
        pdf.addImage(dataUrl, 'PNG', margin + (maxW - imgW) / 2, y, imgW, imgH);
        y += imgH + 4;
        pdf.setFont(bodyFont, 'italic'); pdf.setFontSize(9); pdf.setTextColor(sr, sg, sb);
        pdf.text(p.diagram_spec.caption || '', pageW / 2, y, { align: 'center' });
        pdf.setFont(bodyFont, 'normal'); pdf.setFontSize(11); pdf.setTextColor(40, 40, 40);
        y += 6;
      } catch { /* skip */ }
    }
  }

  // ---------------- Conclusion ----------------
  pdf.addPage(); y = margin;
  await writeHeading(pdf, 'Conclusion', titleFont, palette, margin, y); y += 12;
  y = await writeParagraph(pdf, strip(outline.conclusion), bodyFont, margin, y, maxW, pageH);

  // ---------------- Key takeaways ----------------
  if (outline.key_takeaways?.length) {
    if (y + 60 > pageH - margin) { pdf.addPage(); y = margin; }
    y += 6;
    pdf.setFillColor(...hexToRgb(palette.surface));
    pdf.setDrawColor(ar, ag, ab);
    const boxTop = y;
    pdf.roundedRect(margin, boxTop, maxW, 10 + outline.key_takeaways.length * 7, 3, 3, 'FD');
    pdf.setFont(titleFont, 'bold'); pdf.setFontSize(13); pdf.setTextColor(pr, pg, pb);
    pdf.text('Key Takeaways', margin + 4, boxTop + 7);
    pdf.setFont(bodyFont, 'normal'); pdf.setFontSize(11); pdf.setTextColor(40, 40, 40);
    outline.key_takeaways.forEach((t, i) => {
      const lines = pdf.splitTextToSize(`• ${strip(t)}`, maxW - 10);
      pdf.text(lines, margin + 5, boxTop + 14 + i * 7);
    });
  }

  // ---------------- Teacher lesson plan ----------------
  if (outline.lesson_plan) {
    pdf.addPage(); y = margin;
    await writeHeading(pdf, 'Lesson Plan', titleFont, palette, margin, y); y += 12;
    const lp = outline.lesson_plan;
    const block = (label: string, content: string | string[]) => {
      const text = Array.isArray(content) ? content.map((x) => `• ${x}`).join('\n') : content;
      pdf.setFont(titleFont, 'bold'); pdf.setFontSize(12); pdf.setTextColor(pr, pg, pb);
      if (y + 14 > pageH - margin) { pdf.addPage(); y = margin; }
      pdf.text(label, margin, y); y += 6;
      pdf.setFont(bodyFont, 'normal'); pdf.setFontSize(11); pdf.setTextColor(40, 40, 40);
      const lines = pdf.splitTextToSize(text, maxW);
      lines.forEach((l: string) => {
        if (y + 6 > pageH - margin) { pdf.addPage(); y = margin; }
        pdf.text(l, margin, y); y += 5.5;
      });
      y += 3;
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

  // Page numbers
  const pageCount = (pdf as any).getNumberOfPages();
  for (let i = 2; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFont(bodyFont, 'normal'); pdf.setFontSize(9); pdf.setTextColor(sr, sg, sb);
    pdf.text(`${i - 1}`, pageW - margin, pageH - 8, { align: 'right' });
    pdf.text(strip(outline.title).slice(0, 70), margin, pageH - 8);
  }

  pdf.save(`${strip(outline.title).replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}.pdf`);
}

async function writeHeading(
  pdf: jsPDF, text: string, font: string, palette: Palette, x: number, y: number,
) {
  const [pr, pg, pb] = hexToRgb(palette.primary);
  const [ar, ag, ab] = hexToRgb(palette.accent);
  pdf.setFont(font, 'bold'); pdf.setFontSize(18); pdf.setTextColor(pr, pg, pb);
  pdf.text(text, x, y);
  pdf.setDrawColor(ar, ag, ab); pdf.setLineWidth(0.5);
  pdf.line(x, y + 2, x + 30, y + 2);
}

async function writeParagraph(
  pdf: jsPDF, text: string, font: string, x: number, y: number, maxW: number, pageH: number,
): Promise<number> {
  pdf.setFont(font, 'normal'); pdf.setFontSize(11); pdf.setTextColor(40, 40, 40);
  const lines = pdf.splitTextToSize(text, maxW);
  for (const line of lines) {
    if (y + 6 > pageH - 20) { pdf.addPage(); y = 22; }
    pdf.text(line, x, y); y += 5.6;
  }
  return y + 3;
}

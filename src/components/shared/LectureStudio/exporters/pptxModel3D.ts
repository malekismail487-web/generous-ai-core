/**
 * Embed `.glb` 3D models into a pptxgenjs-generated .pptx so PowerPoint
 * (Desktop / Web / Mobile that support 3D Models) renders them as real
 * <p:graphicFrame> with the Microsoft 2017 model3D drawing extension.
 *
 * Strategy:
 *   - Write each glb into ppt/embeddings/lumina_model{N}.glb
 *   - Register relationship in ppt/slides/_rels/slide{N}.xml.rels with type
 *     http://schemas.microsoft.com/office/2017/03/relationships/model3D
 *   - Append a <p:graphicFrame> with am3d:model3D graphicData inside <p:spTree>
 *   - Register Content Type for .glb
 *
 * Hard rule: this is best-effort. If any slide has no GLB or any step fails,
 * the existing 2D figure on that slide stays untouched. Never produce a broken deck.
 */
import JSZip from 'jszip';

const NS_AM3D = 'http://schemas.microsoft.com/office/drawing/2017/03/model3d';
const REL_TYPE_MODEL3D = 'http://schemas.microsoft.com/office/2017/03/relationships/model3D';

function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const m = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!m) return null;
  try { return base64ToUint8(m[1]); } catch { return null; }
}

function emu(inches: number): number {
  return Math.round(inches * 914400);
}

function nextSlideShapeId(slideXml: string): number {
  let max = 1;
  const re = /<p:cNvPr\b[^>]*\bid="(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slideXml))) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

function nextRelId(relsXml: string): number {
  let max = 0;
  const re = /Id="rId(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(relsXml))) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

function buildGraphicFrameXml(opts: { id: number; name: string; relId: string; xEmu: number; yEmu: number; wEmu: number; hEmu: number }): string {
  return (
    `<p:graphicFrame>` +
    `<p:nvGraphicFramePr>` +
    `<p:cNvPr id="${opts.id}" name="${opts.name}"/>` +
    `<p:cNvGraphicFramePr/>` +
    `<p:nvPr/>` +
    `</p:nvGraphicFramePr>` +
    `<p:xfrm>` +
    `<a:off x="${opts.xEmu}" y="${opts.yEmu}"/>` +
    `<a:ext cx="${opts.wEmu}" cy="${opts.hEmu}"/>` +
    `</p:xfrm>` +
    `<a:graphic>` +
    `<a:graphicData uri="${NS_AM3D}">` +
    `<am3d:model3D xmlns:am3d="${NS_AM3D}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${opts.relId}"/>` +
    `</a:graphicData>` +
    `</a:graphic>` +
    `</p:graphicFrame>`
  );
}

function ensureContentTypeRegistered(contentTypesXml: string): string {
  if (contentTypesXml.includes('Extension="glb"')) return contentTypesXml;
  return contentTypesXml.replace(
    '</Types>',
    `<Default Extension="glb" ContentType="model/gltf-binary"/></Types>`,
  );
}

export interface EmbedGlbInput {
  /** Aligned with body slide indices used in pptx.ts (slide 1 = cover, slide 2 = chapter, slide 3..N = body). */
  bodySlideStartIndex: number; // 1-based slide number where body slides start
  perBodySlideGlbDataUrls: (string | null | undefined)[]; // length === number of body slides
  /** Placement on slide (in inches). */
  placement?: { x: number; y: number; w: number; h: number };
}

export async function embedGlbModels(zip: JSZip, input: EmbedGlbInput): Promise<void> {
  const placement = input.placement || { x: 6.4, y: 0.85, w: 6.4, h: 5.8 };
  const contentTypesFile = zip.file('[Content_Types].xml');
  if (contentTypesFile) {
    const ct = await contentTypesFile.async('string');
    zip.file('[Content_Types].xml', ensureContentTypeRegistered(ct));
  }

  let embedCounter = 1;
  for (let i = 0; i < input.perBodySlideGlbDataUrls.length; i++) {
    const dataUrl = input.perBodySlideGlbDataUrls[i];
    if (!dataUrl) continue;
    const bytes = dataUrlToBytes(dataUrl);
    if (!bytes) continue;

    const slideNumber = input.bodySlideStartIndex + i;
    const slidePath = `ppt/slides/slide${slideNumber}.xml`;
    const relsPath = `ppt/slides/_rels/slide${slideNumber}.xml.rels`;
    const slideFile = zip.file(slidePath);
    const relsFile = zip.file(relsPath);
    if (!slideFile || !relsFile) continue;

    try {
      const embedPath = `ppt/embeddings/lumina_model${embedCounter}.glb`;
      zip.file(embedPath, bytes);

      const relsXml = await relsFile.async('string');
      const relIdNum = nextRelId(relsXml);
      const relId = `rId${relIdNum}`;
      const newRelsXml = relsXml.replace(
        '</Relationships>',
        `<Relationship Id="${relId}" Type="${REL_TYPE_MODEL3D}" Target="../embeddings/lumina_model${embedCounter}.glb"/></Relationships>`,
      );
      zip.file(relsPath, newRelsXml);

      const slideXml = await slideFile.async('string');
      const newId = nextSlideShapeId(slideXml);
      const frame = buildGraphicFrameXml({
        id: newId,
        name: `lumina_3d_${i}`,
        relId,
        xEmu: emu(placement.x), yEmu: emu(placement.y),
        wEmu: emu(placement.w), hEmu: emu(placement.h),
      });
      // Insert just before </p:spTree>
      const updated = slideXml.replace('</p:spTree>', `${frame}</p:spTree>`);
      zip.file(slidePath, updated);

      embedCounter++;
    } catch (e) {
      // Skip this slide — 2D figure already on the slide remains the fallback.
      console.warn(`embedGlbModels: failed for slide ${slideNumber}`, e);
    }
  }
}

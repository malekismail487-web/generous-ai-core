/**
 * Post-process a pptxgenjs-generated .pptx so PowerPoint (desktop, web, AND mobile)
 * actually renders the Morph transition between slides.
 *
 * pptxgenjs does NOT support `morph` — passing `{ type: 'morph' }` is silently dropped.
 * Morph requires two pieces of XML that pptxgenjs will never write:
 *
 *   1. A <p:transition> with the p159 (PowerPoint 2015) extension `<p159:prstTrans val="morph"/>`
 *      injected into every body slide.
 *
 *   2. A stable `<a16:creationId>` on every recurring shape (the hero image, the ring)
 *      so PowerPoint recognises them as the same object across slides and interpolates
 *      position / scale / rotation between them. PowerPoint matches shapes by creationId
 *      first, then by name — alt-text alone is NOT enough.
 *
 * Approach: open the pptx zip in-memory, walk ppt/slides/slide*.xml, regex-rewrite. No
 * DOMParser to avoid namespace headaches across browsers.
 */
import JSZip from 'jszip';

// Microsoft-defined URIs and namespaces. These exact strings are what PowerPoint looks for.
const NS_P14 = 'http://schemas.microsoft.com/office/powerpoint/2010/main';
const NS_P159 = 'http://schemas.microsoft.com/office/powerpoint/2015/09/main';
const NS_A16 = 'http://schemas.microsoft.com/office/drawing/2014/main';
const MORPH_EXT_URI = '{E01B4FDE-9E4C-4A24-A5C6-7F8E8B6D4DD0}';
const CREATIONID_EXT_URI = '{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}';

/** Stable, fake-but-valid GUIDs for each recurring shape name.
 *  Same GUID across every slide = Morph treats them as the same object. */
const SHARED_CREATION_IDS: Record<string, string> = {
  lumina_hero: '{11111111-1111-4111-8111-111111111111}',
  lumina_ring: '{22222222-2222-4222-8222-222222222222}',
  lumina_bg_motif: '{33333333-3333-4333-8333-333333333333}',
};

const TRANSITION_XML =
  `<p:transition xmlns:p14="${NS_P14}" spd="med" p14:dur="850">` +
  `<p:extLst>` +
  `<p:ext uri="${MORPH_EXT_URI}">` +
  `<p159:prstTrans xmlns:p159="${NS_P159}" val="morph" option="byObject"/>` +
  `</p:ext>` +
  `</p:extLst>` +
  `</p:transition>`;

function ensureRootNamespaces(xml: string): string {
  // pptxgenjs writes <p:sld xmlns:a="..." xmlns:r="..." xmlns:p="...">. Add p14/p159/a16 if absent.
  return xml.replace(/<p:sld\b([^>]*)>/, (_, attrs: string) => {
    let updated = attrs;
    if (!/xmlns:p14=/.test(updated)) updated += ` xmlns:p14="${NS_P14}"`;
    if (!/xmlns:p159=/.test(updated)) updated += ` xmlns:p159="${NS_P159}"`;
    if (!/xmlns:a16=/.test(updated)) updated += ` xmlns:a16="${NS_A16}"`;
    return `<p:sld${updated}>`;
  });
}

/** Inject stable a16:creationId into <p:cNvPr name="lumina_*"> so PowerPoint matches the shape across slides. */
function injectCreationIds(xml: string): string {
  // Match <p:cNvPr id="N" name="lumina_xxx" [more attrs]> with optional self-close or open tag.
  // Handles both <p:cNvPr .../> and <p:cNvPr ...>...</p:cNvPr>.
  const cNvPrRegex = /<p:cNvPr\b([^>]*?)\bname="(lumina_[a-z_]+)"([^>]*?)(\/>|>)/g;
  return xml.replace(cNvPrRegex, (match, before: string, name: string, after: string, end: string) => {
    const guid = SHARED_CREATION_IDS[name];
    if (!guid) return match; // unknown lumina_* name — leave alone
    const creationIdExt =
      `<a:extLst>` +
      `<a:ext uri="${CREATIONID_EXT_URI}">` +
      `<a16:creationId xmlns:a16="${NS_A16}" id="${guid}"/>` +
      `</a:ext>` +
      `</a:extLst>`;
    if (end === '/>') {
      // Convert self-closing tag to open+close with extLst child.
      return `<p:cNvPr${before}name="${name}"${after}>${creationIdExt}</p:cNvPr>`;
    }
    // Already an open tag with children — skip if we've already inserted creationId.
    if (/a16:creationId/.test(match)) return match;
    // Inject extLst as the first child by inserting right after the opening tag.
    return `<p:cNvPr${before}name="${name}"${after}>${creationIdExt}`;
  });
}

/** Insert <p:transition> just before </p:sld>. Replace existing transition if pptxgenjs wrote one. */
function injectMorphTransition(xml: string): string {
  // Remove any pre-existing <p:transition>...</p:transition> (pptxgenjs may emit a stub).
  let out = xml.replace(/<p:transition\b[^>]*\/>/g, '')
               .replace(/<p:transition\b[^>]*>[\s\S]*?<\/p:transition>/g, '');
  // PowerPoint expects <p:transition> AFTER <p:cSld>/<p:clrMapOvr> but before <p:timing>.
  // Safest universal placement: right before </p:sld>.
  out = out.replace(/<\/p:sld>\s*$/, `${TRANSITION_XML}</p:sld>`);
  return out;
}

/** Patch one slide XML string. Used on every body slide. */
function patchSlideXml(xml: string, options: { morph: boolean }): string {
  let out = ensureRootNamespaces(xml);
  out = injectCreationIds(out);
  if (options.morph) out = injectMorphTransition(out);
  return out;
}

/**
 * Patch a pptx ArrayBuffer.
 * @param buf raw .pptx bytes from `pptx.write({ outputType: 'arraybuffer' })`
 * @param opts.skipFirstSlide leave the cover slide without a morph IN transition (cleaner first impression). Default true.
 */
export async function patchPptxForMorph(
  buf: ArrayBuffer,
  opts: { skipFirstSlide?: boolean } = {},
): Promise<Blob> {
  const skipFirst = opts.skipFirstSlide ?? true;
  const zip = await JSZip.loadAsync(buf);

  const slideFiles = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/)![1], 10);
      const nb = parseInt(b.match(/slide(\d+)\.xml/)![1], 10);
      return na - nb;
    });

  for (let i = 0; i < slideFiles.length; i++) {
    const path = slideFiles[i];
    const file = zip.file(path);
    if (!file) continue;
    const raw = await file.async('string');
    const patched = patchSlideXml(raw, { morph: !(skipFirst && i === 0) });
    zip.file(path, patched);
  }

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    compression: 'DEFLATE',
  });
}

/** Trigger a browser download of the given blob with the given filename. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

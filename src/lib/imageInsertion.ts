/**
 * Image insertion utility — merges fetched images into content at placeholder positions.
 * 
 * The AI generates text with [IMAGE_PLACEHOLDER_1], [IMAGE_PLACEHOLDER_2], etc.
 * After images are fetched (Wikipedia + AI diagrams), this utility replaces
 * those placeholders with [INLINE_IMG:url:alt] tokens that MathRenderer renders inline.
 * 
 * If the AI doesn't output enough placeholders, remaining images are distributed
 * evenly after major section headings.
 */

export interface InlineImage {
  src: string;
  alt?: string;
}

/**
 * Merge images into content by replacing [IMAGE_PLACEHOLDER_N] markers
 * with [INLINE_IMG:url:alt] tokens.
 * 
 * Leftover images (more images than placeholders) get inserted after
 * markdown headings (## or ###) evenly throughout the content.
 */
export function mergeImagesIntoContent(
  content: string,
  images: InlineImage[]
): string {
  if (!content || !images || images.length === 0) return content;

  let result = content;
  const usedIndices = new Set<number>();

  // Step 1: Replace explicit placeholders [IMAGE_PLACEHOLDER_N]
  const placeholderRegex = /\[IMAGE_PLACEHOLDER_(\d+)\]/g;
  result = result.replace(placeholderRegex, (match, numStr) => {
    const idx = parseInt(numStr, 10) - 1; // 1-indexed to 0-indexed
    if (idx >= 0 && idx < images.length) {
      usedIndices.add(idx);
      const img = images[idx];
      const alt = (img.alt || `Educational image ${idx + 1}`).replace(/:/g, '꞉'); // escape colons in alt
      return `\n\n[INLINE_IMG:${img.src}:${alt}]\n\n`;
    }
    return ''; // Remove unmatched placeholders
  });

  // Step 2: Distribute remaining images after section headings
  const remainingImages = images.filter((_, i) => !usedIndices.has(i));
  if (remainingImages.length > 0) {
    // Find all heading positions (## or ###)
    const lines = result.split('\n');
    const headingIndices: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (/^#{2,3}\s/.test(lines[i])) {
        headingIndices.push(i);
      }
    }

    if (headingIndices.length > 0) {
      // Distribute images evenly after headings
      const step = Math.max(1, Math.floor(headingIndices.length / remainingImages.length));
      let imgIdx = 0;
      
      // Insert in reverse order to preserve line indices
      const insertions: { lineIdx: number; img: InlineImage }[] = [];
      for (let h = 0; h < headingIndices.length && imgIdx < remainingImages.length; h += step) {
        // Find end of the section after this heading (next empty line or next heading)
        let insertAfter = headingIndices[h];
        // Skip past the heading and the next paragraph
        for (let j = insertAfter + 1; j < lines.length; j++) {
          if (lines[j].trim() === '' && j > insertAfter + 1) {
            insertAfter = j;
            break;
          }
          if (j === lines.length - 1) {
            insertAfter = j;
          }
        }
        insertions.push({ lineIdx: insertAfter, img: remainingImages[imgIdx] });
        imgIdx++;
      }

      // Insert in reverse to maintain indices
      insertions.sort((a, b) => b.lineIdx - a.lineIdx);
      for (const ins of insertions) {
        const alt = (ins.img.alt || 'Educational image').replace(/:/g, '꞉');
        const imgToken = `\n[INLINE_IMG:${ins.img.src}:${alt}]\n`;
        lines.splice(ins.lineIdx + 1, 0, imgToken);
      }
      
      result = lines.join('\n');
    } else {
      // No headings found — append remaining images at the end
      for (const img of remainingImages) {
        const alt = (img.alt || 'Educational image').replace(/:/g, '꞉');
        result += `\n\n[INLINE_IMG:${img.src}:${alt}]\n`;
      }
    }
  }

  // Clean up any remaining unmatched placeholders
  result = result.replace(/\[IMAGE_PLACEHOLDER_\d+\]/g, '');
  
  return result;
}

/**
 * Convert an array of image URL strings to InlineImage objects.
 */
export function urlsToInlineImages(urls: string[], topicHint?: string): InlineImage[] {
  return urls.map((url, i) => ({
    src: url,
    alt: topicHint ? `${topicHint} — diagram ${i + 1}` : `Educational diagram ${i + 1}`,
  }));
}

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MathRendererProps {
  content: string;
  className?: string;
}

function renderMath(text: string): string {
  if (!text) return '';
  let result = text;

  // Process display math: $$ ... $$
  result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false, output: 'html', strict: false });
    } catch {
      return `<code>${math}</code>`;
    }
  });

  // Process display math: \[ ... \]
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false, output: 'html', strict: false });
    } catch {
      return `<code>${math}</code>`;
    }
  });

  // Process inline math: \( ... \)
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false, output: 'html', strict: false });
    } catch {
      return `<code>${math}</code>`;
    }
  });

  // Process inline math: $...$
  result = result.replace(/(?:^|[^\$])\$([^\$\n]+?)\$(?!\$)/g, (match, math) => {
    const prefix = match.charAt(0) === '$' ? '' : match.charAt(0);
    try {
      return `${prefix}${katex.renderToString(math.trim(), { displayMode: false, throwOnError: false, output: 'html', strict: false })}`;
    } catch {
      return `${prefix}<code>${math}</code>`;
    }
  });

  return result;
}

export function MathRenderer({ content, className = '' }: MathRendererProps) {
  // Extract images from markdown before rendering
  const { textParts, images } = useMemo(() => {
    const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const imgs: { alt: string; src: string }[] = [];
    let match;
    while ((match = imgRegex.exec(content)) !== null) {
      imgs.push({ alt: match[1], src: match[2] });
    }
    // Remove image markdown from text
    const cleanText = content.replace(imgRegex, '').trim();
    return { textParts: cleanText, images: imgs };
  }, [content]);

  // Also find raw URLs that look like images
  const allImages = useMemo(() => {
    const urlRegex = /(?:^|\s)(https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg|bmp)(?:\?\S*)?)/gi;
    const extraImgs: { alt: string; src: string }[] = [];
    let match;
    const remainingText = textParts;
    while ((match = urlRegex.exec(remainingText)) !== null) {
      extraImgs.push({ alt: 'Image', src: match[1].trim() });
    }
    return [...images, ...extraImgs];
  }, [textParts, images]);

  // Clean raw image URLs from text
  const finalText = useMemo(() => {
    let cleaned = textParts;
    const urlRegex = /(?:^|\s)(https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg|bmp)(?:\?\S*)?)/gi;
    cleaned = cleaned.replace(urlRegex, '').trim();
    return cleaned;
  }, [textParts]);

  const mathProcessedText = useMemo(() => renderMath(finalText), [finalText]);

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Rendered markdown text with math */}
      {mathProcessedText && (
        <div
          className="prose prose-sm dark:prose-invert max-w-none 
            prose-p:my-1.5 prose-p:leading-relaxed
            prose-ul:my-2 prose-ol:my-2 
            prose-li:my-0.5
            prose-headings:mt-4 prose-headings:mb-2
            prose-strong:text-foreground
            prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-xs"
          dangerouslySetInnerHTML={{ __html: mathProcessedText }}
        />
      )}

      {/* Rendered images in a vertical scrollable gallery */}
      {allImages.length > 0 && (
        <div className="flex flex-col gap-3 mt-3">
          {allImages.map((img, idx) => (
            <div key={idx} className="rounded-xl overflow-hidden border border-border/30 bg-card/50">
              <img
                src={img.src}
                alt={img.alt || 'Image'}
                className="w-full max-h-80 object-contain bg-black/5"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              {img.alt && img.alt !== 'Image' && (
                <p className="text-xs text-muted-foreground px-3 py-1.5 text-center">{img.alt}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

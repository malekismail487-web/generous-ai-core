import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MathRendererProps {
  content: string;
  className?: string;
  /** Optional real images to display (e.g. from Wikipedia API) */
  images?: { src: string; alt?: string }[];
}

function renderLatex(text: string, displayMode: boolean): string {
  try {
    return katex.renderToString(text.trim(), { displayMode, throwOnError: false, output: 'html', strict: false });
  } catch {
    return `<code>${text}</code>`;
  }
}

function processMathInText(text: string): string {
  if (!text) return '';
  let result = text;
  result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => renderLatex(math, true));
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => renderLatex(math, true));
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => renderLatex(math, false));
  result = result.replace(/(?:^|[^\$])\$([^\$\n]+?)\$(?!\$)/g, (match, math) => {
    const prefix = match.charAt(0) === '$' ? '' : match.charAt(0);
    return `${prefix}${renderLatex(math, false)}`;
  });
  return result;
}

export function MathRenderer({ content, className = '', images }: MathRendererProps) {
  // Remove markdown image syntax from content (AI sometimes outputs broken image URLs)
  const cleanedContent = useMemo(() => {
    let cleaned = content;
    // Remove markdown images ![alt](url)
    cleaned = cleaned.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '');
    // Remove standalone raw image URLs on their own line
    cleaned = cleaned.replace(/^https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg|bmp)(?:\?\S*)?$/gm, '');
    // Remove ALL YouTube URLs (they are always broken/hallucinated)
    cleaned = cleaned.replace(/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\S*/gi, '');
    // Remove markdown links that contain YouTube URLs [text](youtube...)
    cleaned = cleaned.replace(/\[([^\]]*)\]\(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\S*\)/gi, '$1');
    // Remove any remaining raw URLs on their own line (likely hallucinated)
    cleaned = cleaned.replace(/^https?:\/\/\S+$/gm, '');
    // Remove inline raw URLs (keep surrounding text)
    cleaned = cleaned.replace(/https?:\/\/\S+/g, '');
    // Clean up double spaces and empty lines from removals
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    return cleaned.trim();
  }, [content]);

  return (
    <div className={`space-y-3 ${className}`}>
      {cleanedContent && (
        <div className="prose prose-sm dark:prose-invert max-w-none
          prose-p:my-1.5 prose-p:leading-relaxed
          prose-ul:my-2 prose-ol:my-2
          prose-li:my-0.5
          prose-headings:mt-4 prose-headings:mb-2
          prose-strong:text-foreground
          prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-xs
          prose-a:text-primary prose-a:underline prose-a:font-medium">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children, ...props }) => (
                <p {...props}>{processChildren(children)}</p>
              ),
              li: ({ children, ...props }) => (
                <li {...props}>{processChildren(children)}</li>
              ),
              strong: ({ children, ...props }) => (
                <strong {...props}>{children}</strong>
              ),
              // Don't render markdown images — we show real images from the images prop
              img: () => null,
              // Make all links clickable, opening in new tab
              a: ({ children, href, ...props }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline font-medium hover:text-primary/80 transition-colors"
                  {...props}
                >
                  {children}
                </a>
              ),
            }}
          >
            {cleanedContent}
          </ReactMarkdown>
        </div>
      )}

      {/* Real images gallery (from Wikipedia API — like AI lectures) */}
      {images && images.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">📸 Visual References</p>
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin">
            {images.map((img, idx) => (
              <div key={idx} className="flex-shrink-0 w-64 snap-center rounded-xl overflow-hidden border border-border/30 bg-card/50 shadow-sm">
                <img
                  src={img.src}
                  alt={img.alt || 'Educational image'}
                  className="w-full h-44 object-cover bg-muted/20"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).parentElement!.style.display = 'none';
                  }}
                />
                {img.alt && (
                  <p className="text-[11px] text-muted-foreground px-2.5 py-1.5 text-center truncate">{img.alt}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function processChildren(children: React.ReactNode): React.ReactNode {
  if (!children) return children;
  if (typeof children === 'string') {
    const processed = processMathInText(children);
    if (processed !== children) {
      return <span dangerouslySetInnerHTML={{ __html: processed }} />;
    }
    return children;
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === 'string') {
        const processed = processMathInText(child);
        if (processed !== child) {
          return <span key={i} dangerouslySetInnerHTML={{ __html: processed }} />;
        }
        return child;
      }
      return child;
    });
  }
  return children;
}

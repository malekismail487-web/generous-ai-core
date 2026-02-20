import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MathRendererProps {
  content: string;
  className?: string;
}

function renderLatex(text: string, displayMode: boolean): string {
  try {
    return katex.renderToString(text.trim(), { displayMode, throwOnError: false, output: 'html', strict: false });
  } catch {
    return `<code>${text}</code>`;
  }
}

/**
 * Process math expressions in text segments (not inside code blocks).
 * Returns HTML string with rendered KaTeX.
 */
function processMathInText(text: string): string {
  if (!text) return '';
  let result = text;

  // Display math: $$ ... $$
  result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => renderLatex(math, true));
  // Display math: \[ ... \]
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => renderLatex(math, true));
  // Inline math: \( ... \)
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => renderLatex(math, false));
  // Inline math: $...$
  result = result.replace(/(?:^|[^\$])\$([^\$\n]+?)\$(?!\$)/g, (match, math) => {
    const prefix = match.charAt(0) === '$' ? '' : match.charAt(0);
    return `${prefix}${renderLatex(math, false)}`;
  });

  return result;
}

export function MathRenderer({ content, className = '' }: MathRendererProps) {
  // Extract images from markdown and raw URLs
  const { cleanedContent, images } = useMemo(() => {
    const imgs: { alt: string; src: string }[] = [];

    // Extract markdown images
    const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = imgRegex.exec(content)) !== null) {
      imgs.push({ alt: match[1], src: match[2] });
    }
    let cleaned = content.replace(imgRegex, '');

    // Extract raw image URLs
    const urlRegex = /(?:^|\s)(https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg|bmp)(?:\?\S*)?)/gi;
    while ((match = urlRegex.exec(cleaned)) !== null) {
      imgs.push({ alt: 'Image', src: match[1].trim() });
    }
    cleaned = cleaned.replace(urlRegex, '').trim();

    return { cleanedContent: cleaned, images: imgs };
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
          prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-xs">
          <ReactMarkdown
            components={{
              // Process math in text nodes
              p: ({ children, ...props }) => (
                <p {...props}>
                  {processChildren(children)}
                </p>
              ),
              li: ({ children, ...props }) => (
                <li {...props}>
                  {processChildren(children)}
                </li>
              ),
              strong: ({ children, ...props }) => (
                <strong {...props}>{children}</strong>
              ),
              // Don't render images from markdown - we handle them separately
              img: () => null,
              // Links render normally
              a: ({ children, href, ...props }) => (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline" {...props}>
                  {children}
                </a>
              ),
            }}
          >
            {cleanedContent}
          </ReactMarkdown>
        </div>
      )}

      {/* Rendered images in a vertical scrollable gallery */}
      {images.length > 0 && (
        <div className="flex flex-col gap-3 mt-3">
          {images.map((img, idx) => (
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

/**
 * Process React children to render math in text strings
 */
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

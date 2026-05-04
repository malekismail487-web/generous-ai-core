import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { InteractiveGraph } from '@/components/student/InteractiveGraph';
import { GraphModal } from '@/components/student/GraphModal';
import { CodeBlock } from '@/components/CodeBlock';

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

function processMathInText(text: string): string {
  if (!text) return '';
  let result = text;
  // Process inline images first — protect them from other transformations
  result = result.replace(/\[INLINE_IMG:(.*?):(.*?)\]/g, (_, url, alt) => {
    const cleanAlt = alt.replace(/꞉/g, ':');
    return `<div class="my-4 rounded-xl overflow-hidden border border-border/30 bg-card/50 shadow-sm inline-block max-w-full"><img src="${url}" alt="${cleanAlt}" class="w-full max-h-64 object-contain bg-white rounded-xl" loading="lazy" onerror="this.parentElement.style.display='none'" />${cleanAlt ? `<p class="text-[11px] text-center text-muted-foreground px-2.5 py-1.5 truncate">${cleanAlt}</p>` : ''}</div>`;
  });
  result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => renderLatex(math, true));
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => renderLatex(math, true));
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => renderLatex(math, false));
  result = result.replace(/(?:^|[^\$])\$([^\$\n]+?)\$(?!\$)/g, (match, math) => {
    const prefix = match.charAt(0) === '$' ? '' : match.charAt(0);
    return `${prefix}${renderLatex(math, false)}`;
  });
  return result;
}

export function MathRenderer({ content, className = '' }: MathRendererProps) {
  const [expandGraph, setExpandGraph] = useState<string[] | null>(null);

  // Extract [GRAPH: ...] tokens
  const { graphs, contentWithoutGraphs } = useMemo(() => {
    const graphRegex = /\[GRAPH:\s*(.*?)\]/g;
    const foundGraphs: string[][] = [];
    const cleaned = content.replace(graphRegex, (_, eqs: string) => {
      const equations = eqs.split(',').map((e: string) => e.trim()).filter(Boolean);
      if (equations.length > 0) foundGraphs.push(equations);
      return ''; // remove from text
    });
    return { graphs: foundGraphs, contentWithoutGraphs: cleaned };
  }, [content]);

  // Remove markdown image syntax from content (AI sometimes outputs broken image URLs)
  // but KEEP [INLINE_IMG:...] tokens — those are our own
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
    // Remove any remaining raw URLs on their own line (likely hallucinated) — but not INLINE_IMG tokens
    cleaned = cleaned.replace(/^(?!\[INLINE_IMG:)https?:\/\/\S+$/gm, '');
    // Remove inline raw URLs (keep surrounding text) — but not inside INLINE_IMG tokens
    cleaned = cleaned.replace(/(?<!\[INLINE_IMG:)https?:\/\/(?![^\]]*\])\S+/g, '');
    // Clean up double spaces and empty lines from removals
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    return cleaned.trim();
  }, [contentWithoutGraphs]);

  return (
    <div className={`space-y-3 ${className}`}>
      {cleanedContent && (
        <div className="prose prose-sm dark:prose-invert max-w-none
          font-serif
          prose-p:my-1.5 prose-p:leading-[1.75]
          prose-ul:my-2 prose-ol:my-2
          prose-li:my-0.5 prose-li:leading-[1.75]
          prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-sans
          prose-strong:text-foreground
          prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-xs prose-code:font-mono
          prose-a:text-primary prose-a:underline prose-a:font-medium"
          style={{ fontFamily: "'Source Serif 4', 'Georgia', serif" }}>
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
              // Render fenced code blocks with our CodeBlock (copy + preview)
              code: ({ inline, className, children, ...props }: any) => {
                const text = String(children ?? '').replace(/\n$/, '');
                if (inline) {
                  return <code className={className} {...props}>{children}</code>;
                }
                const match = /language-(\w+)/.exec(className || '');
                const lang = match?.[1] || 'text';
                return <CodeBlock language={lang} code={text} />;
              },
              pre: ({ children }: any) => <>{children}</>,
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

      {/* Inline interactive graphs */}
      {graphs.map((eqs, i) => (
        <div key={i} className="my-3">
          <InteractiveGraph
            equations={eqs}
            width={280}
            height={180}
            compact
            onExpand={() => setExpandGraph(eqs)}
          />
        </div>
      ))}

      {/* Full-screen graph modal */}
      {expandGraph && (
        <GraphModal
          open={!!expandGraph}
          onClose={() => setExpandGraph(null)}
          initialEquations={expandGraph}
        />
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

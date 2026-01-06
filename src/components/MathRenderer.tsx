import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MathRendererProps {
  content: string;
  className?: string;
}

export function MathRenderer({ content, className = '' }: MathRendererProps) {
  const renderedContent = useMemo(() => {
    if (!content) return '';
    
    let result = content;
    
    // Process display math first: $$ ... $$ (must be processed before single $)
    result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
      try {
        const html = katex.renderToString(math.trim(), {
          displayMode: true,
          throwOnError: false,
          output: 'html',
          strict: false,
        });
        return `<div class="my-4 overflow-x-auto flex justify-center">${html}</div>`;
      } catch {
        return `<div class="my-4 font-mono text-sm text-muted-foreground text-center">${math}</div>`;
      }
    });
    
    // Process display math: \[ ... \]
    result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => {
      try {
        const html = katex.renderToString(math.trim(), {
          displayMode: true,
          throwOnError: false,
          output: 'html',
          strict: false,
        });
        return `<div class="my-4 overflow-x-auto flex justify-center">${html}</div>`;
      } catch {
        return `<div class="my-4 font-mono text-sm text-muted-foreground text-center">${math}</div>`;
      }
    });
    
    // Process inline math: \( ... \)
    result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => {
      try {
        const html = katex.renderToString(math.trim(), {
          displayMode: false,
          throwOnError: false,
          output: 'html',
          strict: false,
        });
        return `<span class="inline-math">${html}</span>`;
      } catch {
        return `<code class="font-mono text-sm">${math}</code>`;
      }
    });
    
    // Process inline math: $...$ (single dollar signs, not double)
    // Use negative lookbehind/lookahead to avoid matching $$
    result = result.replace(/(?<!\$)\$([^\$\n]+?)\$(?!\$)/g, (_, math) => {
      try {
        const html = katex.renderToString(math.trim(), {
          displayMode: false,
          throwOnError: false,
          output: 'html',
          strict: false,
        });
        return `<span class="inline-math">${html}</span>`;
      } catch {
        return `<code class="font-mono text-sm">${math}</code>`;
      }
    });
    
    return result;
  }, [content]);
  
  return (
    <div 
      className={`prose prose-sm dark:prose-invert max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: renderedContent }}
    />
  );
}

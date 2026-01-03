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
    
    // Process display math first: \[ ... \]
    result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => {
      try {
        const html = katex.renderToString(math.trim(), {
          displayMode: true,
          throwOnError: false,
          output: 'html',
        });
        return `<div class="my-4 overflow-x-auto">${html}</div>`;
      } catch {
        return `<div class="my-4 font-mono text-sm text-muted-foreground">${math}</div>`;
      }
    });
    
    // Process inline math: \( ... \)
    result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => {
      try {
        const html = katex.renderToString(math.trim(), {
          displayMode: false,
          throwOnError: false,
          output: 'html',
        });
        return html;
      } catch {
        return `<code class="font-mono text-sm">${math}</code>`;
      }
    });
    
    // Also process $...$ for inline math (common markdown style)
    result = result.replace(/\$([^\$\n]+?)\$/g, (_, math) => {
      try {
        const html = katex.renderToString(math.trim(), {
          displayMode: false,
          throwOnError: false,
          output: 'html',
        });
        return html;
      } catch {
        return `<code class="font-mono text-sm">${math}</code>`;
      }
    });
    
    // Process $$...$$ for display math (common markdown style)
    result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
      try {
        const html = katex.renderToString(math.trim(), {
          displayMode: true,
          throwOnError: false,
          output: 'html',
        });
        return `<div class="my-4 overflow-x-auto">${html}</div>`;
      } catch {
        return `<div class="my-4 font-mono text-sm text-muted-foreground">${math}</div>`;
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

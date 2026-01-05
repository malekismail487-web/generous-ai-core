import { useMemo, forwardRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MathRendererProps {
  content: string;
  className?: string;
}

const renderMath = (math: string, displayMode: boolean): string => {
  try {
    // Unescape common escaped characters from JSON
    const cleanMath = math
      .replace(/\\\\(?=[a-zA-Z])/g, '\\') // Fix double backslashes before commands
      .trim();
    
    const html = katex.renderToString(cleanMath, {
      displayMode,
      throwOnError: false,
      output: 'html',
      strict: false,
      trust: true,
      macros: {
        "\\R": "\\mathbb{R}",
        "\\N": "\\mathbb{N}",
        "\\Z": "\\mathbb{Z}",
        "\\Q": "\\mathbb{Q}",
        "\\C": "\\mathbb{C}",
      },
    });
    
    return displayMode 
      ? `<div class="my-4 overflow-x-auto flex justify-center">${html}</div>`
      : `<span class="inline-math">${html}</span>`;
  } catch {
    // Fallback: show the raw math in a styled code block
    return displayMode
      ? `<div class="my-4 font-mono text-sm bg-muted/50 p-2 rounded text-center overflow-x-auto">${math}</div>`
      : `<code class="font-mono text-sm bg-muted/50 px-1 rounded">${math}</code>`;
  }
};

export const MathRenderer = forwardRef<HTMLDivElement, MathRendererProps>(
  ({ content, className = '' }, ref) => {
    const renderedContent = useMemo(() => {
      if (!content) return '';
      
      let result = content;
      
      // Step 1: Process display math $$ ... $$ (greedy, multiline)
      result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => renderMath(math, true));
      
      // Step 2: Process display math \[ ... \] (escaped brackets)
      result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => renderMath(math, true));
      
      // Step 3: Process inline math \( ... \) (escaped parens)
      result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => renderMath(math, false));
      
      // Step 4: Process inline math $...$ avoiding already processed or escaped
      // Match single $ not preceded by \ or $, and not followed by $
      result = result.replace(/(?<![\\$])\$([^$\n]+?)\$(?!\$)/g, (match, math) => {
        // Skip if it looks like currency (number right after $)
        if (/^\d/.test(math.trim())) return match;
        return renderMath(math, false);
      });
      
      // Step 5: Handle common markdown formatting
      // Bold: **text** or __text__
      result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      result = result.replace(/__([^_]+)__/g, '<strong>$1</strong>');
      
      // Italic: *text* or _text_ (but not inside math)
      result = result.replace(/(?<![\\*])\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
      
      // Code: `code`
      result = result.replace(/`([^`]+)`/g, '<code class="bg-muted/50 px-1 py-0.5 rounded text-sm font-mono">$1</code>');
      
      // Headers
      result = result.replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold mt-4 mb-2">$1</h3>');
      result = result.replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-5 mb-2">$1</h2>');
      result = result.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-6 mb-3">$1</h1>');
      
      // Bullet points
      result = result.replace(/^[-*] (.+)$/gm, '<li class="ml-4">$1</li>');
      result = result.replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul class="list-disc my-2">$&</ul>');
      
      // Numbered lists
      result = result.replace(/^\d+\. (.+)$/gm, '<li class="ml-4">$1</li>');
      
      // Line breaks - convert double newlines to paragraph breaks
      result = result.replace(/\n\n+/g, '</p><p class="my-2">');
      result = `<p class="my-2">${result}</p>`;
      
      // Clean up empty paragraphs
      result = result.replace(/<p class="my-2"><\/p>/g, '');
      result = result.replace(/<p class="my-2">(\s*<(?:div|h[1-6]|ul|ol))/g, '$1');
      result = result.replace(/(<\/(?:div|h[1-6]|ul|ol)>)\s*<\/p>/g, '$1');
      
      return result;
    }, [content]);
    
    return (
      <div 
        ref={ref}
        className={`prose prose-sm dark:prose-invert max-w-none ${className}`}
        dangerouslySetInnerHTML={{ __html: renderedContent }}
      />
    );
  }
);

MathRenderer.displayName = 'MathRenderer';

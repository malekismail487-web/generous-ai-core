import { useState } from 'react';
import { Copy, Check, Play, ExternalLink, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { CodePreviewFrame, isPreviewable } from '@/components/code/CodePreviewFrame';

interface CodeBlockProps {
  language: string;
  code: string;
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const lang = (language || '').toLowerCase() || 'text';
  const previewable = isPreviewable(lang);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  const openInLab = () => {
    try {
      sessionStorage.setItem('codelab:incoming', JSON.stringify({ language: lang, code }));
    } catch {}
    navigate('/code-lab');
  };

  return (
    <div className="my-3 rounded-lg border border-border bg-muted/40 overflow-hidden text-left">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border bg-muted/60">
        <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">{lang}</span>
        <div className="flex items-center gap-1">
          {previewable && (
            <button
              onClick={() => setShowPreview((s) => !s)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] hover:bg-background transition-colors"
              title="Run preview"
            >
              {showPreview ? <X size={12} /> : <Play size={12} />}
              {showPreview ? 'Close' : 'Run'}
            </button>
          )}
          <button
            onClick={openInLab}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] hover:bg-background transition-colors"
            title="Open in Code Lab"
          >
            <ExternalLink size={12} />
            Lab
          </button>
          <button
            onClick={onCopy}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] hover:bg-background transition-colors"
            title="Copy code"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        <code className="font-mono text-foreground whitespace-pre">{code}</code>
      </pre>
      {showPreview && previewable && (
        <div className="border-t border-border p-2 bg-background">
          <CodePreviewFrame language={lang} code={code} />
        </div>
      )}
    </div>
  );
}

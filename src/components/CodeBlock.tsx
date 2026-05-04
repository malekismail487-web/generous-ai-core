import { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

interface CodeBlockProps {
  language: string;
  code: string;
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const lang = (language || '').toLowerCase() || 'text';

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
          <button
            onClick={openInLab}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] hover:bg-background transition-colors"
            title="Open in Code Lab to run"
          >
            <ExternalLink size={12} />
            Open in Lab
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
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed max-h-80">
        <code className="font-mono text-foreground whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}

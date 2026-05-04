import { useState } from 'react';
import { Copy, Check, Play, ExternalLink, X, Maximize2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { CodePreviewFrame, isPreviewable } from '@/components/code/CodePreviewFrame';
import { Dialog, DialogContent } from '@/components/ui/dialog';

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
    <>
      <div className="my-3 rounded-lg border border-border bg-muted/40 overflow-hidden text-left">
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border bg-muted/60">
          <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">{lang}</span>
          <div className="flex items-center gap-1">
            {previewable && (
              <button
                onClick={() => setShowPreview(true)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] hover:bg-background transition-colors"
                title="Run preview"
              >
                <Play size={12} />
                Preview
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
        <pre className="overflow-x-auto p-3 text-xs leading-relaxed max-h-80">
          <code className="font-mono text-foreground whitespace-pre">{code}</code>
        </pre>
      </div>

      {previewable && (
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="p-0 w-screen h-screen max-w-none sm:max-w-none rounded-none border-0 gap-0 flex flex-col">
            <div className="h-12 flex items-center justify-between px-3 border-b border-border bg-muted/40 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wide text-muted-foreground">{lang} preview</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={openInLab}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-background transition-colors"
                  title="Open in Code Lab"
                >
                  <Maximize2 size={14} />
                  Edit in Lab
                </button>
                <button
                  onClick={() => setShowPreview(false)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-background transition-colors"
                  title="Close"
                >
                  <X size={14} />
                  Close
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 bg-white">
              <CodePreviewFrame
                language={lang}
                code={code}
                className="w-full h-full border-0 bg-white"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

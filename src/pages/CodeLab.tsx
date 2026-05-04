import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Copy, Check, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { CodePreviewFrame, isPreviewable } from '@/components/code/CodePreviewFrame';
import { streamChat } from '@/lib/chat';

const LANGUAGES = ['html', 'javascript', 'css', 'jsx', 'tsx', 'markdown', 'python', 'typescript', 'json', 'sql', 'java', 'cpp', 'go', 'rust'];

const STARTERS: Record<string, string> = {
  html: '<h1>Hello from Lumina</h1>\n<p>Edit this code and press Run.</p>',
  javascript: 'console.log("Hello from Lumina");\nfor (let i = 1; i <= 3; i++) console.log("count", i);',
  css: 'body { background: #0f172a; color: #fff; }\nh1 { color: #60a5fa; }',
  jsx: 'function App() {\n  const [n, setN] = React.useState(0);\n  return React.createElement("div", null,\n    React.createElement("h1", null, "Count: " + n),\n    React.createElement("button", { onClick: () => setN(n+1) }, "Add")\n  );\n}',
  tsx: 'function App() {\n  return <h1 style={{color:"#2563eb"}}>Hello, React!</h1>;\n}',
  markdown: '# Hello\n\nThis is a **markdown** preview.',
};

export default function CodeLab() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [language, setLanguage] = useState<string>('html');
  const [code, setCode] = useState<string>(STARTERS.html);
  const [previewKey, setPreviewKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [askLoading, setAskLoading] = useState(false);

  // Receive code handed off from chat
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('codelab:incoming');
      if (raw) {
        const { language: lng, code: cd } = JSON.parse(raw);
        if (lng) setLanguage(lng);
        if (cd) setCode(cd);
        sessionStorage.removeItem('codelab:incoming');
      }
    } catch {}
  }, []);

  const previewable = useMemo(() => isPreviewable(language), [language]);

  const onLangChange = (lng: string) => {
    setLanguage(lng);
    if (STARTERS[lng] && (!code.trim() || Object.values(STARTERS).includes(code))) {
      setCode(STARTERS[lng]);
    }
  };

  const onCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const onAsk = async () => {
    const q = prompt.trim();
    if (!q) return;
    setAskLoading(true);
    let buf = '';
    await streamChat({
      messages: [
        {
          id: 'sys',
          role: 'user',
          content:
            `I'm working in Code Lab using language: ${language}.\n\nCurrent code:\n\`\`\`${language}\n${code}\n\`\`\`\n\nRequest: ${q}\n\nReply with ONE fenced code block (\`\`\`${language} ... \`\`\`) containing the complete updated file. No prose outside the block.`,
        },
      ],
      onDelta: (d) => {
        buf += d;
      },
      onDone: () => {
        const m = buf.match(/```[a-zA-Z0-9]*\n([\s\S]*?)```/);
        if (m) {
          setCode(m[1].trimEnd());
          setPreviewKey((k) => k + 1);
          toast({ title: 'Lumina updated your code' });
        } else {
          toast({ title: "Couldn't parse code", description: 'Try again with a clearer request.', variant: 'destructive' });
        }
        setPrompt('');
        setAskLoading(false);
      },
      onError: (e) => {
        toast({ title: 'Lumina error', description: e.message, variant: 'destructive' });
        setAskLoading(false);
      },
    });
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="h-14 border-b border-border/40 flex items-center px-3 gap-2 flex-shrink-0">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
        </Button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-bold text-sm">Code Lab</span>
          <select
            value={language}
            onChange={(e) => onLangChange(e.target.value)}
            className="ml-2 bg-muted border border-border rounded px-2 py-1 text-xs"
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <Button variant="ghost" size="sm" onClick={onCopy} className="h-8">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span className="ml-1 text-xs">{copied ? 'Copied' : 'Copy'}</span>
        </Button>
        <Button size="sm" onClick={() => setPreviewKey((k) => k + 1)} disabled={!previewable} className="h-8">
          <Play size={14} />
          <span className="ml-1 text-xs">Run</span>
        </Button>
      </header>

      <div className="flex-1 grid grid-rows-2 md:grid-rows-1 md:grid-cols-2 min-h-0">
        <div className="flex flex-col min-h-0 border-b md:border-b-0 md:border-r border-border/40">
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            className="flex-1 w-full p-3 bg-background text-foreground font-mono text-xs resize-none outline-none"
          />
        </div>
        <div className="flex flex-col min-h-0 bg-muted/20">
          {previewable ? (
            <CodePreviewFrame
              key={previewKey}
              language={language}
              code={code}
              className="flex-1 w-full bg-white"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Live preview is not available for <span className="font-mono mx-1">{language}</span>.
              Copy the code and run it locally, or paste it into GitHub.
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border/40 p-2 flex items-end gap-2 flex-shrink-0 pb-[calc(env(safe-area-inset-bottom,0px)+8px)]">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask Lumina to write or change code…"
          className="min-h-[42px] max-h-32 text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onAsk();
            }
          }}
        />
        <Button onClick={onAsk} disabled={askLoading || !prompt.trim()} className="h-10">
          {askLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        </Button>
      </div>
    </div>
  );
}

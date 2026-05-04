import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Play, Copy, Check, Sparkles, Loader2, Plus, Trash2, Pencil,
  FileCode, FileText, Download, FolderTree, X, Settings,
} from 'lucide-react';
import Editor from '@monaco-editor/react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { CodePreviewFrame, isPreviewable, injectAIRuntime, type AIConfig } from '@/components/code/CodePreviewFrame';
import { AISettingsModal, loadAIConfig, saveAIConfig } from '@/components/code/AISettingsModal';
import { DiffModal, type DiffEntry } from '@/components/code/DiffModal';
import { streamChat } from '@/lib/chat';
import { supabase } from '@/integrations/supabase/client';

type ProjectFile = { path: string; content: string };
type Project = { files: ProjectFile[]; activePath: string };

const STORAGE_KEY = 'codelab:project:v1';

function extOf(path: string): string {
  const m = path.match(/\.([a-zA-Z0-9]+)$/);
  return (m?.[1] || '').toLowerCase();
}
function languageFromPath(path: string): string {
  const e = extOf(path);
  const map: Record<string, string> = {
    html: 'html', htm: 'html', css: 'css', js: 'javascript', mjs: 'javascript',
    jsx: 'javascript', ts: 'typescript', tsx: 'typescript', json: 'json', md: 'markdown',
    py: 'python', java: 'java', cpp: 'cpp', c: 'c', cs: 'csharp', go: 'go',
    rs: 'rust', sql: 'sql', sh: 'shell', php: 'php', rb: 'ruby', swift: 'swift',
    kt: 'kotlin',
  };
  return map[e] || 'plaintext';
}
function previewLangFromPath(path: string): string {
  const e = extOf(path);
  if (e === 'jsx') return 'jsx';
  if (e === 'tsx') return 'tsx';
  if (e === 'js') return 'javascript';
  return languageFromPath(path);
}

const DEFAULT_PROJECT: Project = {
  files: [
    {
      path: 'index.html',
      content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Hello from Lumina</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main>
    <h1>Hello from Lumina ✨</h1>
    <p>Edit any file on the left, then press <strong>Run</strong>.</p>
    <button id="btn">Click me</button>
    <button id="ai">Ask AI</button>
    <p id="out"></p>
  </main>
  <script src="app.js"></script>
</body>
</html>
`,
    },
    {
      path: 'styles.css',
      content: `:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background: linear-gradient(135deg,#0f172a,#1e293b);
  color: #e2e8f0;
  min-height: 100vh;
  display: grid;
  place-items: center;
}
main {
  text-align: center;
  padding: 2rem 2.5rem;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 18px;
  backdrop-filter: blur(8px);
}
h1 { margin: 0 0 .5rem; font-size: 1.6rem; }
p  { margin: 0 0 1.25rem; color: #94a3b8; }
button {
  padding: .6rem 1.1rem;
  margin: 0 .25rem;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,.15);
  background: #2563eb;
  color: white;
  cursor: pointer;
  transition: transform .15s ease, background .2s ease;
}
button:hover { background:#1d4ed8; transform: translateY(-1px); }
#out { margin-top: 1rem; min-height: 1.2em; color: #cbd5e1; }
`,
    },
    {
      path: 'app.js',
      content: `const btn = document.getElementById('btn');
const ai  = document.getElementById('ai');
const out = document.getElementById('out');
let n = 0;
btn?.addEventListener('click', () => { n++; btn.textContent = 'Clicked ' + n + 'x'; });

ai?.addEventListener('click', async () => {
  ai.disabled = true; out.textContent = 'Thinking…';
  try {
    const text = await LUMINA_AI('Give me one short, fun science fact for a student.');
    out.textContent = text;
  } catch (e) {
    out.textContent = 'AI error: ' + e.message;
  } finally { ai.disabled = false; }
});
`,
    },
  ],
  activePath: 'index.html',
};

function buildProjectSrcDoc(project: Project, ai?: AIConfig): string | null {
  const html = project.files.find((f) => f.path.toLowerCase() === 'index.html');
  if (!html) return null;
  const fileMap = new Map(project.files.map((f) => [f.path.toLowerCase(), f]));
  let doc = html.content;
  doc = doc.replace(
    /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>(?:\s*<\/link>)?/gi,
    (match, href) => {
      const f = fileMap.get(String(href).toLowerCase());
      return f ? `<style>\n${f.content}\n</style>` : match;
    },
  );
  doc = doc.replace(
    /<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi,
    (match, pre, src, post) => {
      const f = fileMap.get(String(src).toLowerCase());
      if (!f) return match;
      const attrs = `${pre} ${post}`.replace(/\s+/g, ' ').trim();
      return `<script ${attrs}>\n${f.content}\n</script>`;
    },
  );
  return injectAIRuntime(doc, ai);
}

function parseFileBlocks(text: string): ProjectFile[] {
  const out: ProjectFile[] = [];
  const re = /```([a-zA-Z0-9+\-]*)([^\n]*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const meta = `${m[1]} ${m[2]}`.trim();
    const pathMatch =
      meta.match(/(?:path\s*=\s*)?["']?([\w./\-]+\.[a-zA-Z0-9]+)["']?/) ||
      meta.match(/:\s*([\w./\-]+\.[a-zA-Z0-9]+)/);
    if (!pathMatch) continue;
    const path = pathMatch[1].replace(/^\.\//, '').trim();
    out.push({ path, content: m[3].replace(/\s+$/g, '') + '\n' });
  }
  return out;
}

function loadProject(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Project;
      if (p?.files?.length) return p;
    }
  } catch {}
  return DEFAULT_PROJECT;
}

export default function CodeLab() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [project, setProject] = useState<Project>(() => loadProject());
  const [aiConfig, setAiConfig] = useState<AIConfig | undefined>(() => loadAIConfig() ?? { mode: 'lumina' });
  const [aiRuntime, setAiRuntime] = useState<AIConfig | undefined>(undefined);
  const [previewKey, setPreviewKey] = useState(0);
  const [hasRun, setHasRun] = useState(false);
  const [runSnapshot, setRunSnapshot] = useState<{ doc: string | null; lang: string; code: string } | null>(null);
  const [mobilePane, setMobilePane] = useState<'editor' | 'preview'>('editor');
  const [copied, setCopied] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [showFiles, setShowFiles] = useState(true);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [pendingDiffs, setPendingDiffs] = useState<DiffEntry[]>([]);
  const [diffOpen, setDiffOpen] = useState(false);

  // Resolve runtime AI config: 'lumina' mode needs a JWT + proxy URL
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!aiConfig) { setAiRuntime(undefined); return; }
      if (aiConfig.mode === 'lumina') {
        const { data } = await supabase.auth.getSession();
        const jwt = data.session?.access_token;
        if (!jwt) { setAiRuntime(undefined); return; }
        if (!cancelled) setAiRuntime({
          mode: 'lumina',
          proxyUrl: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/codelab-proxy`,
          proxyAuth: jwt,
        });
      } else {
        setAiRuntime(aiConfig);
      }
    })();
    return () => { cancelled = true; };
  }, [aiConfig]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('codelab:incoming');
      if (raw) {
        const { language: lng, code: cd } = JSON.parse(raw);
        if (cd) {
          const ext = lng === 'jsx' || lng === 'tsx' ? lng : (lng === 'react' ? 'jsx' : (lng === 'javascript' ? 'js' : (lng === 'markdown' ? 'md' : (lng || 'txt'))));
          const path = `snippet.${ext}`;
          setProject((p) => {
            const without = p.files.filter((f) => f.path !== path);
            return { files: [...without, { path, content: cd }], activePath: path };
          });
        }
        sessionStorage.removeItem('codelab:incoming');
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); } catch {}
  }, [project]);

  const activeFile = useMemo(
    () => project.files.find((f) => f.path === project.activePath) ?? project.files[0],
    [project],
  );

  const projectDoc = useMemo(() => buildProjectSrcDoc(project, aiRuntime), [project, aiRuntime]);
  const canPreviewProject = projectDoc !== null;
  const activeLang = activeFile ? previewLangFromPath(activeFile.path) : 'text';
  const canPreviewActive = activeFile ? isPreviewable(activeLang) : false;

  const setActive = (path: string) => setProject((p) => ({ ...p, activePath: path }));
  const updateActiveContent = (content: string) => {
    setProject((p) => ({ ...p, files: p.files.map((f) => (f.path === p.activePath ? { ...f, content } : f)) }));
  };
  const addFile = () => {
    let base = 'new-file.js';
    let i = 1;
    while (project.files.some((f) => f.path === base)) base = `new-file-${i++}.js`;
    setProject((p) => ({ ...p, files: [...p.files, { path: base, content: '' }], activePath: base }));
    setRenamingPath(base);
    setRenameValue(base);
  };
  const deleteFile = (path: string) => {
    if (project.files.length <= 1) {
      toast({ title: 'Cannot delete the last file', variant: 'destructive' });
      return;
    }
    setProject((p) => {
      const files = p.files.filter((f) => f.path !== path);
      const activePath = p.activePath === path ? files[0].path : p.activePath;
      return { files, activePath };
    });
  };
  const startRename = (path: string) => { setRenamingPath(path); setRenameValue(path); };
  const commitRename = () => {
    if (!renamingPath) return;
    const next = renameValue.trim();
    if (!next || next === renamingPath) { setRenamingPath(null); return; }
    if (project.files.some((f) => f.path === next)) {
      toast({ title: 'A file with that name already exists', variant: 'destructive' });
      return;
    }
    setProject((p) => ({
      ...p,
      files: p.files.map((f) => (f.path === renamingPath ? { ...f, path: next } : f)),
      activePath: p.activePath === renamingPath ? next : p.activePath,
    }));
    setRenamingPath(null);
  };
  const resetProject = () => {
    if (!confirm('Reset to the starter project? Your current files will be lost.')) return;
    setProject(DEFAULT_PROJECT);
    setPreviewKey((k) => k + 1);
  };
  const onCopyActive = async () => {
    if (!activeFile) return;
    await navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const downloadProject = () => {
    const bundle = project.files.map((f) => `===== FILE: ${f.path} =====\n${f.content}\n`).join('\n');
    const blob = new Blob([bundle], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'lumina-project.txt'; a.click();
    URL.revokeObjectURL(url);
  };

  const onAsk = async () => {
    const q = prompt.trim();
    if (!q || !activeFile) return;
    setAskLoading(true);

    const fileList = project.files
      .map((f) => `\`\`\`${languageFromPath(f.path)} path=${f.path}\n${f.content}\n\`\`\``)
      .join('\n\n');

    const aiHint = `\n\nThe preview has an AI helper available: \`await LUMINA_AI("prompt", { system?, model? })\` returns a string. Use it for AI apps, AI chatbots, summarizers, generators, tutors, classifiers, and assistants. Never ask the student to paste provider fetch code for AI features; the Code Lab runtime handles Lumina, Lovable Gateway, and custom keys from AI Settings.`;

    let buf = '';
    await streamChat({
      messages: [{
        id: 'sys', role: 'user',
        content:
`You are editing a multi-file web project in Lumina Code Lab. The active file is "${activeFile.path}".

Current project files:

${fileList}${aiHint}

Student request: ${q}

Rules:
- Reply with ONE fenced code block PER file you change or create, e.g. \`\`\`html path=index.html\`.
- Output the COMPLETE new content of every changed/created file (no diffs, no "...").
- Only include files that change.
- Keep web demos as index.html + styles.css + app.js so they preview together.
- If the student asks for an AI chat/chatbot/assistant, build a real chat UI: message history, input/textarea, send button, loading state, Enter-to-send, assistant/user bubbles, and calls to LUMINA_AI() inside app.js.
- Pick an aesthetic that fits the request; never default to plain unstyled HTML.
- No prose outside the fenced blocks.`,
      }],
      onDelta: (d) => { buf += d; },
      onDone: () => {
        const blocks = parseFileBlocks(buf);
        if (blocks.length === 0) {
          toast({ title: "Couldn't parse Lumina's reply", description: 'Try again with a clearer request.', variant: 'destructive' });
          setPrompt(''); setAskLoading(false);
          return;
        }
        const existing = new Map(project.files.map((f) => [f.path, f.content]));
        const diffs: DiffEntry[] = blocks.map((b) => ({
          path: b.path,
          before: existing.get(b.path),
          after: b.content,
        }));
        setPendingDiffs(diffs);
        setDiffOpen(true);
        setPrompt(''); setAskLoading(false);
      },
      onError: (e) => {
        toast({ title: 'Lumina error', description: e.message, variant: 'destructive' });
        setAskLoading(false);
      },
    });
  };

  const applyDiffs = () => {
    setProject((p) => {
      const map = new Map(p.files.map((f) => [f.path, f]));
      for (const d of pendingDiffs) map.set(d.path, { path: d.path, content: d.after });
      const files = Array.from(map.values());
      return { files, activePath: pendingDiffs[0]?.path ?? p.activePath };
    });
    setPreviewKey((k) => k + 1);
    setDiffOpen(false);
    setPendingDiffs([]);
    toast({ title: `Applied ${pendingDiffs.length} change${pendingDiffs.length !== 1 ? 's' : ''}` });
  };
  const discardDiffs = () => { setDiffOpen(false); setPendingDiffs([]); };

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="h-14 border-b border-border/40 flex items-center px-3 gap-2 flex-shrink-0">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9 md:hidden" onClick={() => setShowFiles((s) => !s)} title="Toggle files">
          <FolderTree size={18} />
        </Button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-bold text-sm">Code Lab</span>
          <span className="text-xs text-muted-foreground truncate">{activeFile?.path ?? '—'}</span>
        </div>
        <Button
          variant="ghost" size="sm" onClick={() => setAiOpen(true)} className="h-8"
          title="AI settings for the preview"
        >
          <Settings size={14} />
          <span className="ml-1 text-xs hidden sm:inline">
            AI: {aiConfig ? (aiConfig.mode === 'custom' ? aiConfig.provider : aiConfig.mode) : 'off'}
          </span>
        </Button>
        <Button variant="ghost" size="sm" onClick={downloadProject} className="h-8 hidden sm:inline-flex">
          <Download size={14} /><span className="ml-1 text-xs">Export</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={onCopyActive} className="h-8">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span className="ml-1 text-xs">{copied ? 'Copied' : 'Copy'}</span>
        </Button>
        <Button size="sm" onClick={() => {
          setRunSnapshot({ doc: projectDoc, lang: activeLang, code: activeFile?.content ?? '' });
          setHasRun(true);
          setMobilePane('preview');
          setPreviewKey((k) => k + 1);
        }} disabled={!canPreviewProject && !canPreviewActive} className="h-8">
          <Play size={14} /><span className="ml-1 text-xs">Run</span>
        </Button>
      </header>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)_minmax(360px,1fr)] min-h-0">
        {showFiles && (
          <aside className="border-r border-border/40 bg-muted/20 flex flex-col min-h-0">
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/40">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Files</span>
              <div className="flex items-center gap-1">
                <button onClick={addFile} className="p-1 rounded hover:bg-background transition-colors" title="New file"><Plus size={13} /></button>
                <button onClick={resetProject} className="p-1 rounded hover:bg-background transition-colors text-muted-foreground" title="Reset project"><X size={13} /></button>
              </div>
            </div>
            <ul className="flex-1 overflow-auto p-1 space-y-0.5 text-xs">
              {project.files.map((f) => {
                const isActive = f.path === project.activePath;
                const isHtml = extOf(f.path) === 'html';
                return (
                  <li key={f.path}>
                    {renamingPath === f.path ? (
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingPath(null); }}
                        autoFocus className="h-7 text-xs"
                      />
                    ) : (
                      <div
                        className={`group flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer ${
                          isActive ? 'bg-background border border-border' : 'hover:bg-background/60'
                        }`}
                        onClick={() => setActive(f.path)}
                      >
                        {isHtml ? <FileCode size={12} className="text-primary" /> : <FileText size={12} className="text-muted-foreground" />}
                        <span className="flex-1 truncate font-mono">{f.path}</span>
                        <button onClick={(e) => { e.stopPropagation(); startRename(f.path); }} className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-primary" title="Rename"><Pencil size={11} /></button>
                        <button onClick={(e) => { e.stopPropagation(); deleteFile(f.path); }} className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-destructive" title="Delete"><Trash2 size={11} /></button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </aside>
        )}

        <section className={`flex-col min-h-0 border-r border-border/40 ${mobilePane === 'editor' ? 'flex' : 'hidden'} md:flex`}>
          <div className="px-3 py-1.5 border-b border-border/40 text-[11px] font-mono text-muted-foreground flex items-center justify-between">
            <span>{activeFile?.path}</span>
            <span className="uppercase tracking-wide">{languageFromPath(activeFile?.path ?? '')}</span>
          </div>
          <div className="flex-1 min-h-0">
            <Editor
              height="100%"
              language={languageFromPath(activeFile?.path ?? '')}
              value={activeFile?.content ?? ''}
              onChange={(v) => updateActiveContent(v ?? '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                fontLigatures: true,
                wordWrap: 'on',
                tabSize: 2,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                renderWhitespace: 'selection',
              }}
            />
          </div>
        </section>

        <section className={`flex-col min-h-0 bg-muted/20 ${mobilePane === 'preview' ? 'flex' : 'hidden'} md:flex`}>
          <div className="px-3 py-1.5 border-b border-border/40 text-[11px] font-mono text-muted-foreground flex items-center justify-between">
            <span>Preview</span>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] md:hidden" onClick={() => setMobilePane('editor')}>Edit</Button>
          </div>
          {!hasRun || !runSnapshot ? (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Press <span className="font-mono mx-1">Run</span> to preview your project.
            </div>
          ) : runSnapshot.doc ? (
            <iframe
              key={`proj-${previewKey}`}
              title="Project preview"
              sandbox="allow-scripts"
              srcDoc={runSnapshot.doc}
              className="flex-1 w-full bg-white border-0"
            />
          ) : isPreviewable(runSnapshot.lang) ? (
            <CodePreviewFrame
              key={`file-${previewKey}`}
              language={runSnapshot.lang}
              code={runSnapshot.code}
              ai={aiRuntime}
              className="flex-1 w-full bg-white border-0"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Live preview needs an <span className="font-mono mx-1">index.html</span> entry file or a previewable language
              (HTML/CSS/JS/React/Markdown).
            </div>
          )}
        </section>
      </div>

      <div className="border-t border-border/40 p-2 flex items-end gap-2 flex-shrink-0 pb-[calc(env(safe-area-inset-bottom,0px)+8px)]">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='Ask Lumina to build or change something — e.g. "make it a glassmorphism todo app with AI suggestions"'
          className="min-h-[42px] max-h-32 text-sm"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onAsk(); } }}
        />
        <Button onClick={onAsk} disabled={askLoading || !prompt.trim()} className="h-10">
          {askLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        </Button>
      </div>

      <AISettingsModal
        open={aiOpen}
        onOpenChange={setAiOpen}
        initial={aiConfig}
        onSave={(cfg) => { setAiConfig(cfg); saveAIConfig(cfg); }}
      />
      <DiffModal
        open={diffOpen}
        onOpenChange={setDiffOpen}
        diffs={pendingDiffs}
        onApply={applyDiffs}
        onDiscard={discardDiffs}
      />
    </div>
  );
}

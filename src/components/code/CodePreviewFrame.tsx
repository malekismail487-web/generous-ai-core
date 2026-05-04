import { useEffect, useMemo, useRef } from 'react';

export type AIConfig = {
  mode: 'lumina' | 'lovable' | 'custom';
  // For 'lumina' mode — we proxy through our edge function
  proxyUrl?: string;
  proxyAuth?: string; // user's supabase JWT
  // For 'lovable' mode — direct gateway call
  lovableKey?: string;
  // For 'custom' mode
  provider?: 'openai' | 'anthropic' | 'gemini';
  apiKey?: string;
  model?: string;
};

interface Props {
  language: string;
  code: string;
  srcDoc?: string;
  className?: string;
  ai?: AIConfig;
}

const PREVIEWABLE = new Set(['html', 'htm', 'js', 'javascript', 'css', 'jsx', 'tsx', 'react', 'markdown', 'md']);
export function isPreviewable(lang: string): boolean {
  return PREVIEWABLE.has((lang || '').toLowerCase());
}

// Build the LUMINA_AI runtime that lives inside the sandbox
function buildAIRuntime(ai?: AIConfig): string {
  if (!ai) {
    return `window.LUMINA_AI = async () => { throw new Error('AI is disabled in this preview. Open Code Lab → AI Settings to enable it.'); };`;
  }

  // We pass config via window.__LUMINA_AI_CFG so we don't have to escape it inline
  return `
window.__LUMINA_AI_CFG = ${JSON.stringify(ai)};
window.LUMINA_AI = async function(prompt, options) {
  options = options || {};
  const cfg = window.__LUMINA_AI_CFG;
  const system = options.system || 'You are a helpful assistant.';
  if (!prompt || typeof prompt !== 'string') throw new Error('LUMINA_AI(prompt) requires a string prompt.');

  if (cfg.mode === 'lumina') {
    const r = await fetch(cfg.proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.proxyAuth },
      body: JSON.stringify({ prompt: prompt, system: system, model: options.model }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'AI request failed');
    return j.text;
  }

  if (cfg.mode === 'lovable') {
    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.lovableKey },
      body: JSON.stringify({
        model: options.model || 'google/gemini-2.5-flash',
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error((j && j.error && j.error.message) || 'AI request failed');
    return j.choices[0].message.content;
  }

  if (cfg.mode === 'custom') {
    if (cfg.provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
        body: JSON.stringify({
          model: options.model || cfg.model || 'gpt-4o-mini',
          messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error((j && j.error && j.error.message) || 'OpenAI request failed');
      return j.choices[0].message.content;
    }
    if (cfg.provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: options.model || cfg.model || 'claude-3-5-haiku-latest',
          max_tokens: 1024,
          system: system,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error((j && j.error && j.error.message) || 'Anthropic request failed');
      return j.content[0].text;
    }
    if (cfg.provider === 'gemini') {
      const model = options.model || cfg.model || 'gemini-1.5-flash';
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + cfg.apiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error((j && j.error && j.error.message) || 'Gemini request failed');
      return j.candidates[0].content.parts[0].text;
    }
  }

  throw new Error('AI mode not configured.');
};
`;
}

function buildSrcDoc(language: string, code: string, ai?: AIConfig): string {
  const lang = (language || '').toLowerCase();
  const aiRuntime = buildAIRuntime(ai);

  if (lang === 'html' || lang === 'htm') {
    if (/<html[\s>]/i.test(code)) {
      // Inject AI runtime into <head>
      return code.replace(/<head([^>]*)>/i, `<head$1><script>${aiRuntime}<\/script>`);
    }
    return `<!doctype html><html><head><meta charset="utf-8"><script>${aiRuntime}<\/script><style>body{font-family:system-ui,sans-serif;padding:12px;color:#111;background:#fff}</style></head><body>${code}</body></html>`;
  }

  if (lang === 'css') {
    return `<!doctype html><html><head><meta charset="utf-8"><style>${code}</style></head><body><div class="demo"><h1>Heading</h1><p>Paragraph text for CSS preview.</p><button>Button</button></div></body></html>`;
  }

  if (lang === 'js' || lang === 'javascript') {
    return `<!doctype html><html><head><meta charset="utf-8"><script>${aiRuntime}<\/script><style>body{font-family:system-ui,sans-serif;padding:12px;background:#fff;color:#111}#__out{white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace;font-size:12px}</style></head><body><div id="__out"></div><script>
(function(){
  var out = document.getElementById('__out');
  function fmt(v){ try{ return typeof v==='object'?JSON.stringify(v,null,2):String(v); }catch(e){ return String(v); } }
  function write(prefix, args){ var line=document.createElement('div'); line.textContent=prefix+Array.from(args).map(fmt).join(' '); out.appendChild(line); }
  ['log','info','warn','error'].forEach(function(k){ var orig=console[k]; console[k]=function(){ write(k.toUpperCase()+': ', arguments); try{orig.apply(console, arguments);}catch(e){} }; });
  window.addEventListener('error', function(e){ write('ERROR: ', [e.message]); });
  window.addEventListener('unhandledrejection', function(e){ write('UNHANDLED: ', [e.reason && e.reason.message || e.reason]); });
  (async function(){
    try { ${code}\n } catch(e){ write('ERROR: ', [e && e.message || e]); }
  })();
})();
<\/script></body></html>`;
  }

  if (lang === 'jsx' || lang === 'tsx' || lang === 'react') {
    return `<!doctype html><html><head><meta charset="utf-8"><script>${aiRuntime}<\/script><style>body{font-family:system-ui,sans-serif;padding:12px;background:#fff;color:#111}</style>
<script src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
</head><body><div id="root"></div>
<script type="text/babel" data-presets="react,typescript">
try {
${code}
const __root = ReactDOM.createRoot(document.getElementById('root'));
__root.render(React.createElement(typeof App !== 'undefined' ? App : (() => React.createElement('div', null, 'Define an App component to preview.'))));
} catch(e) { document.body.innerHTML = '<pre style="color:#b00">'+(e && e.message || e)+'</pre>'; }
<\/script></body></html>`;
  }

  if (lang === 'markdown' || lang === 'md') {
    const escaped = code.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
    return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;padding:12px;background:#fff;color:#111}pre{white-space:pre-wrap}</style></head><body><pre>${escaped}</pre></body></html>`;
  }

  return `<!doctype html><html><body><pre style="padding:12px;font-family:ui-monospace,monospace">Preview not available for "${lang}". Copy the code and run it locally or paste into GitHub.</pre></body></html>`;
}

export function CodePreviewFrame({ language, code, srcDoc, className, ai }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const doc = useMemo(() => srcDoc ?? buildSrcDoc(language, code, ai), [language, code, srcDoc, ai]);

  return (
    <iframe
      ref={iframeRef}
      title="Code preview"
      sandbox="allow-scripts"
      srcDoc={doc}
      className={className ?? 'w-full h-64 rounded-lg border border-border bg-white'}
    />
  );
}

// Helper used by CodeLab to inject AI runtime into a multi-file project's index.html
export function injectAIRuntime(html: string, ai?: AIConfig): string {
  const runtime = buildAIRuntime(ai);
  if (/<head([^>]*)>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1><script>${runtime}<\/script>`);
  }
  return `<script>${runtime}<\/script>` + html;
}

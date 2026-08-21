import { useEffect, useMemo, useRef } from 'react';

export type AIConfig = {
  mode: 'lumina';
  // These values stay in the parent application and are never embedded in srcDoc.
  proxyUrl?: string;
  proxyAuth?: string;
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

// The untrusted preview can request AI work, but never receives a credential or URL.
function buildAIRuntime(ai?: AIConfig): string {
  if (!ai) {
    return `window.LUMINA_AI = async () => { throw new Error('AI features require an authenticated Lumina session.'); };`;
  }

  return `
window.LUMINA_AI = async function(prompt, options) {
  options = options || {};
  const system = options.system || 'You are a helpful assistant.';
  if (!prompt || typeof prompt !== 'string') throw new Error('LUMINA_AI(prompt) requires a string prompt.');
  if (prompt.length > 20000 || String(system).length > 10000) throw new Error('AI request is too large.');
  const requestId = 'lumina-ai-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  return await new Promise(function(resolve, reject) {
    const timeout = setTimeout(function() {
      window.removeEventListener('message', onMessage);
      reject(new Error('AI request timed out.'));
    }, 35000);
    function onMessage(event) {
      if (event.source !== window.parent || !event.data || event.data.type !== 'lumina-ai-response' || event.data.requestId !== requestId) return;
      clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      if (event.data.ok) resolve(event.data.text);
      else reject(new Error(event.data.error || 'AI request failed.'));
    }
    window.addEventListener('message', onMessage);
    window.parent.postMessage({
      type: 'lumina-ai-request',
      requestId: requestId,
      prompt: prompt,
      system: String(system),
      model: typeof options.model === 'string' ? options.model : undefined
    }, '*');
  });
};
`;
}

function buildSrcDoc(language: string, code: string, ai?: AIConfig): string {
  const lang = (language || '').toLowerCase();
  const aiRuntime = buildAIRuntime(ai);

  if (lang === 'html' || lang === 'htm') {
    if (/<html[\s>]/i.test(code)) {
      return code.replace(/<head([^>]*)>/i, `<head$1><script>${aiRuntime}</script>`);
    }
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>${aiRuntime}</script><style>html,body{min-height:100%;margin:0}body{font-family:system-ui,sans-serif;color:#111;background:#fff}</style></head><body>${code}</body></html>`;
  }

  if (lang === 'css') {
    return `<!doctype html><html><head><meta charset="utf-8"><style>${code}</style></head><body><div class="demo"><h1>Heading</h1><p>Paragraph text for CSS preview.</p><button>Button</button></div></body></html>`;
  }

  if (lang === 'js' || lang === 'javascript') {
    return `<!doctype html><html><head><meta charset="utf-8"><script>${aiRuntime}</script><style>body{font-family:system-ui,sans-serif;padding:12px;background:#fff;color:#111}#__out{white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace;font-size:12px}</style></head><body><div id="__out"></div><script>
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
</script></body></html>`;
  }

  if (lang === 'jsx' || lang === 'tsx' || lang === 'react') {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>${aiRuntime}</script><style>html,body,#root{min-height:100%;margin:0}body{font-family:system-ui,sans-serif;background:#fff;color:#111}</style>
<script src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head><body><div id="root"></div>
<script type="text/babel" data-presets="react,typescript">
try {
${code}
const __root = ReactDOM.createRoot(document.getElementById('root'));
__root.render(React.createElement(typeof App !== 'undefined' ? App : (() => React.createElement('div', null, 'Define an App component to preview.'))));
} catch(e) { document.body.innerHTML = '<pre style="color:#b00">'+(e && e.message || e)+'</pre>'; }
</script></body></html>`;
  }

  if (lang === 'markdown' || lang === 'md') {
    const escaped = code.replace(/[&<>]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character] as string);
    return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;padding:12px;background:#fff;color:#111}pre{white-space:pre-wrap}</style></head><body><pre>${escaped}</pre></body></html>`;
  }

  return `<!doctype html><html><body><pre style="padding:12px;font-family:ui-monospace,monospace">Preview not available for "${lang}". Copy the code and run it locally or paste into GitHub.</pre></body></html>`;
}

export function CodePreviewFrame({ language, code, srcDoc, className, ai }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const doc = useMemo(() => srcDoc ?? buildSrcDoc(language, code, ai), [language, code, srcDoc, ai]);

  useEffect(() => {
    if (!ai?.proxyUrl || !ai.proxyAuth) return;

    const handleMessage = async (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const request = event.data as Record<string, unknown> | null;
      if (!request || request.type !== 'lumina-ai-request') return;

      const requestId = typeof request.requestId === 'string' ? request.requestId : '';
      const prompt = typeof request.prompt === 'string' ? request.prompt : '';
      const system = typeof request.system === 'string' ? request.system : '';
      const model = typeof request.model === 'string' ? request.model : undefined;
      const respond = (payload: Record<string, unknown>) => {
        iframeRef.current?.contentWindow?.postMessage({ type: 'lumina-ai-response', requestId, ...payload }, '*');
      };

      if (!requestId || requestId.length > 128 || !prompt || prompt.length > 20000 || system.length > 10000 || (model?.length ?? 0) > 200) {
        respond({ ok: false, error: 'Invalid AI request.' });
        return;
      }

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(ai.proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.proxyAuth}` },
          body: JSON.stringify({ prompt, system, model }),
          signal: controller.signal,
        });
        const result = await response.json() as { text?: unknown };
        if (!response.ok || typeof result.text !== 'string') throw new Error('proxy-failure');
        respond({ ok: true, text: result.text });
      } catch {
        respond({ ok: false, error: 'AI request failed.' });
      } finally {
        window.clearTimeout(timeout);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [ai?.proxyAuth, ai?.proxyUrl]);

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

// Helper used by CodeLab to inject the credential-free runtime into a multi-file preview.
export function injectAIRuntime(html: string, ai?: AIConfig): string {
  const runtime = buildAIRuntime(ai);
  if (/<head([^>]*)>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1><script>${runtime}</script>`);
  }
  return `<script>${runtime}</script>` + html;
}

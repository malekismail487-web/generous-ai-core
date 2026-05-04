import { useMemo, useRef } from 'react';

interface Props {
  language: string;
  code: string;
  // Optional override for combined HTML doc (used by Code Lab multi-file mode)
  srcDoc?: string;
  className?: string;
}

const PREVIEWABLE = new Set(['html', 'htm', 'js', 'javascript', 'css', 'jsx', 'tsx', 'react', 'markdown', 'md']);

export function isPreviewable(lang: string): boolean {
  return PREVIEWABLE.has((lang || '').toLowerCase());
}

function buildSrcDoc(language: string, code: string): string {
  const lang = (language || '').toLowerCase();

  if (lang === 'html' || lang === 'htm') {
    // Treat as full document if it looks like one, else wrap
    if (/<html[\s>]/i.test(code)) return code;
    return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;padding:12px;color:#111;background:#fff}</style></head><body>${code}</body></html>`;
  }

  if (lang === 'css') {
    return `<!doctype html><html><head><meta charset="utf-8"><style>${code}</style></head><body><div class="demo"><h1>Heading</h1><p>Paragraph text for CSS preview.</p><button>Button</button></div></body></html>`;
  }

  if (lang === 'js' || lang === 'javascript') {
    return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;padding:12px;background:#fff;color:#111}#__out{white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace;font-size:12px}</style></head><body><div id="__out"></div><script>
(function(){
  var out = document.getElementById('__out');
  function fmt(v){ try{ return typeof v==='object'?JSON.stringify(v,null,2):String(v); }catch(e){ return String(v); } }
  function write(prefix, args){ var line=document.createElement('div'); line.textContent=prefix+Array.from(args).map(fmt).join(' '); out.appendChild(line); }
  ['log','info','warn','error'].forEach(function(k){ var orig=console[k]; console[k]=function(){ write(k.toUpperCase()+': ', arguments); try{orig.apply(console, arguments);}catch(e){} }; });
  window.addEventListener('error', function(e){ write('ERROR: ', [e.message]); });
  try { ${code}\n } catch(e){ write('ERROR: ', [e && e.message || e]); }
})();
<\/script></body></html>`;
  }

  if (lang === 'jsx' || lang === 'tsx' || lang === 'react') {
    return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;padding:12px;background:#fff;color:#111}</style>
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

export function CodePreviewFrame({ language, code, srcDoc, className }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const doc = useMemo(() => srcDoc ?? buildSrcDoc(language, code), [language, code, srcDoc]);

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

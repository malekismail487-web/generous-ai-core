window.__orchestra_errors = [];
window.addEventListener('error', (e) => window.__orchestra_errors.push(String(e.message).slice(0,200)));
window.addEventListener('unhandledrejection', (e) => window.__orchestra_errors.push('rejection:'+String(e.reason).slice(0,180)));
(() => { const orig = console.error; console.error = (...a) => { window.__orchestra_errors.push(a.map(String).join(' ').slice(0,200)); orig(...a); }; })();
window.__frames = 0;

/**
 * ORCHESTRA O7 — Playtest Rig: the workers' EYES (browser half)
 * ------------------------------------------------------------
 * Injected into ANY generated scene. Runs the full perception battery and
 * returns a PerceptionReport-compatible JSON:
 *   motion (animation liveness) · palette · edges · physics (Rapier replay
 *   determinism) · audio (offline render analysis) · playtest (fuzz +
 *   latency + crash watch).
 * Loaded by run.mjs via page.addScriptTag; error hooks install via
 * evaluateOnNewDocument BEFORE scene scripts run.
 */

export const ERROR_HOOK = `
if (!window.__orchestra_errors) {
  window.__orchestra_errors = [];
  window.addEventListener('error', (e) => window.__orchestra_errors.push(String(e.message).slice(0,200)));
  window.addEventListener('unhandledrejection', (e) => window.__orchestra_errors.push('rejection:'+String(e.reason).slice(0,180)));
  (() => { const orig = console.error; console.error = (...a) => { window.__orchestra_errors.push(a.map(String).join(' ').slice(0,200)); orig(...a); }; })();
}
if (typeof window.__frames !== 'number') window.__frames = 0;
window.__latency = { last: null };
addEventListener('orchestra:ping', () => { window.__latency.last = { sent: performance.now(), frame: performance.now() }; }, { passive: true });
`;

function luma(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h).data;
  return d;
}

export const BATTERY = `
(async () => {
  const report = { errors: window.__orchestra_errors || [] };

  // ---------- grab two canvas frames for motion + stills ----------
  const src = document.querySelector('canvas');
  if (!src) return { fatal: 'no_canvas', ...report };
  const W = 256, H = Math.max(1, Math.round(256 * src.height / src.width));
  const grab = () => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0, W, H);
    return g.getImageData(0, 0, W, H).data;
  };
  const f1 = grab();
  await new Promise(r => setTimeout(r, 700));
  const f2 = grab();
  await new Promise(r => setTimeout(r, 700));
  const f3 = grab();

  // ---------- motion: mean abs luma delta across pairs ----------
  const luma = (d, i) => 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2];
  let dSum = 0, dN = 0;
  for (let i = 0; i < f1.length; i += 4) {
    dSum += Math.abs(luma(f1,i) - luma(f2,i)) + Math.abs(luma(f2,i) - luma(f3,i));
    dN += 2;
  }
  report.motion = { meanFrameDelta: +(dSum/dN).toFixed(3), samples: 2 };

  // ---------- palette + edges from f3 ----------
  const hist = new Array(8).fill(0);
  let sum = 0;
  for (let i = 0; i < f3.length; i += 4) {
    const l = luma(f3, i); sum += l; hist[Math.min(7, Math.floor(l/32))]++;
  }
  const meanLum = +(sum / (f3.length/4)).toFixed(2);
  report.palette = { histogram: hist, meanLuminance: meanLum };

  let edges = 0, edgeN = 0;
  for (let y = 1; y < H-1; y++) for (let x = 1; x < W-1; x++) {
    const i = (y*W+x)*4;
    const gx = Math.abs(luma(f3,i+4)-luma(f3,i-4)), gy = Math.abs(luma(f3,i+W*4)-luma(f3,i-W*4));
    if (gx+gy > 40) edges++;
    edgeN++;
  }
  report.edges = { edgeRatio: +(edges/edgeN).toFixed(4) };

  // ---------- physics (scene-provided hook) ----------
  try {
    if (window.__physicsReplay) report.physics = await window.__physicsReplay();
    else report.physics = { replayHashA: 'n/a', replayHashB: 'n/a', energyDrift: 0, tunnelRate: 0 };
  } catch (e) { report.physics = { replayHashA: 'err', replayHashB: 'err', energyDrift: 1, tunnelRate: 1 }; report.errors.push('physics:'+String(e).slice(0,150)); }

  // ---------- audio (offline render result or live render) ----------
  try {
    if (window.__audioResult) report.audio = window.__audioResult;
    else if (window.__audioRender) report.audio = await window.__audioRender();
    else report.audio = { rms: 0, peak: 0, spectralCentroidHz: 0, durationSec: 0 };
  } catch (e) { report.audio = { rms: 0, peak: 0, spectralCentroidHz: 0, durationSec: 0 }; report.errors.push('audio:'+String(e).slice(0,150)); }

  // ---------- playtest: fuzz + latency + loop liveness ----------
  const framesBefore = window.__frames || 0;
  const errorsBefore = report.errors.length;
  const fuzzStart = performance.now();
  for (let i = 0; i < 120; i++) {
    const x = 10 + (i * 37) % (innerWidth - 20), y = 10 + (i * 53) % (innerHeight - 20);
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y, bubbles: true }));
    if (i % 17 === 0) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    if (i % 17 === 0) window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', bubbles: true }));
    await new Promise(r => setTimeout(r, 12));
  }
  // input→frame latency proxy: dispatch ping, await next rAF timestamp
  const latency = await new Promise((res) => {
    const sentAt = performance.now();
    window.dispatchEvent(new Event('orchestra:ping'));
    requestAnimationFrame(() => res(performance.now() - sentAt));
  });
  await new Promise(r => setTimeout(r, 250));
  const fuzzEnd = performance.now();
  report.playtest = {
    injectedEvents: 120,
    consoleErrors: report.errors.slice(0, 20),
    framesAdvanced: (window.__frames || 0) - framesBefore,
    windowMs: Math.round(fuzzEnd - fuzzStart),
    inputLatencyMs: +latency.toFixed(1),
  };
  report.errorsAfterFuzz = report.errors.length - errorsBefore;
  report.wallMs = Math.round(performance.now() - fuzzStart);
  return report;
})()
`;

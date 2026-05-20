import type { DiagramSpec, Palette } from './types';

/** Render a lightweight informative SVG diagram from a diagram_spec.
 *  Returns an SVG string with width/height attributes set. */
export function renderDiagramSVG(spec: DiagramSpec, palette: Palette): string {
  const W = 720, H = 360;
  const { primary, accent, secondary, surface } = palette;
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const nodes = spec.nodes || [];
  const edges = spec.edges || [];

  // Position nodes by kind.
  type Pt = { x: number; y: number };
  const pts: Record<string, Pt> = {};

  if (spec.kind === 'cycle') {
    const cx = W / 2, cy = H / 2 - 10, r = Math.min(W, H) * 0.32;
    nodes.forEach((n, i) => {
      const a = (i / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
      pts[n.id] = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    });
  } else if (spec.kind === 'compare') {
    const half = nodes.length / 2;
    nodes.forEach((n, i) => {
      const col = i < half ? 0 : 1;
      const rowCount = Math.ceil(half);
      const row = i < half ? i : i - Math.ceil(half);
      pts[n.id] = {
        x: col === 0 ? W * 0.25 : W * 0.75,
        y: 80 + row * ((H - 140) / Math.max(rowCount, 1)),
      };
    });
  } else {
    // flow / anatomy / chart -> horizontal flow
    const gap = (W - 120) / Math.max(nodes.length - 1, 1);
    nodes.forEach((n, i) => {
      pts[n.id] = { x: 60 + i * gap, y: H / 2 };
    });
  }

  const nodeRects = nodes.map((n) => {
    const p = pts[n.id];
    if (!p) return '';
    const text = esc(n.label);
    const w = Math.max(110, Math.min(180, text.length * 8 + 24));
    const h = 56;
    return `
      <g>
        <rect x="${p.x - w / 2}" y="${p.y - h / 2}" rx="10" ry="10" width="${w}" height="${h}"
              fill="${surface}" stroke="${primary}" stroke-width="1.5"/>
        <text x="${p.x}" y="${p.y + 5}" font-family="Inter, system-ui, sans-serif" font-size="13"
              fill="${primary}" text-anchor="middle">${wrap(text, 22)}</text>
      </g>`;
  }).join('');

  const arrowDef = `
    <defs>
      <marker id="ar" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,6 L9,3 z" fill="${accent}"/>
      </marker>
    </defs>`;

  const edgeLines = edges.map((e) => {
    const a = pts[e.from], b = pts[e.to];
    if (!a || !b) return '';
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 - 18;
    const label = e.label ? `<text x="${mx}" y="${my}" font-family="Inter, sans-serif" font-size="11" fill="${secondary}" text-anchor="middle">${esc(e.label)}</text>` : '';
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${accent}" stroke-width="1.6" marker-end="url(#ar)" />${label}`;
  }).join('');

  // Cycle: draw arrows around the ring even if edges weren't given.
  const ringEdges = spec.kind === 'cycle' && edges.length === 0
    ? nodes.map((n, i) => {
        const a = pts[n.id];
        const b = pts[nodes[(i + 1) % nodes.length].id];
        return a && b ? `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${accent}" stroke-width="1.6" marker-end="url(#ar)" />` : '';
      }).join('')
    : '';

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="white"/>
  ${arrowDef}
  ${edgeLines}
  ${ringEdges}
  ${nodeRects}
  <text x="${W / 2}" y="${H - 14}" font-family="Inter, sans-serif" font-size="12" fill="${secondary}" text-anchor="middle">${esc(spec.caption || '')}</text>
</svg>`.trim();
}

function wrap(text: string, max: number): string {
  // tspan word wrap helper — single line if it fits, otherwise split into 2.
  if (text.length <= max) return text;
  const words = text.split(' ');
  const lines: string[] = ['', ''];
  let i = 0;
  for (const w of words) {
    if ((lines[i] + ' ' + w).trim().length > max && i === 0) i = 1;
    lines[i] = (lines[i] + ' ' + w).trim();
  }
  return `<tspan x="${0}" dy="-6">${lines[0]}</tspan><tspan x="${0}" dy="14">${lines[1]}</tspan>`
    .replace(/x="0"/g, '');
}

/** Convert an SVG string into a PNG data URL using <canvas>. */
export async function svgToPngDataUrl(svg: string, scale = 2): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('no ctx')); return; }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

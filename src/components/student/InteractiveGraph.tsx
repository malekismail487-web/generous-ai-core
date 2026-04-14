import { useRef, useEffect, useState, useCallback } from 'react';
import { Maximize2 } from 'lucide-react';

interface InteractiveGraphProps {
  equations: string[];
  width?: number;
  height?: number;
  onExpand?: () => void;
  compact?: boolean;
}

const COLORS = ['#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];

// Lightweight math expression parser
function parseMathExpr(expr: string): ((x: number) => number) | null {
  try {
    // Clean the expression
    let cleaned = expr.trim();
    // Remove "y=" or "f(x)=" prefix
    cleaned = cleaned.replace(/^[yf]\s*\(?x?\)?\s*=\s*/i, '');
    
    // Replace common math notation with JS equivalents
    cleaned = cleaned
      .replace(/\^/g, '**')
      .replace(/sin/g, 'Math.sin')
      .replace(/cos/g, 'Math.cos')
      .replace(/tan/g, 'Math.tan')
      .replace(/log/g, 'Math.log10')
      .replace(/ln/g, 'Math.log')
      .replace(/sqrt/g, 'Math.sqrt')
      .replace(/abs/g, 'Math.abs')
      .replace(/pi/gi, 'Math.PI')
      .replace(/e(?![a-zA-Z])/g, 'Math.E')
      // Handle implicit multiplication: 2x → 2*x, x(... → x*(
      .replace(/(\d)([a-zA-Z(])/g, '$1*$2')
      .replace(/([)])(\d)/g, '$1*$2')
      .replace(/([)])([(])/g, '$1*$2');

    // Validate: only allow safe characters
    if (/[^0-9x+\-*/.()Math\s,sincotaglbqrtpPIE]/.test(cleaned.replace(/Math\.\w+/g, ''))) {
      return null;
    }

    const fn = new Function('x', `"use strict"; try { return ${cleaned}; } catch { return NaN; }`) as (x: number) => number;
    // Quick test
    fn(0); fn(1);
    return fn;
  } catch {
    return null;
  }
}

export function InteractiveGraph({ equations, width = 300, height = 200, onExpand, compact = false }: InteractiveGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewState, setViewState] = useState({ cx: 0, cy: 0, scale: 40 }); // scale = pixels per unit
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const pinchStart = useRef<number | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const { cx, cy, scale } = viewState;

    // Background
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
      ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--background').trim()})`
      : '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // World-to-screen transform
    const toScreenX = (wx: number) => width / 2 + (wx - cx) * scale;
    const toScreenY = (wy: number) => height / 2 - (wy - cy) * scale;
    const toWorldX = (sx: number) => (sx - width / 2) / scale + cx;
    const toWorldY = (sy: number) => -(sy - height / 2) / scale + cy;

    // Grid lines
    const gridStep = getGridStep(scale);
    const xMin = toWorldX(0);
    const xMax = toWorldX(width);
    const yMin = toWorldY(height);
    const yMax = toWorldY(0);

    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border').trim()
      ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--border').trim()} / 0.3)`
      : 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;

    for (let x = Math.ceil(xMin / gridStep) * gridStep; x <= xMax; x += gridStep) {
      const sx = toScreenX(x);
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, height); ctx.stroke();
    }
    for (let y = Math.ceil(yMin / gridStep) * gridStep; y <= yMax; y += gridStep) {
      const sy = toScreenY(y);
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(width, sy); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()
      ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()} / 0.4)`
      : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    const originX = toScreenX(0);
    const originY = toScreenY(0);
    if (originX >= 0 && originX <= width) {
      ctx.beginPath(); ctx.moveTo(originX, 0); ctx.lineTo(originX, height); ctx.stroke();
    }
    if (originY >= 0 && originY <= height) {
      ctx.beginPath(); ctx.moveTo(0, originY); ctx.lineTo(width, originY); ctx.stroke();
    }

    // Axis labels
    if (!compact) {
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground').trim()
        ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground').trim()})`
        : 'rgba(255,255,255,0.4)';
      ctx.font = '9px system-ui';
      ctx.textAlign = 'center';
      for (let x = Math.ceil(xMin / gridStep) * gridStep; x <= xMax; x += gridStep) {
        if (Math.abs(x) < 0.001) continue;
        const sx = toScreenX(x);
        const label = Number.isInteger(x) ? x.toString() : x.toFixed(1);
        ctx.fillText(label, sx, Math.min(Math.max(originY + 12, 12), height - 2));
      }
      ctx.textAlign = 'right';
      for (let y = Math.ceil(yMin / gridStep) * gridStep; y <= yMax; y += gridStep) {
        if (Math.abs(y) < 0.001) continue;
        const sy = toScreenY(y);
        const label = Number.isInteger(y) ? y.toString() : y.toFixed(1);
        ctx.fillText(label, Math.min(Math.max(originX - 4, 20), width - 2), sy + 3);
      }
    }

    // Plot equations
    equations.forEach((eq, idx) => {
      const fn = parseMathExpr(eq);
      if (!fn) return;

      ctx.strokeStyle = COLORS[idx % COLORS.length];
      ctx.lineWidth = compact ? 1.5 : 2;
      ctx.beginPath();
      let started = false;

      const step = (xMax - xMin) / (width * 2);
      for (let wx = xMin; wx <= xMax; wx += step) {
        const wy = fn(wx);
        if (!isFinite(wy) || Math.abs(wy) > 1e6) {
          started = false;
          continue;
        }
        const sx = toScreenX(wx);
        const sy = toScreenY(wy);
        if (!started) {
          ctx.moveTo(sx, sy);
          started = true;
        } else {
          ctx.lineTo(sx, sy);
        }
      }
      ctx.stroke();
    });
  }, [equations, viewState, width, height, compact]);

  useEffect(() => { draw(); }, [draw]);

  // Mouse/touch handlers for pan & zoom
  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setViewState(prev => ({
      ...prev,
      cx: prev.cx - dx / prev.scale,
      cy: prev.cy + dy / prev.scale,
    }));
  };

  const handlePointerUp = () => { isDragging.current = false; };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setViewState(prev => ({ ...prev, scale: Math.max(5, Math.min(500, prev.scale * factor)) }));
  };

  // Touch pinch zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStart.current = Math.hypot(dx, dy);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStart.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / pinchStart.current;
      pinchStart.current = dist;
      setViewState(prev => ({ ...prev, scale: Math.max(5, Math.min(500, prev.scale * factor)) }));
    }
  };

  return (
    <div className="relative rounded-xl overflow-hidden border border-border/30 bg-card/50 group" style={{ width, height }}>
      <canvas
        ref={canvasRef}
        style={{ width, height, cursor: 'grab' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
      />
      {onExpand && (
        <button
          onClick={onExpand}
          className="absolute top-1.5 right-1.5 p-1 rounded-md bg-background/70 backdrop-blur-sm border border-border/30 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Maximize2 size={12} className="text-foreground" />
        </button>
      )}
      {/* Equation labels */}
      {!compact && equations.length > 0 && (
        <div className="absolute bottom-1.5 left-1.5 flex flex-col gap-0.5">
          {equations.map((eq, i) => (
            <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-background/70 backdrop-blur-sm" style={{ color: COLORS[i % COLORS.length] }}>
              {eq}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function getGridStep(scale: number): number {
  const candidates = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
  const idealPixels = 50;
  for (const step of candidates) {
    if (step * scale >= idealPixels) return step;
  }
  return 100;
}

import { useEffect, useMemo, useRef } from 'react';
import { useCalmMotion } from '@/lib/motion';

/**
 * AbstractField — the interactive geometry bed.
 *
 * A layer of abstract shapes (rings, arcs, capsules, polygons, filaments)
 * that drift on their own and lean toward the pointer with per-shape depth,
 * so the whole field parallaxes like a stack of glass plates. Tapping or
 * clicking anywhere drops a ripple that expands and dissolves.
 *
 * Works with mouse and touch. Purely decorative: pointer-events are off,
 * listeners are passive, and everything is skipped under reduced motion.
 */

interface Shape {
  kind: 'ring' | 'arc' | 'capsule' | 'triangle' | 'square' | 'cross' | 'dot';
  /** percentage position within the field */
  x: number;
  y: number;
  /** px */
  size: number;
  rotate: number;
  /** 0 (far) → 1 (near). Drives parallax amount and opacity. */
  depth: number;
  spin: number;
  drift: number;
  delay: number;
}

const PRESETS: Record<string, Shape[]> = {
  // A calm scattering for content-heavy dashboards.
  ambient: [
    { kind: 'ring', x: 8, y: 18, size: 220, rotate: 0, depth: 0.18, spin: 120, drift: 26, delay: 0 },
    { kind: 'arc', x: 86, y: 26, size: 260, rotate: 22, depth: 0.32, spin: 90, drift: 22, delay: -6 },
    { kind: 'capsule', x: 68, y: 74, size: 180, rotate: -14, depth: 0.5, spin: 0, drift: 18, delay: -11 },
    { kind: 'triangle', x: 22, y: 78, size: 120, rotate: 12, depth: 0.62, spin: 70, drift: 20, delay: -3 },
    { kind: 'dot', x: 48, y: 12, size: 10, rotate: 0, depth: 0.8, spin: 0, drift: 30, delay: -8 },
    { kind: 'cross', x: 92, y: 62, size: 28, rotate: 0, depth: 0.74, spin: 40, drift: 24, delay: -14 },
    { kind: 'square', x: 12, y: 52, size: 64, rotate: 18, depth: 0.44, spin: 55, drift: 16, delay: -17 },
  ],
  // A denser, more theatrical composition for landings and gates.
  landing: [
    { kind: 'ring', x: -4, y: 12, size: 420, rotate: 0, depth: 0.14, spin: 160, drift: 30, delay: 0 },
    { kind: 'ring', x: 84, y: 8, size: 300, rotate: 0, depth: 0.22, spin: 140, drift: 26, delay: -9 },
    { kind: 'arc', x: 70, y: 58, size: 380, rotate: -30, depth: 0.3, spin: 110, drift: 28, delay: -4 },
    { kind: 'arc', x: 14, y: 82, size: 300, rotate: 140, depth: 0.4, spin: 130, drift: 24, delay: -15 },
    { kind: 'capsule', x: 40, y: 30, size: 240, rotate: 34, depth: 0.52, spin: 0, drift: 22, delay: -7 },
    { kind: 'capsule', x: 88, y: 84, size: 160, rotate: -22, depth: 0.6, spin: 0, drift: 20, delay: -19 },
    { kind: 'triangle', x: 26, y: 20, size: 150, rotate: -8, depth: 0.66, spin: 80, drift: 24, delay: -12 },
    { kind: 'triangle', x: 62, y: 90, size: 96, rotate: 30, depth: 0.7, spin: 95, drift: 18, delay: -2 },
    { kind: 'square', x: 8, y: 44, size: 88, rotate: 14, depth: 0.48, spin: 60, drift: 18, delay: -21 },
    { kind: 'square', x: 78, y: 36, size: 54, rotate: -12, depth: 0.76, spin: 45, drift: 22, delay: -5 },
    { kind: 'cross', x: 50, y: 66, size: 34, rotate: 0, depth: 0.82, spin: 35, drift: 26, delay: -10 },
    { kind: 'cross', x: 32, y: 6, size: 22, rotate: 0, depth: 0.88, spin: 30, drift: 30, delay: -16 },
    { kind: 'dot', x: 92, y: 48, size: 12, rotate: 0, depth: 0.9, spin: 0, drift: 34, delay: -13 },
    { kind: 'dot', x: 18, y: 34, size: 8, rotate: 0, depth: 0.86, spin: 0, drift: 32, delay: -6 },
    { kind: 'dot', x: 58, y: 46, size: 6, rotate: 0, depth: 0.94, spin: 0, drift: 36, delay: -18 },
  ],
};

function ShapeGlyph({ shape }: { shape: Shape }) {
  const stroke = 'hsl(var(--foreground) / 0.5)';
  const common = { fill: 'none', stroke, strokeWidth: 1, vectorEffect: 'non-scaling-stroke' as const };

  switch (shape.kind) {
    case 'ring':
      return (
        <svg viewBox="0 0 100 100" width={shape.size} height={shape.size}>
          <circle cx="50" cy="50" r="48" {...common} />
          <circle cx="50" cy="50" r="34" {...common} strokeDasharray="3 6" />
        </svg>
      );
    case 'arc':
      return (
        <svg viewBox="0 0 100 100" width={shape.size} height={shape.size}>
          <path d="M 4 50 A 46 46 0 0 1 96 50" {...common} />
          <path d="M 18 50 A 32 32 0 0 1 82 50" {...common} strokeDasharray="2 8" />
        </svg>
      );
    case 'capsule':
      return (
        <svg viewBox="0 0 100 44" width={shape.size} height={shape.size * 0.44}>
          <rect x="1" y="1" width="98" height="42" rx="21" {...common} />
          <line x1="18" y1="22" x2="82" y2="22" {...common} strokeDasharray="1 7" />
        </svg>
      );
    case 'triangle':
      return (
        <svg viewBox="0 0 100 88" width={shape.size} height={shape.size * 0.88}>
          <path d="M50 3 L97 85 L3 85 Z" {...common} />
        </svg>
      );
    case 'square':
      return (
        <svg viewBox="0 0 100 100" width={shape.size} height={shape.size}>
          <rect x="2" y="2" width="96" height="96" rx="14" {...common} />
        </svg>
      );
    case 'cross':
      return (
        <svg viewBox="0 0 100 100" width={shape.size} height={shape.size}>
          <line x1="50" y1="4" x2="50" y2="96" {...common} />
          <line x1="4" y1="50" x2="96" y2="50" {...common} />
        </svg>
      );
    case 'dot':
    default:
      return (
        <svg viewBox="0 0 100 100" width={shape.size} height={shape.size}>
          <circle cx="50" cy="50" r="46" fill="hsl(var(--foreground) / 0.35)" />
        </svg>
      );
  }
}

interface AbstractFieldProps {
  variant?: keyof typeof PRESETS;
  /** 0–1. How far shapes lean toward the pointer. */
  reactivity?: number;
  /** Drop an expanding ripple wherever the user clicks or taps. */
  ripples?: boolean;
  className?: string;
}

export function AbstractField({
  variant = 'ambient',
  reactivity = 1,
  ripples = true,
  className = '',
}: AbstractFieldProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const calm = useCalmMotion();
  const shapes = useMemo(() => PRESETS[variant] ?? PRESETS.ambient, [variant]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || calm) return;

    // Pointer is tracked in normalised (-1 → 1) space and eased toward, so the
    // field glides rather than snapping to every jitter of the mouse.
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let frame = 0;

    const onPointer = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      targetX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      targetY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    };

    const onLeave = () => {
      targetX = 0;
      targetY = 0;
    };

    const spawnRipple = (event: PointerEvent) => {
      if (!ripples) return;
      const rect = host.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'abstract-ripple';
      ripple.style.left = `${event.clientX - rect.left}px`;
      ripple.style.top = `${event.clientY - rect.top}px`;
      host.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 1100);
    };

    const tick = () => {
      currentX += (targetX - currentX) * 0.055;
      currentY += (targetY - currentY) * 0.055;
      host.style.setProperty('--px', currentX.toFixed(4));
      host.style.setProperty('--py', currentY.toFixed(4));
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('pointerdown', spawnRipple, { passive: true });
    window.addEventListener('pointerleave', onLeave, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', spawnRipple);
      window.removeEventListener('pointerleave', onLeave);
    };
  }, [calm, ripples]);

  return (
    <div
      ref={hostRef}
      aria-hidden
      className={`abstract-field pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      style={{ ['--react' as string]: reactivity }}
    >
      {shapes.map((shape, index) => (
        <span
          key={index}
          className="abstract-shape"
          style={{
            left: `${shape.x}%`,
            top: `${shape.y}%`,
            opacity: 0.1 + shape.depth * 0.22,
            ['--depth' as string]: shape.depth,
            ['--spin' as string]: shape.spin ? `${shape.spin}s` : '0s',
            ['--drift' as string]: `${shape.drift}s`,
            ['--rot' as string]: `${shape.rotate}deg`,
            animationDelay: `${shape.delay}s`,
          }}
        >
          <span className="abstract-shape-inner">
            <ShapeGlyph shape={shape} />
          </span>
        </span>
      ))}
    </div>
  );
}

export default AbstractField;

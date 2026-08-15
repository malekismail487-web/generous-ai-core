import { useCallback, useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCalmMotion } from '@/lib/motion';
import { useLensPreference } from '@/hooks/useLensPreference';

/**
 * LiquidLens — the draggable glass oval.
 *
 * A physical object rather than a widget: you grab it, it squashes along the
 * axis of travel, it trails the finger with a spring, and when you let go it
 * wobbles back to a circle and settles against the nearest edge. The surface
 * is real Apple-style liquid glass — blurred backdrop, saturated refraction,
 * a specular highlight that tracks the pointer, and a caustic rim.
 *
 * Tapping (a press with almost no travel) opens its actions as a fan of
 * satellite buttons. Position survives reloads.
 */

export interface LensAction {
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
}

interface LiquidLensProps {
  actions: LensAction[];
  /** Storage key so each surface remembers where the lens was parked. */
  storageKey?: string;
  label?: string;
  className?: string;
}

interface Point {
  x: number;
  y: number;
}

const LENS_W = 108;
const LENS_H = 60;
const MARGIN = 14;

function clampToViewport(p: Point): Point {
  const maxX = Math.max(MARGIN, window.innerWidth - LENS_W - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - LENS_H - MARGIN);
  return {
    x: Math.min(Math.max(p.x, MARGIN), maxX),
    y: Math.min(Math.max(p.y, MARGIN), maxY),
  };
}

export function LiquidLens({
  actions,
  storageKey = 'lumina.lens',
  label = 'Quick lens',
  className,
}: LiquidLensProps) {
  const lensRef = useRef<HTMLDivElement>(null);
  const calm = useCalmMotion();
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Physics live in refs — the render loop writes transforms directly so the
  // drag never queues a React re-render per frame.
  const pos = useRef<Point>({ x: 0, y: 0 });
  const target = useRef<Point>({ x: 0, y: 0 });
  const velocity = useRef<Point>({ x: 0, y: 0 });
  const grabOffset = useRef<Point>({ x: 0, y: 0 });
  const pressAt = useRef<{ p: Point; t: number } | null>(null);
  const draggingRef = useRef(false);
  const frame = useRef(0);

  const write = useCallback(() => {
    const el = lensRef.current;
    if (!el) return;
    const vx = velocity.current.x;
    const vy = velocity.current.y;
    const speed = Math.min(Math.hypot(vx, vy), 60);
    // Squash along the direction of travel, stretch across it — the tell of
    // a body of liquid being dragged.
    const stretch = 1 + (speed / 60) * 0.16;
    const squash = 1 - (speed / 60) * 0.1;
    const angle = speed > 0.6 ? (Math.atan2(vy, vx) * 180) / Math.PI : 0;
    el.style.transform = [
      `translate3d(${pos.current.x}px, ${pos.current.y}px, 0)`,
      `rotate(${angle}deg)`,
      `scale(${stretch}, ${squash})`,
      `rotate(${-angle}deg)`,
    ].join(' ');
    // Mirror the satellite fan when the lens is parked on the left half,
    // so the arc always opens into the screen rather than off it.
    el.style.setProperty(
      '--fan-base',
      pos.current.x + LENS_W / 2 < window.innerWidth / 2 ? '-30deg' : '-150deg',
    );
    el.style.setProperty('--tilt-x', `${(vx / 60) * 8}deg`);
    el.style.setProperty('--tilt-y', `${(vy / 60) * -8}deg`);
  }, []);

  // Spring loop: the lens chases its target with damping, so a fling coasts
  // and a release settles with a soft overshoot.
  useEffect(() => {
    const tick = () => {
      const stiffness = draggingRef.current ? 0.34 : 0.14;
      const damping = draggingRef.current ? 0.62 : 0.78;
      const dx = target.current.x - pos.current.x;
      const dy = target.current.y - pos.current.y;
      velocity.current.x = (velocity.current.x + dx * stiffness) * damping;
      velocity.current.y = (velocity.current.y + dy * stiffness) * damping;
      pos.current.x += velocity.current.x;
      pos.current.y += velocity.current.y;
      write();
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [write]);

  // Restore the parked position (or default to the lower-right thumb zone).
  useEffect(() => {
    let start: Point = {
      x: window.innerWidth - LENS_W - 20,
      y: window.innerHeight - LENS_H - 108,
    };
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Point;
        if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') start = parsed;
      }
    } catch {
      /* a corrupt entry just means we use the default corner */
    }
    const safe = clampToViewport(start);
    pos.current = { ...safe };
    target.current = { ...safe };
    write();

    const onResize = () => {
      target.current = clampToViewport(target.current);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [storageKey, write]);

  const endDrag = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);

    // Fling forward a little, then magnetise to the nearest vertical edge.
    const projected = clampToViewport({
      x: target.current.x + velocity.current.x * 4,
      y: target.current.y + velocity.current.y * 4,
    });
    const snapLeft = projected.x + LENS_W / 2 < window.innerWidth / 2;
    const settled = clampToViewport({
      x: snapLeft ? MARGIN : window.innerWidth - LENS_W - MARGIN,
      y: projected.y,
    });
    target.current = settled;
    try {
      localStorage.setItem(storageKey, JSON.stringify(settled));
    } catch {
      /* storage is best-effort */
    }
  }, [storageKey]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!draggingRef.current) return;
      target.current = clampToViewport({
        x: event.clientX - grabOffset.current.x,
        y: event.clientY - grabOffset.current.y,
      });
      const el = lensRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        el.style.setProperty('--gx', `${((event.clientX - rect.left) / rect.width) * 100}%`);
        el.style.setProperty('--gy', `${((event.clientY - rect.top) / rect.height) * 100}%`);
      }
    };

    const onUp = (event: PointerEvent) => {
      const press = pressAt.current;
      pressAt.current = null;
      endDrag();
      if (!press) return;
      const travel = Math.hypot(event.clientX - press.p.x, event.clientY - press.p.y);
      // A press that barely moved is a tap, not a drag.
      if (travel < 6 && Date.now() - press.t < 600) setOpen((v) => !v);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [endDrag]);

  const onPointerDown = (event: React.PointerEvent) => {
    const el = lensRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    grabOffset.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    pressAt.current = { p: { x: event.clientX, y: event.clientY }, t: Date.now() };
    draggingRef.current = true;
    setDragging(true);
  };

  const onHover = (event: React.PointerEvent) => {
    if (draggingRef.current) return;
    const el = lensRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--gx', `${((event.clientX - rect.left) / rect.width) * 100}%`);
    el.style.setProperty('--gy', `${((event.clientY - rect.top) / rect.height) * 100}%`);
  };

  return (
    <div
      ref={lensRef}
      className={cn(
        'liquid-lens fixed left-0 top-0 z-[60] select-none touch-none',
        dragging && 'is-dragging',
        open && 'is-open',
        calm && 'motion-reduce:transition-none',
        className,
      )}
      style={{ width: LENS_W, height: LENS_H }}
      onPointerDown={onPointerDown}
      onPointerMove={onHover}
      role="group"
      aria-label={label}
    >
      {/* the glass body */}
      <div className="liquid-lens-body">
        <span className="liquid-lens-caustic" aria-hidden />
        <span className="liquid-lens-specular" aria-hidden />
        <span className="liquid-lens-rim" aria-hidden />
        <span className="liquid-lens-grip" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      </div>

      {/* satellites — real actions, fanned out above the lens */}
      <div className={cn('liquid-lens-fan', open ? 'is-visible' : '')}>
        {actions.map((action, index) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              type="button"
              title={action.label}
              aria-label={action.label}
              className="liquid-lens-satellite"
              style={{ ['--i' as string]: index, ['--n' as string]: actions.length }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                action.onSelect();
              }}
            >
              <Icon size={16} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default LiquidLens;

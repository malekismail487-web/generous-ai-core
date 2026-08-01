import { ReactNode, HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { useReveal, useTilt, useMagnetic } from '@/lib/motion';

/* ────────────────────────────────────────────────
   Reveal — content arrives as you reach it.
   ──────────────────────────────────────────────── */
interface RevealProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Milliseconds of delay before the reveal plays. */
  delay?: number;
}

export function Reveal({ children, delay = 0, className, ...rest }: RevealProps) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn('reveal', className)}
      style={{ animationDelay: `${delay}ms`, ...rest.style }}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ────────────────────────────────────────────────
   Surface — the one card shape in the whole product.
   ──────────────────────────────────────────────── */
interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Adds pointer-driven 3D tilt and a travelling specular highlight. */
  interactive?: boolean;
  /** Adds the animated hairline edge. */
  edge?: boolean;
}

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  { children, interactive = false, edge = false, className, ...rest },
  _forwarded,
) {
  const tiltRef = useTilt<HTMLDivElement>({ max: 6, lift: 14 });

  const body = (
    <div
      ref={interactive ? tiltRef : undefined}
      className={cn(
        'onyx-surface layer-3d relative overflow-hidden',
        edge && 'onyx-edge',
        interactive && 'cursor-pointer',
        className,
      )}
      {...rest}
    >
      {interactive && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[var(--sheen-o,0)] transition-opacity duration-300"
          style={{
            background:
              'radial-gradient(220px circle at var(--sheen-x,50%) var(--sheen-y,50%), hsl(var(--ink) / 0.10), transparent 65%)',
          }}
        />
      )}
      <div className="relative z-[1]">{children}</div>
    </div>
  );

  return interactive ? <div className="scene-3d">{body}</div> : body;
});

/* ────────────────────────────────────────────────
   Magnetic — buttons that lean toward your finger.
   ──────────────────────────────────────────────── */
interface MagneticProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  strength?: number;
}

export function Magnetic({ children, strength = 0.2, className, ...rest }: MagneticProps) {
  const ref = useMagnetic<HTMLDivElement>(strength);
  return (
    <div
      ref={ref}
      className={cn('inline-block transition-transform duration-300 ease-out', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ────────────────────────────────────────────────
   RisingText — headlines that assemble themselves.
   ──────────────────────────────────────────────── */
export function RisingText({
  text,
  className,
  stagger = 45,
}: {
  text: string;
  className?: string;
  stagger?: number;
}) {
  const words = text.split(' ');
  return (
    <span className={cn('text-rise inline-block', className)} style={{ perspective: '600px' }}>
      {words.map((word, index) => (
        <span key={`${word}-${index}`} style={{ animationDelay: `${index * stagger}ms` }}>
          {word}
          {index < words.length - 1 ? '\u00A0' : ''}
        </span>
      ))}
    </span>
  );
}

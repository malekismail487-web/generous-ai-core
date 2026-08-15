import { AbstractField } from '@/components/motion/AbstractField';
import { LiquidField } from '@/components/shell/LiquidField';

interface ActorBackdropProps {
  /** 'landing' is the dense, theatrical composition; 'ambient' is calmer. */
  variant?: 'landing' | 'ambient';
  className?: string;
}

/**
 * The shared atmosphere behind every actor's surface.
 *
 * Sits at -z-10 so the page's own content stays untouched: the body keeps the
 * background colour, this layer paints the horizon wash, the drifting liquid
 * blobs, the pointer-reactive abstract geometry and the film grain on top of
 * it, and everything the page renders sits above.
 */
export function ActorBackdrop({ variant = 'ambient', className = '' }: ActorBackdropProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 -z-10 overflow-hidden ${className}`}
    >
      <div className="absolute inset-0" style={{ background: 'var(--gradient-hero)' }} />
      <LiquidField dense={variant === 'landing'} />
      <AbstractField variant={variant} reactivity={variant === 'landing' ? 1 : 0.7} />
      <div className="grain-overlay absolute inset-0" />
    </div>
  );
}

export default ActorBackdrop;

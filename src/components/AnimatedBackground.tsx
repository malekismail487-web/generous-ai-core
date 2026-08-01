import { OrbitField } from '@/components/motion/OrbitField';

interface AnimatedBackgroundProps {
  /** Fewer electrons for dense screens, more for hero moments. */
  density?: number;
  className?: string;
}

/**
 * The app-wide atmosphere: a slow orbital field behind everything, plus the
 * film grain and horizon wash that give the Onyx palette its depth.
 */
export function AnimatedBackground({ density = 14, className = '' }: AnimatedBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 -z-10 overflow-hidden ${className}`}
    >
      <div className="absolute inset-0 bg-background" />
      <div
        className="absolute inset-0"
        style={{ background: 'var(--gradient-hero)' }}
      />
      <OrbitField density={density} />
      <div className="grain-overlay absolute inset-0" />
    </div>
  );
}

export default AnimatedBackground;

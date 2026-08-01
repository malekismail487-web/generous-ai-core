interface AnimatedBackgroundProps {
  /** Kept for API compatibility with existing callers. */
  density?: number;
  className?: string;
}

/**
 * A legibility wash layered over the global WebGL atom field (see AtomScene).
 * It no longer paints its own opaque backdrop or 2D orbit — the real 3D scene
 * mounted in App.tsx shows through, and this only adds a subtle vignette + grain
 * so content stays readable.
 */
export function AnimatedBackground({ className = '' }: AnimatedBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 -z-[5] overflow-hidden ${className}`}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 0%, transparent 45%, hsl(240 6% 2.5% / 0.5) 100%)',
        }}
      />
      <div className="grain-overlay absolute inset-0" />
    </div>
  );
}

export default AnimatedBackground;

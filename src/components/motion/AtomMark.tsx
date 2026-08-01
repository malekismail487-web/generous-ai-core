import { CSSProperties } from 'react';
import { useCalmMotion } from '@/lib/motion';

interface AtomMarkProps {
  /** Diameter in px. */
  size?: number;
  /** Slows or quickens the whole system. 1 = default. */
  tempo?: number;
  className?: string;
}

/**
 * The Lumina mark, rebuilt as living geometry: three tilted shells rotating in
 * real 3D space around a breathing nucleus, with arrow-headed arcs sweeping the
 * outer shell. Pure CSS 3D + SVG — no WebGL, no bundle cost.
 */
export function AtomMark({ size = 120, tempo = 1, className = '' }: AtomMarkProps) {
  const calm = useCalmMotion();

  const shells = [
    { tilt: 68, yaw: 0, duration: 14, scale: 1 },
    { tilt: 68, yaw: 60, duration: 19, scale: 0.86 },
    { tilt: 68, yaw: 120, duration: 24, scale: 0.72 },
  ];

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size, perspective: size * 5 }}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0"
        style={{ transformStyle: 'preserve-3d', transform: 'rotateX(12deg)' }}
      >
        {shells.map((shell, index) => (
          <div
            key={index}
            className="absolute inset-0"
            style={
              {
                transformStyle: 'preserve-3d',
                transform: `rotateZ(${shell.yaw}deg) scale(${shell.scale})`,
              } as CSSProperties
            }
          >
            <div
              className="absolute inset-0 rounded-full border border-foreground/25"
              style={{
                transformStyle: 'preserve-3d',
                animation: calm
                  ? undefined
                  : `atom-shell-${index} ${(shell.duration / tempo).toFixed(2)}s linear infinite`,
                transform: `rotateX(${shell.tilt}deg)`,
              }}
            />
          </div>
        ))}

        {/* Arrow arcs — the logo's motion signature */}
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 h-full w-full"
          style={{
            transform: 'translateZ(1px)',
            animation: calm ? undefined : `atom-sweep ${(22 / tempo).toFixed(2)}s linear infinite`,
          }}
        >
          <defs>
            <marker id="atom-head" markerWidth="5" markerHeight="5" refX="3" refY="2.5" orient="auto">
              <path d="M0,0 L5,2.5 L0,5 z" fill="currentColor" />
            </marker>
          </defs>
          <path
            d="M18,66 C24,30 62,14 82,26"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            markerEnd="url(#atom-head)"
            className="text-foreground/70"
          />
          <path
            d="M84,60 C74,84 34,88 20,70"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            markerEnd="url(#atom-head)"
            className="text-foreground/45"
          />
        </svg>

        {/* Nucleus */}
        <div
          className="absolute rounded-full bg-foreground nucleus-pulse"
          style={{
            width: size * 0.3,
            height: size * 0.3,
            left: '50%',
            top: '50%',
            transform: 'translate3d(-50%, -50%, 6px)',
            animationDuration: `${(4.5 / tempo).toFixed(2)}s`,
          }}
        />

        {/* The spark from the mark */}
        <div
          className="absolute text-foreground/80"
          style={{
            right: '6%',
            top: '8%',
            fontSize: size * 0.22,
            lineHeight: 1,
            animation: calm ? undefined : `atom-spark ${(3.4 / tempo).toFixed(2)}s ease-in-out infinite`,
          }}
        >
          ✳
        </div>
      </div>

      <style>{`
        @keyframes atom-shell-0 { from { transform: rotateX(68deg) rotateZ(0deg); } to { transform: rotateX(68deg) rotateZ(360deg); } }
        @keyframes atom-shell-1 { from { transform: rotateX(68deg) rotateZ(360deg); } to { transform: rotateX(68deg) rotateZ(0deg); } }
        @keyframes atom-shell-2 { from { transform: rotateX(68deg) rotateZ(0deg); } to { transform: rotateX(68deg) rotateZ(360deg); } }
        @keyframes atom-sweep { from { transform: translateZ(1px) rotate(0deg); } to { transform: translateZ(1px) rotate(360deg); } }
        @keyframes atom-spark { 0%, 100% { opacity: 0.35; transform: scale(0.85) rotate(0deg); } 50% { opacity: 1; transform: scale(1.15) rotate(45deg); } }
      `}</style>
    </div>
  );
}

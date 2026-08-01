import { CSSProperties } from 'react';

interface LuminaAtomProps {
  size?: number;
  animate?: boolean;
  glow?: boolean;
  className?: string;
}

/**
 * Exact SVG recreation of the Lumina atom logo:
 * White nucleus, two swept orbital arcs with arrowheads,
 * a third elliptical ring, and an asterisk star — all with
 * metallic silver gradient fill and optional 3D CSS animation.
 */
export function LuminaAtom({ size = 120, animate = true, glow = false, className = '' }: LuminaAtomProps) {
  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        style={{
          filter: glow ? 'drop-shadow(0 0 18px rgba(232,232,232,0.55))' : 'drop-shadow(0 0 8px rgba(232,232,232,0.2))',
        }}
      >
        <defs>
          {/* Metallic silver gradient matching the reference */}
          <linearGradient id="silver-main" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#f5f5f5" />
            <stop offset="40%"  stopColor="#c8c8c8" />
            <stop offset="70%"  stopColor="#e8e8e8" />
            <stop offset="100%" stopColor="#909090" />
          </linearGradient>
          <linearGradient id="silver-ring" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#ffffff" />
            <stop offset="50%"  stopColor="#b0b0b0" />
            <stop offset="100%" stopColor="#e0e0e0" />
          </linearGradient>
          <radialGradient id="nucleus-glow" cx="40%" cy="35%" r="65%">
            <stop offset="0%"  stopColor="#ffffff" />
            <stop offset="60%" stopColor="#f0f0f0" />
            <stop offset="100%" stopColor="#c8c8c8" />
          </radialGradient>
          {/* Arrowhead markers */}
          <marker id="arrow-a" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 L2,4 Z" fill="url(#silver-main)" />
          </marker>
          <marker id="arrow-b" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 L2,4 Z" fill="url(#silver-ring)" />
          </marker>
        </defs>

        {/* ── Outer orbital ring (bottom ellipse, horizontal) ── */}
        <g
          style={animate ? {
            animation: 'atom-shell-1 22s linear infinite',
            transformOrigin: '100px 100px',
          } as CSSProperties : undefined}
        >
          <ellipse
            cx="100" cy="108"
            rx="62" ry="24"
            fill="none"
            stroke="url(#silver-ring)"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
        </g>

        {/* ── First swept arc — upper-left arrow ── */}
        <g
          style={animate ? {
            animation: 'atom-shell-0 16s linear infinite',
            transformOrigin: '100px 100px',
          } as CSSProperties : undefined}
        >
          <path
            d="M 54,152  C 38,130 36,80 60,50  C 80,26 120,18 148,36"
            fill="none"
            stroke="url(#silver-main)"
            strokeWidth="5"
            strokeLinecap="round"
            markerEnd="url(#arrow-a)"
          />
        </g>

        {/* ── Second swept arc — lower-right arrow ── */}
        <g
          style={animate ? {
            animation: 'atom-shell-2 20s linear infinite',
            transformOrigin: '100px 100px',
          } as CSSProperties : undefined}
        >
          <path
            d="M 148,56  C 162,76 162,122 140,148  C 120,172 78,178 54,162"
            fill="none"
            stroke="url(#silver-main)"
            strokeWidth="5"
            strokeLinecap="round"
            markerEnd="url(#arrow-a)"
          />
        </g>

        {/* ── Third orbital arc (inner tilted ring) ── */}
        <g
          style={animate ? {
            animation: 'atom-shell-1 28s linear infinite reverse',
            transformOrigin: '100px 100px',
          } as CSSProperties : undefined}
        >
          <ellipse
            cx="100" cy="100"
            rx="56" ry="22"
            fill="none"
            stroke="url(#silver-ring)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeOpacity="0.6"
            transform="rotate(-42 100 100)"
          />
        </g>

        {/* ── Nucleus — white glowing sphere ── */}
        <circle
          cx="100" cy="100" r="26"
          fill="url(#nucleus-glow)"
          style={animate ? {
            animation: 'atom-nucleus 3.5s ease-in-out infinite',
            transformOrigin: '100px 100px',
          } as CSSProperties : undefined}
        />
        {/* nucleus inner highlight */}
        <ellipse cx="90" cy="89" rx="9" ry="7" fill="white" opacity="0.65" />

        {/* ── Asterisk star (upper-right) ── */}
        <g
          transform="translate(148, 54)"
          style={animate ? {
            animation: 'atom-star 3s ease-in-out infinite',
            transformOrigin: '0px 0px',
          } as CSSProperties : undefined}
        >
          {/* 6-spoke asterisk */}
          {[0, 30, 60, 90, 120, 150].map((deg) => (
            <line
              key={deg}
              x1="0" y1="-11"
              x2="0" y2="11"
              stroke="url(#silver-main)"
              strokeWidth="2.5"
              strokeLinecap="round"
              transform={`rotate(${deg})`}
            />
          ))}
          <circle cx="0" cy="0" r="2.5" fill="white" />
        </g>
      </svg>

      <style>{`
        @keyframes atom-shell-0 {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes atom-shell-1 {
          from { transform: rotate(0deg); }
          to   { transform: rotate(-360deg); }
        }
        @keyframes atom-shell-2 {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes atom-nucleus {
          0%,100% { transform: scale(1); filter: drop-shadow(0 0 6px rgba(255,255,255,0.6)); }
          50%      { transform: scale(1.08); filter: drop-shadow(0 0 18px rgba(255,255,255,0.9)); }
        }
        @keyframes atom-star {
          0%,100% { opacity: 0.7; transform: scale(0.9) rotate(0deg); }
          50%      { opacity: 1;   transform: scale(1.15) rotate(30deg); }
        }
      `}</style>
    </div>
  );
}

export default LuminaAtom;

// Lumina mascot - a modern white-outline lightbulb character with eyes and small wings
// Inspired by the user's hand-drawn design

interface LuminaMascotProps {
  size?: number;
  className?: string;
}

export function LuminaMascot({ size = 48, className = '' }: LuminaMascotProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Glow effect */}
      <defs>
        <filter id="lumina-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Main body - inverted teardrop / lightbulb shape */}
      <path
        d="M50 12 C32 12 20 28 20 42 C20 54 28 62 34 68 C36 70 38 74 38 78 L62 78 C62 74 64 70 66 68 C72 62 80 54 80 42 C80 28 68 12 50 12Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#lumina-glow)"
      />

      {/* Base of lightbulb */}
      <path
        d="M38 78 L38 84 C38 87 43 90 50 90 C57 90 62 87 62 84 L62 78"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Base lines */}
      <line x1="38" y1="82" x2="62" y2="82" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="40" y1="86" x2="60" y2="86" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />

      {/* Left eye */}
      <circle cx="40" cy="42" r="4" stroke="currentColor" strokeWidth="2" />
      <circle cx="41" cy="41" r="1.5" fill="currentColor" />

      {/* Right eye */}
      <circle cx="60" cy="42" r="4" stroke="currentColor" strokeWidth="2" />
      <circle cx="61" cy="41" r="1.5" fill="currentColor" />

      {/* Smile */}
      <path
        d="M43 52 C46 56 54 56 57 52"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Left wing/leaf */}
      <path
        d="M20 38 C12 32 8 38 14 44"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Right wing/leaf */}
      <path
        d="M80 38 C88 32 92 38 86 44"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Top sparkle */}
      <line x1="50" y1="4" x2="50" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="36" y1="8" x2="38" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="64" y1="8" x2="62" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

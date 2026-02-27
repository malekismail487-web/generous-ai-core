// Lumina mascot - a cute ghost/water droplet character with happy eyes and excited hands
// Based on the user's design: upside-down water droplet shape, happy expression, hands popping out

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

      {/* Main body - upside-down water droplet / ghost shape */}
      {/* Pointed top, round bottom with wavy tail */}
      <path
        d="M50 8 C50 8 42 20 36 32 C28 48 24 56 24 66 C24 80 36 90 50 90 C64 90 76 80 76 66 C76 56 72 48 64 32 C58 20 50 8 50 8Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#lumina-glow)"
      />

      {/* Wavy bottom edge to make it ghost-like */}
      <path
        d="M24 66 C24 80 36 92 42 86 C46 82 46 90 50 90 C54 90 54 82 58 86 C64 92 76 80 76 66"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Left eye - happy/curved */}
      <path
        d="M38 54 C38 50 42 48 44 52"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Left eye pupil */}
      <circle cx="41" cy="52" r="1.5" fill="currentColor" />

      {/* Right eye - happy/curved */}
      <path
        d="M56 54 C56 50 60 48 62 52"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Right eye pupil */}
      <circle cx="59" cy="52" r="1.5" fill="currentColor" />

      {/* Cute smile */}
      <path
        d="M44 62 C47 66 53 66 56 62"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Left hand - excited, popping out to the side */}
      <path
        d="M24 58 C18 52 12 50 10 54"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Left hand fingers spread */}
      <path
        d="M10 54 C8 50 6 52 9 48"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M10 54 C6 54 6 56 8 58"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Right hand - excited, popping out to the side */}
      <path
        d="M76 58 C82 52 88 50 90 54"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Right hand fingers spread */}
      <path
        d="M90 54 C92 50 94 52 91 48"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M90 54 C94 54 94 56 92 58"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Small sparkle/excitement marks above head */}
      <line x1="46" y1="4" x2="44" y2="0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="54" y1="4" x2="56" y2="0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

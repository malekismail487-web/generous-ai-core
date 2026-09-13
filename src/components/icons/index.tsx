/**
 * Lumina Glyphs — the platform's own icon system.
 *
 * Every mark here is drawn from scratch on a 24×24 grid with a single
 * 1.5 stroke weight, square-cut joints and no fills. Nothing is imported
 * from a third-party icon pack and no emoji are used anywhere in the UI,
 * so the visual language stays proprietary and consistent across actors.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface GlyphProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

function Glyph({ size = 20, className, children, ...props }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
      {...props}
    >
      {children}
    </svg>
  );
}

/* ---------------------------------------------------------------- system */

export const GlyphEnvelope = (p: GlyphProps) => (
  <Glyph {...p}>
    <rect x="2.75" y="5.25" width="18.5" height="13.5" rx="2" />
    <path d="M3.5 7.5 12 13.25 20.5 7.5" />
  </Glyph>
);

export const GlyphLock = (p: GlyphProps) => (
  <Glyph {...p}>
    <rect x="4.25" y="10.25" width="15.5" height="9.5" rx="2" />
    <path d="M8 10.25V7.5a4 4 0 0 1 8 0v2.75" />
    <path d="M12 14v2.25" />
  </Glyph>
);

export const GlyphKey = (p: GlyphProps) => (
  <Glyph {...p}>
    <circle cx="8" cy="8" r="3.75" />
    <path d="M10.6 10.6 20 20" />
    <path d="M17.2 17.2 15.4 19" />
  </Glyph>
);

export const GlyphShieldCheck = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M12 2.75 20 6v6.2c0 4.1-3.2 7.4-8 9.05-4.8-1.65-8-4.95-8-9.05V6z" />
    <path d="m8.6 12.1 2.3 2.3 4.5-4.6" />
  </Glyph>
);

export const GlyphSeal = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M12 2.5 14.6 5l3.5-.3.4 3.5 2.8 2.1-1.8 3 1.1 3.35-3.3 1.2-1.5 3.2-3.3-1.2-3.3 1.2-1.5-3.2-3.3-1.2L5.5 13.3l-1.8-3L6.5 8.2l.4-3.5L10.4 5z" />
    <path d="m8.8 12 2.2 2.2 4.2-4.3" />
  </Glyph>
);

export const GlyphOrbit = ({ size = 20, className, ...p }: GlyphProps) => (
  <Glyph size={size} className={cn('animate-spin', className)} {...p}>
    <circle cx="12" cy="12" r="8.25" strokeOpacity="0.25" />
    <path d="M20.25 12A8.25 8.25 0 0 0 12 3.75" />
  </Glyph>
);

export const GlyphArrowLeft = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M19 12H5.5" />
    <path d="m11 5.5-5.5 6.5 5.5 6.5" />
  </Glyph>
);

export const GlyphArrowRight = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M5 12h13.5" />
    <path d="m13 5.5 5.5 6.5-5.5 6.5" />
  </Glyph>
);

export const GlyphRefresh = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20.25 3.75V8.5H15.5" />
  </Glyph>
);

export const GlyphPerson = (p: GlyphProps) => (
  <Glyph {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M4.75 20c.9-3.7 3.7-5.6 7.25-5.6S18.35 16.3 19.25 20" />
  </Glyph>
);

export const GlyphPersonAdd = (p: GlyphProps) => (
  <Glyph {...p}>
    <circle cx="10" cy="8" r="3.5" />
    <path d="M3.5 20c.85-3.7 3.4-5.6 6.5-5.6 1.2 0 2.3.28 3.25.8" />
    <path d="M17.5 14.5v5.25M14.9 17.1h5.2" />
  </Glyph>
);

export const GlyphPeople = (p: GlyphProps) => (
  <Glyph {...p}>
    <circle cx="9" cy="8.5" r="3.25" />
    <path d="M3 19.5c.8-3.3 3.1-5 6-5s5.2 1.7 6 5" />
    <path d="M16 6.1a3.25 3.25 0 0 1 0 6.3" />
    <path d="M17.5 14.9c2 .6 3.3 2.2 3.8 4.6" />
  </Glyph>
);

export const GlyphBond = (p: GlyphProps) => (
  <Glyph {...p}>
    <circle cx="8" cy="7.5" r="3.25" />
    <circle cx="16.75" cy="15.5" r="2.75" />
    <path d="M10.4 9.8c1.4 3.3 2.6 4.9 4.2 5.5" />
    <path d="M3.5 19.5c.6-2.6 2.2-4.2 4.5-4.6" />
  </Glyph>
);

export const GlyphGlobe = (p: GlyphProps) => (
  <Glyph {...p}>
    <circle cx="12" cy="12" r="8.25" />
    <path d="M3.9 9.5h16.2M3.9 14.5h16.2" />
    <path d="M12 3.75c2.2 2.4 3.3 5.2 3.3 8.25S14.2 17.85 12 20.25c-2.2-2.4-3.3-5.2-3.3-8.25S9.8 6.15 12 3.75Z" />
  </Glyph>
);

export const GlyphTimer = (p: GlyphProps) => (
  <Glyph {...p}>
    <circle cx="12" cy="13" r="7.5" />
    <path d="M12 9v4.2l2.7 1.7" />
    <path d="M9.5 2.75h5" />
  </Glyph>
);

export const GlyphHome = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M3.75 10.5 12 3.75l8.25 6.75V20H3.75z" />
    <path d="M9.75 20v-5.5h4.5V20" />
  </Glyph>
);

export const GlyphCalendar = (p: GlyphProps) => (
  <Glyph {...p}>
    <rect x="3.5" y="5.25" width="17" height="15" rx="2" />
    <path d="M3.5 9.75h17M8.25 3.5v3.5M15.75 3.5v3.5" />
  </Glyph>
);

export const GlyphBroadcast = (p: GlyphProps) => (
  <Glyph {...p}>
    <circle cx="12" cy="12" r="2.25" />
    <path d="M7.6 7.6a6.2 6.2 0 0 0 0 8.8M16.4 16.4a6.2 6.2 0 0 0 0-8.8" />
    <path d="M4.6 4.6a10.4 10.4 0 0 0 0 14.8M19.4 19.4a10.4 10.4 0 0 0 0-14.8" />
  </Glyph>
);

export const GlyphCap = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M2.75 9 12 4.75 21.25 9 12 13.25z" />
    <path d="M6.5 10.9v4.6c0 1.6 2.5 2.9 5.5 2.9s5.5-1.3 5.5-2.9v-4.6" />
    <path d="M21.25 9v5" />
  </Glyph>
);

export const GlyphSpark = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M12 3.25 13.9 9l5.85 2-5.85 2-1.9 5.75L10.1 13 4.25 11l5.85-2z" />
  </Glyph>
);

/* --------------------------------------------------------------- subjects */

export const GlyphHelix = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M8 3.5c0 6 8 8.5 8 14.5M16 3.5c0 6-8 8.5-8 14.5" />
    <path d="M8.9 7h6.2M8 11h8M8.9 15h6.2" />
  </Glyph>
);

export const GlyphAtom = (p: GlyphProps) => (
  <Glyph {...p}>
    <circle cx="12" cy="12" r="1.9" />
    <ellipse cx="12" cy="12" rx="9" ry="4" />
    <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(60 12 12)" />
    <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(120 12 12)" />
  </Glyph>
);

export const GlyphAngle = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M4 19.5h16L4 5.5z" />
    <path d="M7.5 16.5a5 5 0 0 0 1.6-3.4" />
  </Glyph>
);

export const GlyphFlask = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M9.75 3.5v5.3L4.9 17.4a2 2 0 0 0 1.75 3h10.7a2 2 0 0 0 1.75-3L14.25 8.8V3.5" />
    <path d="M8.5 3.5h7" />
    <path d="M7.4 14.6h9.2" />
  </Glyph>
);

export const GlyphBook = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M4 4.75h5.25A2.75 2.75 0 0 1 12 7.5v12a2.4 2.4 0 0 0-2.4-2.4H4z" />
    <path d="M20 4.75h-5.25A2.75 2.75 0 0 0 12 7.5v12a2.4 2.4 0 0 1 2.4-2.4H20z" />
  </Glyph>
);

export const GlyphChip = (p: GlyphProps) => (
  <Glyph {...p}>
    <rect x="6.75" y="6.75" width="10.5" height="10.5" rx="1.5" />
    <rect x="10" y="10" width="4" height="4" rx="0.5" />
    <path d="M9.5 3.5v3.25M14.5 3.5v3.25M9.5 17.25V20.5M14.5 17.25V20.5M3.5 9.5h3.25M3.5 14.5h3.25M17.25 9.5h3.25M17.25 14.5h3.25" />
  </Glyph>
);

export const GlyphScript = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M5 17.5c2.6 0 3.9-1.3 3.9-3.4 0-1.7-1-2.7-2.3-2.7-1 0-1.7.6-1.7 1.5" />
    <path d="M11.5 17.5h2.1c1.7 0 2.6-.9 2.6-2.4V6.5" />
    <path d="M19 17.5h.5" />
  </Glyph>
);

export const GlyphCrescent = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M16.6 4.6a8.25 8.25 0 1 0 3.4 12.2 6.6 6.6 0 0 1-3.4-12.2Z" />
  </Glyph>
);

export const GlyphPillar = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M3.25 9 12 4.25 20.75 9z" />
    <path d="M6 10.5v7M10 10.5v7M14 10.5v7M18 10.5v7" />
    <path d="M3.75 19.75h16.5" />
  </Glyph>
);

export const GlyphPalette = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M12 3.75a8.25 8.25 0 0 0 0 16.5c1.2 0 1.9-.8 1.9-1.7 0-1.4-1-1.6-1-2.7 0-.8.7-1.4 1.6-1.4h1.6c2.3 0 4.15-1.9 4.15-4.3 0-3.6-3.6-6.4-8.25-6.4Z" />
    <circle cx="8.4" cy="10" r="1" />
    <circle cx="12" cy="7.6" r="1" />
    <circle cx="15.7" cy="9.8" r="1" />
  </Glyph>
);

export const GlyphCase = (p: GlyphProps) => (
  <Glyph {...p}>
    <rect x="3" y="7.5" width="18" height="12.25" rx="2" />
    <path d="M8.75 7.5V5.9a2 2 0 0 1 2-2h2.5a2 2 0 0 1 2 2v1.6" />
    <path d="M3 12.5h18" />
  </Glyph>
);

export const GlyphPaper = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M6 3.75h7.5L18 8.25v12H6z" />
    <path d="M13.25 3.9v4.35h4.35" />
    <path d="M9 13h6M9 16.25h4" />
  </Glyph>
);

/* --------------------------------------------------------------- mapping */

const SUBJECT_GLYPHS: Record<string, (p: GlyphProps) => JSX.Element> = {
  biology: GlyphHelix,
  physics: GlyphAtom,
  mathematics: GlyphAngle,
  chemistry: GlyphFlask,
  english: GlyphBook,
  social_studies: GlyphGlobe,
  technology: GlyphChip,
  arabic: GlyphScript,
  islamic_studies: GlyphCrescent,
  ksa_history: GlyphPillar,
  art_design: GlyphPalette,
  entrepreneurship: GlyphCase,
};

/** Renders the proprietary mark for a subject id, falling back to a book. */
export function SubjectGlyph({ subject, ...props }: GlyphProps & { subject?: string | null }) {
  const Mark = (subject && SUBJECT_GLYPHS[subject]) || GlyphBook;
  return <Mark {...props} />;
}

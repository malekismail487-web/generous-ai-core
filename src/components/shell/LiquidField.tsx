import { useMemo } from "react";

/**
 * LiquidField — the ambient optical bed the glass panes refract.
 *
 * Pure CSS: a handful of slow-wandering luminous blobs plus a fine
 * refraction lattice. No canvas, no rAF, no per-frame JS cost.
 */

interface Blob {
  size: number;
  top: string;
  left: string;
  delay: string;
  duration: string;
  opacity: number;
}

const BLOBS: Blob[] = [
  { size: 46, top: "-8%", left: "-6%", delay: "0s", duration: "28s", opacity: 0.55 },
  { size: 34, top: "42%", left: "62%", delay: "-6s", duration: "34s", opacity: 0.4 },
  { size: 28, top: "72%", left: "8%", delay: "-13s", duration: "30s", opacity: 0.34 },
  { size: 22, top: "12%", left: "48%", delay: "-19s", duration: "24s", opacity: 0.28 },
];

export function LiquidField({ dense = false }: { dense?: boolean }) {
  const blobs = useMemo(() => (dense ? BLOBS : BLOBS.slice(0, 3)), [dense]);

  return (
    <div className="liquid-field" aria-hidden>
      {/* refraction lattice — a barely-there grid the blur bends */}
      <div
        className="absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--ink) / 0.05) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--ink) / 0.05) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(120% 90% at 50% 0%, #000 20%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(120% 90% at 50% 0%, #000 20%, transparent 78%)",
        }}
      />

      {blobs.map((b, i) => (
        <span
          key={i}
          className="liquid-blob"
          style={{
            width: `${b.size}vmax`,
            height: `${b.size}vmax`,
            top: b.top,
            left: b.left,
            opacity: b.opacity,
            animationDelay: b.delay,
            animationDuration: b.duration,
          }}
        />
      ))}

      {/* horizon meniscus */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}

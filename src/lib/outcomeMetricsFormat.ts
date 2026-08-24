export interface FormattedDelta {
  text: string;
  tone: "up" | "down" | "flat" | "na";
}

/** Human-friendly pure formatter for diagnostics and offline verification. */
export function formatRate(n: number | null, digits = 0): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function formatDelta(n: number | null): FormattedDelta {
  if (n == null) return { text: "—", tone: "na" };
  const pct = n * 100;
  if (Math.abs(pct) < 0.5) return { text: "±0%", tone: "flat" };
  const sign = pct > 0 ? "+" : "";
  return { text: `${sign}${pct.toFixed(1)}%`, tone: pct > 0 ? "up" : "down" };
}

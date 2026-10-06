import { cn } from "@/components/ui/cn";

/**
 * The Moon's lit shape for an illuminated fraction. Waxing is lit on the right (as seen from the northern tropics and
 * beyond); waning is mirrored. Decorative: callers give the phase in words.
 */
export function MoonGlyph({ fraction, waxing, className }: { fraction: number; waxing: boolean; className?: string }) {
  const r = 20;
  const f = Math.min(1, Math.max(0, fraction));
  // The terminator is a half-ellipse whose x-radius shrinks to 0 at quarter and grows back to r at new/full.
  const rx = Math.abs(1 - 2 * f) * r;
  const sweep = f < 0.5 ? 0 : 1;
  const lit = f <= 0.001 ? null : f >= 0.999 ? <circle cx="24" cy="24" r={r} /> : <path d={`M24 ${24 - r} A${r} ${r} 0 0 1 24 ${24 + r} A${rx} ${r} 0 0 ${sweep} 24 ${24 - r}Z`} />;
  return (
    <svg viewBox="0 0 48 48" className={cn("shrink-0", className)} aria-hidden>
      <circle cx="24" cy="24" r={r} fill="#2a2f57" />
      <g fill="#f4ecd2" transform={waxing ? undefined : "translate(48 0) scale(-1 1)"}>{lit}</g>
      <circle cx="24" cy="24" r={r} fill="none" stroke="#f4ecd2" strokeOpacity="0.35" strokeWidth="1" />
    </svg>
  );
}

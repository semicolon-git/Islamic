/** The 8-point star (khatam) mark used as the app's logo and a quiet motif. */
export function Khatam({ size = 28, className, strokeWidth = 1.6 }: { size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <rect x="7" y="7" width="18" height="18" rx="1.5" stroke="currentColor" strokeWidth={strokeWidth} />
      <rect x="7" y="7" width="18" height="18" rx="1.5" stroke="currentColor" strokeWidth={strokeWidth} transform="rotate(45 16 16)" />
      <circle cx="16" cy="16" r="3.2" fill="currentColor" />
    </svg>
  );
}

export function Logo({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold text-ink">
      <span className="text-accent">
        <Khatam size={26} />
      </span>
      <span className="text-[1.05rem] tracking-tight">{label}</span>
    </span>
  );
}

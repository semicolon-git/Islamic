"use client";
import { useEffect, useRef, useState } from "react";

/** Outline 8-point star (two squares), for quiet decoration. */
export function StarOutline({ size = 120, className, strokeWidth = 0.6 }: { size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <rect x="7" y="7" width="18" height="18" stroke="currentColor" strokeWidth={strokeWidth} />
      <rect x="7" y="7" width="18" height="18" stroke="currentColor" strokeWidth={strokeWidth} transform="rotate(45 16 16)" />
      <circle cx="16" cy="16" r="4.2" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
  );
}

/**
 * Full-bleed hero image. If the (decorative, generated) image can't load, a calm night-ink field
 * with a faint khatam lattice takes its place, so the title never sits on a broken image.
 */
export function HeroImage({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(!src);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, [src]);
  return (
    <div className="absolute inset-0" role="img" aria-label={alt}>
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_85%_10%,#1d5a63_0%,#10143a_55%,#070a22_100%)]" aria-hidden />
      <svg className="absolute inset-0 size-full text-white/[0.07]" aria-hidden>
        <defs>
          <pattern id="khatam-lattice" width="64" height="64" patternUnits="userSpaceOnUse">
            <g fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="16" y="16" width="32" height="32" />
              <rect x="16" y="16" width="32" height="32" transform="rotate(45 32 32)" />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#khatam-lattice)" />
      </svg>
      {src && !failed && (
        <img ref={ref} src={src} alt="" onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover animate-[rise_0.6s_ease-out_both]" />
      )}
    </div>
  );
}

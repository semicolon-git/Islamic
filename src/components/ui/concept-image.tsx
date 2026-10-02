"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "./cn";
import { Khatam } from "./khatam";

/**
 * Decorative concept image with a graceful fallback (tinted khatam tile) when the image is missing,
 * offline, or blocked. Images are illustrative only (generated, no text) — never evidence.
 */
export function ConceptImage({ src, alt, className, hue = 170, rounded = true }: { src?: string | null; alt: string; className?: string; hue?: number; rounded?: boolean }) {
  const [failed, setFailed] = useState(false);
  // An image that failed before hydration never fires onError in React: detect it on mount.
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, [src]);
  const show = src && !failed;
  return (
    <div className={cn("relative overflow-hidden bg-surface-2", rounded && "rounded-[var(--radius)]", className)}>
      {show ? (
        <img ref={imgRef} src={src!} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center" style={{ background: `linear-gradient(135deg, oklch(0.42 0.08 ${hue}), oklch(0.28 0.06 ${hue + 40}))` }} role="img" aria-label={alt}>
          <span className="text-white/60"><Khatam size={44} /></span>
        </div>
      )}
    </div>
  );
}

"use client";
import { cn } from "@/components/ui/cn";
import { bbox, padBox, toPoints, type Polygon } from "../geometry";

export type ImageFilter = "none" | "contrast" | "invert";
export const FILTER_CSS: Record<ImageFilter, string> = {
  none: "none",
  contrast: "grayscale(1) contrast(1.9) brightness(1.08)",
  invert: "grayscale(1) invert(1) contrast(1.35)",
};

/**
 * The line image, cropped from the page image with an SVG viewBox (no server round trip, uses the cached page image).
 * Everything outside the line polygon is dimmed so the eye stays on the line; `context` widens the crop vertically.
 */
export function LineCrop({
  src,
  width,
  height,
  polygon,
  context = 0,
  filter = "none",
  label,
  className,
  maxHeight = 150,
  legible = false,
}: {
  src: string;
  width: number;
  height: number;
  polygon: Polygon;
  context?: number;
  filter?: ImageFilter;
  label: string;
  className?: string;
  maxHeight?: number;
  /** Show the line at a readable height (horizontal scroll, starting at the right edge for RTL) instead of fitting the width. */
  legible?: boolean;
}) {
  const b0 = bbox(polygon);
  const padY = Math.max(10, b0.h * 0.18) + context * b0.h;
  const b = padBox({ x: b0.x, y: b0.y - padY + 10, w: b0.w, h: b0.h + 2 * padY - 20 }, 12, width, height);
  const outside = `M${b.x},${b.y} h${b.w} v${b.h} h${-b.w} Z M${toPoints(polygon).split(" ").join(" L")} Z`;
  const h = Math.round(Math.min(maxHeight, Math.max(72, b.h * 1.25)));
  return (
    <div dir="rtl" tabIndex={legible ? 0 : undefined} aria-label={legible ? label : undefined} role={legible ? "region" : undefined} className={cn("relative w-full rounded-[10px] bg-sand border border-line scrollbar-thin", legible ? "overflow-x-auto overflow-y-hidden" : "overflow-hidden", className)} style={{ maxHeight: legible ? undefined : maxHeight }}>
      <svg
        role="img"
        aria-label={label}
        viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`}
        preserveAspectRatio="xMidYMid meet"
        className={cn("block", legible ? "mx-auto" : "w-full h-auto")}
        style={legible ? { height: h, width: Math.round((b.w / b.h) * h), maxWidth: "none" } : { aspectRatio: `${b.w} / ${b.h}`, maxHeight }}
      >
        <image href={src} x={0} y={0} width={width} height={height} style={{ filter: FILTER_CSS[filter] }} preserveAspectRatio="none" />
        <path d={outside} fillRule="evenodd" fill="rgb(243 238 228 / 0.55)" />
        <polygon points={toPoints(polygon)} fill="none" stroke="#0a8c77" strokeOpacity={0.55} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

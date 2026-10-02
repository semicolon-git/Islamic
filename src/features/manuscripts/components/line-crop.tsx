"use client";
import { useState } from "react";
import { RotateCw } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { autoTurn, bbox, padBox, toPoints, type Polygon, type Turn } from "../geometry";

export type ImageFilter = "none" | "contrast" | "invert";
export const FILTER_CSS: Record<ImageFilter, string> = {
  none: "none",
  contrast: "grayscale(1) contrast(1.9) brightness(1.08)",
  invert: "grayscale(1) invert(1) contrast(1.35)",
};

/**
 * The line image, cropped from the page image with an SVG viewBox (no server round trip, uses the cached page image).
 * Everything outside the line polygon is dimmed so the eye stays on the line; `context` widens the crop across the line.
 */
export function LineCrop({
  src, width, height, polygon, baseline, context = 0, filter = "none", label, className, maxHeight = 150, legible = false, rotateLabel,
}: {
  src: string;
  width: number;
  height: number;
  polygon: Polygon;
  baseline?: Polygon | null;
  context?: number;
  filter?: ImageFilter;
  label: string;
  className?: string;
  maxHeight?: number;
  /** Show the line at a readable height (horizontal scroll, starting at the right edge for RTL) instead of fitting the width. */
  legible?: boolean;
  rotateLabel?: string;
}) {
  const auto = autoTurn(polygon, baseline);
  const [turn, setTurn] = useState<Turn>(auto);
  const b0 = bbox(polygon);
  const vertical = turn !== "none";
  const across = Math.max(10, (vertical ? b0.w : b0.h) * 0.18) + context * (vertical ? b0.w : b0.h);
  const b = vertical
    ? padBox({ x: b0.x - across + 10, y: b0.y, w: b0.w + 2 * across - 20, h: b0.h }, 12, width, height)
    : padBox({ x: b0.x, y: b0.y - across + 10, w: b0.w, h: b0.h + 2 * across - 20 }, 12, width, height);
  const outside = `M${b.x},${b.y} h${b.w} v${b.h} h${-b.w} Z M${toPoints(polygon).split(" ").join(" L")} Z`;
  const dw = vertical ? b.h : b.w, dh = vertical ? b.w : b.h;
  const transform = turn === "cw" ? `matrix(0 1 -1 0 ${b.y + b.h} ${-b.x})` : turn === "ccw" ? `matrix(0 -1 1 0 ${-b.y} ${b.x + b.w})` : `translate(${-b.x} ${-b.y})`;
  const h = Math.round(Math.min(maxHeight, Math.max(72, dh * 1.25)));
  return (
    <div className={cn("relative", className)}>
      <div dir="rtl" tabIndex={legible ? 0 : undefined} aria-label={legible ? label : undefined} role={legible ? "region" : undefined}
        className={cn("relative w-full rounded-[10px] bg-sand border border-line scrollbar-thin", legible ? "overflow-x-auto overflow-y-hidden" : "overflow-hidden")}
        style={{ maxHeight: legible ? undefined : maxHeight }}>
        <svg
          role="img"
          aria-label={label}
          viewBox={`0 0 ${dw} ${dh}`}
          preserveAspectRatio="xMidYMid meet"
          className={cn("block", legible ? "mx-auto" : "w-full h-auto")}
          style={legible ? { height: h, width: Math.round((dw / dh) * h), maxWidth: "none" } : { aspectRatio: `${dw} / ${dh}`, maxHeight }}
        >
          <g transform={transform}>
            <image href={src} x={0} y={0} width={width} height={height} style={{ filter: FILTER_CSS[filter] }} preserveAspectRatio="none" />
            <path d={outside} fillRule="evenodd" fill="rgb(243 238 228 / 0.55)" />
            <polygon points={toPoints(polygon)} fill="none" stroke="#0a8c77" strokeOpacity={0.55} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          </g>
        </svg>
      </div>
      {auto !== "none" && rotateLabel && (
        <button type="button" onClick={() => setTurn((t) => (t === "cw" ? "ccw" : "cw"))} aria-label={rotateLabel} title={rotateLabel}
          className="absolute top-1.5 start-1.5 size-8 grid place-items-center rounded-full bg-surface/90 border border-line text-ink-2 hover:text-ink shadow-card">
          <RotateCw className="size-4" />
        </button>
      )}
    </div>
  );
}

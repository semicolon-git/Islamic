"use client";
import { useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { autoTurn, bbox, padBox, toPoints, type Polygon } from "../../../manuscripts/geometry";

/**
 * The line image with the hard word's estimated position highlighted. Zoomed to the word when geometry allows
 * (horizontal lines), always with a way back to the whole line; vertical marginal glosses show the whole line.
 */
export function WordCrop({ image, polygon, baseline, box, label, height = 140 }: {
  image: { src: string; width: number; height: number };
  polygon: Polygon;
  baseline?: Polygon | null;
  box: { x: number; y: number; w: number; h: number } | null;
  label: string;
  height?: number;
}) {
  const { t } = useI18n();
  const canZoom = !!box && autoTurn(polygon, baseline) === "none";
  const [zoom, setZoom] = useState(canZoom);
  const lb = bbox(polygon);
  const area = zoom && box
    ? padBox({ x: box.x - box.w * 1.4, y: lb.y, w: box.w * 3.8, h: lb.h }, 14, image.width, image.height)
    : padBox(lb, 14, image.width, image.height);
  const outside = `M${area.x},${area.y} h${area.w} v${area.h} h${-area.w} Z M${toPoints(polygon).split(" ").join(" L")} Z`;
  const w = Math.round((area.w / area.h) * height);
  return (
    <figure className="flex flex-col gap-1.5">
      <div dir="rtl" className="relative w-full rounded-[12px] bg-sand border border-line overflow-x-auto overflow-y-hidden scrollbar-thin" role="region" tabIndex={0} aria-label={label}>
        <svg role="img" aria-label={label} viewBox={`${area.x} ${area.y} ${area.w} ${area.h}`} style={{ height, width: zoom ? "100%" : Math.max(w, 280), maxWidth: zoom ? "100%" : "none" }} preserveAspectRatio="xMidYMid meet" className="block mx-auto">
          <image href={image.src} x={0} y={0} width={image.width} height={image.height} preserveAspectRatio="none" />
          <path d={outside} fillRule="evenodd" fill="rgb(243 238 228 / 0.6)" />
          <polygon points={toPoints(polygon)} fill="none" stroke="#0a8c77" strokeOpacity={0.5} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          {box && <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={6} fill="rgb(242 196 90 / 0.18)" stroke="#c98a00" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" data-testid="word-box" />}
        </svg>
      </div>
      <figcaption className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
        {box ? <span className="inline-flex items-center gap-1.5"><span className="inline-block w-4 h-2.5 rounded-[3px] border-2 border-dashed border-[#c98a00]" aria-hidden />{t("collab.hard.approx")}</span> : <span>{t("collab.hard.wholeLine")}</span>}
        {canZoom && (
          <button type="button" onClick={() => setZoom((z) => !z)} className="ms-auto inline-flex items-center gap-1 h-8 px-2.5 rounded-full border border-line-strong text-ink-2 hover:bg-surface-2">
            {zoom ? <ZoomOut className="size-3.5" /> : <ZoomIn className="size-3.5" />}{zoom ? t("collab.hard.showLine") : t("collab.hard.zoomWord")}
          </button>
        )}
      </figcaption>
    </figure>
  );
}

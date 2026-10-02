"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import {
  Contrast, Eye, EyeOff, Focus, Layers, Maximize, MousePointer2, PenLine, RectangleHorizontal, ScanLine, SquareDashed, Trash, WandSparkles, ZoomIn, ZoomOut,
} from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import { bbox, boxFromPoints, center, fitPolygon, rectPolygon, toPoints, type Box, type Polygon, type Pt } from "../../geometry";
import { REGION_TYPES, type RegionType } from "../../schema";
import type { LineDTO, PageDetail } from "../../types";
import { api, ApiError, num } from "../api";
import { FILTER_CSS, type ImageFilter } from "../line-crop";
import { regionStyle } from "../regions";

export interface ImagePaneHandle {
  zoomToLine: (id: string, zoom?: boolean) => void;
  fit: () => void;
  actual: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

export type LayoutTool = "select" | "line" | "region";
type Sel = { kind: "line" | "region"; id: string } | null;

interface Props {
  detail: PageDetail;
  selectedId: string | null;
  hoverId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  filter: ImageFilter;
  onFilter: (f: ImageFilter) => void;
  overlays: { regions: boolean; lines: boolean };
  onOverlays: (o: { regions: boolean; lines: boolean }) => void;
  layoutMode: boolean;
  onLayoutMode: (on: boolean) => void;
  onLayoutChanged: () => Promise<void>;
  extraOverlay?: React.ReactNode;
  myId: string;
}

const FILTERS: ImageFilter[] = ["none", "contrast", "invert"];

export const ImagePane = forwardRef<ImagePaneHandle, Props>(function ImagePane(p, ref) {
  const { detail, selectedId, hoverId, onHover, onSelect, filter, onFilter, overlays, onOverlays, layoutMode, onLayoutMode, onLayoutChanged, extraOverlay, myId } = p;
  const { t, locale } = useI18n();
  const toast = useToast();
  const W = detail.page.width, H = detail.page.height;
  const zp = useRef<ReactZoomPanPinchRef>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [scale, setScale] = useState(0.3);
  const [loaded, setLoaded] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  const [tool, setTool] = useState<LayoutTool>("select");
  const [regionType, setRegionType] = useState<RegionType>("main");
  const [layoutSel, setLayoutSel] = useState<Sel>(null);
  const [draft, setDraft] = useState<Box | null>(null);
  const [override, setOverride] = useState<{ id: string; poly: Polygon } | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ mode: "draw" | "move" | "resize"; start: Pt; orig?: Polygon; corner?: number; id?: string; kind?: "line" | "region" } | null>(null);
  const down = useRef<Pt | null>(null);

  const linesById = useMemo(() => new Map(detail.lines.map((l) => [l.id, l])), [detail.lines]);

  // The image may finish loading before hydration (no onLoad then); fit the page once the pane has its final size.
  useEffect(() => {
    if (img.current?.complete) setLoaded(true);
    const id = setTimeout(() => zp.current?.fitToView({ animationTime: 0 }), 60);
    return () => clearTimeout(id);
  }, [detail.page.id]);

  const zoomToLine = useCallback((id: string, zoom = true) => {
    const l = linesById.get(id);
    const inst = zp.current;
    const el = wrap.current;
    if (!l || !inst || !el) return;
    const b = bbox(l.polygon);
    const vw = el.clientWidth, vh = el.clientHeight;
    const cur = inst.instance.state.scale;
    const fitScale = Math.min((vw * 0.9) / Math.max(1, b.w), (vh * 0.35) / Math.max(1, b.h), 3);
    const s = zoom ? fitScale : Math.max(cur, Math.min(fitScale, cur));
    const [cx, cy] = [b.x + b.w / 2, b.y + b.h / 2];
    inst.setTransform(vw / 2 - cx * s, vh / 2 - cy * s, s, 280, "easeOut");
  }, [linesById]);

  useImperativeHandle(ref, () => ({
    zoomToLine,
    fit: () => zp.current?.fitToView({ animationTime: 250 }),
    actual: () => {
      const el = wrap.current, inst = zp.current;
      if (!el || !inst) return;
      const st = inst.instance.state;
      const cx = (el.clientWidth / 2 - st.positionX) / st.scale, cy = (el.clientHeight / 2 - st.positionY) / st.scale;
      inst.setTransform(el.clientWidth / 2 - cx, el.clientHeight / 2 - cy, 1, 250);
    },
    zoomIn: () => zp.current?.zoomIn(0.35, 200),
    zoomOut: () => zp.current?.zoomOut(0.35, 200),
  }), [zoomToLine]);

  // ── pointer helpers (content = image pixel coordinates)
  const toContent = (e: React.PointerEvent | PointerEvent): Pt => {
    const r = svg.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * W), Math.round(((e.clientY - r.top) / r.height) * H)];
  };

  const layoutCall = async (fn: () => Promise<unknown>, okText?: string) => {
    setBusy(true);
    try {
      await fn();
      await onLayoutChanged();
      if (okText) toast({ tone: "ok", text: okText });
    } catch (e) {
      toast({ tone: "bad", text: e instanceof ApiError ? e.message : t("manuscripts.error.generic") });
    } finally {
      setBusy(false);
      setOverride(null);
    }
  };

  const onSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!layoutMode || tool === "select") return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const pt = toContent(e);
    drag.current = { mode: "draw", start: pt };
    setDraft({ x: pt[0], y: pt[1], w: 0, h: 0 });
  };
  const onSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const pt = toContent(e);
    if (d.mode === "draw") setDraft(boxFromPoints(d.start, pt));
    else if (d.mode === "move" && d.orig && d.id) {
      const dx = pt[0] - d.start[0], dy = pt[1] - d.start[1];
      setOverride({ id: d.id, poly: d.orig.map(([x, y]) => [x + dx, y + dy] as Pt) });
    } else if (d.mode === "resize" && d.orig && d.id && d.corner !== undefined) {
      const b = bbox(d.orig);
      const x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
      const corners: Pt[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      const opposite = corners[(d.corner + 2) % 4];
      const nb = boxFromPoints(opposite, pt);
      if (nb.w > 6 && nb.h > 6) setOverride({ id: d.id, poly: fitPolygon(d.orig, nb) });
    }
  };
  const onSvgPointerUp = async () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.mode === "draw") {
      const b = draft;
      setDraft(null);
      if (!b || b.w < 8 || b.h < 6) return;
      const polygon = rectPolygon(b);
      if (tool === "line") await layoutCall(() => api(`/api/ms/pages/${detail.page.id}/lines`, { method: "POST", json: { polygon } }), t("manuscripts.layout.created"));
      else await layoutCall(() => api(`/api/ms/pages/${detail.page.id}/regions`, { method: "POST", json: { type: regionType, polygon } }), t("manuscripts.layout.regionCreated"));
      return;
    }
    if (override && d.id) {
      const poly = override.poly;
      const url = d.kind === "region" ? `/api/ms/regions/${d.id}` : `/api/ms/lines/${d.id}`;
      await layoutCall(() => api(url, { method: "PATCH", json: { polygon: poly } }), t("manuscripts.layout.saved"));
    }
  };

  const startShapeDrag = (e: React.PointerEvent, kind: "line" | "region", id: string, poly: Polygon, corner?: number) => {
    if (!layoutMode || tool !== "select") return;
    e.stopPropagation();
    e.preventDefault();
    setLayoutSel({ kind, id });
    (svg.current as unknown as Element)?.setPointerCapture?.(e.pointerId);
    drag.current = { mode: corner === undefined ? "move" : "resize", start: toContent(e), orig: poly, corner, id, kind };
  };

  const deleteSelected = async () => {
    if (!layoutSel) return;
    const url = layoutSel.kind === "region" ? `/api/ms/regions/${layoutSel.id}` : `/api/ms/lines/${layoutSel.id}`;
    setLayoutSel(null);
    await layoutCall(() => api(url, { method: "DELETE" }), t("manuscripts.layout.deleted"));
  };

  const autoDetect = async () => {
    const replace = detail.lines.length > 0;
    setBusy(true);
    try {
      const r = await api<{ lines: number }>(`/api/ms/pages/${detail.page.id}/segment`, { method: "POST", json: { replace } });
      await onLayoutChanged();
      toast({ tone: "ok", text: t("manuscripts.layout.detected", { n: num(r.lines, locale) }) });
    } catch (e) {
      toast({ tone: "bad", text: e instanceof ApiError ? e.message : t("manuscripts.error.generic") });
    } finally {
      setBusy(false);
    }
  };

  const changeRegionType = async (type: RegionType) => {
    if (layoutSel?.kind !== "region") return;
    await layoutCall(() => api(`/api/ms/regions/${layoutSel.id}`, { method: "PATCH", json: { type } }), t("manuscripts.layout.saved"));
  };

  // pointer-up without movement on a line polygon = select it (panning starts on the same press)
  const lineDown = (e: React.PointerEvent) => { down.current = [e.clientX, e.clientY]; };
  const lineUp = (e: React.PointerEvent, l: LineDTO) => {
    const d = down.current;
    down.current = null;
    if (layoutMode) {
      if (tool === "select") setLayoutSel({ kind: "line", id: l.id });
      return;
    }
    if (d && Math.hypot(e.clientX - d[0], e.clientY - d[1]) < 6) onSelect(l.id);
  };

  const sw = (px: number) => px / Math.max(scale, 0.05); // screen pixels → content units
  const presentTypes = [...new Set(detail.regions.map((r) => r.type))];
  const selectedLine = selectedId ? linesById.get(selectedId) : null;
  const selPolyOf = (id: string, poly: Polygon) => (override?.id === id ? override.poly : poly);
  const layoutSelPoly = layoutSel
    ? layoutSel.kind === "line" ? linesById.get(layoutSel.id)?.polygon : detail.regions.find((r) => r.id === layoutSel.id)?.polygon
    : undefined;
  const layoutSelRegion = layoutSel?.kind === "region" ? detail.regions.find((r) => r.id === layoutSel.id) : undefined;

  const ctl = (label: string, icon: React.ReactNode, onClick: () => void, pressed?: boolean, extra?: string) => (
    <button type="button" onClick={onClick} aria-label={label} title={label} aria-pressed={pressed}
      className={cn("size-9 grid place-items-center rounded-[9px] transition-colors", pressed ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-2 hover:text-ink", extra)}>
      {icon}
    </button>
  );

  return (
    <section aria-label={t("manuscripts.img.label")} className="relative h-full min-h-0 bg-sand overflow-hidden khatam-bg" data-testid="image-pane">
      <div ref={wrap} className="absolute inset-0" dir="ltr">
        <TransformWrapper
          ref={zp}
          minScale={0.05}
          maxScale={6}
          limitToBounds={false}
          centerOnInit
          fitOnInit="contain"
          wheel={{ step: 0.12 }}
          doubleClick={{ disabled: true }}
          panning={{ disabled: layoutMode && tool !== "select", excluded: layoutMode ? ["ms-shape", "ms-handle"] : [], velocityDisabled: true }}
          onTransform={(_r, s) => setScale(s.scale)}
          onInit={(r) => setScale(r.state.scale)}
        >
          <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: W, height: H }}>
            <div className="relative shadow-[0_8px_40px_rgb(60_45_20/0.18)]" style={{ width: W, height: H }}>
                            <img ref={img} src={detail.page.image_path} width={W} height={H} alt={t("manuscripts.img.alt", { title: locale === "ar" ? detail.manuscript.title_ar : detail.manuscript.title_en, page: t("manuscripts.page.n", { n: num(detail.page.seq, locale) }), n: num(detail.lines.length, locale) })}
                onLoad={() => setLoaded(true)} draggable={false} className="block select-none" style={{ width: W, height: H, filter: FILTER_CSS[filter] }} />
              <svg ref={svg} viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={cn("absolute inset-0", layoutMode && tool !== "select" && "cursor-crosshair")}
                onPointerDown={onSvgPointerDown} onPointerMove={onSvgPointerMove} onPointerUp={onSvgPointerUp} aria-hidden>
                {overlays.regions && detail.regions.map((r) => {
                  const st = regionStyle(r.type);
                  const poly = selPolyOf(r.id, r.polygon);
                  const isSel = layoutSel?.kind === "region" && layoutSel.id === r.id;
                  return (
                    <polygon key={r.id} points={toPoints(poly)} fill={st.color} fillOpacity={isSel ? 0.12 : 0.04} stroke={st.color} strokeOpacity={0.9}
                      strokeWidth={isSel ? 2.5 : 1.5} strokeDasharray={st.dash} vectorEffect="non-scaling-stroke"
                      className={cn(layoutMode && tool === "select" ? "ms-shape cursor-move" : "pointer-events-none")}
                      style={{ pointerEvents: layoutMode && tool === "select" ? "visibleStroke" : "none" }}
                      onPointerDown={(e) => startShapeDrag(e, "region", r.id, r.polygon)} />
                  );
                })}
                {overlays.lines && detail.lines.map((l) => {
                  const poly = selPolyOf(l.id, l.polygon);
                  const sel = l.id === selectedId;
                  const hov = l.id === hoverId;
                  const lockedOther = !!l.locked_by && l.locked_by !== myId;
                  const lsel = layoutSel?.kind === "line" && layoutSel.id === l.id;
                  return (
                    <polygon key={l.id} points={toPoints(poly)} data-line={l.id}
                      fill={sel || lsel ? "#0a8c77" : hov ? "#0a8c77" : "#ffffff"}
                      fillOpacity={sel || lsel ? 0.17 : hov ? 0.1 : 0.001}
                      stroke={lockedOther ? "#c27a00" : "#0a8c77"}
                      strokeOpacity={sel || hov || lsel ? 1 : lockedOther ? 0.9 : 0.42}
                      strokeWidth={sel || lsel ? 2.25 : lockedOther ? 2 : 1}
                      strokeDasharray={lockedOther ? "6 4" : undefined}
                      vectorEffect="non-scaling-stroke"
                      className={cn("transition-[fill-opacity,stroke-opacity] duration-150", layoutMode ? (tool === "select" ? "ms-shape cursor-move" : "pointer-events-none") : "cursor-pointer")}
                      onPointerEnter={() => onHover(l.id)} onPointerLeave={() => onHover(null)}
                      onPointerDown={(e) => (layoutMode ? startShapeDrag(e, "line", l.id, l.polygon) : lineDown(e))}
                      onPointerUp={(e) => lineUp(e, l)} />
                  );
                })}
                {selectedLine && overlays.lines && !layoutMode && (() => {
                  const b = bbox(selectedLine.polygon);
                  const r = sw(13);
                  const cx = b.x + b.w + sw(18), cy = b.y + b.h / 2;
                  return (
                    <g className="pointer-events-none">
                      <circle cx={Math.min(cx, W - r)} cy={cy} r={r} fill="#0a8c77" />
                      <text x={Math.min(cx, W - r)} y={cy} dy="0.35em" textAnchor="middle" fill="#fff" fontSize={sw(13)} fontWeight={600} fontFamily="var(--font-ui)">{num(selectedLine.n, locale)}</text>
                    </g>
                  );
                })()}
                {overlays.lines && detail.lines.filter((l) => l.locked_by && l.locked_by !== myId).map((l) => {
                  const [cx] = center(l.polygon);
                  const b = bbox(l.polygon);
                  const name = (locale === "ar" ? l.lock_name_ar : l.lock_name_en) ?? "";
                  return (
                    <g key={`lk-${l.id}`} className="pointer-events-none">
                      <rect x={cx - sw(70)} y={b.y - sw(24)} width={sw(140)} height={sw(20)} rx={sw(10)} fill="#c27a00" />
                      <text x={cx} y={b.y - sw(14)} dy="0.35em" textAnchor="middle" fill="#fff" fontSize={sw(11)} fontFamily="var(--font-ui)">{t("manuscripts.text.lockedBy", { name: name.split(" ")[0] })}</text>
                    </g>
                  );
                })}
                {layoutMode && layoutSelPoly && tool === "select" && (() => {
                  const poly = selPolyOf(layoutSel!.id, layoutSelPoly);
                  const b = bbox(poly);
                  const corners: Pt[] = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
                  return corners.map((c, i) => (
                    <rect key={i} x={c[0] - sw(6)} y={c[1] - sw(6)} width={sw(12)} height={sw(12)} rx={sw(2)} fill="#fff" stroke="#5747e0" strokeWidth={1.5} vectorEffect="non-scaling-stroke"
                      className="ms-handle cursor-nwse-resize" onPointerDown={(e) => startShapeDrag(e, layoutSel!.kind, layoutSel!.id, layoutSelPoly, i)} />
                  ));
                })()}
                {draft && <rect x={draft.x} y={draft.y} width={draft.w} height={draft.h} fill="#5747e0" fillOpacity={0.12} stroke="#5747e0" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}
                {extraOverlay}
              </svg>
            </div>
          </TransformComponent>
        </TransformWrapper>
      </div>

      {!loaded && <div className="absolute inset-0 grid place-items-center pointer-events-none"><Spinner label={t("manuscripts.loading")} /></div>}

      {/* Controls */}
      <div className="absolute top-3 start-3 flex flex-col gap-2 items-start">
        <div role="toolbar" aria-label={t("manuscripts.img.label")} className="flex items-center gap-0.5 rounded-[12px] bg-surface/95 backdrop-blur border border-line shadow-card p-1">
          {ctl(t("manuscripts.img.zoomIn"), <ZoomIn className="size-4" />, () => zp.current?.zoomIn(0.35, 200))}
          {ctl(t("manuscripts.img.zoomOut"), <ZoomOut className="size-4" />, () => zp.current?.zoomOut(0.35, 200))}
          {ctl(t("manuscripts.img.fit"), <Maximize className="size-4" />, () => zp.current?.fitToView({ animationTime: 250 }))}
          <button type="button" onClick={() => {
            const el = wrap.current, inst = zp.current;
            if (!el || !inst) return;
            const st = inst.instance.state;
            const cx = (el.clientWidth / 2 - st.positionX) / st.scale, cy = (el.clientHeight / 2 - st.positionY) / st.scale;
            inst.setTransform(el.clientWidth / 2 - cx, el.clientHeight / 2 - cy, 1, 250);
          }} aria-label={t("manuscripts.img.actual")} title={t("manuscripts.img.actual")} className="h-9 px-2 rounded-[9px] text-xs font-semibold tabular text-ink-2 hover:bg-surface-2">{Math.round(scale * 100)}%</button>
          {ctl(t("manuscripts.img.zoomLine"), <Focus className="size-4" />, () => selectedId && zoomToLine(selectedId))}
          <span className="w-px h-5 bg-line mx-0.5" aria-hidden />
          {ctl(t("manuscripts.img.regions"), <Layers className="size-4" />, () => onOverlays({ ...overlays, regions: !overlays.regions }), overlays.regions)}
          {ctl(t("manuscripts.img.lines"), overlays.lines ? <Eye className="size-4" /> : <EyeOff className="size-4" />, () => onOverlays({ ...overlays, lines: !overlays.lines }), overlays.lines)}
          <button type="button" onClick={() => onFilter(FILTERS[(FILTERS.indexOf(filter) + 1) % FILTERS.length])} aria-label={`${t("manuscripts.img.filter")}: ${t(`manuscripts.img.filter.${filter}`)}`} title={`${t("manuscripts.img.filter")}: ${t(`manuscripts.img.filter.${filter}`)}`}
            className={cn("h-9 px-2 rounded-[9px] inline-flex items-center gap-1.5 text-xs font-medium", filter !== "none" ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-2")}>
            <Contrast className="size-4" />{filter !== "none" && <span className="hidden sm:inline">{t(`manuscripts.img.filter.${filter}`)}</span>}
          </button>
          {detail.viewer.canLayout && (
            <>
              <span className="w-px h-5 bg-line mx-0.5" aria-hidden />
              <button type="button" onClick={() => { onLayoutMode(!layoutMode); setLayoutSel(null); setTool("select"); }} aria-pressed={layoutMode}
                className={cn("h-9 px-2.5 rounded-[9px] inline-flex items-center gap-1.5 text-sm font-medium", layoutMode ? "bg-violet text-white" : "text-ink-2 hover:bg-surface-2")}>
                <PenLine className="size-4" />{layoutMode ? t("manuscripts.layout.done") : t("manuscripts.layout.edit")}
              </button>
            </>
          )}
        </div>
        {layoutMode && (
          <div className="flex flex-col gap-2 rounded-[12px] bg-surface/95 backdrop-blur border border-violet/40 shadow-card p-2 max-w-[22rem] animate-pop" role="group" aria-label={t("manuscripts.layout.edit")}>
            <div className="flex flex-wrap items-center gap-1">
              {([["select", MousePointer2], ["line", RectangleHorizontal], ["region", SquareDashed]] as const).map(([k, Icon]) => (
                <button key={k} type="button" onClick={() => { setTool(k); setLayoutSel(null); }} aria-pressed={tool === k}
                  className={cn("h-9 px-2.5 rounded-[9px] inline-flex items-center gap-1.5 text-sm", tool === k ? "bg-violet text-white" : "text-ink-2 hover:bg-surface-2")}>
                  <Icon className="size-4" />{t(k === "select" ? "manuscripts.layout.select" : k === "line" ? "manuscripts.layout.drawLine" : "manuscripts.layout.drawRegion")}
                </button>
              ))}
            </div>
            {tool === "region" && (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-ink-3">{t("manuscripts.layout.regionType")}</span>
                <select value={regionType} onChange={(e) => setRegionType(e.target.value as RegionType)} className="h-9 rounded-[9px] border border-line-strong bg-surface px-2">
                  {REGION_TYPES.map((r) => <option key={r} value={r}>{t(`manuscripts.region.${r}`)}</option>)}
                </select>
              </label>
            )}
            {layoutSelRegion && (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-ink-3">{t("manuscripts.layout.regionType")}</span>
                <select value={layoutSelRegion.type} onChange={(e) => changeRegionType(e.target.value as RegionType)} className="h-9 rounded-[9px] border border-line-strong bg-surface px-2">
                  {REGION_TYPES.map((r) => <option key={r} value={r}>{t(`manuscripts.region.${r}`)}</option>)}
                </select>
              </label>
            )}
            <p className="text-xs text-ink-3">{t(`manuscripts.layout.hint.${tool === "line" ? "drawLine" : tool === "region" ? "drawRegion" : "select"}`)}</p>
            <div className="flex flex-wrap gap-1">
              {layoutSel && (
                <button type="button" onClick={deleteSelected} className="h-9 px-2.5 rounded-[9px] inline-flex items-center gap-1.5 text-sm text-bad hover:bg-bad-soft"><Trash className="size-4" />{t("manuscripts.layout.delete")}</button>
              )}
              {!detail.lines.some((l) => l.has_human) && (
                <button type="button" onClick={autoDetect} disabled={busy} className="h-9 px-2.5 rounded-[9px] inline-flex items-center gap-1.5 text-sm text-ink-2 hover:bg-surface-2 disabled:opacity-50">
                  <WandSparkles className="size-4" />{detail.lines.length ? t("manuscripts.layout.autoReplace") : t("manuscripts.layout.auto")}
                </button>
              )}
              {busy && <Spinner />}
            </div>
          </div>
        )}
      </div>

      {/* Legend + credit */}
      <div className="absolute bottom-0 inset-x-0 p-3 flex flex-col gap-2 pointer-events-none">
        {overlays.regions && presentTypes.length > 0 && (
          <ul aria-label={t("manuscripts.img.legend")} className="self-start flex flex-wrap gap-1.5 pointer-events-auto">
            {presentTypes.map((ty) => {
              const st = regionStyle(ty);
              return (
                <li key={ty} className="inline-flex items-center gap-1.5 rounded-full bg-surface/95 border border-line px-2.5 h-7 text-xs shadow-card">
                  <svg width="18" height="8" aria-hidden><line x1="1" y1="4" x2="17" y2="4" stroke={st.color} strokeWidth="2.5" strokeDasharray={st.dash ? "4 2" : undefined} /></svg>
                  {t(`manuscripts.region.${ty}`)}
                </li>
              );
            })}
            <li className="inline-flex items-center gap-1.5 rounded-full bg-surface/95 border border-line px-2.5 h-7 text-xs shadow-card">
              <ScanLine className="size-3.5 text-accent" />{t("manuscripts.img.lines")}
            </li>
          </ul>
        )}
        <p className="self-stretch text-[0.68rem] leading-snug text-sand-ink/90 bg-sand/90 rounded-md px-2 py-1 pointer-events-auto line-clamp-2" dir="ltr">
          {t("manuscripts.img.credit")}: {detail.manuscript.credit_line}
        </p>
      </div>
    </section>
  );
});

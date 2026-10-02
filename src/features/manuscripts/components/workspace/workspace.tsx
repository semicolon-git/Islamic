"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CircleQuestionMark, Download, Flag, FlaskConical, Lock, Radio, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import { useEvents } from "@/lib/use-events";
import type { WorkspaceContext } from "../../extensions";
import { studioExtensions } from "../../studio-extensions";
import type { LineVersionDTO, PageDetail } from "../../types";
import { api, ApiError, num } from "../api";
import { ExportSheet } from "../export-sheet";
import type { ImageFilter } from "../line-crop";
import { PageStatus } from "../status";
import { ImagePane, type ImagePaneHandle } from "./image-pane";
import { isTyping } from "./keys";
import type { EditorCommand } from "./line-editor";
import type { SessionHandle } from "./line-session";
import { DraftSheet, EvalSheet, FlagSheet, HistorySheet, ShortcutsSheet } from "./sheets";
import { TextPane } from "./text-pane";
import { WorkflowActions, WorkflowStepper } from "./workflow-bar";

type SheetName = "history" | "eval" | "draft" | "flag" | "keys" | "export" | `ext:${string}` | null;
const FILTERS: ImageFilter[] = ["none", "contrast", "invert"];

export function Workspace({ initial }: { initial: PageDetail }) {
  const { t, locale, dir } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [detail, setDetail] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusToken, setFocusToken] = useState<number | undefined>();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [layer, setLayer] = useState<"diplomatic" | "reading">("diplomatic");
  const [filter, setFilter] = useState<ImageFilter>("none");
  const [overlays, setOverlays] = useState({ regions: true, lines: true });
  const [layoutMode, setLayoutMode] = useState(false);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [live, setLive] = useState(false);
  const image = useRef<ImagePaneHandle>(null);
  const session = useRef<SessionHandle>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setDetail(initial), [initial]);

  const reload = useCallback(async () => {
    try {
      setDetail(await api<PageDetail>(`/api/ms/pages/${initial.page.id}`));
    } catch (e) {
      toast({ tone: "bad", text: e instanceof ApiError ? e.message : t("manuscripts.error.load") });
    }
  }, [initial.page.id, t, toast]);
  const reloadSoon = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(reload, 250);
  }, [reload]);

  const selected = detail.lines.find((l) => l.id === selectedId) ?? null;

  const select = useCallback(async (id: string | null, opts: { token?: number; zoom?: boolean } = {}) => {
    if (id === selectedId) {
      if (opts.token !== undefined) setFocusToken(opts.token);
      return;
    }
    if (session.current?.dirty()) {
      const ok = await session.current.flush();
      if (!ok) return;
    }
    setFocusToken(opts.token);
    setSelectedId(id);
    if (id) requestAnimationFrame(() => image.current?.zoomToLine(id, opts.zoom ?? true));
  }, [selectedId]);

  const step = useCallback((d: 1 | -1) => {
    const i = detail.lines.findIndex((l) => l.id === selectedId);
    const next = detail.lines[i < 0 ? 0 : Math.max(0, Math.min(detail.lines.length - 1, i + d))];
    if (next) select(next.id);
  }, [detail.lines, selectedId, select]);

  const onCommand = useCallback((c: EditorCommand) => {
    if (c === "next") step(1);
    else if (c === "prev") step(-1);
    else if (c === "zoomLine" && selectedId) image.current?.zoomToLine(selectedId);
    else if (c === "help") setSheet("keys");
  }, [selectedId, step]);

  const onSaved = useCallback((lineId: string, v: LineVersionDTO) => {
    setDetail((d) => ({
      ...d,
      lines: d.lines.map((l) => (l.id === lineId ? { ...l, version: v, current_version: v.version, status: "transcribed", has_human: true, locked_by: d.viewer.id } : l)),
    }));
  }, []);

  // Realtime: other viewers' saves, locks, layout and workflow changes.
  useEvents([`page:${initial.page.id}`], (ev) => {
    setLive(true);
    const mine = ev.actor_id === detail.viewer.id;
    const p = ev.payload as Record<string, string>;
    for (const x of studioExtensions) x.onEvent?.({ type: ev.type, payload: ev.payload, actor_id: ev.actor_id }, ctx);
    if (mine && (ev.type === "line.saved" || ev.type === "line.locked" || ev.type === "line.unlocked")) return;
    if (ev.type === "line.locked" || ev.type === "line.unlocked") {
      setDetail((d) => ({
        ...d,
        lines: d.lines.map((l) => l.id !== p.line_id ? l : ev.type === "line.locked"
          ? { ...l, locked_by: p.user_id, locked_until: p.until, lock_name_en: p.name_en, lock_name_ar: p.name_ar, lock_hue: Number(p.hue) }
          : { ...l, locked_by: null, locked_until: null, lock_name_en: null, lock_name_ar: null, lock_hue: null }),
      }));
      return;
    }
    if (ev.type === "line.saved" && !mine) {
      const n = detail.lines.find((l) => l.id === p.line_id)?.n;
      toast({ tone: "info", text: t("manuscripts.updatedBy", { name: (locale === "ar" ? p.author_name_ar : p.author_name_en) ?? "", n: n ? num(n, locale) : "" }) });
    }
    reloadSoon();
  });

  // Expired locks disappear without an event.
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setDetail((d) => d.lines.some((l) => l.locked_until && new Date(l.locked_until).getTime() < now)
        ? { ...d, lines: d.lines.map((l) => (l.locked_until && new Date(l.locked_until).getTime() < now ? { ...l, locked_by: null, locked_until: null } : l)) }
        : d);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Global keys (not while typing or in a dialog). Physical keys: works with Arabic layouts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
      const k = e.code;
      const act: Record<string, () => void> = {
        KeyJ: () => step(1), ArrowDown: () => step(1), KeyK: () => step(-1), ArrowUp: () => step(-1),
        Equal: () => image.current?.zoomIn(), NumpadAdd: () => image.current?.zoomIn(),
        Minus: () => image.current?.zoomOut(), NumpadSubtract: () => image.current?.zoomOut(),
        Digit0: () => image.current?.fit(), Digit1: () => image.current?.actual(),
        KeyL: () => selectedId && image.current?.zoomToLine(selectedId),
        KeyI: () => setFilter((f) => FILTERS[(FILTERS.indexOf(f) + 1) % FILTERS.length]),
        KeyO: () => setOverlays((o) => ({ regions: !o.lines, lines: !o.lines })),
        KeyR: () => setLayer((l) => (l === "diplomatic" ? "reading" : "diplomatic")),
        Enter: () => session.current?.focus(),
      };
      if (e.shiftKey && k === "Slash") { e.preventDefault(); setSheet("keys"); return; }
      if (e.shiftKey) return;
      if (act[k]) { e.preventDefault(); act[k](); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, step]);

  const ctx: WorkspaceContext = useMemo(() => ({
    detail, selected, selectLine: (id) => void select(id), reload, zoomToLine: (id) => image.current?.zoomToLine(id),
  }), [detail, selected, select, reload]);

  const restore = async (v: LineVersionDTO) => {
    if (!selected) return;
    if (session.current?.dirty()) await session.current.flush();
    try {
      await api(`/api/ms/lines/${selected.id}`, { method: "PUT", json: { base_version: selected.current_version, tokens: v.tokens, normalized_text: v.normalized_text, note: `Restored version ${v.version}` } });
      toast({ tone: "ok", text: t("manuscripts.ed.undone") });
      setSheet(null);
      setSelectedId(null);
      await reload();
      setSelectedId(selected.id);
    } catch (e) {
      toast({ tone: "bad", text: e instanceof ApiError ? e.message : t("manuscripts.error.generic") });
    }
  };

  const reorder = async (ids: string[]) => {
    setDetail((d) => ({ ...d, lines: ids.map((id, i) => ({ ...d.lines.find((l) => l.id === id)!, n: i + 1 })) }));
    try {
      await api(`/api/ms/pages/${detail.page.id}/reorder`, { method: "POST", json: { line_ids: ids } });
    } catch (e) {
      toast({ tone: "bad", text: e instanceof ApiError ? e.message : t("manuscripts.error.generic") });
    }
    await reload();
  };

  const goPage = async (id: string | null) => {
    if (!id) return;
    if (session.current?.dirty() && !(await session.current.flush())) return;
    router.push(`/portal/manuscripts/${detail.manuscript.id}/pages/${id}`);
  };

  const resolveFlag = async () => {
    try {
      await api(`/api/ms/pages/${detail.page.id}/flag`, { method: "POST", json: { flagged: false } });
      toast({ tone: "ok", text: t("manuscripts.flag.resolved") });
      await reload();
    } catch (e) {
      toast({ tone: "bad", text: e instanceof ApiError ? e.message : t("manuscripts.error.generic") });
    }
  };

  const Prev = dir === "rtl" ? ChevronRight : ChevronLeft;
  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;
  const title = locale === "ar" ? detail.manuscript.title_ar : detail.manuscript.title_en;
  const lastReturn = detail.reviews.find((r) => r.decision === "return");
  const panels = studioExtensions.flatMap((x) => x.panels ?? []).filter((pn) => !pn.visible || pn.visible(ctx));
  const v = detail.viewer;

  const tool = (label: string, icon: React.ReactNode, onClick: () => void, extra?: { pressed?: boolean; testid?: string }) => (
    <button type="button" onClick={onClick} aria-label={label} title={label} aria-pressed={extra?.pressed} data-testid={extra?.testid}
      className={cn("h-9 px-2 xl:px-2.5 rounded-[10px] inline-flex items-center gap-1.5 text-sm font-medium transition-colors", extra?.pressed ? "bg-warn-soft text-warn" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
      {icon}<span className="hidden 2xl:inline">{label}</span>
    </button>
  );

  const banners = (
    <>
      {detail.page.flagged && (
        <div className="flex items-start gap-3 px-4 py-2.5 bg-warn-soft border-b border-warn/30 text-sm" role="status" data-testid="flag-banner">
          <Flag className="size-4 text-warn mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0"><strong className="font-semibold">{t("manuscripts.flag.banner")}</strong>{detail.page.flag_reason && <span className="text-ink-2"> · {detail.page.flag_reason}</span>}</div>
          {(v.role === "researcher" || v.role === "institution_admin" || v.role === "platform_admin") && <Button size="sm" variant="secondary" onClick={resolveFlag}>{t("manuscripts.flag.resolve")}</Button>}
        </div>
      )}
      {detail.page.status === "published" && (
        <div className="flex items-center gap-2 px-4 py-2 bg-ok-soft text-ok text-sm border-b border-line" data-testid="published-banner">
          <Lock className="size-4 shrink-0" />
          <span className="truncate">{t("manuscripts.wf.publishedBanner", { v: num(detail.page.published_version ?? 1, locale), sha: (detail.page.published_sha ?? "").slice(0, 12) })}</span>
        </div>
      )}
      {detail.page.status !== "published" && !v.canEdit && (v.role === "institution_admin" || detail.page.status === "researcher_approved" || detail.page.status === "student_submitted") && (
        <div className="px-4 py-2 bg-surface-2 text-ink-2 text-sm border-b border-line">{v.role === "institution_admin" ? t("manuscripts.wf.reviewOnly") : t("manuscripts.wf.frozen")}</div>
      )}
      {detail.page.status === "returned" && lastReturn?.note && (
        <div className="px-4 py-2 bg-warn-soft/60 text-sm border-b border-line"><strong>{t("manuscripts.status.returned")}:</strong> <span className="text-ink-2">{lastReturn.note}</span></div>
      )}
    </>
  );

  return (
    <div className="flex flex-col -mx-4 lg:-mx-8 -my-6 h-[calc(100dvh-3.5rem)] min-h-[560px]" data-testid="workspace">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 border-b border-line bg-surface">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Link href={`/portal/manuscripts/${detail.manuscript.id}`} className="flex items-center gap-2 min-w-0 rounded-[10px] hover:bg-surface-2 px-1.5 py-1">
            {detail.manuscript.siglum && <span className="size-9 shrink-0 rounded-[10px] bg-sand text-sand-ink grid place-items-center font-ms text-xl leading-none"><span className="inline-block translate-y-[0.14em]">{detail.manuscript.siglum}</span></span>}
            <span className="flex flex-col min-w-0 leading-tight">
              <span className="text-sm font-semibold truncate">{title}</span>
              <span className="text-xs text-ink-3 truncate"><bdi>{detail.manuscript.shelfmark}</bdi> · {detail.page.label ?? t("manuscripts.page.n", { n: num(detail.page.seq, locale) })}</span>
            </span>
          </Link>
          <nav className="flex items-center shrink-0" aria-label={t("manuscripts.pageOf", { i: num(detail.neighbours.index, locale), n: num(detail.neighbours.total, locale) })}>
            <button type="button" disabled={!detail.neighbours.prev} onClick={() => goPage(detail.neighbours.prev)} className="size-8 grid place-items-center rounded-full text-ink-2 hover:bg-surface-2 disabled:opacity-30" aria-label={t("manuscripts.prevPage")}><Prev className="size-4" /></button>
            <span className="text-xs text-ink-3 tabular whitespace-nowrap">{t("manuscripts.pageOf", { i: num(detail.neighbours.index, locale), n: num(detail.neighbours.total, locale) })}</span>
            <button type="button" disabled={!detail.neighbours.next} onClick={() => goPage(detail.neighbours.next)} className="size-8 grid place-items-center rounded-full text-ink-2 hover:bg-surface-2 disabled:opacity-30" aria-label={t("manuscripts.nextPage")}><Next className="size-4" /></button>
          </nav>
        </div>
        <div className="hidden lg:block"><WorkflowStepper detail={detail} /></div>
        <div className="lg:hidden"><PageStatus status={detail.page.status} /></div>
        <div className="flex items-center gap-1">
          {live && <span className="hidden md:inline-flex items-center gap-1 text-[0.7rem] text-ok me-1" title={t("manuscripts.live")}><Radio className="size-3.5" />{t("manuscripts.live")}</span>}
          {v.role !== "specialist" && !detail.page.flagged && tool(t("manuscripts.flag.button"), <Flag className="size-4" />, () => setSheet("flag"))}
          {v.canDraft && tool(t("manuscripts.draft.button"), <WandSparkles className="size-4" />, () => setSheet("draft"))}
          {v.canEval && tool(t("manuscripts.eval.button"), <FlaskConical className="size-4" />, () => setSheet("eval"), { testid: "open-eval" })}
          {tool(t("manuscripts.export"), <Download className="size-4" />, () => setSheet("export"), { testid: "open-export" })}
          {tool(t("manuscripts.tool.shortcuts"), <CircleQuestionMark className="size-4" />, () => setSheet("keys"))}
          {studioExtensions.map((x) => x.toolbarExtras && <span key={x.id}>{x.toolbarExtras(ctx)}</span>)}
          {panels.map((pn) => <span key={pn.id}>{tool(pn.label, pn.icon ?? null, () => setSheet(`ext:${pn.id}`))}</span>)}
        </div>
        <WorkflowActions detail={detail} onChanged={reload} beforeAction={async () => (session.current?.dirty() ? session.current.flush() : true)} />
      </header>

      <div className="flex-1 min-h-0 grid grid-rows-[minmax(280px,42dvh)_1fr] lg:grid-rows-1 lg:grid-cols-[minmax(0,1.12fr)_minmax(420px,1fr)]">
        <ImagePane
          ref={image}
          detail={detail}
          selectedId={selectedId}
          hoverId={hoverId}
          onHover={setHoverId}
          onSelect={(id) => select(id, { zoom: false })}
          filter={filter}
          onFilter={setFilter}
          overlays={overlays}
          onOverlays={setOverlays}
          layoutMode={layoutMode}
          onLayoutMode={setLayoutMode}
          onLayoutChanged={reload}
          myId={v.id}
          extraOverlay={studioExtensions.map((x) => x.imageOverlay && <g key={x.id}>{x.imageOverlay(ctx)}</g>)}
        />
        <div className="min-h-0 border-t lg:border-t-0 lg:border-s border-line">
          <TextPane
            ref={session}
            detail={detail}
            ctx={ctx}
            selectedId={selectedId}
            hoverId={hoverId}
            focusToken={focusToken}
            onHover={setHoverId}
            onSelect={(id, tok) => select(id, { token: tok })}
            layer={layer}
            onLayer={setLayer}
            filter={filter}
            layoutMode={layoutMode}
            onReorder={reorder}
            onSaved={onSaved}
            onCommand={onCommand}
            onHistory={() => setSheet("history")}
            onCloseEditor={() => select(null)}
            banners={banners}
          />
        </div>
      </div>

      <HistorySheet open={sheet === "history"} onClose={() => setSheet(null)} line={selected} detail={detail} onRestore={restore} onApproved={reload} />
      {v.canEval && <EvalSheet open={sheet === "eval"} onClose={() => setSheet(null)} detail={detail} onPick={(id) => { setSheet(null); select(id); }} />}
      <DraftSheet open={sheet === "draft"} onClose={() => setSheet(null)} detail={detail} onDone={reload} />
      <FlagSheet open={sheet === "flag"} onClose={() => setSheet(null)} detail={detail} onDone={reload} />
      <ShortcutsSheet open={sheet === "keys"} onClose={() => setSheet(null)} />
      <ExportSheet open={sheet === "export"} onClose={() => setSheet(null)} pageId={detail.page.id} msId={detail.manuscript.id} />
      {panels.map((pn) => sheet === `ext:${pn.id}` && <div key={pn.id}>{pn.render({ ...ctx, close: () => setSheet(null) })}</div>)}
    </div>
  );
}

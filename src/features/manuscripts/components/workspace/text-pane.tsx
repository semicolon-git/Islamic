"use client";
import { forwardRef, useEffect, useRef } from "react";
import { ArrowDown, ArrowUp, ScanLine, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/feedback";
import { cn } from "@/components/ui/cn";
import { Segmented } from "@/components/ui/tabs";
import { useI18n } from "@/i18n/client";
import type { WorkspaceContext } from "../../extensions";
import { studioExtensions } from "../../studio-extensions";
import type { Tok } from "../../tokens";
import type { LineDTO, LineVersionDTO, PageDetail } from "../../types";
import { num } from "../api";
import type { ImageFilter } from "../line-crop";
import { LineStatusDot, lineState } from "../status";
import { TokenText } from "../token-view";
import type { EditorCommand } from "./line-editor";
import { LineSession, type SessionHandle } from "./line-session";

interface Props {
  detail: PageDetail;
  ctx: WorkspaceContext;
  selectedId: string | null;
  hoverId: string | null;
  focusToken?: number;
  onHover: (id: string | null) => void;
  onSelect: (id: string, tokenIndex?: number) => void;
  layer: "diplomatic" | "reading";
  onLayer: (l: "diplomatic" | "reading") => void;
  filter: ImageFilter;
  layoutMode: boolean;
  onReorder: (ids: string[]) => void;
  onSaved: (lineId: string, v: LineVersionDTO) => void;
  onCommand: (c: EditorCommand) => void;
  onHistory: () => void;
  onCloseEditor: () => void;
  banners?: React.ReactNode;
}

export const TextPane = forwardRef<SessionHandle, Props>(function TextPane(p, sessionRef) {
  const { detail, ctx, selectedId, hoverId, focusToken, onHover, onSelect, layer, onLayer, filter, layoutMode, onReorder, onSaved, onCommand, onHistory, onCloseEditor, banners } = p;
  const { t, locale } = useI18n();
  const list = useRef<HTMLOListElement>(null);
  const checked = detail.lines.filter((l) => l.has_human).length;
  const regionType = (l: LineDTO) => detail.regions.find((r) => r.id === l.region_id)?.type;

  useEffect(() => {
    if (!selectedId) return;
    const el = document.getElementById(`row-${selectedId}`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  const move = (i: number, d: -1 | 1) => {
    const ids = detail.lines.map((l) => l.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    onReorder(ids);
  };

  return (
    <section aria-label={t("manuscripts.text.label")} className="flex flex-col h-full min-h-0 bg-surface" data-testid="text-pane">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-line">
        <h2 className="text-sm font-semibold">{t("manuscripts.text.label")}</h2>
        <span className="text-xs text-ink-3 tabular">{t("manuscripts.text.checked", { n: num(checked, locale), total: num(detail.lines.length, locale) })}</span>
        <Segmented size="sm" className="ms-auto" label={t("manuscripts.text.layer")} value={layer} onChange={onLayer}
          options={[{ value: "diplomatic", label: t("manuscripts.text.asWritten") }, { value: "reading", label: t("manuscripts.text.reading") }]} />
      </div>
      {banners}
      {detail.lines.length === 0 ? (
        <EmptyState className="flex-1" icon={<ScanLine className="size-7" />} title={t("manuscripts.layout.noLines")} body={t("manuscripts.layout.noLinesBody")} />
      ) : (
        <ol ref={list} className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-2 py-2 flex flex-col gap-0.5" aria-label={t("manuscripts.text.label")}>
          {detail.lines.map((l, i) => {
            const sel = l.id === selectedId;
            const state = lineState(l);
            const lockedOther = !!l.locked_by && l.locked_by !== detail.viewer.id;
            const lockName = (locale === "ar" ? l.lock_name_ar : l.lock_name_en) ?? "";
            const zone = regionType(l);
            if (sel)
              return (
                <li key={l.id} id={`row-${l.id}`} className="rounded-[14px] border border-accent/50 bg-surface shadow-card my-1.5 p-3 flex flex-col gap-2 animate-pop" aria-current="true" data-line-row={l.id}>
                  <div className="flex items-center gap-2">
                    <span className="min-w-8 h-7 px-1.5 rounded-full bg-accent text-accent-ink grid place-items-center text-xs font-semibold tabular">{num(l.n, locale)}</span>
                    <LineStatusDot state={state} withLabel />
                    {zone && zone !== "main" && <Badge tone="violet">{t(`manuscripts.region.${zone}`)}</Badge>}
                    {lockedOther && <Badge tone="warn" data-testid="row-lock"><Avatar name={lockName} hue={l.lock_hue ?? 40} size={16} />{t("manuscripts.text.lockedBy", { name: lockName })}</Badge>}
                    <button type="button" onClick={onCloseEditor} className="ms-auto size-8 grid place-items-center rounded-full text-ink-3 hover:bg-surface-2" aria-label={t("manuscripts.ed.close")}><X className="size-4" /></button>
                  </div>
                  <LineSession
                    key={l.id}
                    ref={sessionRef}
                    detail={detail}
                    line={l}
                    filter={filter}
                    focusToken={focusToken}
                    onSaved={(v) => onSaved(l.id, v)}
                    onCommand={onCommand}
                    onHistory={onHistory}
                    onClose={onCloseEditor}
                    extras={studioExtensions.some((x) => x.lineEditorExtras)
                      ? (tokens: Tok[], setTokens: (t: Tok[]) => void) => studioExtensions.map((x) => x.lineEditorExtras && <div key={x.id}>{x.lineEditorExtras({ ...ctx, line: l, tokens, setTokens, canEdit: detail.viewer.canEdit })}</div>)
                      : undefined}
                  />
                </li>
              );
            return (
              <li key={l.id} id={`row-${l.id}`} data-line-row={l.id} className="group flex items-stretch">
                <button type="button"
                  onClick={(e) => {
                    const tok = (e.target as HTMLElement).closest("[data-tok]")?.getAttribute("data-tok");
                    onSelect(l.id, tok != null ? Number(tok) : undefined);
                  }}
                  onMouseEnter={() => onHover(l.id)} onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(l.id)} onBlur={() => onHover(null)}
                  aria-label={`${t("manuscripts.img.lineN", { n: num(l.n, locale) })}: ${l.version?.plain_text || t("manuscripts.text.emptyLine")}`}
                  className={cn("flex-1 min-w-0 flex items-start gap-3 rounded-[12px] px-2 py-1 text-start transition-colors",
                    hoverId === l.id ? "bg-accent-soft/60" : "hover:bg-surface-2", lockedOther && "ring-1 ring-warn/50")}>
                  <span className="flex flex-col items-center gap-1 pt-2.5 w-8 shrink-0">
                    <span className="text-xs font-medium text-ink-3 tabular">{num(l.n, locale)}</span>
                    <LineStatusDot state={state} />
                  </span>
                  <span className="flex-1 min-w-0 flex flex-col">
                    {zone && zone !== "main" && <span className="text-[0.68rem] text-violet font-medium">{t(`manuscripts.region.${zone}`)}</span>}
                    {l.version && l.version.tokens.length ? (
                      <TokenText tokens={l.version.tokens} layer={layer} className={cn("block text-[1.22rem] leading-[2.05]", state === "draft" && "text-ink-2")} />
                    ) : (
                      <span className="text-sm text-ink-3 italic py-2.5">{t("manuscripts.text.emptyLine")}</span>
                    )}
                  </span>
                  {lockedOther && (
                    <span className="shrink-0 pt-2.5" title={t("manuscripts.text.lockedBy", { name: lockName })} data-testid="row-lock">
                      <Avatar name={lockName} hue={l.lock_hue ?? 40} size={24} />
                      <span className="sr-only">{t("manuscripts.text.lockedBy", { name: lockName })}</span>
                    </span>
                  )}
                  {studioExtensions.map((x) => x.lineRowExtras && <span key={x.id} className="shrink-0 pt-2">{x.lineRowExtras(l, ctx)}</span>)}
                </button>
                {layoutMode && (
                  <span className="flex flex-col justify-center gap-0.5 ps-1">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="size-7 grid place-items-center rounded-md text-ink-3 hover:bg-surface-2 disabled:opacity-30" aria-label={t("manuscripts.layout.moveUp")}><ArrowUp className="size-3.5" /></button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === detail.lines.length - 1} className="size-7 grid place-items-center rounded-md text-ink-3 hover:bg-surface-2 disabled:opacity-30" aria-label={t("manuscripts.layout.moveDown")}><ArrowDown className="size-3.5" /></button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
});

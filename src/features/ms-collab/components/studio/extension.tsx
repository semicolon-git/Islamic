"use client";
/**
 * The collaboration & understanding layer, plugged into the Studio workspace through its extension slots
 * (src/features/manuscripts/extensions.ts): row badges, the panel under the line editor, presence and tools in the
 * toolbar, presence pins on the image, and realtime handling of collaboration events.
 */
import { useEffect, useState } from "react";
import { BookOpenText, GitPullRequestArrow, MessageSquare } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n/client";
import { num } from "../../../manuscripts/components/api";
import { isTyping } from "../../../manuscripts/components/workspace/keys";
import type { StudioExtension, WorkspaceContext } from "../../../manuscripts/extensions";
import { CommentsPanel } from "./comments";
import { LinePanel, RowBadges } from "./line-panel";
import { PresenceBar, PresencePins } from "./presence";
import { refreshSoon, updatePresence, useOverview } from "./store";
import { SuggestionsPanel } from "./suggestions";
import { UnderstandingPanel } from "./understanding";

type Tool = "understand" | "comments" | "suggestions" | null;

/** Toolbar: who is here, and the three collaboration tools (keys Q, C, S when not typing). */
function Toolbar({ ctx }: { ctx: WorkspaceContext }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState<Tool>(null);
  const { data } = useOverview(ctx.detail.page.id);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || document.querySelector("dialog[open]")) return;
      const tool: Record<string, Tool> = { KeyQ: "understand", KeyC: "comments", KeyS: "suggestions" };
      if (tool[e.code]) { e.preventDefault(); setOpen(tool[e.code]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const btn = (tool: Exclude<Tool, null>, label: string, icon: React.ReactNode, count?: number, testid?: string) => (
    <button type="button" onClick={() => setOpen(tool)} aria-label={count ? `${label} (${num(count, locale)})` : label} title={label} data-testid={testid}
      className={cn("relative h-9 px-2 xl:px-2.5 rounded-[10px] inline-flex items-center gap-1.5 text-sm font-medium transition-colors text-ink-2 hover:bg-surface-2 hover:text-ink")}>
      {icon}<span className="hidden 2xl:inline">{label}</span>
      {!!count && <span className="absolute -top-0.5 -end-0.5 min-w-4 h-4 px-1 rounded-full bg-violet text-white text-[0.62rem] font-semibold grid place-items-center tabular" aria-hidden>{num(count, locale)}</span>}
    </button>
  );
  return (
    <span className="inline-flex items-center gap-1">
      <PresenceBar ctx={ctx} />
      {btn("understand", t("collab.tool.understand"), <BookOpenText className="size-4" />, undefined, "open-understand")}
      {btn("comments", t("collab.tool.comments"), <MessageSquare className="size-4" />, data?.page_comments.open, "open-comments")}
      {btn("suggestions", t("collab.tool.suggestions"), <GitPullRequestArrow className="size-4" />, data?.open_suggestions, "open-suggestions")}
      {open === "understand" && <UnderstandingPanel ctx={ctx} close={() => setOpen(null)} />}
      {open === "comments" && <CommentsPanel ctx={ctx} close={() => setOpen(null)} />}
      {open === "suggestions" && <SuggestionsPanel ctx={ctx} close={() => setOpen(null)} />}
    </span>
  );
}

const COLLAB_EVENTS = /^(comment|suggestion|hardword|annotation|task)\./;

export const collabExtension: StudioExtension = {
  id: "ms-collab",
  lineRowExtras: (line, ctx) => <RowBadges line={line} ctx={ctx} />,
  lineEditorExtras: (ctx) => <LinePanel ctx={ctx} />,
  toolbarExtras: (ctx) => <Toolbar ctx={ctx} />,
  imageOverlay: (ctx) => <PresencePins ctx={ctx} />,
  shortcuts: [
    {
      group: "collab.keys.group",
      rows: [
        [["Q"], "collab.keys.understand"],
        [["C"], "collab.keys.comments"],
        [["S"], "collab.keys.suggestions"],
        [["@"], "collab.keys.mention"],
        [["Ctrl ↵"], "collab.keys.sendComment"],
      ],
    },
  ],
  onEvent: (ev, ctx) => {
    const pageId = ctx.detail.page.id;
    const p = ev.payload as Record<string, unknown>;
    if (ev.type === "presence.ping" || ev.type === "presence.leave") {
      const id = String(p.user_id ?? ev.actor_id ?? "");
      updatePresence(pageId, (list) => {
        const rest = list.filter((x) => x.id !== id);
        if (ev.type === "presence.leave") return rest;
        return [...rest, { id, name_en: String(p.name_en ?? ""), name_ar: String(p.name_ar ?? ""), hue: Number(p.hue ?? 200), role: (p.role as never) ?? "student", line_id: (p.line_id as string | null) ?? null, at: new Date().toISOString() }];
      });
      return true; // nothing on the page itself changed
    }
    if (COLLAB_EVENTS.test(ev.type)) {
      refreshSoon(pageId);
      // comments, suggestions, hard-word keyings, annotations and tasks never change the text: no page reload needed
      return true;
    }
    if (ev.type === "line.saved" || ev.type === "line.locked" || ev.type === "line.unlocked") refreshSoon(pageId, ev.type === "line.saved");
    return false;
  },
};

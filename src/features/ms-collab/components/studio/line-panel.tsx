"use client";
import { useState } from "react";
import { BookOpenText, GitPullRequestArrow, Lightbulb, MessageSquare, Scale, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/chip";
import { Callout } from "@/components/ui/feedback";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n/client";
import type { Role } from "@/lib/auth";
import type { Status } from "@/lib/workflow";
import { num } from "../../../manuscripts/components/api";
import type { LineEditorContext, WorkspaceContext } from "../../../manuscripts/extensions";
import type { LineDTO } from "../../../manuscripts/types";
import { lineAccess } from "../../rules";
import { LineComments } from "./comments";
import { ExplainSheet } from "./explain";
import { refreshSoon, useOverview } from "./store";
import { SuggestionCard, SuggestSheet, useSuggestions } from "./suggestions";
import { UnderstandingPanel } from "./understanding";

/** Compact, non-interactive badges at the end of a line row (the row itself is the button). */
export function RowBadges({ line, ctx }: { line: LineDTO; ctx: WorkspaceContext }) {
  const { t, locale } = useI18n();
  const { data } = useOverview(ctx.detail.page.id);
  if (!data) return null;
  const c = data.comments[line.id];
  const s = data.suggestions[line.id] ?? 0;
  const h = data.hard[line.id];
  const q = (data.quotes[line.id] ?? []).filter((x) => x.status !== "rejected");
  if (!c?.open && !s && !h?.disputed && !h?.open && !q.length) return null;
  return (
    <span className="flex flex-col items-end gap-1" data-testid="row-badges">
      {q.map((x, i) => (
        <span key={i} className={cn("inline-flex items-center gap-1 h-6 px-2 rounded-full text-[0.7rem] font-medium", x.status === "confirmed" ? "bg-ok-soft text-ok" : "bg-accent-soft text-ink")}
          title={t(x.status === "confirmed" ? "collab.row.quoteConfirmed" : "collab.row.quoteProposed", { k: x.verse_keys.join(", ") })}>
          <BookOpenText className="size-3" aria-hidden /><bdi dir="ltr" className="mono">{x.verse_keys[0]}</bdi>
          <span className="sr-only">{t(x.status === "confirmed" ? "collab.row.quoteConfirmed" : "collab.row.quoteProposed", { k: x.verse_keys.join(", ") })}</span>
        </span>
      ))}
      <span className="flex items-center gap-1">
        {!!c?.open && (
          <span className="inline-flex items-center gap-1 h-6 px-1.5 rounded-full bg-violet-soft text-[0.72rem] font-semibold tabular" title={t("collab.row.comments", { n: num(c.open, locale) })} data-testid="row-comments">
            <MessageSquare className="size-3" aria-hidden />{num(c.open, locale)}<span className="sr-only">{t("collab.row.comments", { n: num(c.open, locale) })}</span>
          </span>
        )}
        {s > 0 && (
          <span className="inline-flex items-center gap-1 h-6 px-1.5 rounded-full bg-surface-3 text-[0.72rem] font-semibold tabular" title={t("collab.row.suggestions", { n: num(s, locale) })}>
            <GitPullRequestArrow className="size-3" aria-hidden />{num(s, locale)}<span className="sr-only">{t("collab.row.suggestions", { n: num(s, locale) })}</span>
          </span>
        )}
        {!!h?.disputed && (
          <span className="inline-flex items-center gap-1 h-6 px-1.5 rounded-full bg-warn-soft text-warn text-[0.72rem] font-semibold tabular" title={t("collab.row.disputed", { n: num(h.disputed, locale) })}>
            <Scale className="size-3" aria-hidden />{num(h.disputed, locale)}<span className="sr-only">{t("collab.row.disputed", { n: num(h.disputed, locale) })}</span>
          </span>
        )}
      </span>
    </span>
  );
}

const accessOf = (role: Role, userId: string, status: Status, line: LineDTO, ownerId: string | null) =>
  lineAccess({ role, userId, status, lockedBy: line.locked_by, ownerId });

/** Under the line editor: who owns the page, this line's suggestions and comments, and "Explain this line". */
export function LinePanel({ ctx }: { ctx: LineEditorContext }) {
  const { t, locale } = useI18n();
  const pageId = ctx.detail.page.id;
  const line = ctx.line;
  const v = ctx.detail.viewer;
  const { data } = useOverview(pageId);
  const { list, reload } = useSuggestions(pageId);
  const [sheet, setSheet] = useState<"suggest" | "explain" | "quran" | null>(null);
  const owner = data?.owner ?? null;
  const access = accessOf(v.role, v.id, ctx.detail.page.status, line, owner?.id ?? null);
  const mineOpen = (list ?? []).filter((s) => s.line_id === line.id && s.status === "open");
  const quotes = (data?.quotes[line.id] ?? []).filter((x) => x.status !== "rejected");
  const hard = data?.hard[line.id];
  const ownedByOther = v.role === "student" && !!owner && owner.id !== v.id;
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3 mt-1" data-testid="line-collab">
      {ownedByOther && (
        <Callout tone="accent" icon={<UserRound className="size-4" />}>
          {t("collab.line.owned", { name: locale === "ar" ? owner!.name_ar : owner!.name_en })}
        </Callout>
      )}
      {access === "suggest" && !ownedByOther && (
        <Callout tone="neutral" icon={<GitPullRequestArrow className="size-4" />}>
          {line.locked_by && line.locked_by !== v.id ? t("collab.line.lockedSuggest") : t("collab.line.frozenSuggest")}
        </Callout>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {access === "suggest" && (
          <Button size="sm" onClick={() => setSheet("suggest")} data-testid="suggest-open"><GitPullRequestArrow className="size-4" />{t("collab.suggest.open")}</Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => setSheet("explain")} data-testid="explain-open"><Lightbulb className="size-4" />{t("collab.explain.open")}</Button>
        {access === "edit" && v.role !== "institution_admin" && (
          <Button size="sm" variant="ghost" onClick={() => setSheet("suggest")}><GitPullRequestArrow className="size-4" />{t("collab.suggest.openSecondary")}</Button>
        )}
        {quotes.map((x, i) => (
          <button key={i} type="button" onClick={() => setSheet("quran")} className={cn("inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-medium", x.status === "confirmed" ? "bg-ok-soft text-ok" : "bg-accent-soft text-ink")}>
            <BookOpenText className="size-4" />{t(x.status === "confirmed" ? "collab.line.quoteConfirmed" : "collab.line.quoteProposed")} <bdi dir="ltr" className="mono text-xs">{x.verse_keys.join(", ")}</bdi>
          </button>
        ))}
        {hard && (hard.open > 0 || hard.disputed > 0) && (
          <Badge tone={hard.disputed ? "warn" : "neutral"} title={t("collab.line.hardHint")}>
            <Scale className="size-3" />{hard.disputed ? t("collab.line.disputed", { n: num(hard.disputed, locale) }) : t("collab.line.hard", { n: num(hard.open, locale) })}
          </Badge>
        )}
      </div>
      {mineOpen.length > 0 && (
        <section className="flex flex-col gap-2" aria-label={t("collab.suggest.panel")}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">{t("collab.line.suggestions", { n: num(mineOpen.length, locale) })}</h3>
          {mineOpen.map((s) => <SuggestionCard key={s.id} s={s} ctx={ctx} onChanged={() => { void reload(); refreshSoon(pageId, false); }} />)}
        </section>
      )}
      <LineComments ctx={ctx} lineId={line.id} />
      {sheet === "suggest" && <SuggestSheet ctx={ctx} line={line} onClose={() => setSheet(null)} />}
      {sheet === "explain" && <ExplainSheet lineId={line.id} lineN={line.n} onClose={() => setSheet(null)} onUnderstand={() => setSheet("quran")} />}
      {sheet === "quran" && <UnderstandingPanel ctx={ctx} close={() => setSheet(null)} initialTab="quran" />}
    </div>
  );
}

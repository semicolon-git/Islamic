"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, GitPullRequestArrow, PencilLine, TriangleAlert, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/chip";
import { Callout, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Field, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import { fmtRelative } from "@/i18n";
import { useI18n } from "@/i18n/client";
import type { Genre, Zone } from "../../../manuscripts/abbreviations";
import { api, ApiError, num } from "../../../manuscripts/components/api";
import { LineEditor } from "../../../manuscripts/components/workspace/line-editor";
import type { WorkspaceContext } from "../../../manuscripts/extensions";
import { plainText, sameTokens, type Tok } from "../../../manuscripts/tokens";
import type { LineDTO } from "../../../manuscripts/types";
import type { SuggestionDTO } from "../../types";
import { DiffLegend, DiffText, FirstTip } from "../bits";
import { refreshSoon, useOverview } from "./store";

export function useSuggestions(pageId: string) {
  const { rev } = useOverview(pageId);
  const [list, setList] = useState<SuggestionDTO[] | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    try {
      setList((await api<{ suggestions: SuggestionDTO[] }>(`/api/ms-collab/pages/${pageId}/suggestions`)).suggestions);
      setError(false);
    } catch {
      setError(true);
    }
  }, [pageId]);
  useEffect(() => { void load(); }, [load, rev]);
  return { list, error, reload: load };
}

const zoneOf = (ctx: WorkspaceContext, line: LineDTO): Zone => (ctx.detail.regions.find((r) => r.id === line.region_id)?.type === "margin" ? "margin" : "main");

/** Propose a change to a line you can't (or shouldn't) edit directly: a diff against the current version, with a reason. */
export function SuggestSheet({ ctx, line, onClose }: { ctx: WorkspaceContext; line: LineDTO; onClose: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [base, setBase] = useState({ version: line.current_version, tokens: line.version?.tokens ?? [] });
  const [tokens, setTokens] = useState<Tok[]>(line.version?.tokens ?? []);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unchanged = sameTokens(tokens, base.tokens);
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/ms-collab/lines/${line.id}/suggestions`, { method: "POST", json: { base_version: base.version, tokens, reason } });
      toast({ tone: "ok", text: t("collab.suggest.sent") });
      refreshSoon(ctx.detail.page.id);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.data && typeof e.data === "object" && "tokens" in e.data) {
        const d = e.data as { current_version: number; tokens: Tok[] };
        setBase({ version: d.current_version, tokens: d.tokens });
      }
      setError(e instanceof ApiError ? e.message : t("collab.error.generic"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} side="end" title={t("collab.suggest.title", { n: num(line.n, locale) })} description={t("collab.suggest.desc")} closeLabel={t("action.close")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("action.cancel")}</Button><Button onClick={send} loading={busy} disabled={unchanged || reason.trim().length < 3} data-testid="suggest-send"><GitPullRequestArrow className="size-4" />{t("collab.suggest.send")}</Button></>}>
      <div className="flex flex-col gap-4" data-testid="suggest-sheet">
        <FirstTip id="suggest" title={t("collab.tip.suggest.title")}>{t("collab.tip.suggest.body")}</FirstTip>
        <LineEditor id={`sg-${line.id}`} tokens={tokens} onChange={setTokens} genre={(ctx.detail.manuscript.genre ?? "general") as Genre} zone={zoneOf(ctx, line)}
          label={t("collab.suggest.editorLabel", { n: num(line.n, locale) })} autoFocus />
        <div className="rounded-[12px] bg-surface-2 px-3 py-2 flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-3">{t("collab.suggest.preview")}</span>
          {unchanged ? <span className="text-sm text-ink-3">{t("collab.suggest.noChange")}</span> : <DiffText from={plainText(base.tokens)} to={plainText(tokens)} className="text-[1.2rem]" />}
          {!unchanged && <DiffLegend />}
        </div>
        <Field label={t("collab.suggest.reason")} hint={t("collab.suggest.reasonHint")} htmlFor="sg-reason">
          <Textarea id="sg-reason" value={reason} onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        </Field>
        {error && <Callout tone="bad">{error}</Callout>}
      </div>
    </Sheet>
  );
}

/** One suggestion with its diff against the *current* text and, for its reviewer, accept / edit & accept / reject. */
export function SuggestionCard({ s, ctx, onChanged }: { s: SuggestionDTO; ctx: WorkspaceContext; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [mode, setMode] = useState<"view" | "edit" | "reject">("view");
  const [tokens, setTokens] = useState<Tok[]>(s.tokens);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const line = ctx.detail.lines.find((l) => l.id === s.line_id);
  const stale = s.base_version !== s.current_version;
  const name = locale === "ar" ? s.author.name_ar : s.author.name_en;
  const decide = async (decision: "accept" | "accept_edit" | "reject") => {
    setBusy(true);
    try {
      await api(`/api/ms-collab/suggestions/${s.id}`, { method: "POST", json: decision === "accept_edit" ? { decision, tokens, note } : { decision, note: note || undefined } });
      toast({ tone: "ok", text: t(`collab.suggest.done.${decision}`) });
      setMode("view");
      onChanged();
      void ctx.reload();
    } catch (e) {
      toast({ tone: "bad", text: e instanceof ApiError ? e.message : t("collab.error.generic") });
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className={cn("rounded-[14px] border p-3 flex flex-col gap-2.5", s.status === "open" ? "border-violet/40 bg-surface" : "border-line bg-surface-2/50")} data-testid="suggestion" data-status={s.status}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Avatar name={name} hue={s.author.hue} size={24} />
        <span className="font-semibold">{name}</span>
        <span className="text-ink-3 text-xs">{t("collab.lineN", { n: num(s.line_n, locale) })} · {fmtRelative(s.created_at, locale)}</span>
        <Badge tone={s.status === "open" ? "violet" : s.status === "accepted" ? "ok" : "neutral"} className="ms-auto">{t(`collab.suggest.status.${s.status}`)}</Badge>
      </div>
      <DiffText from={s.current_text} to={s.plain_text} className="text-[1.15rem] leading-[2]" />
      {s.reason && <p className="text-sm text-ink-2" dir="auto"><span className="text-ink-3">{t("collab.suggest.why")}</span> {s.reason}</p>}
      {stale && s.status === "open" && <Callout tone="warn" icon={<TriangleAlert className="size-4 text-warn" />}>{t("collab.suggest.stale")}</Callout>}
      {s.status !== "open" && s.reviewer && (
        <p className="text-xs text-ink-3">{t("collab.suggest.decidedBy", { name: locale === "ar" ? s.reviewer.name_ar : s.reviewer.name_en })}{s.review_note ? ` — ${s.review_note}` : ""}</p>
      )}
      {s.status === "open" && s.can_review && mode === "view" && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => decide("accept")} loading={busy} data-testid="suggestion-accept"><Check className="size-4" />{t("collab.suggest.accept")}</Button>
          <Button size="sm" variant="secondary" onClick={() => setMode("edit")}><PencilLine className="size-4" />{t("collab.suggest.acceptEdit")}</Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("reject")}><X className="size-4" />{t("collab.suggest.reject")}</Button>
        </div>
      )}
      {s.status === "open" && !s.can_review && s.review_block && <p className="text-xs text-ink-3">{s.review_block}</p>}
      {mode === "edit" && line && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <LineEditor id={`sge-${s.id}`} tokens={tokens} onChange={setTokens} genre={(ctx.detail.manuscript.genre ?? "general") as Genre} zone={zoneOf(ctx, line)} label={t("collab.suggest.editorLabel", { n: num(s.line_n, locale) })} autoFocus />
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder={t("collab.suggest.notePlaceholder")} aria-label={t("collab.suggest.note")} className="min-h-16" />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => decide("accept_edit")} loading={busy}><Check className="size-4" />{t("collab.suggest.saveAccept")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("view")}>{t("action.cancel")}</Button>
          </div>
        </div>
      )}
      {mode === "reject" && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder={t("collab.suggest.rejectPlaceholder")} aria-label={t("collab.suggest.note")} className="min-h-16" autoFocus />
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => decide("reject")} loading={busy}>{t("collab.suggest.confirmReject")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("view")}>{t("action.cancel")}</Button>
          </div>
        </div>
      )}
    </article>
  );
}

export function SuggestionsPanel({ ctx, close }: { ctx: WorkspaceContext; close: () => void }) {
  const { t } = useI18n();
  const pageId = ctx.detail.page.id;
  const { list, error, reload } = useSuggestions(pageId);
  const open = (list ?? []).filter((s) => s.status === "open");
  const closed = (list ?? []).filter((s) => s.status !== "open");
  const changed = () => { void reload(); refreshSoon(pageId, false); };
  return (
    <Sheet open onClose={close} side="end" title={t("collab.suggest.panel")} description={t("collab.suggest.panelDesc")} closeLabel={t("action.close")}>
      <div className="flex flex-col gap-3" data-testid="suggestions-panel">
        {error && <Callout tone="bad">{t("collab.error.load")} <button type="button" className="underline" onClick={() => void reload()}>{t("collab.retry")}</button></Callout>}
        {!list && !error && [0, 1].map((i) => <Skeleton key={i} className="h-28" />)}
        {list && list.length === 0 && <EmptyState icon={<GitPullRequestArrow className="size-7" />} title={t("collab.suggest.emptyTitle")} body={t("collab.suggest.emptyBody")} />}
        {open.map((s) => <SuggestionCard key={s.id} s={s} ctx={ctx} onChanged={changed} />)}
        {closed.length > 0 && <h3 className="text-sm font-semibold text-ink-3 mt-2">{t("collab.suggest.decided")}</h3>}
        {closed.map((s) => <SuggestionCard key={s.id} s={s} ctx={ctx} onChanged={changed} />)}
      </div>
    </Sheet>
  );
}

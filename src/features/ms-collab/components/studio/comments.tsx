"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AtSign, CheckCircle2, CornerDownLeft, MessageSquare, MessageSquarePlus, RotateCcw, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/chip";
import { Callout, EmptyState, Kbd, Skeleton } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import { fmtRelative } from "@/i18n";
import { useI18n } from "@/i18n/client";
import { api, ApiError, num } from "../../../manuscripts/components/api";
import type { WorkspaceContext } from "../../../manuscripts/extensions";
import type { Participant } from "../../rules";
import type { CommentDTO } from "../../types";
import { FirstTip } from "../bits";
import { refreshSoon, useOverview } from "./store";

interface CommentsData { comments: CommentDTO[]; participants: Participant[] }

/** Load the page's comments; re-fetch when a realtime event bumps the store. */
export function useComments(pageId: string) {
  const { rev } = useOverview(pageId);
  const [data, setData] = useState<CommentsData | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await api<CommentsData>(`/api/ms-collab/pages/${pageId}/comments`));
      setError(false);
    } catch {
      setError(true);
    }
  }, [pageId]);
  useEffect(() => { void load(); }, [load, rev]);
  return { data, error, reload: load };
}

/** Comment text with @mentions highlighted. Plain text only (never HTML). */
function Body({ text, people }: { text: string; people: Participant[] }) {
  const { locale } = useI18n();
  const names = people.flatMap((p) => [p.name_en, p.name_ar]).filter(Boolean).sort((a, b) => b.length - a.length);
  const parts: { s: string; m: boolean }[] = [];
  let rest = text;
  while (rest) {
    let hit = -1, name = "";
    for (const n of names) {
      const i = rest.indexOf(`@${n}`);
      if (i >= 0 && (hit < 0 || i < hit)) { hit = i; name = n; }
    }
    if (hit < 0) { parts.push({ s: rest, m: false }); break; }
    if (hit > 0) parts.push({ s: rest.slice(0, hit), m: false });
    parts.push({ s: `@${name}`, m: true });
    rest = rest.slice(hit + name.length + 1);
  }
  return (
    <p className="text-sm text-ink whitespace-pre-wrap break-words leading-relaxed" dir="auto" lang={locale}>
      {parts.map((p, i) => (p.m ? <bdi key={i} className="font-medium text-violet">{p.s}</bdi> : <span key={i}>{p.s}</span>))}
    </p>
  );
}

/** Text box with an @mention picker of the page's participants. Ctrl/⌘+Enter sends. */
export function Composer({ people, onSend, placeholder, autoFocus, anchor, onClearAnchor, compact }: {
  people: Participant[]; onSend: (body: string) => Promise<boolean>; placeholder: string; autoFocus?: boolean;
  anchor?: { text: string } | null; onClearAnchor?: () => void; compact?: boolean;
}) {
  const { t, locale } = useI18n();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [pick, setPick] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const nameOf = (p: Participant) => (locale === "ar" ? p.name_ar : p.name_en);
  const options = useMemo(() => {
    if (query === null) return [];
    const qy = query.toLowerCase();
    return people.filter((p) => p.name_en.toLowerCase().includes(qy) || p.name_ar.includes(query)).slice(0, 6);
  }, [people, query]);

  const onChange = (v: string) => {
    setText(v);
    const caret = ref.current?.selectionStart ?? v.length;
    const m = /(^|\s)@([^\s@]{0,20})$/.exec(v.slice(0, caret));
    setQuery(m ? m[2] : null);
    setPick(0);
  };
  const insert = (p: Participant) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([^\s@]{0,20})$/, `@${nameOf(p)} `);
    const next = before + text.slice(caret);
    setText(next);
    setQuery(null);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); });
  };
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const ok = await onSend(text.trim());
    setBusy(false);
    if (ok) setText("");
  };
  return (
    <div className="relative flex flex-col gap-2">
      {anchor && (
        <span className="self-start inline-flex items-center gap-1.5 rounded-full bg-warn-soft ps-3 pe-1 h-8 text-xs">
          {t("collab.comments.on")} <span className="font-ms text-base" dir="rtl">«{anchor.text}»</span>
          {onClearAnchor && <button type="button" onClick={onClearAnchor} className="size-6 grid place-items-center rounded-full hover:bg-surface" aria-label={t("collab.comments.clearAnchor")}><X className="size-3.5" /></button>}
        </span>
      )}
      <textarea ref={ref} value={text} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} dir="auto" rows={compact ? 2 : 3}
        aria-label={placeholder} placeholder={placeholder}
        onKeyDown={(e) => {
          if (options.length) {
            if (e.key === "ArrowDown") { e.preventDefault(); setPick((i) => (i + 1) % options.length); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setPick((i) => (i - 1 + options.length) % options.length); return; }
            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insert(options[pick]); return; }
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setQuery(null); return; }
          }
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); }
          e.stopPropagation(); // keep the line editor's and the page's shortcuts out of the comment box
        }}
        className="w-full rounded-[12px] border border-line-strong bg-surface px-3 py-2 text-sm leading-relaxed placeholder:text-ink-3 focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/25 resize-y min-h-16" />
      {options.length > 0 && (
        <ul role="listbox" aria-label={t("collab.comments.mention")} className="absolute z-20 top-full mt-1 start-0 w-64 rounded-[12px] border border-line bg-surface shadow-pop p-1">
          {options.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === pick}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); insert(p); }} className={cn("w-full flex items-center gap-2 px-2 h-9 rounded-[8px] text-sm text-start", i === pick ? "bg-accent-soft" : "hover:bg-surface-2")}>
                <AtSign className="size-3.5 text-violet" />{nameOf(p)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <span className="text-[0.72rem] text-ink-3 me-auto inline-flex items-center gap-1"><AtSign className="size-3" />{t("collab.comments.mentionHint")}</span>
        <Button size="sm" onClick={send} loading={busy} disabled={!text.trim()} data-testid="comment-send">{t("collab.comments.send")} <Kbd>Ctrl ↵</Kbd></Button>
      </div>
    </div>
  );
}

function Thread({ root, replies, people, pageId, onChanged }: { root: CommentDTO; replies: CommentDTO[]; people: Participant[]; pageId: string; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [replying, setReplying] = useState(false);
  const name = (c: CommentDTO) => (locale === "ar" ? c.author.name_ar : c.author.name_en);
  const resolve = async (resolved: boolean) => {
    try {
      await api(`/api/ms-collab/comments/${root.id}`, { method: "PATCH", json: { resolved } });
      onChanged();
    } catch (e) {
      toast({ tone: "bad", text: e instanceof ApiError ? e.message : t("collab.error.generic") });
    }
  };
  const reply = async (body: string) => {
    try {
      await api(`/api/ms-collab/pages/${pageId}/comments`, { method: "POST", json: { parent_id: root.id, body } });
      setReplying(false);
      onChanged();
      return true;
    } catch (e) {
      toast({ tone: "bad", text: e instanceof ApiError ? e.message : t("collab.error.generic") });
      return false;
    }
  };
  return (
    <article className={cn("rounded-[14px] border p-3 flex flex-col gap-2.5", root.resolved ? "border-line bg-surface-2/50" : "border-line bg-surface")} data-testid="comment-thread" data-resolved={root.resolved ? "1" : "0"}>
      {[root, ...replies].map((c, i) => (
        <div key={c.id} className={cn("flex gap-2.5", i > 0 && "ps-4 border-s-2 border-line ms-3")}>
          <Avatar name={name(c)} hue={c.author.hue} size={26} />
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="font-semibold text-ink text-sm">{name(c)}</span>
              <span className="text-ink-3">{t(`role.${c.author.role}`)}</span>
              <span className="text-ink-3 ms-auto">{fmtRelative(c.created_at, locale)}</span>
            </div>
            {c.anchor && <span className="self-start rounded-full bg-warn-soft px-2.5 text-xs">{t("collab.comments.on")} <span className="font-ms text-base" dir="rtl">«{c.anchor.text}»</span></span>}
            <Body text={c.body} people={people} />
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-1.5">
        {root.resolved && root.resolved_by && <Badge tone="ok"><CheckCircle2 className="size-3" />{t("collab.comments.resolvedBy", { name: locale === "ar" ? root.resolved_by.name_ar : root.resolved_by.name_en })}</Badge>}
        <span className="ms-auto flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setReplying((r) => !r)}><CornerDownLeft className="size-4" />{t("collab.comments.reply")}</Button>
          {root.can_resolve && (root.resolved
            ? <Button size="sm" variant="ghost" onClick={() => resolve(false)}><RotateCcw className="size-4" />{t("collab.comments.reopen")}</Button>
            : <Button size="sm" variant="secondary" onClick={() => resolve(true)} data-testid="comment-resolve"><CheckCircle2 className="size-4" />{t("collab.comments.resolve")}</Button>)}
        </span>
      </div>
      {replying && <Composer people={people} onSend={reply} placeholder={t("collab.comments.replyPlaceholder")} autoFocus compact />}
    </article>
  );
}

export function Threads({ comments, people, pageId, onChanged, showResolved = true }: { comments: CommentDTO[]; people: Participant[]; pageId: string; onChanged: () => void; showResolved?: boolean }) {
  const roots = comments.filter((c) => !c.parent_id && (showResolved || !c.resolved));
  roots.sort((a, b) => Number(a.resolved) - Number(b.resolved) || a.created_at.localeCompare(b.created_at));
  return (
    <div className="flex flex-col gap-2.5">
      {roots.map((r) => <Thread key={r.id} root={r} replies={comments.filter((c) => c.parent_id === r.id)} people={people} pageId={pageId} onChanged={onChanged} />)}
    </div>
  );
}

/** Under the line editor: this line's threads and a composer (optionally anchored on the selected words). */
export function LineComments({ ctx, lineId }: { ctx: WorkspaceContext; lineId: string }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const pageId = ctx.detail.page.id;
  const { data, error, reload } = useComments(pageId);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ from: number; to: number; text: string } | null>(null);
  const mine = (data?.comments ?? []).filter((c) => c.line_id === lineId);
  const roots = mine.filter((c) => !c.parent_id);
  const openCount = roots.filter((c) => !c.resolved).length;
  const canComment = ctx.detail.viewer.role !== "specialist";

  const start = () => {
    const el = document.getElementById(`ed-${lineId}`) as HTMLTextAreaElement | null;
    if (el && el.selectionEnd > el.selectionStart) {
      const text = el.value.slice(el.selectionStart, el.selectionEnd).trim();
      if (text) setAnchor({ from: el.selectionStart, to: el.selectionEnd, text: text.slice(0, 120) });
    } else setAnchor(null);
    setOpen(true);
  };
  const send = async (body: string) => {
    try {
      await api(`/api/ms-collab/pages/${pageId}/comments`, { method: "POST", json: { line_id: lineId, body, anchor } });
      setOpen(false);
      setAnchor(null);
      await reload();
      refreshSoon(pageId, false);
      return true;
    } catch (e) {
      toast({ tone: "bad", text: e instanceof ApiError ? e.message : t("collab.error.generic") });
      return false;
    }
  };
  return (
    <section className="flex flex-col gap-2" aria-label={t("collab.comments.title")} data-testid="line-comments">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3 inline-flex items-center gap-1.5"><MessageSquare className="size-3.5" />{t("collab.comments.title")}</h3>
        {roots.length > 0 && <Badge tone={openCount ? "violet" : "neutral"}>{t("collab.comments.count", { open: num(openCount, locale), total: num(roots.length, locale) })}</Badge>}
        {canComment && !open && <Button size="sm" variant="ghost" className="ms-auto" onClick={start} data-testid="comment-add"><MessageSquarePlus className="size-4" />{t("collab.comments.add")}</Button>}
      </div>
      {error && <Callout tone="bad">{t("collab.error.load")} <button type="button" className="underline" onClick={() => void reload()}>{t("collab.retry")}</button></Callout>}
      {!data && !error && roots.length === 0 && <Skeleton className="h-10" />}
      {data && <Threads comments={mine} people={data.participants} pageId={pageId} onChanged={() => { void reload(); refreshSoon(pageId, false); }} />}
      {open && data && (
        <>
          <FirstTip id="comments" title={t("collab.tip.comments.title")}>{t("collab.tip.comments.body")}</FirstTip>
          <Composer people={data.participants} onSend={send} placeholder={t("collab.comments.placeholder")} autoFocus anchor={anchor} onClearAnchor={() => setAnchor(null)} />
          <button type="button" className="self-start text-xs text-ink-3 hover:text-ink" onClick={() => setOpen(false)}>{t("action.cancel")}</button>
        </>
      )}
    </section>
  );
}

/** Side panel: every thread on the page, grouped by line, plus page-level comments. */
export function CommentsPanel({ ctx, close }: { ctx: WorkspaceContext; close: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const pageId = ctx.detail.page.id;
  const { data, error, reload } = useComments(pageId);
  const [showResolved, setShowResolved] = useState(false);
  const lines = new Map(ctx.detail.lines.map((l) => [l.id, l.n]));
  const roots = (data?.comments ?? []).filter((c) => !c.parent_id && (showResolved || !c.resolved));
  const groups = new Map<string, CommentDTO[]>();
  for (const r of roots) groups.set(r.line_id ?? "", [...(groups.get(r.line_id ?? "") ?? []), r]);
  const order = [...groups.keys()].sort((a, b) => (lines.get(a) ?? 0) - (lines.get(b) ?? 0));
  const send = async (body: string) => {
    try {
      await api(`/api/ms-collab/pages/${pageId}/comments`, { method: "POST", json: { body } });
      await reload();
      refreshSoon(pageId, false);
      return true;
    } catch (e) {
      toast({ tone: "bad", text: e instanceof ApiError ? e.message : t("collab.error.generic") });
      return false;
    }
  };
  return (
    <Sheet open onClose={close} side="end" title={t("collab.comments.panel")} description={t("collab.comments.panelDesc")} closeLabel={t("action.close")}>
      <div className="flex flex-col gap-4" data-testid="comments-panel">
        <label className="inline-flex items-center gap-2 text-sm text-ink-2 self-start">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          {t("collab.comments.showResolved")}
        </label>
        {error && <Callout tone="bad">{t("collab.error.load")} <button type="button" className="underline" onClick={() => void reload()}>{t("collab.retry")}</button></Callout>}
        {!data && !error && [0, 1].map((i) => <Skeleton key={i} className="h-24" />)}
        {data && roots.length === 0 && (
          <EmptyState icon={<MessageSquare className="size-7" />} title={t("collab.comments.emptyTitle")} body={t("collab.comments.emptyBody")} />
        )}
        {data && order.map((k) => (
          <section key={k || "page"} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{k ? t("collab.lineN", { n: num(lines.get(k) ?? 0, locale) }) : t("collab.comments.pageLevel")}</h3>
              {k && <Button size="sm" variant="ghost" onClick={() => { close(); ctx.selectLine(k); }}>{t("collab.goToLine")}</Button>}
            </div>
            <Threads comments={data.comments.filter((c) => (c.line_id ?? "") === k)} people={data.participants} pageId={pageId} onChanged={() => { void reload(); refreshSoon(pageId, false); }} showResolved={showResolved} />
          </section>
        ))}
        {data && ctx.detail.viewer.role !== "specialist" && (
          <section className="flex flex-col gap-2 border-t border-line pt-4">
            <h3 className="text-sm font-semibold">{t("collab.comments.aboutPage")}</h3>
            <Composer people={data.participants} onSend={send} placeholder={t("collab.comments.pagePlaceholder")} />
          </section>
        )}
      </div>
    </Sheet>
  );
}

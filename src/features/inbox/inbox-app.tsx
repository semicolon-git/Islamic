"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, Globe, MessageSquareQuote, MessagesSquare, Search, Send, X, Info, Sparkles } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fmtNumber, fmtRelative } from "@/i18n/core";
import { useEvents } from "@/lib/use-events";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/chip";
import { Input, Textarea } from "@/components/ui/field";
import { Callout, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/sheet";
import { Segmented } from "@/components/ui/tabs";
import { cn } from "@/components/ui/cn";
import { api, fmtDuration, useTick } from "@/features/portal/client";
import { CANNED, cannedText, consentSummary, publicCardPath, type CannedId } from "./logic";
import { MessagesView, type ChatMessage } from "./messages-view";
import type { InboxThread, ThreadRow } from "./server";

const code = (id: string) => id.slice(-4).toUpperCase();

export function InboxApp({ initial, selectedId }: { initial: InboxThread[]; selectedId: string | null }) {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState<"open" | "closed">("open");
  const [threads, setThreads] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  useTick(30_000);

  const load = useCallback(async (s = status) => {
    const r = await api<{ items: InboxThread[] }>(`/api/threads?status=${s}`);
    setLoading(false);
    if (r.ok) {
      setThreads(r.data.items);
      setError(false);
    } else setError(true);
  }, [status]);

  useEvents(["inbox"], () => void load());

  const switchTab = (s: "open" | "closed") => {
    setStatus(s);
    setLoading(true);
    void load(s);
  };

  return (
    <div className="flex flex-col gap-4">
      <header className={cn(selectedId && "hidden lg:block")}>
        <h1 className="text-2xl font-semibold">{t("inbox.title")}</h1>
        <p className="text-ink-2 mt-0.5">{t("inbox.subtitle")}</p>
      </header>
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)] lg:h-[calc(100dvh-11rem)] lg:min-h-[520px]">
        {/* thread list */}
        <section aria-label={t("inbox.title")} className={cn("flex flex-col gap-3 min-h-0", selectedId && "hidden lg:flex")}>
          <Segmented label={t("inbox.tabsLabel")} value={status} onChange={switchTab} options={[{ value: "open", label: t("inbox.tab.open") }, { value: "closed", label: t("inbox.tab.closed") }]} className="self-start" />
          {error && <Callout tone="bad">{t("inbox.error")}</Callout>}
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin rounded-[var(--radius)] border border-line bg-surface">
            {loading ? (
              <div className="p-3 flex flex-col gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
            ) : threads.length === 0 ? (
              <EmptyState icon={<MessagesSquare className="size-6" />} title={status === "open" ? t("inbox.empty.title") : t("inbox.emptyClosed.title")} body={status === "open" ? t("inbox.empty.body") : undefined} />
            ) : (
              <ul className="divide-y divide-line" data-testid="thread-list">
                {threads.map((th) => {
                  const active = th.id === selectedId;
                  const shared = consentSummary(th.consent);
                  return (
                    <li key={th.id}>
                      <Link href={`/portal/inbox/${th.id}`} aria-current={active ? "page" : undefined} className={cn("flex flex-col gap-1.5 px-4 py-3 hover:bg-surface-2", active && "bg-accent-soft hover:bg-accent-soft")}>
                        <span className="flex items-center gap-2">
                          <span className="font-medium text-ink">{t("inbox.visitor", { code: code(th.id) })}</span>
                          <Badge tone="neutral" title={t(`inbox.langFull.${th.lang === "en" || th.lang === "ar" ? th.lang : "und"}`)}>{t(`inbox.lang.${th.lang === "en" || th.lang === "ar" ? th.lang : "und"}`)}</Badge>
                          {th.unread > 0 && <Badge tone="violet" className="tabular">{t("inbox.unread", { n: fmtNumber(th.unread, locale) })}</Badge>}
                          <span className="ms-auto text-xs text-ink-3" suppressHydrationWarning>{fmtRelative(th.last_message_at, locale)}</span>
                        </span>
                        {th.last_body && <span className="text-sm text-ink-2 line-clamp-2" dir="auto">{th.last_body}</span>}
                        <span className="flex flex-wrap items-center gap-1.5 text-xs">
                          {th.waiting_since ? (
                            <span className="text-warn font-medium" suppressHydrationWarning>{t("inbox.waiting", { time: fmtDuration(th.waiting_since, locale) })}</span>
                          ) : th.status === "open" ? (
                            <span className="text-ok">{t("inbox.answered")}</span>
                          ) : (
                            <span className="text-ink-3">{t("inbox.closed")}</span>
                          )}
                          <span className="text-ink-3">·</span>
                          <span className="text-ink-3">{shared.length ? shared.map((s) => t(`inbox.consent.${s}`)).join(", ") : t("inbox.consent.none")}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* thread */}
        <section className={cn("min-h-0", !selectedId && "hidden lg:block")}>
          {selectedId ? (
            <ThreadPane key={selectedId} id={selectedId} onChanged={() => void load()} />
          ) : (
            <div className="h-full rounded-[var(--radius)] border border-dashed border-line-strong grid place-items-center">
              <EmptyState icon={<MessageSquareQuote className="size-6" />} title={t("inbox.select.title")} body={t("inbox.select.body")} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ThreadPane({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const [data, setData] = useState<{ thread: ThreadRow; messages: ChatMessage[]; assignee: { display_name_en: string; display_name_ar: string } | null } | null>(null);
  const [error, setError] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    const r = await api<NonNullable<typeof data>>(`/api/threads/${id}`);
    if (r.ok) {
      setData(r.data);
      setError(false);
      if (r.data.thread.status === "open" && r.data.messages.some((m) => m.sender === "visitor")) void api(`/api/threads/${id}/read`, { method: "POST" });
    } else setError(true);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);
  useEvents([`thread:${id}`], () => {
    void load();
    onChanged();
  });
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [data?.messages.length]);

  const send = async (body = text) => {
    const msg = body.trim();
    if (!msg) return;
    setSending(true);
    setSendError(null);
    const clientId = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => (b % 36).toString(36)).join("");
    const r = await api(`/api/threads/${id}/messages`, { method: "POST", json: { body: msg, client_id: clientId } });
    setSending(false);
    if (r.ok) {
      setText("");
      void load();
      onChanged();
    } else setSendError(r.error.message || t("inbox.sendError"));
  };
  const insert = (s: string) => {
    setText((x) => (x.trim() ? `${x.trimEnd()}\n${s}` : s));
    setTimeout(() => box.current?.focus(), 0);
  };
  const close = async () => {
    const r = await api(`/api/threads/${id}/close`, { method: "POST" });
    setConfirmClose(false);
    if (r.ok) {
      void load();
      onChanged();
    }
  };

  if (error) return <Callout tone="bad">{t("inbox.error")}</Callout>;
  if (!data) return <div className="flex flex-col gap-3"><Skeleton className="h-16" /><Skeleton className="h-64" /></div>;
  const { thread, messages } = data;
  const lang = thread.lang === "en" || thread.lang === "ar" ? thread.lang : "und";
  const shared = consentSummary(thread.consent);
  const notShared = (["question", "card", "lang"] as const).filter((k) => !shared.includes(k));
  const ctx = thread.context ?? {};
  const open = thread.status === "open";

  return (
    <div className="h-full flex flex-col rounded-[var(--radius)] border border-line bg-surface overflow-hidden" data-testid="thread-pane">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <Link href="/portal/inbox" className="lg:hidden size-10 -ms-2 grid place-items-center rounded-full hover:bg-surface-2" aria-label={t("inbox.back")}>
          <ArrowLeft className="size-5 rtl:rotate-180" aria-hidden />
        </Link>
        <div className="flex flex-col min-w-0 flex-1">
          <h2 className="font-semibold text-ink">{t("inbox.visitor", { code: code(thread.id) })}</h2>
          <p className="text-xs text-ink-3 flex flex-wrap gap-x-2" suppressHydrationWarning>
            <span className="inline-flex items-center gap-1"><Globe className="size-3.5" aria-hidden />{t(`inbox.langFull.${lang}`)}</span>
            <span>· {t("inbox.started", { when: fmtRelative(thread.created_at, locale) })}</span>
            {data.assignee && <span>· {t("inbox.assigned", { name: locale === "ar" ? data.assignee.display_name_ar : data.assignee.display_name_en })}</span>}
          </p>
        </div>
        {open ? (
          <Button size="sm" variant="secondary" onClick={() => setConfirmClose(true)}><X className="size-4" aria-hidden />{t("inbox.close")}</Button>
        ) : (
          <Badge tone="neutral">{t("inbox.closed")}</Badge>
        )}
      </header>

      <div className="border-b border-line bg-surface-2/60 px-4 py-3 flex flex-col gap-2 text-sm">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-ink">{t("inbox.consent.title")}:</span>
          {shared.length ? shared.map((s) => <Badge key={s} tone="accent">{t(`inbox.consent.${s}`)}</Badge>) : <span className="text-ink-3">{t("inbox.consent.none")}</span>}
          {notShared.length > 0 && <span className="text-xs text-ink-3">· {t("inbox.consent.notShared", { list: notShared.map((s) => t(`inbox.consent.${s}`)).join(", ") })}</span>}
        </p>
        {ctx.card_id && (
          <p className="flex items-center gap-2">
            <BookOpen className="size-4 text-accent" aria-hidden />
            <span className="text-ink-2">{t("inbox.context.card")}:</span>
            <Link href={`/portal/cards/${encodeURIComponent(ctx.card_id)}`} className="font-medium text-ink underline underline-offset-4" dir="auto">{(locale === "ar" ? ctx.card_title_ar : ctx.card_title_en) ?? ctx.card_id}</Link>
          </p>
        )}
      </div>

      <div className="flex-1 min-h-[260px] overflow-y-auto scrollbar-thin px-4 py-4">
        <MessagesView
          messages={messages}
          me="specialist"
          labels={{ me: t("inbox.talk.specialist"), them: t("inbox.visitor", { code: code(thread.id) }), openCard: t("inbox.talk.openCard"), closedVisitor: t("inbox.closedBy.visitor"), closedSpecialist: t("inbox.closedBy.specialist"), queued: t("inbox.talk.queued"), sending: t("inbox.talk.sending") }}
        />
        <div ref={bottom} />
      </div>

      {open && (
        <form
          className="border-t border-line p-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-ink-3 me-1 inline-flex items-center gap-1"><Sparkles className="size-3.5" aria-hidden />{t("inbox.canned")}:</span>
            {CANNED.map((c) => (
              <button key={c.id} type="button" onClick={() => insert(cannedText(c.id as CannedId, thread.lang, locale))} className="h-9 rounded-full border border-line px-3 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink" data-canned={c.id}>
                {t(`inbox.canned.${c.id}`)}
              </button>
            ))}
            <button type="button" onClick={() => setCardsOpen(true)} className="h-9 rounded-full border border-accent/40 bg-accent-soft px-3 text-sm text-ink hover:brightness-95 inline-flex items-center gap-1.5">
              <BookOpen className="size-4" aria-hidden />{t("inbox.insertCard")}
            </button>
          </div>
          <label htmlFor="reply" className="sr-only">{t("inbox.composer")}</label>
          <div className="flex gap-2 items-end">
            <Textarea
              id="reply"
              ref={box}
              rows={2}
              dir="auto"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("inbox.composer")}
              className="min-h-[52px] max-h-48"
              data-testid="reply-box"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <Button type="submit" loading={sending} disabled={!text.trim()} className="h-[52px]" aria-label={t("inbox.send")}>
              <Send className="size-4 rtl:-scale-x-100" aria-hidden /><span className="hidden sm:inline">{t("inbox.send")}</span>
            </Button>
          </div>
          <p className="text-xs text-ink-3 flex items-center gap-1.5"><Info className="size-3.5" aria-hidden />{t("inbox.enterHint")} · {t("inbox.rulingReminder")}</p>
          {sendError && <p className="text-sm text-bad" role="alert">{sendError}</p>}
        </form>
      )}

      <CardPickerSheet
        open={cardsOpen}
        onClose={() => setCardsOpen(false)}
        lang={lang === "und" ? locale : lang}
        onPick={(s) => {
          insert(s);
          setCardsOpen(false);
        }}
      />
      <Sheet
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        side="center"
        title={t("inbox.close")}
        closeLabel={t("action.close")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClose(false)}>{t("action.cancel")}</Button>
            <Button variant="danger" onClick={close} data-testid="confirm-close">{t("inbox.close")}</Button>
          </>
        }
      >
        <p className="text-ink-2">{t("inbox.closeConfirm")}</p>
      </Sheet>
    </div>
  );
}

function CardPickerSheet({ open, onClose, onPick, lang }: { open: boolean; onClose: () => void; onPick: (text: string) => void; lang: "en" | "ar" }) {
  const { t, locale } = useI18n();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<{ id: string; kind: string; concept_id: string | null; title_en: string; title_ar: string; institution_en: string | null; institution_ar: string | null }[] | null>(null);
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(async () => {
      const r = await api<{ items: NonNullable<typeof items> }>(`/api/cards?published=1&q=${encodeURIComponent(q)}`);
      if (r.ok) setItems(r.data.items);
    }, 200);
    return () => clearTimeout(id);
  }, [q, open]);
  return (
    <Sheet open={open} onClose={onClose} side="end" title={t("inbox.insertCard.title")} closeLabel={t("action.close")}>
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="size-4 absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("inbox.insertCard.search")} aria-label={t("inbox.insertCard.search")} className="ps-10" dir="auto" />
        </div>
        {items === null ? (
          <Skeleton className="h-24" />
        ) : items.length === 0 ? (
          <p className="text-sm text-ink-2">{t("inbox.insertCard.none")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((c) => {
              const title = lang === "ar" ? c.title_ar : c.title_en;
              const text = t("inbox.cardLinkText", { title, path: publicCardPath(c) });
              const msg = lang === locale ? text : (lang === "ar" ? `بطاقة معتمدة: ${title} — ${publicCardPath(c)}` : `Approved card: ${title} — ${publicCardPath(c)}`);
              return (
                <li key={c.id} className="rounded-[12px] border border-line p-3 flex items-center gap-3">
                  <span className="flex flex-col min-w-0 flex-1">
                    <span className="font-medium truncate" dir="auto">{locale === "ar" ? c.title_ar : c.title_en}</span>
                    <span className="text-xs text-ink-3 truncate">{locale === "ar" ? c.institution_ar : c.institution_en}</span>
                  </span>
                  <Button size="sm" variant="soft" onClick={() => onPick(msg)} data-testid="insert-card">{t("inbox.insertCard.insert")}</Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

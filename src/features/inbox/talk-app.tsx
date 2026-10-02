"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, CheckCircle2, EyeOff, HeartHandshake, Lock, MessageCircle, Scale, Send, ShieldCheck, UserRound, WifiOff } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { useEvents } from "@/lib/use-events";
import { Button, ButtonLink } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Callout, Skeleton } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/components/ui/cn";
import { api } from "@/features/portal/client";
import { personHasJoined, type Consent } from "./logic";
import { MessagesView, type ChatMessage } from "./messages-view";

const K_TOKEN = "talk.device";
const K_THREAD = "talk.thread";
const K_OUTBOX = "talk.outbox";

type Outbox = { client_id: string; thread_id: string; body: string; at: string; state: "sending" | "queued" }[];
type ThreadData = { thread: { id: string; status: "open" | "closed"; lang: string; consent: Partial<Consent>; context: { question?: string; card_id?: string; card_title_en?: string; card_title_ar?: string }; closed_by: string | null }; messages: ChatMessage[] };

const rand = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
  del: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {}
  },
};

/** Random device token kept only in this browser; the server stores its sha256. */
function deviceToken() {
  let tok = ls.get(K_TOKEN);
  if (!tok || !/^[A-Za-z0-9_-]{24,128}$/.test(tok)) {
    tok = rand(40);
    ls.set(K_TOKEN, tok);
  }
  return tok;
}
const readOutbox = (): Outbox => {
  try {
    return JSON.parse(ls.get(K_OUTBOX) ?? "[]");
  } catch {
    return [];
  }
};

export function TalkApp({ card, initialQuestion }: { card: { id: string; title_en: string; title_ar: string } | null; initialQuestion: string }) {
  const { t, locale } = useI18n();
  const [phase, setPhase] = useState<"boot" | "intro" | "thread" | "ended" | "error">("boot");
  const [token, setToken] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [data, setData] = useState<ThreadData | null>(null);
  const [outbox, setOutbox] = useState<Outbox>([]);
  const [consentOpen, setConsentOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [endedBy, setEndedBy] = useState<"visitor" | "specialist">("visitor");
  const [online, setOnline] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const msgCount = (data?.messages.length ?? 0) + outbox.length;
  useEffect(() => {
    if (phase === "thread" && msgCount > 1) endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [msgCount, phase]);

  const load = useCallback(async (id: string, tok: string) => {
    const r = await api<ThreadData>(`/api/threads/${id}`, { headers: { "x-device-token": tok } });
    if (r.ok) {
      setData(r.data);
      if (r.data.thread.status === "closed") {
        setEndedBy(r.data.thread.closed_by === "visitor" ? "visitor" : "specialist");
        setPhase("ended");
        ls.del(K_THREAD);
      } else setPhase("thread");
      return "ok";
    }
    return r.status === 404 ? "gone" : "error";
  }, []);

  // boot: resume this device's conversation if there is one
  useEffect(() => {
    const tok = deviceToken();
    setToken(tok);
    setOutbox(readOutbox());
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    (async () => {
      let id = ls.get(K_THREAD);
      if (!id) {
        const r = await api<{ thread_id: string | null }>("/api/threads", { headers: { "x-device-token": tok } });
        id = r.ok ? r.data.thread_id : null;
      }
      if (!id) return setPhase("intro");
      const res = await load(id, tok);
      if (res === "ok") {
        setThreadId(id);
        ls.set(K_THREAD, id);
      } else if (res === "gone") {
        ls.del(K_THREAD);
        setPhase("intro");
      } else setPhase("error");
    })();
  }, [load]);

  useEvents(threadId ? [`thread:${threadId}`] : [], () => {
    if (threadId) void load(threadId, token);
  }, !!threadId && phase === "thread");

  /* ── offline-safe sending ─────────────────────────── */
  const saveOutbox = (o: Outbox) => {
    setOutbox(o);
    ls.set(K_OUTBOX, JSON.stringify(o));
  };
  const flush = useCallback(async () => {
    const box = readOutbox();
    if (!box.length || !token) return;
    let changed = false;
    const keep: Outbox = [];
    for (const m of box) {
      const r = await api(`/api/threads/${m.thread_id}/messages`, { method: "POST", headers: { "x-device-token": token }, json: { body: m.body, client_id: m.client_id } });
      if (r.ok || (r.status >= 400 && r.status < 500 && r.status !== 429)) changed = true;
      else keep.push({ ...m, state: "queued" });
    }
    saveOutbox(keep);
    if (changed && threadId) void load(threadId, token);
  }, [token, threadId, load]);

  useEffect(() => {
    const on = () => {
      setOnline(true);
      void flush();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const id = setInterval(() => {
      if (readOutbox().length) void flush();
    }, 15_000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      clearInterval(id);
    };
  }, [flush]);

  const send = async (body: string) => {
    if (!threadId) return;
    const item = { client_id: rand(16), thread_id: threadId, body, at: new Date().toISOString(), state: "sending" as const };
    saveOutbox([...readOutbox(), item]);
    await flush();
  };

  const start = async (consent: Consent, question: string) => {
    const r = await api<{ thread: { id: string } }>("/api/threads", {
      method: "POST",
      json: { device_token: token, consent, question: question || null, card_id: card?.id ?? null, lang: locale },
    });
    if (!r.ok) return r.error.message || t("inbox.talk.startError");
    ls.set(K_THREAD, r.data.thread.id);
    setThreadId(r.data.thread.id);
    await load(r.data.thread.id, token);
    setConsentOpen(false);
    return null;
  };

  const end = async () => {
    if (!threadId) return;
    await api(`/api/threads/${threadId}/close`, { method: "POST", headers: { "x-device-token": token } });
    ls.del(K_THREAD);
    saveOutbox(readOutbox().filter((m) => m.thread_id !== threadId));
    setEndOpen(false);
    setEndedBy("visitor");
    setPhase("ended");
  };
  const restart = () => {
    setThreadId(null);
    setData(null);
    setPhase("intro");
  };

  if (phase === "boot")
    return (
      <div className="flex flex-col gap-4 py-6" aria-busy>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-24" />
        <Skeleton className="h-40" />
      </div>
    );

  if (phase === "error")
    return (
      <div className="py-6 flex flex-col gap-4">
        <Callout tone="bad" title={t("inbox.talk.loadError")} />
        <Button onClick={() => location.reload()}>{t("action.retry")}</Button>
      </div>
    );

  if (phase === "intro" || phase === "ended")
    return (
      <div className="flex flex-col gap-6 py-4 animate-rise">
        {phase === "ended" && (
          <Callout tone="ok" icon={<CheckCircle2 className="size-5 text-ok" />} title={t("inbox.talk.ended")}>
            {endedBy === "specialist" ? t("inbox.talk.endedBySpecialist") : t("inbox.talk.endedBody")}
          </Callout>
        )}
        <div className="flex flex-col gap-3">
          <span className="size-14 rounded-2xl bg-accent-soft text-accent grid place-items-center"><HeartHandshake className="size-7" aria-hidden /></span>
          <h1 className="text-[1.75rem] font-semibold leading-tight">{t("inbox.talk.title")}</h1>
          <p className="text-ink-2 text-[1.05rem]">{t("inbox.talk.lead")}</p>
        </div>
        <ul className="flex flex-col gap-3">
          {[
            [EyeOff, "inbox.talk.point1"],
            [ShieldCheck, "inbox.talk.point2"],
            [Scale, "inbox.talk.point3"],
          ].map(([Icon, k]) => {
            const I = Icon as React.ElementType;
            return (
              <li key={k as string} className="flex gap-3 items-start rounded-[14px] bg-surface border border-line p-3.5">
                <I className="size-5 text-accent mt-0.5 shrink-0" aria-hidden />
                <span className="text-ink">{t(k as string)}</span>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-col gap-2">
          <Button size="xl" full onClick={() => (phase === "ended" ? (restart(), setConsentOpen(true)) : setConsentOpen(true))} data-testid="talk-start">
            <MessageCircle className="size-5" aria-hidden />
            {phase === "ended" ? t("inbox.talk.new") : t("inbox.talk.start")}
          </Button>
          {phase === "ended" && <ButtonLink href="/" variant="ghost" size="lg" full>{t("inbox.talk.discover")}</ButtonLink>}
        </div>
        <ConsentSheet open={consentOpen} onClose={() => setConsentOpen(false)} card={card} initialQuestion={initialQuestion} onStart={start} />
      </div>
    );

  // phase === "thread"
  const msgs: ChatMessage[] = [
    ...(data?.messages ?? []),
    ...outbox.filter((m) => m.thread_id === threadId).map((m) => ({ id: `out_${m.client_id}`, sender: "visitor" as const, body: m.body, created_at: m.at, pending: m.state })),
  ];
  const joined = personHasJoined(msgs);
  const ctx = data?.thread.context ?? {};
  const consent = data?.thread.consent ?? {};
  return (
    <div className="flex flex-col gap-3 pt-2 min-h-[calc(100dvh-var(--tab-h)-5rem)]">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold">{t("inbox.talk.title")}</h1>
          <p className="text-xs text-ink-3 flex items-center gap-1.5 mt-0.5"><Lock className="size-3.5 shrink-0" aria-hidden />{t("inbox.talk.privacy")}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setEndOpen(true)} data-testid="talk-end">{t("inbox.talk.end")}</Button>
      </div>

      <div aria-live="polite">
        {joined ? (
          <div className="flex items-center gap-2.5 rounded-[14px] bg-ok-soft px-4 py-3 text-ok font-medium animate-pop" data-testid="person-banner">
            <UserRound className="size-5 shrink-0" aria-hidden />
            {t("badge.person")}
          </div>
        ) : (
          <p className="rounded-[14px] bg-surface-2 px-4 py-3 text-sm text-ink-2">{t("inbox.talk.waiting")}</p>
        )}
      </div>

      <p className="text-xs text-ink-3 flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{t("inbox.talk.youShared")}:</span>
        {consent.question || consent.card || consent.lang ? (
          <>
            {consent.question && ctx.question && <span className="rounded-full bg-surface-2 px-2 py-0.5">{t("inbox.talk.share.question")}</span>}
            {ctx.card_id && <span className="rounded-full bg-surface-2 px-2 py-0.5 inline-flex items-center gap-1"><BookOpen className="size-3" aria-hidden />{t("inbox.talk.sharedCard", { title: (locale === "ar" ? ctx.card_title_ar : ctx.card_title_en) ?? "" })}</span>}
            {consent.lang && <span className="rounded-full bg-surface-2 px-2 py-0.5">{t("inbox.talk.sharedLang")}</span>}
          </>
        ) : (
          <span>{t("inbox.talk.sharedNothing")}</span>
        )}
      </p>

      {!online && <Callout tone="warn" icon={<WifiOff className="size-4" />}>{t("inbox.talk.offline")}</Callout>}

      <div className="flex-1 py-2">
        {msgs.length === 0 ? (
          <p className="text-center text-sm text-ink-3 py-8">{t("inbox.talk.empty")}</p>
        ) : (
          <MessagesView
            messages={msgs}
            me="visitor"
            labels={{ me: t("inbox.talk.you"), them: t("inbox.talk.specialist"), openCard: t("inbox.talk.openCard"), closedVisitor: t("inbox.closedBy.visitor"), closedSpecialist: t("inbox.talk.endedBySpecialist"), queued: t("inbox.talk.queued"), sending: t("inbox.talk.sending") }}
          />
        )}
      </div>

      <div ref={endRef} />
      <Composer onSend={send} />

      <Sheet
        open={endOpen}
        onClose={() => setEndOpen(false)}
        title={t("inbox.talk.end")}
        closeLabel={t("action.close")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEndOpen(false)}>{t("action.cancel")}</Button>
            <Button variant="danger" onClick={end} data-testid="talk-end-confirm">{t("inbox.talk.endYes")}</Button>
          </>
        }
      >
        <p className="text-ink-2">{t("inbox.talk.endConfirm")}</p>
      </Sheet>
    </div>
  );
}

function Composer({ onSend }: { onSend: (body: string) => Promise<void> }) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const submit = async () => {
    const b = text.trim();
    if (!b) return;
    setText("");
    await onSend(b);
    ref.current?.focus();
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="sticky bottom-[calc(var(--tab-h)+env(safe-area-inset-bottom,0px)+8px)] z-10 flex items-end gap-2 rounded-[20px] border border-line bg-surface p-2 shadow-pop"
    >
      <label htmlFor="talk-msg" className="sr-only">{t("inbox.talk.composer")}</label>
      <Textarea
        id="talk-msg"
        ref={ref}
        rows={1}
        dir="auto"
        value={text}
        maxLength={2000}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={t("inbox.talk.composer")}
        className="min-h-11! max-h-36 border-0 focus:ring-0 resize-none bg-transparent py-2.5"
        data-testid="talk-input"
      />
      <Button type="submit" disabled={!text.trim()} className="size-11 p-0 rounded-full shrink-0" aria-label={t("inbox.talk.send")}>
        <Send className="size-5 rtl:-scale-x-100" aria-hidden />
      </Button>
    </form>
  );
}

function ConsentSheet({
  open,
  onClose,
  card,
  initialQuestion,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  card: { id: string; title_en: string; title_ar: string } | null;
  initialQuestion: string;
  onStart: (c: Consent, question: string) => Promise<string | null>;
}) {
  const { t, locale } = useI18n();
  const [question, setQuestion] = useState(initialQuestion);
  const [c, setC] = useState<Consent>({ question: true, card: !!card, lang: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    const e = await onStart({ ...c, question: c.question && !!question.trim() }, c.question ? question.trim() : "");
    setBusy(false);
    if (e) setErr(e);
  };
  const row = (k: keyof Consent, title: React.ReactNode, hint?: string, children?: React.ReactNode) => (
    <div key={k} className={cn("rounded-[14px] border p-3.5 flex flex-col gap-2", c[k] ? "border-accent bg-accent-soft/50" : "border-line")}>
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" className="mt-1 size-5 accent-[var(--accent)] shrink-0" checked={c[k]} onChange={(e) => setC((x) => ({ ...x, [k]: e.target.checked }))} data-testid={`consent-${k}`} />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium text-ink">{title}</span>
          {hint && <span className="text-sm text-ink-2">{hint}</span>}
        </span>
      </label>
      {children}
    </div>
  );
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("inbox.talk.consentTitle")}
      description={t("inbox.talk.consentLead")}
      closeLabel={t("action.close")}
      footer={
        <Button size="lg" full loading={busy} onClick={go} data-testid="talk-begin">
          {t("inbox.talk.begin")}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {row(
          "question",
          t("inbox.talk.share.question"),
          t("inbox.talk.share.questionHint"),
          c.question && (
            <>
              <label htmlFor="talk-question" className="sr-only">{t("inbox.talk.questionLabel")}</label>
              <Textarea id="talk-question" rows={3} dir="auto" value={question} maxLength={1000} onChange={(e) => setQuestion(e.target.value)} placeholder={t("inbox.talk.questionPlaceholder")} data-testid="talk-question" />
            </>
          ),
        )}
        {card && row("card", t("inbox.talk.share.card"), locale === "ar" ? card.title_ar : card.title_en)}
        {row("lang", t("inbox.talk.share.lang", { lang: t(`inbox.talk.langName.${locale}`) }), t("inbox.talk.share.langHint"))}
        <p className="text-sm text-ink-2 flex gap-2"><EyeOff className="size-4 mt-0.5 shrink-0" aria-hidden />{t("inbox.talk.notShared")}</p>
        {err && <Callout tone="bad">{err}</Callout>}
      </div>
    </Sheet>
  );
}


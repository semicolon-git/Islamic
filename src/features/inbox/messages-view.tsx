"use client";
import Link from "next/link";
import { BookOpen, Clock } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fmtDate } from "@/i18n/core";
import { cn } from "@/components/ui/cn";
import { splitMessage } from "./logic";

export interface ChatMessage {
  id: string;
  sender: "visitor" | "specialist" | "system";
  body: string;
  created_at: string;
  pending?: "sending" | "queued";
}

/** Message body with approved-card links rendered as chips. */
export function MessageBody({ body, linkLabel }: { body: string; linkLabel: string }) {
  return (
    <>
      {splitMessage(body).map((p, i) =>
        p.type === "text" ? (
          <span key={i} className="whitespace-pre-wrap">{p.value}</span>
        ) : (
          <Link key={i} href={p.value} target="_blank" className="inline-flex items-center gap-1 rounded-full bg-accent-soft text-ink px-2.5 py-0.5 text-sm font-medium underline-offset-2 hover:underline align-middle mx-0.5">
            <BookOpen className="size-3.5 text-accent" aria-hidden />
            {linkLabel}
          </Link>
        ),
      )}
    </>
  );
}

/** The shared chat transcript. `me` decides which side is "mine" (visitor app vs specialist inbox). */
export function MessagesView({ messages, me, labels }: { messages: ChatMessage[]; me: "visitor" | "specialist"; labels: { me: string; them: string; openCard: string; closedVisitor: string; closedSpecialist: string; queued: string; sending: string } }) {
  const { locale } = useI18n();
  return (
    <ol className="flex flex-col gap-3" aria-live="polite" aria-relevant="additions" data-testid="messages">
      {messages.map((m) => {
        if (m.sender === "system")
          return (
            <li key={m.id} className="self-center text-xs text-ink-3 bg-surface-2 rounded-full px-3 py-1">
              {m.body === "closed_by_visitor" ? labels.closedVisitor : m.body === "closed_by_specialist" ? labels.closedSpecialist : m.body}
            </li>
          );
        const mine = m.sender === me;
        return (
          <li key={m.id} className={cn("flex flex-col gap-1 max-w-[85%] sm:max-w-[75%] animate-rise", mine ? "self-end items-end" : "self-start items-start")} data-sender={m.sender}>
            <span className="text-[0.7rem] text-ink-3 px-1">{mine ? labels.me : labels.them}</span>
            <div
              dir="auto"
              className={cn(
                "rounded-[18px] px-4 py-2.5 text-[0.97rem] leading-relaxed",
                mine ? "bg-accent text-accent-ink rounded-ee-[6px]" : "bg-surface border border-line text-ink rounded-es-[6px]",
                m.pending && "opacity-70",
              )}
            >
              <MessageBody body={m.body} linkLabel={labels.openCard} />
            </div>
            <span className="text-[0.7rem] text-ink-3 px-1 inline-flex items-center gap-1" suppressHydrationWarning>
              {m.pending ? (
                <>
                  <Clock className="size-3" aria-hidden />
                  {m.pending === "queued" ? labels.queued : labels.sending}
                </>
              ) : (
                fmtDate(m.created_at, locale, { timeStyle: "short" })
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, CornerUpLeft, FilePlus2, MessageCircle, Send, Archive, PenLine, Inbox, CheckCheck, X, Activity } from "lucide-react";
import { useEvents } from "@/lib/use-events";
import { useI18n } from "@/i18n/client";
import { fmtRelative } from "@/i18n/core";
import { cn } from "@/components/ui/cn";
import { activityFromEvent, type ActivityItem, type Verb } from "./logic";
import { useTick } from "./client";

const ICON: Record<Verb, React.ElementType> = {
  "card.create": FilePlus2,
  "card.submit": Send,
  "card.approve": CheckCheck,
  "card.return": CornerUpLeft,
  "card.publish": BadgeCheck,
  "card.archive": Archive,
  "card.revision": PenLine,
  "demand.request": Inbox,
  "demand.fulfil": BadgeCheck,
  "demand.dismiss": X,
  "thread.start": MessageCircle,
  "thread.visitor": MessageCircle,
  "thread.reply": MessageCircle,
  "thread.close": X,
  other: Activity,
};
const TONE: Partial<Record<Verb, string>> = {
  "card.publish": "bg-ok-soft text-ok",
  "demand.fulfil": "bg-ok-soft text-ok",
  "card.approve": "bg-accent-soft text-accent",
  "card.return": "bg-warn-soft text-warn",
  "card.submit": "bg-violet-soft text-violet",
  "demand.request": "bg-violet-soft text-violet",
};

export function ActivitySentence({ item }: { item: ActivityItem }) {
  const { t, locale } = useI18n();
  const actor = (locale === "ar" ? item.actor_ar : item.actor_en) || item.actor_en || t("portal.dash.someone");
  const title = (locale === "ar" ? item.title_ar : item.title_en) || item.title_en || "—";
  return <>{t(`portal.act.${item.verb}`, { actor, title, action: item.raw ?? "" })}</>;
}

/** Live activity: starts from the audit log, then streams events (cards, demand, inbox) and refreshes the counts. */
export function ActivityFeed({ initial, canInbox, scopes = ["cards", "demand", "inbox"] }: { initial: ActivityItem[]; canInbox: boolean; scopes?: string[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useTick(30_000);

  useEffect(() => setItems(initial), [initial]);

  const onEvent = useCallback(
    (ev: Parameters<typeof activityFromEvent>[0]) => {
      const item = activityFromEvent(ev);
      if (item) {
        setItems((xs) => [item, ...xs.filter((x) => x.id !== item.id)].slice(0, 30));
        setFresh((s) => new Set(s).add(item.id));
      }
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 900);
    },
    [router],
  );
  useEvents(scopes, onEvent);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-semibold">{t("portal.dash.activity")}</h2>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2" aria-hidden>
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full rounded-full bg-ok opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex size-2 rounded-full bg-ok" />
          </span>
          {t("portal.dash.live")}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-ink-2 py-6">{t("portal.dash.activityEmpty")}</p>
      ) : (
        <ol className="flex flex-col" aria-live="polite" aria-relevant="additions">
          {items.map((it) => {
            const Icon = ICON[it.verb] ?? Activity;
            const href = it.href && (!it.href.startsWith("/portal/inbox") || canInbox) ? it.href : null;
            const body = (
              <>
                <span className={cn("mt-0.5 size-8 shrink-0 rounded-full grid place-items-center", TONE[it.verb] ?? "bg-surface-2 text-ink-2")}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[0.92rem] text-ink leading-snug">
                    <ActivitySentence item={it} />
                  </span>
                  <time className="text-xs text-ink-3" dateTime={it.at} suppressHydrationWarning>{fmtRelative(it.at, locale)}</time>
                </span>
              </>
            );
            return (
              <li key={it.id} className={cn("border-b border-line last:border-0", fresh.has(it.id) && "animate-rise")}>
                {href ? (
                  <Link href={href} className="flex gap-3 py-2.5 px-1 -mx-1 rounded-[10px] hover:bg-surface-2">{body}</Link>
                ) : (
                  <div className="flex gap-3 py-2.5">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

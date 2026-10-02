"use client";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { BadgeCheck, ExternalLink, FilePlus2, Inbox, PencilLine, RotateCw, ShieldCheck } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fmtNumber, fmtRelative } from "@/i18n/core";
import { useEvents } from "@/lib/use-events";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/chip";
import { Card } from "@/components/ui/surface";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { Segmented } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import { api, useTick } from "@/features/portal/client";
import { publicCardPath } from "@/features/inbox/logic";
import type { DemandGroup } from "./demand";

type Tab = "needs" | "fulfilled" | "dismissed" | "all";
const TONE = { open: "violet", in_progress: "accent", fulfilled: "ok", dismissed: "neutral" } as const;

export function DemandBoard({ initial, canDismiss, canCreate }: { initial: DemandGroup[]; canDismiss: boolean; canCreate: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [groups, setGroups] = useState(initial);
  const [tab, setTab] = useState<Tab>("needs");
  const [error, setError] = useState(false);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useTick(30_000);

  const load = useCallback(async () => {
    const r = await api<{ groups: DemandGroup[] }>("/api/demand");
    if (r.ok) {
      setGroups(r.data.groups);
      setError(false);
    } else setError(true);
  }, []);

  useEvents(["demand", "cards"], (ev) => {
    const key = typeof ev.payload.key === "string" ? ev.payload.key : null;
    if (ev.scope === "demand" && ev.type === "request" && key) {
      setFlash((s) => new Set(s).add(key));
      const label = (locale === "ar" ? ev.payload.label_ar : ev.payload.label_en) as string | undefined;
      if (label) toast({ tone: "info", text: t("demand.newRequest", { label }) });
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void load(), 250);
  });

  const counts = useMemo(
    () => ({
      needs: groups.filter((g) => g.status === "open" || g.status === "in_progress").length,
      fulfilled: groups.filter((g) => g.status === "fulfilled").length,
      dismissed: groups.filter((g) => g.status === "dismissed").length,
      all: groups.length,
    }),
    [groups],
  );
  const shown = groups.filter((g) => (tab === "all" ? true : tab === "needs" ? g.status === "open" || g.status === "in_progress" : g.status === tab));
  const openTotal = groups.reduce((s, g) => s + g.open, 0);

  const label = (g: DemandGroup) =>
    g.concept_id ? (locale === "ar" ? g.label_ar : g.label_en) ?? g.concept_id : g.topic ? `“${g.topic}”` : t("demand.item", { code: g.item_code ?? "?" });
  const setStatus = async (g: DemandGroup, status: "dismissed" | "open") => {
    const r = await api("/api/demand", { method: "PATCH", json: { key: g.key, status } });
    if (r.ok) {
      if (status === "dismissed") toast({ tone: "ok", text: t("demand.dismissed") });
      void load();
    }
  };
  const createHref = (g: DemandGroup) =>
    g.concept_id ? `/portal/cards/new?concept=${encodeURIComponent(g.concept_id)}` : `/portal/cards/new?kind=answer&title=${encodeURIComponent(g.topic ?? "")}`;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-3">
            {t("demand.title")}
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2 rounded-full border border-line px-2 py-0.5">
              <span className="relative flex size-2" aria-hidden>
                <span className="absolute inline-flex size-full rounded-full bg-ok opacity-60 motion-safe:animate-ping" />
                <span className="relative inline-flex size-2 rounded-full bg-ok" />
              </span>
              {t("demand.live")}
            </span>
          </h1>
          <p className="text-ink-2 mt-0.5 max-w-[70ch]">{t("demand.subtitle")}</p>
        </div>
        <p className="text-sm text-ink-2 tabular" aria-live="polite" data-testid="demand-summary">
          {t("demand.summary", { open: fmtNumber(openTotal, locale), groups: fmtNumber(counts.needs, locale) })}
        </p>
      </header>

      <Segmented<Tab>
        label={t("demand.tabsLabel")}
        value={tab}
        onChange={setTab}
        options={(["needs", "fulfilled", "dismissed", "all"] as const).map((k) => ({ value: k, label: t(`demand.tab.${k}`), count: counts[k] }))}
        className="self-start max-w-full overflow-x-auto"
      />

      {error && (
        <Callout tone="bad" title={t("demand.error")}>
          <Button size="sm" variant="secondary" className="mt-2" onClick={() => load()}><RotateCw className="size-4" aria-hidden />{t("action.retry")}</Button>
        </Callout>
      )}

      {shown.length === 0 ? (
        <Card>
          <EmptyState icon={<Inbox className="size-6" />} title={t("demand.empty.title")} body={t("demand.empty.body")} />
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" data-testid="demand-groups">
          {shown.map((g) => (
            <li key={g.key} data-key={g.key} className={cn(flash.has(g.key) && "animate-pop")}>
              <Card className={cn("p-4 h-full flex flex-col gap-3 transition-shadow", flash.has(g.key) && "ring-2 ring-violet/40")}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold text-ink truncate" dir="auto">{label(g)}</h2>
                    <p className="text-xs text-ink-3 mt-0.5">
                      {g.concept_id ? (g.track ? t(`cards.track.${g.track}`) : "") : g.topic ? t("demand.topic") : ""}
                    </p>
                  </div>
                  <Badge tone={TONE[g.status]}>{t(`demand.status.${g.status}`)}</Badge>
                </div>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-3xl font-semibold tabular text-ink" data-testid="demand-count">{fmtNumber(g.status === "fulfilled" ? g.fulfilled : g.open || g.total, locale)}</span>
                  <span className="text-sm text-ink-2">{(g.open || g.total) === 1 ? t("demand.request1") : t("demand.requests", { n: "" }).trim()}</span>
                  {g.recent > 0 && <Badge tone="violet" className="tabular">{t("demand.week", { n: fmtNumber(g.recent, locale) })}</Badge>}
                </div>
                <p className="text-xs text-ink-3" suppressHydrationWarning>{t("demand.last", { when: fmtRelative(g.last_at, locale) })}</p>

                {g.in_progress.length > 0 && g.status !== "fulfilled" && (
                  <ul className="flex flex-col gap-1">
                    {g.in_progress.slice(0, 2).map((c) => (
                      <li key={c.id}>
                        <Link href={`/portal/cards/${encodeURIComponent(c.id)}`} className="flex items-center gap-2 text-sm rounded-[10px] bg-accent-soft px-3 py-2 hover:brightness-95">
                          <PencilLine className="size-4 text-accent shrink-0" aria-hidden />
                          <span className="truncate flex-1" dir="auto">{locale === "ar" ? c.title_ar : c.title_en}</span>
                          <span className="text-xs text-ink-2 shrink-0">{t(`status.${c.stage}`)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {g.card && (g.status === "fulfilled" || !g.in_progress.length) && (
                  <div className="flex items-center gap-2 text-sm rounded-[10px] bg-ok-soft px-3 py-2">
                    <BadgeCheck className="size-4 text-ok shrink-0" aria-hidden />
                    <span className="truncate flex-1" dir="auto">{locale === "ar" ? g.card.title_ar : g.card.title_en}</span>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mt-auto pt-1">
                  {g.status === "fulfilled" && g.card ? (
                    <>
                      <ButtonLink href={`/portal/cards/${encodeURIComponent(g.card.id)}`} size="sm" variant="secondary">{t("demand.viewCard")}</ButtonLink>
                      <ButtonLink href={publicCardPath(g.card)} size="sm" variant="ghost" target="_blank"><ExternalLink className="size-4" aria-hidden />{t("demand.viewPublic")}</ButtonLink>
                    </>
                  ) : g.status === "dismissed" ? (
                    canDismiss && <Button size="sm" variant="secondary" onClick={() => setStatus(g, "open")}>{t("demand.reopen")}</Button>
                  ) : (
                    <>
                      {canCreate && !g.in_progress.length && !g.item_code && (
                        <ButtonLink href={createHref(g)} size="sm" data-testid="demand-create"><FilePlus2 className="size-4" aria-hidden />{t("demand.create")}</ButtonLink>
                      )}
                      {g.in_progress[0] && <ButtonLink href={`/portal/cards/${encodeURIComponent(g.in_progress[0].id)}`} size="sm" variant="soft">{t("demand.openDraft")}</ButtonLink>}
                      {canDismiss && <Button size="sm" variant="ghost" onClick={() => setStatus(g, "dismissed")}>{t("demand.dismiss")}</Button>}
                    </>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ink-3 flex items-center gap-1.5"><ShieldCheck className="size-3.5" aria-hidden />{t("demand.privacy")}</p>
    </div>
  );
}

"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FilePlus2, Search, LayoutList, RotateCw } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fmtNumber, fmtRelative } from "@/i18n/core";
import { useEvents } from "@/lib/use-events";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge, Chip, StatusPill } from "@/components/ui/chip";
import { Input, Select } from "@/components/ui/field";
import { Card } from "@/components/ui/surface";
import { Callout, EmptyState, Kbd, Skeleton } from "@/components/ui/feedback";
import { cn } from "@/components/ui/cn";
import { api, isTyping, useDebounced, useTick } from "@/features/portal/client";
import type { CardListItem } from "./server";

const STAGES = ["all", "ai_draft", "student_submitted", "researcher_approved", "published", "returned", "archived"] as const;

export interface ListData {
  items: CardListItem[];
  counts: Record<string, number>;
}

export function CardsList({ initial, canCreate }: { initial: ListData; canCreate: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const [stage, setStage] = useState(sp.get("stage") ?? "all");
  const [kind, setKind] = useState(sp.get("kind") ?? "");
  const [track, setTrack] = useState(sp.get("track") ?? "");
  const [mine, setMine] = useState(sp.get("mine") === "1");
  const [q, setQ] = useState(sp.get("q") ?? "");
  const dq = useDebounced(q, 250);
  const [data, setData] = useState<ListData>(initial);
  const [state, setState] = useState<"ok" | "loading" | "error">("ok");
  const searchRef = useRef<HTMLInputElement>(null);
  const first = useRef(true);
  useTick(60_000);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (stage !== "all") p.set("stage", stage);
    if (kind) p.set("kind", kind);
    if (track) p.set("track", track);
    if (mine) p.set("mine", "1");
    if (dq.trim()) p.set("q", dq.trim());
    return p.toString();
  }, [stage, kind, track, mine, dq]);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setState("loading");
      const r = await api<ListData>(`/api/cards?${query}`);
      if (r.ok) {
        setData(r.data);
        setState("ok");
      } else if (!quiet) setState("error");
    },
    [query],
  );

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    router.replace(`/portal/cards${query ? `?${query}` : ""}`, { scroll: false });
    void load();
  }, [query, load, router]);

  useEvents(["cards"], () => void load(true));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if ((e.key === "n" || e.key === "N") && canCreate) {
        e.preventDefault();
        router.push("/portal/cards/new");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, canCreate]);

  const filtered = stage !== "all" || kind || track || mine || dq.trim();
  const clear = () => {
    setStage("all");
    setKind("");
    setTrack("");
    setMine(false);
    setQ("");
  };
  const title = (c: CardListItem) => (locale === "ar" ? c.title_ar || c.title_en : c.title_en || c.title_ar) || t("cards.untitled");
  const concept = (c: CardListItem) => (locale === "ar" ? c.concept_ar : c.concept_en) ?? "—";
  const author = (c: CardListItem) => (locale === "ar" ? c.author_ar : c.author_en) ?? "—";
  const href = (c: CardListItem) => `/portal/cards/${encodeURIComponent(c.id)}`;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("cards.title")}</h1>
          <p className="text-ink-2 mt-0.5 max-w-[70ch]">{t("cards.subtitle")}</p>
        </div>
        {canCreate && (
          <ButtonLink href="/portal/cards/new" size="md" aria-keyshortcuts="n">
            <FilePlus2 className="size-4" aria-hidden />
            {t("cards.new")}
            <span className="hidden lg:inline-flex ms-1 opacity-80"><Kbd>N</Kbd></span>
          </ButtonLink>
        )}
      </header>

      <div role="tablist" aria-label={t("cards.stagesLabel")} className="flex gap-1 overflow-x-auto scrollbar-thin -mx-1 px-1 pb-1">
        {STAGES.map((s) => {
          const n = s === "all" ? data.counts.all ?? 0 : data.counts[s] ?? 0;
          const active = stage === s;
          return (
            <button
              key={s}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setStage(s)}
              className={cn(
                "shrink-0 inline-flex items-center gap-2 h-10 px-3.5 rounded-[10px] text-sm font-medium border transition-colors",
                active ? "bg-surface border-line-strong text-ink shadow-card" : "border-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              {t(`cards.stage.${s}`)}
              <span className={cn("tabular text-xs rounded-full px-1.5 min-w-6 text-center", active ? "bg-accent-soft text-ink" : "bg-surface-2 text-ink-3")}>{fmtNumber(n, locale)}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="size-4 absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" aria-hidden />
          <Input ref={searchRef} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("cards.search")} aria-label={t("cards.searchLabel")} className="ps-10" aria-keyshortcuts="/" />
        </div>
        <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex">
        <Select aria-label={t("cards.filter.kind")} value={kind} onChange={(e) => setKind(e.target.value)} className="sm:w-44!">
          <option value="">{t("cards.filter.allKinds")}</option>
          <option value="concept">{t("cards.kind.concept")}</option>
          <option value="answer">{t("cards.kind.answer")}</option>
        </Select>
        <Select aria-label={t("cards.filter.track")} value={track} onChange={(e) => setTrack(e.target.value)} className="sm:w-40!">
          <option value="">{t("cards.filter.allTracks")}</option>
          <option value="nature">{t("cards.track.nature")}</option>
          <option value="art">{t("cards.track.art")}</option>
          <option value="heritage">{t("cards.track.heritage")}</option>
        </Select>
        </div>
        <Chip selected={mine} onClick={() => setMine((m) => !m)} className="h-11">{t("cards.filter.mine")}</Chip>
        {filtered && (
          <Button variant="ghost" size="md" onClick={clear}>{t("cards.filter.clear")}</Button>
        )}
      </div>

      <div aria-live="polite" aria-busy={state === "loading"}>
        {state === "error" ? (
          <Callout tone="bad" title={t("cards.error")}>
            <Button variant="secondary" size="sm" className="mt-2" onClick={() => load()}><RotateCw className="size-4" aria-hidden />{t("action.retry")}</Button>
          </Callout>
        ) : state === "loading" && !data.items.length ? (
          <Card className="p-4 flex flex-col gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</Card>
        ) : data.items.length === 0 ? (
          <Card>
            <EmptyState
              icon={<LayoutList className="size-6" />}
              title={t("cards.empty.title")}
              body={t("cards.empty.body")}
              action={
                <>
                  {filtered && <Button variant="secondary" onClick={clear}>{t("cards.filter.clear")}</Button>}
                  {canCreate && <ButtonLink href="/portal/cards/new"><FilePlus2 className="size-4" aria-hidden />{t("cards.new")}</ButtonLink>}
                </>
              }
            />
          </Card>
        ) : (
          <Card className={cn("overflow-hidden transition-opacity", state === "loading" && "opacity-60")}>
            {/* desktop / tablet table */}
            <table className="hidden md:table w-full text-sm">
              <caption className="sr-only">{t("cards.count", { n: data.items.length })}</caption>
              <thead className="bg-surface-2 text-ink-2 text-start">
                <tr>
                  <th scope="col" className="text-start font-medium px-4 py-2.5">{t("cards.col.title")}</th>
                  <th scope="col" className="text-start font-medium px-3 py-2.5 hidden lg:table-cell">{t("cards.col.concept")}</th>
                  <th scope="col" className="text-start font-medium px-3 py-2.5">{t("cards.col.level")}</th>
                  <th scope="col" className="text-start font-medium px-3 py-2.5">{t("cards.col.stage")}</th>
                  <th scope="col" className="text-start font-medium px-3 py-2.5 hidden xl:table-cell">{t("cards.col.author")}</th>
                  <th scope="col" className="text-start font-medium px-4 py-2.5">{t("cards.col.updated")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id} className="border-t border-line hover:bg-surface-2/60 cursor-pointer group" onClick={() => router.push(href(c))}>
                    <td className="px-4 py-3 max-w-[420px]">
                      <Link href={href(c)} className="font-medium text-ink group-hover:underline underline-offset-4 block truncate" dir="auto" onClick={(e) => e.stopPropagation()}>
                        {title(c)}
                      </Link>
                      <span className="flex items-center gap-2 text-xs text-ink-3 mt-0.5">
                        <span>{t(`cards.kind.${c.kind}`)}</span>
                        <span className="mono truncate" dir="ltr">{c.id}</span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-ink-2 hidden lg:table-cell">{concept(c)}</td>
                    <td className="px-3 py-3"><Badge className="mono">{c.level}</Badge></td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <StatusPill status={c.stage} label={t(`status.${c.stage}`)} />
                        {c.status === "published" && c.stage !== "published" && c.published_version && (
                          <Badge tone="ok" title={t("cards.liveHint", { v: c.published_version })}>{t("cards.live", { v: c.published_version })}</Badge>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-ink-2 hidden xl:table-cell">{author(c)}</td>
                    <td className="px-4 py-3 text-ink-3 whitespace-nowrap" suppressHydrationWarning>{fmtRelative(c.updated_at, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* phone list */}
            <ul className="md:hidden divide-y divide-line">
              {data.items.map((c) => (
                <li key={c.id}>
                  <Link href={href(c)} className="flex flex-col gap-1.5 p-4 hover:bg-surface-2">
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-medium text-ink" dir="auto">{title(c)}</span>
                      <Badge className="mono shrink-0">{c.level}</Badge>
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                      <StatusPill status={c.stage} label={t(`status.${c.stage}`)} />
                      <span>{concept(c)}</span>
                      <span suppressHydrationWarning>· {fmtRelative(c.updated_at, locale)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

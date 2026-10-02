"use client";
import { useEffect, useState } from "react";
import { History as HistoryIcon, RotateCcw } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fmtDate, fmtRelative } from "@/i18n/core";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/chip";
import { Card } from "@/components/ui/surface";
import { Callout, Skeleton } from "@/components/ui/feedback";
import { cn } from "@/components/ui/cn";
import { api } from "@/features/portal/client";
import type { DiffEntry } from "../diff";
import type { ReviewInfo, VersionInfo } from "../server";
import type { VersionDoc } from "../diff";

const ARABIC_PATH = /\.ar$|title_ar/;

function DiffView({ entries }: { entries: DiffEntry[] }) {
  const { t } = useI18n();
  if (!entries.length) return <p className="text-sm text-ink-2 py-4">{t("cards.hist.noChanges")}</p>;
  return (
    <ul className="flex flex-col gap-3" data-testid="diff">
      {entries.map((e) => (
        <li key={e.path} className="rounded-[12px] border border-line p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3 mb-1.5">{t(`cards.path.${e.path}`)}</p>
          {e.kind === "text" && (
            <p className={cn("text-sm leading-relaxed whitespace-pre-wrap", ARABIC_PATH.test(e.path) && "text-[1rem] leading-[1.9]")} dir={ARABIC_PATH.test(e.path) ? "rtl" : "ltr"} lang={ARABIC_PATH.test(e.path) ? "ar" : "en"}>
              {e.words.map((w, i) =>
                w.op === "equal" ? <span key={i}>{w.text}</span> : w.op === "insert" ? (
                  <ins key={i} className="bg-ok-soft text-ok no-underline rounded px-0.5">{w.text}</ins>
                ) : (
                  <del key={i} className="bg-bad-soft text-bad rounded px-0.5">{w.text}</del>
                ),
              )}
            </p>
          )}
          {e.kind === "value" && (
            <p className="text-sm flex flex-wrap items-center gap-2">
              <del className="bg-bad-soft text-bad rounded px-1.5 mono">{e.before || "—"}</del>
              <span aria-hidden>→</span>
              <ins className="bg-ok-soft text-ok no-underline rounded px-1.5 mono">{e.after || "—"}</ins>
            </p>
          )}
          {e.kind === "list" && (
            <div className="flex flex-col gap-1 text-sm">
              {e.added.map((x) => <p key={`a${x}`} className="text-ok"><span className="font-medium">+ {t("cards.hist.added")}:</span> <bdi className="mono">{x}</bdi></p>)}
              {e.removed.map((x) => <p key={`r${x}`} className="text-bad"><span className="font-medium">− {t("cards.hist.removed")}:</span> <bdi className="mono">{x}</bdi></p>)}
              {e.reordered && <p className="text-ink-2">↕ {t("cards.hist.reordered")}</p>}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function HistoryTab({
  cardId,
  versions,
  reviews,
  currentVersion,
  publishedVersion,
  canRestore,
  onRestore,
}: {
  cardId: string;
  versions: VersionInfo[];
  reviews: ReviewInfo[];
  currentVersion: number;
  publishedVersion: number | null;
  canRestore: boolean;
  onRestore: (doc: VersionDoc, v: number) => void;
}) {
  const { t, locale } = useI18n();
  const sorted = [...versions].sort((a, b) => b.version - a.version);
  const [b, setB] = useState(currentVersion);
  const [a, setA] = useState(Math.max(1, currentVersion - 1));
  const [entries, setEntries] = useState<DiffEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (a === b) {
      setEntries([]);
      return;
    }
    let stale = false;
    setEntries(null);
    setErr(null);
    api<{ entries: DiffEntry[] }>(`/api/cards/${encodeURIComponent(cardId)}/diff?a=${a}&b=${b}`).then((r) => {
      if (stale) return;
      if (r.ok) setEntries(r.data.entries);
      else setErr(r.error.message);
    });
    return () => {
      stale = true;
    };
  }, [a, b, cardId]);

  const restore = async (v: number) => {
    const r = await api<{ doc: VersionDoc }>(`/api/cards/${encodeURIComponent(cardId)}/versions/${v}`);
    if (r.ok) onRestore(r.data.doc, v);
  };
  const name = (en: string | null, ar: string | null) => (locale === "ar" ? ar : en) ?? "—";

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] items-start">
      <div className="flex flex-col gap-5">
        <Card className="p-4 flex flex-col gap-3">
          <h2 className="font-semibold flex items-center gap-2"><HistoryIcon className="size-4" aria-hidden />{t("cards.hist.versions")}</h2>
          <ol className="flex flex-col max-h-[420px] overflow-y-auto scrollbar-thin -mx-1">
            {sorted.map((v) => (
              <li key={v.version} className="flex items-center gap-2 px-1 py-2 border-b border-line last:border-0">
                <span className="flex flex-col min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {t("cards.hist.v", { v: v.version })}
                    {v.version === currentVersion && <Badge tone="accent">{t("cards.hist.current")}</Badge>}
                    {v.version === publishedVersion && <Badge tone="ok">{t("cards.hist.published")}</Badge>}
                  </span>
                  <span className="text-xs text-ink-3 truncate" suppressHydrationWarning>
                    {name(v.author_en, v.author_ar)} · {fmtRelative(v.created_at, locale)}{v.note ? ` · ${v.note}` : ""}
                  </span>
                  <span className="mono text-[0.7rem] text-ink-3" dir="ltr">{v.content_sha}</span>
                </span>
                {canRestore && v.version !== currentVersion && (
                  <Button size="sm" variant="ghost" onClick={() => restore(v.version)} aria-label={t("cards.hist.restore", { v: v.version })}>
                    <RotateCcw className="size-4" aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ol>
        </Card>
        <Card className="p-4 flex flex-col gap-3">
          <h2 className="font-semibold">{t("cards.hist.timeline")}</h2>
          {reviews.length === 0 ? (
            <p className="text-sm text-ink-3">{t("cards.hist.noReviews")}</p>
          ) : (
            <ol className="flex flex-col gap-3 border-s-2 border-line ps-4" data-testid="review-timeline">
              {reviews.map((r) => (
                <li key={r.id} className="relative">
                  <span className="absolute -start-[1.4rem] top-1.5 size-2.5 rounded-full bg-accent ring-4 ring-surface" aria-hidden />
                  <p className="text-sm">
                    <span className="font-medium">{name(r.reviewer_en, r.reviewer_ar)}</span> {t(`cards.hist.decision.${r.decision}`)} {r.version ? <span className="text-ink-3">({t("cards.hist.v", { v: r.version })})</span> : null}
                  </p>
                  <p className="text-xs text-ink-3">{fmtDate(r.created_at, locale, { dateStyle: "medium", timeStyle: "short" })}</p>
                  {r.note && <p className="mt-1 text-sm text-ink-2 rounded-[10px] bg-surface-2 px-3 py-2" dir="auto">{r.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card className="p-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <h2 className="font-semibold me-auto">{t("cards.hist.compare")}</h2>
          <label className="flex items-center gap-2 text-sm">
            {t("cards.hist.from")}
            <Select value={a} onChange={(e) => setA(Number(e.target.value))} className="h-9 w-auto! py-0" aria-label={t("cards.hist.from")}>
              {sorted.map((v) => <option key={v.version} value={v.version}>{t("cards.hist.v", { v: v.version })}</option>)}
            </Select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            {t("cards.hist.to")}
            <Select value={b} onChange={(e) => setB(Number(e.target.value))} className="h-9 w-auto! py-0" aria-label={t("cards.hist.to")}>
              {sorted.map((v) => <option key={v.version} value={v.version}>{t("cards.hist.v", { v: v.version })}</option>)}
            </Select>
          </label>
        </div>
        {versions.length < 2 ? (
          <p className="text-sm text-ink-2">{t("cards.hist.single")}</p>
        ) : err ? (
          <Callout tone="bad">{err}</Callout>
        ) : entries === null ? (
          <div className="flex flex-col gap-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
        ) : (
          <DiffView entries={entries} />
        )}
      </Card>
    </div>
  );
}

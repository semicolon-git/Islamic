"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Compass, FilePlus2, FileText } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import { fmtRelative } from "@/i18n/core";
import { discoverHref } from "../link";
import type { DiscoveryRow } from "../server";

/** Demand board: what visitors explored without a reviewed card → draft a card from the found sources. */
export function DiscoveriesPanel({ initial, canHide }: { initial: DiscoveryRow[]; canHide: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/discover/board", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (r?.ok) setRows(r.data);
  }, []);
  useEffect(() => {
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [load]);

  const draft = async (key: string) => {
    setBusy(key);
    const r = await fetch("/api/discover/card", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) }).then((x) => x.json()).catch(() => null);
    setBusy(null);
    if (!r?.ok) return toast({ tone: "bad", text: r?.error?.message ?? "Failed" });
    router.push(`/portal/cards/${encodeURIComponent(r.data.id)}`);
  };
  const hide = async (key: string) => {
    await fetch("/api/discover/board", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) });
    setRows((s) => s.filter((r) => r.key !== key));
  };

  return (
    <section className="flex flex-col gap-3 mt-8" aria-labelledby="disc-h" data-testid="discoveries-panel">
      <div className="flex flex-col gap-1">
        <h2 id="disc-h" className="text-xl font-semibold text-ink inline-flex items-center gap-2"><Compass className="size-5 text-accent" aria-hidden />{t("discover.board.title")}</h2>
        <p className="text-sm text-ink-2 max-w-[80ch]">{t("discover.board.body")}</p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-[16px] border border-line bg-surface p-4 text-ink-2">{t("discover.board.empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-[18px] border border-line bg-surface overflow-hidden">
          {rows.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center gap-3 px-4 py-3" data-discovery={r.key}>
              <span className="mono text-sm text-ink-3 w-10 shrink-0" dir="ltr">{t("discover.board.hits", { n: r.hits })}</span>
              <span className="flex-1 min-w-[12rem] flex flex-col">
                <span className="font-medium text-ink">{locale === "ar" ? r.label_ar || r.label_en : r.label_en || r.label_ar}</span>
                <span className="text-xs text-ink-3">
                  {r.status === "empty" ? t("discover.board.status.empty") : t("discover.board.counts", { v: r.verses, h: r.hadith })}
                  {r.has_summary ? ` · ${t("discover.board.summary")}` : ""} · {fmtRelative(r.last_hit_at, locale)}
                </span>
              </span>
              <Link href={discoverHref({ label_en: r.label_en, label_ar: r.label_ar }, "search")} className="text-sm font-medium text-accent min-h-11 inline-flex items-center px-2">{t("discover.board.open")}</Link>
              {r.card_id ? (
                <Link href={`/portal/cards/${encodeURIComponent(r.card_id)}`} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] border border-line-strong text-sm font-medium hover:bg-surface-2"><FileText className="size-4" aria-hidden />{t("discover.board.drafted")}</Link>
              ) : (
                r.status !== "empty" && <Button size="sm" onClick={() => draft(r.key)} loading={busy === r.key} data-testid="discovery-draft"><FilePlus2 className="size-4" aria-hidden />{t("discover.board.draft")}</Button>
              )}
              {canHide && <Button size="sm" variant="ghost" onClick={() => hide(r.key)}>{t("discover.board.hide")}</Button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

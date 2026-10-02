"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Landmark } from "lucide-react";
import { Badge, EmptyState, StatusPill } from "@/components/ui";
import { ConceptImage } from "@/components/ui/concept-image";
import { Segmented } from "@/components/ui/tabs";
import { useI18n } from "@/i18n/client";
import { fmtRelative } from "@/i18n/core";
import { useEvents } from "@/lib/use-events";
import { loc, num } from "../l10n";

export interface ItemListRow {
  id: string;
  item_code: string | null;
  kind: string;
  title_en: string;
  title_ar: string;
  status: string;
  venue_name_en: string | null;
  venue_name_ar: string | null;
  thumb: string | null;
  inscriptions: number;
  inscriptions_pending: number;
  updated_at: string;
  your_turn: boolean;
}

type Filter = "all" | "work" | "published";

/** Portal list of heritage items with live updates. */
export function ItemsTable({ rows }: { rows: ItemListRow[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  useEvents(["items"], () => router.refresh());
  const counts = useMemo(
    () => ({ all: rows.length, work: rows.filter((r) => r.status !== "published" && r.status !== "archived").length, published: rows.filter((r) => r.status === "published").length }),
    [rows],
  );
  const shown = rows.filter((r) => (filter === "all" ? true : filter === "published" ? r.status === "published" : r.status !== "published" && r.status !== "archived"));
  return (
    <div className="flex flex-col gap-4">
      <Segmented
        label={t("heritage.portal.filterLabel")}
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: t("heritage.portal.filterAll"), count: counts.all },
          { value: "work", label: t("heritage.portal.filterWork"), count: counts.work },
          { value: "published", label: t("heritage.portal.filterPublished"), count: counts.published },
        ]}
      />
      {shown.length === 0 ? (
        <EmptyState className="rounded-[var(--radius)] border border-dashed border-line-strong" icon={<Landmark className="size-7" aria-hidden />} title={t("heritage.portal.emptyTitle")} body={t("heritage.portal.emptyBody")} />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius)] border border-line bg-surface shadow-card">
          <table className="w-full text-sm" data-testid="items-table">
            <thead>
              <tr className="text-start text-xs uppercase tracking-wider text-ink-3 bg-surface-2">
                <th scope="col" className="text-start font-semibold px-4 py-2.5">{t("heritage.portal.colItem")}</th>
                <th scope="col" className="text-start font-semibold px-4 py-2.5">{t("heritage.portal.colCode")}</th>
                <th scope="col" className="text-start font-semibold px-4 py-2.5 hidden md:table-cell">{t("heritage.portal.colVenue")}</th>
                <th scope="col" className="text-start font-semibold px-4 py-2.5">{t("heritage.portal.colStatus")}</th>
                <th scope="col" className="text-start font-semibold px-4 py-2.5 hidden lg:table-cell">{t("heritage.portal.colInscriptions")}</th>
                <th scope="col" className="text-start font-semibold px-4 py-2.5 hidden lg:table-cell">{t("heritage.portal.colUpdated")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-line hover:bg-surface-2/60 transition-colors" data-testid="item-row">
                  <td className="px-4 py-3">
                    <Link href={`/portal/items/${r.id}`} className="flex items-center gap-3 min-w-0 group">
                      <ConceptImage src={r.thumb} alt={loc(locale, r.title_en, r.title_ar)} className="size-11 shrink-0 rounded-[10px]" rounded={false} hue={200} />
                      <span className="flex flex-col min-w-0">
                        <span className="font-medium text-ink group-hover:underline underline-offset-4 truncate">{loc(locale, r.title_en, r.title_ar)}</span>
                        <span className="text-xs text-ink-3">{t(`heritage.kind.${r.kind}`)}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.item_code ? <span className="mono text-ink" dir="ltr">{r.item_code}</span> : <span className="text-ink-3 text-xs">{t("heritage.portal.noCode")}</span>}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-ink-2 min-w-[11rem]">{loc(locale, r.venue_name_en, r.venue_name_ar) || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap items-center gap-1.5 whitespace-nowrap">
                      <StatusPill status={r.status} label={t(`status.${r.status}`)} />
                      {r.your_turn && <Badge tone="violet">{t("heritage.portal.yourTurn")}</Badge>}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-ink-2 tabular">
                    {num(locale, r.inscriptions)}
                    {r.inscriptions_pending > 0 && <Badge tone="warn" className="ms-2">{t("heritage.portal.pendingInscriptions", { n: num(locale, r.inscriptions_pending) })}</Badge>}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-ink-3 whitespace-nowrap">{fmtRelative(r.updated_at, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

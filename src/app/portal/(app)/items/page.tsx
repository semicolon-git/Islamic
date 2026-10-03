import type { Metadata } from "next";
import { Plus, Printer } from "lucide-react";
import { ButtonLink, Card } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { itemsUser } from "@/features/heritage/access";
import { NoAccess } from "@/features/heritage/components/no-access";
import { availableDecisions, type Status } from "@/lib/workflow";
import { listPortalItems } from "@/features/heritage/portal-queries";
import { allVenues } from "@/features/heritage/queries";
import { venueQr } from "@/features/heritage/qr";
import { thumbOf } from "@/features/heritage/uploads";
import { ItemsTable, type ItemListRow } from "@/features/heritage/components/items-table";
import { loc } from "@/features/heritage/l10n";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("heritage.portal.title") };
}

export default async function ItemsPage() {
  const user = await itemsUser();
  const { t, locale } = await getI18n();
  if (!user) return <NoAccess title={t("heritage.portal.noAccessTitle")} body={t("heritage.portal.noAccessBody")} back={t("heritage.portal.home")} />;
  const [items, venues] = await Promise.all([listPortalItems(), allVenues()]);
  const rows: ItemListRow[] = items.map((i) => ({
    id: i.id,
    item_code: i.item_code,
    kind: i.kind,
    title_en: i.title_en,
    title_ar: i.title_ar,
    status: i.status,
    venue_name_en: i.venue_name_en,
    venue_name_ar: i.venue_name_ar,
    thumb: i.images[0] ? thumbOf(i.images[0].src) : null,
    inscriptions: i.inscriptions,
    inscriptions_pending: i.inscriptions_pending,
    updated_at: i.updated_at,
    your_turn:
      availableDecisions(user.role, i.status as Status).some((d) => d !== "archive" && d !== "return") ||
      (i.inscriptions_pending > 0 && (user.role === "researcher" || user.role === "platform_admin")),
  }));
  const venueQrs = await Promise.all(venues.map(async (v) => ({ v, qr: await venueQr(v.code) })));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-ink">{t("heritage.portal.title")}</h1>
          <p className="text-ink-2 max-w-[70ch]">{t("heritage.portal.subtitle")}</p>
        </div>
        <ButtonLink href="/portal/items/new" size="lg" data-testid="register-item">
          <Plus className="size-5" aria-hidden />
          {t("heritage.portal.register")}
        </ButtonLink>
      </header>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] items-start">
        <ItemsTable rows={rows} />
        {venueQrs.length > 0 && (
          <aside className="flex flex-col gap-3" aria-labelledby="venue-qr-h">
            <h2 id="venue-qr-h" className="text-sm font-semibold uppercase tracking-wider text-ink-3">{t("heritage.qr.venueTitle")}</h2>
            {venueQrs.map(({ v, qr }) => (
              <Card key={v.id} className="p-4 flex items-center gap-4">
                <div className="size-24 shrink-0 rounded-[10px] overflow-hidden border border-line bg-white" role="img" aria-label={t("heritage.qr.alt", { code: v.code })} dangerouslySetInnerHTML={{ __html: qr.svg }} />
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="font-medium text-ink leading-snug">{loc(locale, v.name_en, v.name_ar)}</span>
                  <span className="mono text-sm text-ink-2" dir="ltr">{v.code}</span>
                  <span className="mono text-[0.7rem] text-ink-3 break-all" dir="ltr">{qr.payload}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-ink-3"><Printer className="size-3.5" aria-hidden />{t("heritage.venue.privacy")}</span>
                </div>
              </Card>
            ))}
          </aside>
        )}
      </div>
    </div>
  );
}

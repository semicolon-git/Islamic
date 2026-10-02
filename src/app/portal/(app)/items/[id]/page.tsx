import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ExternalLink, Printer, QrCode } from "lucide-react";
import { ButtonLink, Card, StatusPill } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { env } from "@/lib/env";
import { availableDecisions, fourEyesOk, type Status } from "@/lib/workflow";
import { itemsUser } from "@/features/heritage/access";
import { getPortalItem, formOptions } from "@/features/heritage/portal-queries";
import { itemInscriptions } from "@/features/heritage/queries";
import { itemHistory, lastApprover } from "@/features/heritage/server";
import { itemQr } from "@/features/heritage/qr";
import { loc } from "@/features/heritage/l10n";
import { NoAccess } from "@/features/heritage/components/no-access";
import { ItemDetails, LiveRefresh } from "@/features/heritage/components/item-details";
import { WorkflowPanel } from "@/features/heritage/components/workflow-panel";
import { InscriptionsPanel } from "@/features/heritage/components/inscriptions-panel";
import type { ItemFormValue } from "@/features/heritage/components/item-form";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { locale, t } = await getI18n();
  const item = await getPortalItem(id);
  return { title: item ? loc(locale, item.title_en, item.title_ar) : t("heritage.portal.title") };
}

export default async function PortalItemPage({ params }: Props) {
  const { id } = await params;
  const user = await itemsUser();
  const { t, locale } = await getI18n();
  if (!user) return <NoAccess title={t("heritage.portal.noAccessTitle")} body={t("heritage.portal.noAccessBody")} back={t("heritage.portal.home")} />;
  const item = await getPortalItem(id);
  if (!item) return <NoAccess title={t("heritage.portal.notFound")} body="" back={t("heritage.portal.back")} />;
  const [history, inscriptions, options, approver, qr] = await Promise.all([
    itemHistory(id),
    itemInscriptions(id),
    formOptions(),
    lastApprover(id),
    item.status === "published" && item.item_code ? itemQr(item.item_code) : Promise.resolve(null),
  ]);
  const status = item.status as Status;
  const decisions = availableDecisions(user.role, status);
  const value: ItemFormValue = {
    title_en: item.title_en,
    title_ar: item.title_ar,
    kind: item.kind,
    venue_id: item.venue_id ?? "",
    concept_id: item.concept_id ?? "",
    card_id: item.card_id ?? "",
    manuscript_id: item.manuscript_id ?? "",
    date_text: item.date_text ?? "",
    date_text_ar: item.date_text_ar ?? "",
    origin: item.origin ?? "",
    origin_ar: item.origin_ar ?? "",
    material: item.material ?? "",
    material_ar: item.material_ar ?? "",
    description_en: item.description_en ?? "",
    description_ar: item.description_ar ?? "",
    images: item.images.map((im) => ({ ...im, source_url: im.source_url ?? null })),
  };

  return (
    <div className="flex flex-col gap-5" data-testid="portal-item" data-id={item.id}>
      <LiveRefresh scopes={[`item:${item.id}`, ...(item.item_code ? [`item:${item.item_code}`] : [])]} />
      <Link href="/portal/items" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink min-h-11 self-start">
        <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
        {t("heritage.portal.back")}
      </Link>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-ink me-auto">{loc(locale, item.title_en, item.title_ar)}</h1>
        <StatusPill status={item.status} label={t(`status.${item.status}`)} />
        {item.item_code && <span className="mono text-sm rounded-full border border-line px-2.5 py-0.5 text-ink-2" dir="ltr" data-testid="item-code">{item.item_code}</span>}
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <div className="flex flex-col gap-5 min-w-0">
          <ItemDetails value={value} options={options} itemId={item.id} editable={["ai_draft", "returned", "student_submitted"].includes(item.status)} />
          <InscriptionsPanel itemId={item.id} rows={inscriptions} user={{ id: user.id, role: user.role }} demo={env.demoMode} />
        </div>
        <div className="flex flex-col gap-5 lg:sticky lg:top-20">
          <WorkflowPanel
            itemId={item.id}
            status={item.status}
            decisions={decisions}
            fourEyesBlocked={!fourEyesOk(user.id, approver)}
            history={history}
            demo={env.demoMode}
          />
          <Card className="p-5 flex flex-col gap-3" data-testid="qr-panel">
            <h2 className="font-semibold text-ink flex items-center gap-2">
              <QrCode className="size-5 text-accent" aria-hidden />
              {t("heritage.qr.title")}
            </h2>
            {qr && item.item_code ? (
              <>
                <div className="flex items-center gap-4">
                  <div className="size-32 shrink-0 rounded-[12px] overflow-hidden border border-line bg-white" role="img" aria-label={t("heritage.qr.alt", { code: item.item_code })} dangerouslySetInnerHTML={{ __html: qr.svg }} data-testid="item-qr" />
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">{t("heritage.qr.code")}</span>
                    <span className="mono text-2xl text-ink" dir="ltr">{item.item_code}</span>
                    <span className="text-xs text-ink-3">{t("heritage.qr.opens")}</span>
                    <span className="mono text-[0.72rem] text-ink-2 break-all" dir="ltr">{qr.payload}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ButtonLink href={`/portal/items/${item.id}/label`} data-testid="print-label">
                    <Printer className="size-4" aria-hidden />
                    {t("heritage.qr.print")}
                  </ButtonLink>
                  <ButtonLink href={`/heritage/item/${encodeURIComponent(item.item_code)}`} variant="ghost" target="_blank">
                    <ExternalLink className="size-4" aria-hidden />
                    {t("heritage.portal.viewPublic")}
                  </ButtonLink>
                </div>
              </>
            ) : (
              <p className="text-sm text-ink-2">{t("heritage.qr.pending")}</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

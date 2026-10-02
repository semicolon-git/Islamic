import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Khatam } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { makeT, messages } from "@/i18n";
import { env } from "@/lib/env";
import { itemsUser } from "@/features/heritage/access";
import { getPortalItem } from "@/features/heritage/portal-queries";
import { itemQr } from "@/features/heritage/qr";
import { NoAccess } from "@/features/heritage/components/no-access";
import { PrintButton } from "@/features/heritage/components/print-button";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("heritage.label.title") };
}

/** Printable A6 museum label: bilingual title, QR code, short code, institution and credit line. */
export default async function LabelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await itemsUser();
  const { t } = await getI18n();
  if (!user) return <NoAccess title={t("heritage.portal.noAccessTitle")} body={t("heritage.portal.noAccessBody")} back={t("heritage.portal.home")} />;
  const item = await getPortalItem(id);
  if (!item) return <NoAccess title={t("heritage.portal.notFound")} body="" back={t("heritage.portal.back")} />;
  if (item.status !== "published" || !item.item_code)
    return <NoAccess title={t("heritage.label.notPublished")} body="" back={t("heritage.label.back")} />;
  const qr = await itemQr(item.item_code);
  const en = makeT(messages, "en");
  const ar = makeT(messages, "ar");
  const demo = env.demoMode && item.institution_is_demo;
  const credit = [...new Set(item.images.map((im) => im.credit))].join(" · ");

  return (
    <div className="flex flex-col items-center gap-5 pb-10">
      <style>{`
        @page { size: 105mm 148mm; margin: 0; }
        @media print {
          body { background: #fff !important; }
          body * { visibility: hidden; }
          #a6-label, #a6-label * { visibility: visible; }
          #a6-label { position: fixed; inset: 0; margin: 0; box-shadow: none !important; border: 0 !important; border-radius: 0 !important; }
        }
      `}</style>
      <div className="w-full max-w-[105mm] flex items-center justify-between gap-3 print:hidden">
        <Link href={`/portal/items/${item.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink min-h-11">
          <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
          {t("heritage.label.back")}
        </Link>
        <PrintButton label={t("heritage.label.print")} />
      </div>
      <p className="text-xs text-ink-3 print:hidden">{t("heritage.label.size")}</p>

      <section
        id="a6-label"
        aria-label={t("heritage.label.title")}
        data-testid="a6-label"
        className="relative w-[105mm] h-[148mm] bg-white text-[#10143a] shadow-pop rounded-[6px] border border-line overflow-hidden flex flex-col px-[9mm] py-[8mm]"
        style={{ colorScheme: "light" }}
      >
        <div className="flex items-center justify-between gap-3 text-[8.5pt] text-[#474d75]">
          <span className="font-semibold uppercase tracking-[0.12em] leading-tight" dir="ltr">
            {item.institution_name_en}
            {demo ? " (demo)" : ""}
          </span>
          <span lang="ar" dir="rtl" className="font-[family-name:var(--font-arabic)] leading-tight text-end">
            {item.institution_name_ar}
            {demo ? " (تجريبي)" : ""}
          </span>
        </div>
        <div className="mt-[5mm] h-px bg-[#c3c8db]" />
        <h2 lang="ar" dir="rtl" className="mt-[5mm] font-[family-name:var(--font-ms)] text-[20pt] leading-[1.6] text-end">{item.title_ar}</h2>
        <p lang="en" dir="ltr" className="text-[12.5pt] font-semibold leading-snug">{item.title_en}</p>
        {(item.date_text || item.material) && (
          <p dir="ltr" className="mt-[1.5mm] text-[8.5pt] text-[#474d75] leading-snug">{[item.date_text, item.material].filter(Boolean).join(" · ")}</p>
        )}

        <div className="mt-auto flex items-end gap-[5mm]">
          <div className="w-[38mm] h-[38mm] shrink-0" role="img" aria-label={t("heritage.qr.alt", { code: item.item_code })} dangerouslySetInnerHTML={{ __html: qr.svg }} />
          <div className="flex flex-col gap-[1.5mm] min-w-0 pb-[1mm]">
            <span className="mono text-[22pt] font-medium tracking-[0.06em] leading-none" dir="ltr" data-testid="label-code">{item.item_code}</span>
            <span className="text-[7.5pt] leading-snug text-[#474d75]" dir="ltr">{en("heritage.label.scan")} {en("heritage.label.orType")}</span>
            <span lang="ar" dir="rtl" className="text-[8pt] leading-snug text-[#474d75] font-[family-name:var(--font-arabic)]">{ar("heritage.label.scan")} {ar("heritage.label.orType")}</span>
          </div>
        </div>
        <div className="mt-[5mm] flex items-center gap-2 border-t border-[#dadeeb] pt-[2.5mm] text-[6.5pt] text-[#5f6589] leading-snug">
          <span className="text-[#077a67] shrink-0" aria-hidden>
            <Khatam size={14} />
          </span>
          <span dir="ltr" className="min-w-0">
            {en("app.name")} · {ar("app.name")}
            {credit ? <> · {en("heritage.item.credit")}: {credit}</> : null}
          </span>
        </div>
      </section>
    </div>
  );
}

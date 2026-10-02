import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { itemsUser } from "@/features/heritage/access";
import { NoAccess } from "@/features/heritage/components/no-access";
import { formOptions } from "@/features/heritage/portal-queries";
import { ItemForm } from "@/features/heritage/components/item-form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("heritage.portal.newTitle") };
}

export default async function NewItemPage() {
  const user = await itemsUser();
  const { t } = await getI18n();
  if (!user) return <NoAccess title={t("heritage.portal.noAccessTitle")} body={t("heritage.portal.noAccessBody")} back={t("heritage.portal.home")} />;
  const options = await formOptions();
  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <Link href="/portal/items" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink min-h-11 self-start">
        <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
        {t("heritage.portal.back")}
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink">{t("heritage.portal.newTitle")}</h1>
        <p className="text-ink-2 max-w-[70ch]">{t("heritage.portal.newSubtitle")}</p>
      </header>
      <ItemForm options={options} />
    </div>
  );
}

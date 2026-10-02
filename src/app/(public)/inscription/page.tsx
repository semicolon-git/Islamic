import { Suspense } from "react";
import type { Metadata } from "next";
import { Khatam, Skeleton } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { aiEnabled } from "@/lib/ai/claude";
import { InscriptionReader } from "@/features/heritage/components/inscription-reader";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("heritage.ins.title") };
}

export default async function InscriptionPage() {
  const { t } = await getI18n();
  return (
    <div className="flex flex-col gap-6 pb-10">
      <header className="relative flex flex-col gap-2 pt-2 animate-rise">
        <span className="text-accent" aria-hidden>
          <Khatam size={30} />
        </span>
        <h1 className="text-[2rem] sm:text-[2.4rem] font-semibold tracking-tight text-ink">{t("heritage.ins.title")}</h1>
        <p className="text-ink-2 text-[1.02rem] max-w-[60ch]">{t("heritage.ins.subtitle")}</p>
      </header>
      <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        <InscriptionReader aiEnabled={aiEnabled()} />
      </Suspense>
    </div>
  );
}

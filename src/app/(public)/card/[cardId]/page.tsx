import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { resolveCard } from "@/lib/cards/resolve";
import { ButtonLink } from "@/components/ui/button";
import { CardView } from "@/features/beneficiary/card-view";
import { BackLink } from "@/features/beneficiary/back-link";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ cardId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cardId } = await params;
  const { locale } = await getI18n();
  const r = await resolveCard(decodeURIComponent(cardId), "published");
  return { title: r ? (locale === "ar" ? r.card.title_ar : r.card.title_en) : undefined };
}

export default async function CardPage({ params, searchParams }: Props) {
  const { cardId } = await params;
  const sp = await searchParams;
  const { t } = await getI18n();
  const resolved = await resolveCard(decodeURIComponent(cardId), "published");
  if (!resolved) {
    return (
      <div className="flex flex-col items-center text-center gap-3 py-16 px-6">
        <div className="size-14 rounded-2xl bg-surface-2 text-ink-2 grid place-items-center"><SearchX className="size-6" aria-hidden /></div>
        <h1 className="text-xl font-semibold text-ink max-w-[28ch]">{t("beneficiary.cardMissing.title")}</h1>
        <p className="text-ink-2 max-w-[42ch]">{t("beneficiary.cardMissing.body")}</p>
        <div className="mt-2 flex flex-wrap gap-2 justify-center">
          <ButtonLink href="/">{t("beneficiary.cardMissing.home")}</ButtonLink>
          <ButtonLink href="/ask" variant="secondary">{t("beneficiary.nocard.ask")}</ButtonLink>
        </div>
      </div>
    );
  }
  return (
    <>
      <BackLink label={t("nav.back")} />
      <CardView resolved={resolved} justApproved={sp.approved === "1"} />
    </>
  );
}

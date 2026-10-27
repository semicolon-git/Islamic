import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getI18n } from "@/i18n/server";
import { chainForReview } from "@/features/science/review";
import { ChainView } from "@/features/science/ui/chain-view";
import { ChainReviewActions } from "@/features/science/ui/chain-review-actions";
import { BackLink } from "@/features/beneficiary/back-link";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { locale } = await getI18n();
  const r = await chainForReview(id);
  return { title: r ? (locale === "ar" ? r.name_ar : r.name_en) : undefined };
}

const ALLOWED = new Set(["researcher", "institution_admin", "platform_admin"]);

/** One chain under review: the exact page visitors see, plus the review actions. */
export default async function ChainReviewPage({ params }: Props) {
  const { id } = await params;
  const user = await getUser();
  const { t, locale } = await getI18n();
  if (!user || !ALLOWED.has(user.role)) return <p className="py-16 text-center text-ink-2">{t("chainReview.forbidden")}</p>;
  const r = await chainForReview(id);
  if (!r) notFound();
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] max-w-6xl" data-testid="chain-review">
      <div className="flex flex-col gap-5">
        <BackLink label={t("nav.back")} />
        <ChainView chain={r.chain} t={t} locale={locale} />
      </div>
      <aside className="flex flex-col gap-4 lg:sticky lg:top-6 self-start">
        <div className="rounded-[18px] border border-line bg-surface-2 p-4 text-sm flex flex-col gap-1.5">
          <span className="font-semibold text-ink">{t(`chainReview.state.${r.state}`)}</span>
          {r.last && <span className="text-ink-2">{t(`chainReview.last.${r.last.decision}`, { who: (locale === "ar" ? r.last.reviewer_ar : r.last.reviewer_en) ?? "—" })}</span>}
          {r.last?.note && <span className="text-ink-2 whitespace-pre-wrap">«{r.last.note}»</span>}
          <span className="text-ink-3">{t("chainReview.checklist")}</span>
        </div>
        <ChainReviewActions id={r.id} state={r.state} role={user.role} />
      </aside>
    </div>
  );
}

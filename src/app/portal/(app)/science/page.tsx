import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getUser } from "@/lib/auth";
import { getI18n } from "@/i18n/server";
import { chainsForReview } from "@/features/science/review";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("chainReview.title") };
}

const ALLOWED = new Set(["researcher", "institution_admin", "platform_admin"]);
const TONE: Record<string, string> = {
  pending: "bg-surface-2 text-ink-2", returned: "bg-warn-soft text-warn", approved: "bg-[#fdf3d6] text-[#7a5600] dark:bg-[#3a2f12] dark:text-[#f3d27a]", reviewed: "bg-ok-soft text-ink",
};

/** /portal/science — contribution chains awaiting scholarly review (researcher approves, a different admin signs off). */
export default async function ChainReviewList() {
  const user = await getUser();
  const { t, locale } = await getI18n();
  if (!user || !ALLOWED.has(user.role)) return <p className="py-16 text-center text-ink-2">{t("chainReview.forbidden")}</p>;
  const rows = await chainsForReview();
  return (
    <div className="flex flex-col gap-5 max-w-4xl" data-testid="chain-review-list">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold text-ink">{t("chainReview.title")}</h1>
        <p className="text-ink-2 max-w-[70ch]">{t("chainReview.intro")}</p>
      </header>
      <ul className="flex flex-col divide-y divide-line rounded-[18px] border border-line bg-surface overflow-hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/portal/science/${encodeURIComponent(r.id)}`} className="flex items-center gap-3 px-4 py-3 min-h-14 hover:bg-surface-2" data-chain-row={r.id}>
              <span className="flex-1 flex flex-col">
                <span className="font-medium text-ink">{locale === "ar" ? r.name_ar : r.name_en}</span>
                {r.last && <span className="text-xs text-ink-3">{t(`chainReview.last.${r.last.decision}`, { who: (locale === "ar" ? r.last.reviewer_ar : r.last.reviewer_en) ?? "—" })}</span>}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TONE[r.state]}`} data-state={r.state}>{t(`chainReview.state.${r.state}`)}</span>
              <ChevronRight className="size-4 text-ink-3 rtl:rotate-180" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

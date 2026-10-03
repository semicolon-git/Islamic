import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { env } from "@/lib/env";
import { getI18n } from "@/i18n/server";
import { publishedManuscript, publishedPages } from "@/features/ms-collab/server/public";
import { PublicReader } from "@/features/ms-collab/components/public/reader";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ msId: string }> }): Promise<Metadata> {
  const { msId } = await params;
  const { t, locale } = await getI18n();
  const m = await publishedManuscript(decodeURIComponent(msId));
  return { title: m ? (locale === "ar" ? m.title_ar : m.title_en) : t("collab.pub.listTitle") };
}

/** Public reader: only frozen, hashed publications of a manuscript's pages. */
export default async function PublicManuscript({ params }: { params: Promise<{ msId: string }> }) {
  const { msId } = await params;
  const id = decodeURIComponent(msId);
  const { t } = await getI18n();
  const manuscript = await publishedManuscript(id);
  const pages = manuscript ? await publishedPages(id) : [];
  if (!manuscript || !pages.length)
    return (
      <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-6 mt-4 flex flex-col items-center text-center gap-3" data-testid="public-empty">
        <span className="size-14 rounded-2xl bg-sand text-sand-ink grid place-items-center"><ScrollText className="size-7" aria-hidden /></span>
        <h1 className="text-xl font-semibold">{t("collab.pub.noneTitle")}</h1>
        <p className="text-ink-2 max-w-[44ch]">{t("collab.pub.noneBody")}</p>
        <Link href="/heritage/manuscripts" className="mt-1 inline-flex items-center h-11 px-5 rounded-[12px] bg-accent text-accent-ink font-medium">{t("collab.pub.all")}</Link>
      </div>
    );
  return <PublicReader manuscript={manuscript} pages={pages} demo={env.demoMode} />;
}

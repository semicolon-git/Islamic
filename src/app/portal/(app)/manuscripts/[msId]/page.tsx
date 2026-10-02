import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { sql } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { getManuscript, listPages } from "@/features/manuscripts/server/repo";
import { ManuscriptView } from "@/features/manuscripts/components/manuscript/manuscript-view";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ msId: string }> }): Promise<Metadata> {
  const { msId } = await params;
  const m = await getManuscript(msId);
  const { locale } = await getI18n();
  return { title: m ? (locale === "ar" ? m.title_ar : m.title_en) : "Manuscript" };
}

export default async function ManuscriptPage({ params }: { params: Promise<{ msId: string }> }) {
  const user = await getUser();
  if (!user) redirect("/portal/login");
  const { msId } = await params;
  const manuscript = await getManuscript(msId);
  if (!manuscript) notFound();
  const [pages, siblings] = await Promise.all([
    listPages(msId),
    manuscript.work_id
      ? sql<{ id: string; siglum: string | null; shelfmark: string | null; repository: string | null; holding_library_ar: string | null }>(
          "select id, siglum, shelfmark, repository, holding_library_ar from manuscripts where work_id = $1 and id <> $2 order by siglum nulls last",
          [manuscript.work_id, msId],
        )
      : Promise.resolve([]),
  ]);
  return <ManuscriptView manuscript={manuscript} pages={pages} siblings={siblings} role={user.role} demo={env.demoMode} />;
}

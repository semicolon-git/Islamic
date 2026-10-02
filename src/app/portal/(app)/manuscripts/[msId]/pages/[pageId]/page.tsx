import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import { getI18n } from "@/i18n/server";
import { getPage, getPageDetail } from "@/features/manuscripts/server/repo";
import { Workspace } from "@/features/manuscripts/components/workspace/workspace";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ pageId: string }> }): Promise<Metadata> {
  const { pageId } = await params;
  const p = await getPage(pageId);
  const { t } = await getI18n();
  return { title: p ? `${p.label ?? t("manuscripts.page.n", { n: p.seq })} · ${t("manuscripts.title")}` : t("manuscripts.title") };
}

export default async function PageWorkspace({ params }: { params: Promise<{ msId: string; pageId: string }> }) {
  const user = await getUser();
  if (!user) redirect("/portal/login");
  const { msId, pageId } = await params;
  try {
    const detail = await getPageDetail(pageId, user);
    if (detail.manuscript.id !== msId) notFound();
    return <Workspace initial={detail} />;
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
}

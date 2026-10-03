import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import { getI18n } from "@/i18n/server";
import { collationView } from "@/features/ms-collab/server/collation";
import { CompareView } from "@/features/ms-collab/components/compare/compare-view";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("collab.compare.title") };
}

/** Collation of copies of the same work, word by word on the current reading text. */
export default async function ComparePage({ params }: { params: Promise<{ msId: string }> }) {
  const user = await getUser();
  if (!user) redirect("/portal/login");
  const { msId } = await params;
  try {
    return <CompareView data={await collationView(msId)} />;
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
}

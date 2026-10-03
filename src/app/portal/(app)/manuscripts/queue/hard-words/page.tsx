import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getI18n } from "@/i18n/server";
import { NoAccess } from "@/features/portal/no-access";
import { canAdjudicate, canKey } from "@/features/ms-collab/rules";
import { AdjudicateView } from "@/features/ms-collab/components/hard/adjudicate-view";
import { KeyingView } from "@/features/ms-collab/components/hard/keying-view";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("collab.hard.title") };
}

/** Students read hard words blind; researchers decide the disputed ones. */
export default async function HardWordsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await getUser();
  if (!user) redirect("/portal/login");
  const { page } = await searchParams;
  if (user.role === "student") return <KeyingView pageId={page} />;
  if (canAdjudicate(user.role)) return <AdjudicateView pageId={page} />;
  if (canKey(user.role)) return <KeyingView pageId={page} />;
  return <NoAccess />;
}

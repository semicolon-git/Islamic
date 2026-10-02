import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { getI18n } from "@/i18n/server";
import { listManuscripts } from "@/features/manuscripts/server/repo";
import { LibraryView } from "@/features/manuscripts/components/library/library-view";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("manuscripts.title") };
}

export default async function ManuscriptsPage() {
  const user = await getUser();
  if (!user) redirect("/portal/login");
  const manuscripts = await listManuscripts();
  return <LibraryView manuscripts={manuscripts} role={user.role} demo={env.demoMode} />;
}

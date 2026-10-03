import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { publishedManuscripts } from "@/features/ms-collab/server/public";
import { PublicList } from "@/features/ms-collab/components/public/reader";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("collab.pub.listTitle") };
}

/** Published manuscripts: reviewed transcriptions approved by the holding institution. */
export default async function PublicManuscripts() {
  return <PublicList items={await publishedManuscripts()} />;
}

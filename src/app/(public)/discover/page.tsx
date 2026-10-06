import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getI18n } from "@/i18n/server";
import { parseDiscoverParams } from "@/features/discover/link";
import { DiscoverScreen } from "@/features/discover/ui/discover-screen";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const { t, locale } = await getI18n();
  const p = parseDiscoverParams(await searchParams);
  const label = locale === "ar" ? p.label_ar || p.label_en : p.label_en || p.label_ar;
  return { title: label ? `${label} · ${t("discover.title")}` : t("discover.title") };
}

/** /discover?en=&ar=&c=&te=a|b&ta=x|y (from Snap) or ?q= (from Explore search). The photo never travels, only its subject. */
export default async function DiscoverPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = parseDiscoverParams(await searchParams);
  if (!p.label_en && !p.label_ar) redirect("/");
  return <DiscoverScreen key={`${p.label_en}|${p.label_ar}`} input={p} />;
}

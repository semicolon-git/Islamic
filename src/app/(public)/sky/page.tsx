import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { isSkyId } from "@/features/sky/catalog";
import { SkyScreen } from "@/features/sky/sky-screen";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("sky.title"), description: t("sky.lead") };
}

/** Sky mode: what the phone is pointing at, computed on the device from time, place and compass. `?find=<id>` guides to one object. */
export default async function SkyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const find = typeof sp.find === "string" && isSkyId(sp.find) ? sp.find : null;
  return <SkyScreen find={find} />;
}

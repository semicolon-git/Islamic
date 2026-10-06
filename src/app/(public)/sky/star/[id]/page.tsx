import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getI18n } from "@/i18n/server";
import { getAyat, type Ayah } from "@/lib/quran";
import { getBody, getStar } from "@/features/sky/catalog";
import { StarDetail, BodyDetail } from "@/features/sky/detail";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/** Quran references shown on star pages (rendered by reference from the KFGQPC table, never typed). */
const STAR_VERSES = ["6:97", "16:16"];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = decodeURIComponent((await params).id);
  const { locale, t } = await getI18n();
  const star = getStar(id);
  const body = getBody(id);
  const name = star ? (locale === "ar" ? star.name_ar ?? star.bayer : star.iau ?? star.bayer) : body ? (locale === "ar" ? body.name_ar : body.name_en) : null;
  return { title: name ?? t("sky.title") };
}

export default async function SkyObjectPage({ params }: Props) {
  const id = decodeURIComponent((await params).id);
  const star = getStar(id);
  const body = getBody(id);
  if (!star && !body) notFound();

  if (star) {
    let verses: Ayah[] = [];
    try {
      verses = await getAyat(STAR_VERSES);
    } catch {
      verses = []; // the page still works without the Quran table (e.g. before `npm run setup`)
    }
    return <StarDetail star={star} verses={verses} />;
  }
  return <BodyDetail id={body!.id} now={new Date()} />;
}

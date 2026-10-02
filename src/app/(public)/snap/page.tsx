import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { aiEnabled } from "@/lib/ai/claude";
import { listConcepts } from "@/features/beneficiary/data";
import { TRACKS, type Track } from "@/features/beneficiary/labels";
import { Snap } from "@/features/beneficiary/snap";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("beneficiary.snap.title") };
}

/** Sample photos: concepts with an approved card first, then a few that photograph well. Labels say "Sample". */
const SAMPLE_ORDER = ["moon", "date_palm", "mosque_lamp", "pen", "camel", "olive", "astrolabe", "honey_bee"];

export default async function SnapPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const concepts = await listConcepts();
  const withImg = concepts.filter((c) => c.image);
  const samples = [
    ...withImg.filter((c) => c.has_card),
    ...SAMPLE_ORDER.map((id) => withImg.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c && !c.has_card),
  ].slice(0, 8);
  const track = typeof sp.track === "string" && TRACKS.includes(sp.track as Track) ? (sp.track as Track) : null;
  return <Snap concepts={concepts} samples={samples} aiOn={aiEnabled()} startWithPicker={sp.pick === "1"} initialTrack={track} />;
}

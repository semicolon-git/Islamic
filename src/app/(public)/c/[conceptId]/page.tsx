import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getI18n } from "@/i18n/server";
import { resolveCard, publishedCardForConcept } from "@/lib/cards/resolve";
import { CardView } from "@/features/beneficiary/card-view";
import { NoCard } from "@/features/beneficiary/no-card";
import { getConcept, listConcepts } from "@/features/beneficiary/data";
import { conceptHue, conceptLabel } from "@/features/beneficiary/labels";
import { BackLink } from "@/features/beneficiary/back-link";
import { ScienceForConcept } from "@/features/science/ui/concept-section";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ conceptId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { conceptId } = await params;
  const { locale } = await getI18n();
  const c = await getConcept(decodeURIComponent(conceptId));
  return { title: c ? conceptLabel(c, locale) : undefined };
}

export default async function ConceptPage({ params, searchParams }: Props) {
  const { conceptId: raw } = await params;
  const sp = await searchParams;
  const conceptId = decodeURIComponent(raw);
  const { t, locale } = await getI18n();
  const concept = await getConcept(conceptId);
  if (!concept) notFound();

  const pub = await publishedCardForConcept(conceptId);
  const resolved = pub ? await resolveCard(pub.id, "published") : null;

  if (resolved) {
    return (
      <>
        <BackLink label={t("nav.back")} />
        <CardView resolved={resolved} justApproved={sp.approved === "1"} />
        <ScienceForConcept conceptId={conceptId} />
      </>
    );
  }

  const suggestions = (await listConcepts(concept.track))
    .filter((c) => c.has_card && c.id !== concept.id)
    .concat((await listConcepts()).filter((c) => c.has_card && c.track !== concept.track))
    .slice(0, 4)
    .map((c) => ({ id: c.id, label: conceptLabel(c, locale) }));

  return (
    <>
      <BackLink label={t("nav.back")} />
      <NoCard conceptId={concept.id} labels={{ en: concept.label_en, ar: concept.label_ar }} label={conceptLabel(concept, locale)} image={concept.image} hue={conceptHue(concept.id, concept.track)} suggestions={suggestions} />
      <ScienceForConcept conceptId={conceptId} />
    </>
  );
}

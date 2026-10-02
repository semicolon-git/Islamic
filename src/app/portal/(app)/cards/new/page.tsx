import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NewCardForm, type ConceptOption } from "@/features/cards/new-card-form";
import { NoAccess } from "@/features/portal/no-access";

export const dynamic = "force-dynamic";
export const metadata = { title: "New card" };

export default async function NewCardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getUser();
  if (!user) redirect("/portal/login");
  if (user.role === "specialist") return <NoAccess />;
  const sp = await searchParams;
  const concepts = await sql<ConceptOption>(
    `select k.id, k.track, k.label_en, k.label_ar,
            (select count(*)::int from card_requests r where r.concept_id = k.id and r.status = 'open') as open_requests,
            coalesce((select array_agg(c.id order by c.id) from cards c where c.concept_id = k.id and c.status <> 'archived'), '{}') as cards
       from concepts k where k.enabled order by k.track, k.sort, k.label_en`,
  );
  const concept = sp.concept && concepts.some((c) => c.id === sp.concept) ? sp.concept : null;
  return <NewCardForm concepts={concepts} initialConcept={concept} initialKind={sp.kind === "answer" ? "answer" : "concept"} initialTitle={sp.title?.slice(0, 200) ?? ""} />;
}

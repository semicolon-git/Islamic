import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { env } from "@/lib/env";
import { allTerms } from "@/lib/glossary";
import { HttpError } from "@/lib/http";
import { getCardDetail, publishedCards, resolveDraft } from "@/features/cards/server";
import { isEditable } from "@/features/cards/transition";
import { CardEditor } from "@/features/cards/editor/editor";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: decodeURIComponent((await params).id) };
}

export default async function CardEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) redirect("/portal/login");
  const id = decodeURIComponent((await params).id);
  let detail;
  try {
    detail = await getCardDetail(user, id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  const { card, doc, stage } = detail;
  const sameInstitution = user.role === "platform_admin" || !card.institution_id || card.institution_id === user.institution_id;
  const canEdit = ["student", "researcher", "institution_admin", "platform_admin"].includes(user.role) && sameInstitution && isEditable(stage, user.role);

  const [concepts, glossary, published, resolved] = await Promise.all([
    sql<{ id: string; track: string; label_en: string; label_ar: string }>("select id, track, label_en, label_ar from concepts where enabled order by track, sort, label_en"),
    allTerms(),
    publishedCards("", 100),
    resolveDraft({
      verses: doc.content.verses.map((v) => v.key),
      hadith: doc.content.hadith.map((h) => h.id),
      glossary_terms: doc.content.glossary_terms,
      concept_id: doc.meta.concept_id,
      show_count: doc.content.show_count,
    }),
  ]);

  return (
    <CardEditor
      key={`${card.current_version}:${stage}:${card.published_version ?? 0}`}
      detail={detail}
      user={{ id: user.id, role: user.role, display_name_en: user.display_name_en, display_name_ar: user.display_name_ar }}
      canEdit={canEdit}
      concepts={concepts}
      glossary={glossary}
      published={published.map((p) => ({ id: p.id, title_en: p.title_en, title_ar: p.title_ar }))}
      resolved={resolved}
      demo={env.demoMode}
    />
  );
}

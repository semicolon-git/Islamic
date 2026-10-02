import { one } from "@/lib/db";
import { TalkApp } from "@/features/inbox/talk-app";

export const dynamic = "force-dynamic";
export const metadata = { title: "Talk to a person" };

/** /talk?card=<id>&q=<question> — talk to a person. Only published cards can be shared as context. */
export default async function TalkPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const card = sp.card
    ? await one<{ id: string; title_en: string; title_ar: string }>("select id, title_en, title_ar from cards where id = $1 and status = 'published'", [sp.card.slice(0, 120)])
    : null;
  return <TalkApp card={card} initialQuestion={(sp.q ?? "").slice(0, 1000)} />;
}

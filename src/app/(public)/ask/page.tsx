import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { AskScreen } from "@/features/ask/ui/ask-screen";
import { contextCardTitle } from "@/features/ask/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("ask.metaTitle") };
}

/** /ask — answers only from approved evidence. ?card=<id> adds "Asking about: …"; ?q= prefills the question. */
export default async function AskPage({ searchParams }: { searchParams: Promise<{ card?: string; q?: string }> }) {
  const sp = await searchParams;
  const context = sp.card ? await contextCardTitle(sp.card).catch(() => null) : null;
  return <AskScreen context={context} initialQuestion={typeof sp.q === "string" ? sp.q.slice(0, 500) : undefined} />;
}

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { listCards } from "@/features/cards/server";
import { CardsList } from "@/features/cards/cards-list";
import { NoAccess } from "@/features/portal/no-access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cards" };

export default async function CardsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getUser();
  if (!user) redirect("/portal/login");
  if (user.role === "specialist") return <NoAccess />;
  const sp = await searchParams;
  const initial = await listCards(user, { stage: sp.stage, kind: sp.kind, track: sp.track, q: sp.q, mine: sp.mine === "1" });
  return (
    <Suspense>
      <CardsList initial={initial} canCreate />
    </Suspense>
  );
}

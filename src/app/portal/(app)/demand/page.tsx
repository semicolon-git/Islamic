import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { demandBoard } from "@/features/cards/demand";
import { DemandBoard } from "@/features/cards/demand-board";
import { NoAccess } from "@/features/portal/no-access";
import { discoveryBoard } from "@/features/discover/server";
import { DiscoveriesPanel } from "@/features/discover/ui/discoveries-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visitor requests" };

export default async function DemandPage() {
  const user = await getUser();
  if (!user) redirect("/portal/login");
  if (user.role === "specialist") return <NoAccess />;
  const [groups, discoveries] = await Promise.all([demandBoard(), discoveryBoard().catch(() => [])]);
  const canDismiss = ["researcher", "institution_admin", "platform_admin"].includes(user.role);
  return (
    <>
      <DemandBoard initial={groups} canDismiss={canDismiss} canCreate />
      <DiscoveriesPanel initial={discoveries} canHide={canDismiss} />
    </>
  );
}

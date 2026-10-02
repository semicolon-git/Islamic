import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { demandBoard } from "@/features/cards/demand";
import { DemandBoard } from "@/features/cards/demand-board";
import { NoAccess } from "@/features/portal/no-access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visitor requests" };

export default async function DemandPage() {
  const user = await getUser();
  if (!user) redirect("/portal/login");
  if (user.role === "specialist") return <NoAccess />;
  const groups = await demandBoard();
  return <DemandBoard initial={groups} canDismiss={["researcher", "institution_admin", "platform_admin"].includes(user.role)} canCreate />;
}

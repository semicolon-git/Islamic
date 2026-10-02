import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { listInbox } from "@/features/inbox/server";
import { InboxApp } from "@/features/inbox/inbox-app";
import { NoAccess } from "@/features/portal/no-access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conversations" };

export default async function InboxPage() {
  const user = await getUser();
  if (!user) redirect("/portal/login");
  if (!["specialist", "researcher", "platform_admin"].includes(user.role)) return <NoAccess />;
  return <InboxApp initial={await listInbox("open")} selectedId={null} />;
}

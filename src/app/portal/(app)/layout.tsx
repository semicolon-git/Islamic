import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { PortalShell } from "@/components/shell/portal-shell";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/portal/login");
  return (
    <PortalShell user={user} demo={env.demoMode}>
      {children}
    </PortalShell>
  );
}

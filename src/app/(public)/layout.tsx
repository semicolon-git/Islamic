import { PublicShell } from "@/components/shell/public-shell";
import { env } from "@/lib/env";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell demo={env.demoMode}>{children}</PublicShell>;
}

import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getI18n } from "@/i18n/server";
import { listBooks } from "@/features/library/server";
import { LibraryView } from "@/features/library/ui/library-view";
import { NoAccess } from "@/features/portal/no-access";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("library.title") };
}

export default async function LibraryPage() {
  const user = await getUser();
  if (!user) redirect("/portal/login");
  if (user.role === "specialist") return <NoAccess />;
  const books = await listBooks();
  return <LibraryView initial={books} canUpload={["researcher", "institution_admin", "platform_admin"].includes(user.role)} />;
}

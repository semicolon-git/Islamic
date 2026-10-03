import Link from "next/link";
import { getI18n } from "@/i18n/server";
import { Logo } from "@/components/ui/khatam";
import { NotFoundView } from "@/components/shell/not-found-view";

/** Unmatched URLs (outside any layout): a branded page with ways back into the app. */
export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="h-14 px-4 flex items-center border-b border-line/60">
        <Link href="/" className="inline-flex items-center min-h-11 rounded-lg" aria-label={t("nav.home")}>
          <Logo label={t("app.name")} />
        </Link>
      </header>
      <main className="flex-1 grid place-items-center">
        <NotFoundView t={t} />
      </main>
    </div>
  );
}

import { Lock } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";

/** Friendly page for roles that don't use an area (the server also refuses every API call). */
export async function NoAccess() {
  const { t } = await getI18n();
  return (
    <Card className="max-w-xl mx-auto mt-8 flex flex-col items-center text-center gap-3 py-10 px-6">
      <div className="size-14 rounded-2xl bg-surface-2 text-ink-2 grid place-items-center"><Lock className="size-6" aria-hidden /></div>
      <h1 className="text-xl font-semibold">{t("portal.noAccess.title")}</h1>
      <p className="text-ink-2 max-w-[42ch]">{t("portal.noAccess.body")}</p>
      <ButtonLink href="/portal" className="mt-2">{t("portal.noAccess.home")}</ButtonLink>
    </Card>
  );
}

import { getUser } from "@/lib/auth";
import { getI18n } from "@/i18n/server";

// Placeholder — owned by the cards/portal builder (B3).
export default async function PortalHome() {
  const user = await getUser();
  const { t, locale } = await getI18n();
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{t("portal.nav.home")}</h1>
      <p className="text-ink-2">{locale === "ar" ? user?.display_name_ar : user?.display_name_en}</p>
    </div>
  );
}

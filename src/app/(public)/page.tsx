import { getI18n } from "@/i18n/server";

// Placeholder — owned by the beneficiary builder (B1).
export default async function Home() {
  const { t } = await getI18n();
  return (
    <div className="py-10 flex flex-col gap-3">
      <h1 className="text-3xl font-semibold">{t("app.name")}</h1>
      <p className="text-ink-2">{t("app.tagline")}</p>
    </div>
  );
}

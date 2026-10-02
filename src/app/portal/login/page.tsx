import { sql } from "@/lib/db";
import { env } from "@/lib/env";
import { getI18n } from "@/i18n/server";
import { LoginForm, type Persona } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portal sign-in" };

export default async function LoginPage() {
  const { t, locale } = await getI18n();
  const personas = await sql<Persona>(
    `select u.id, u.role, u.display_name_en, u.display_name_ar, u.title_en, u.title_ar, u.avatar_hue,
            i.name_en as institution_en, i.name_ar as institution_ar
       from users u left join institutions i on i.id = u.institution_id
      order by array_position(array['student','researcher','institution_admin','specialist','platform_admin'], u.role), u.display_name_en`,
  );
  return (
    <main className="min-h-dvh grid lg:grid-cols-[1fr_1.1fr]">
      <section className="hidden lg:flex flex-col justify-between bg-brand text-brand-ink p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.07] khatam-bg" aria-hidden />
        <div className="relative text-xl font-semibold">{t("portal.name")}</div>
        <div className="relative flex flex-col gap-4 max-w-md">
          <p className="text-3xl font-semibold leading-snug">{locale === "ar" ? "المؤسسات والباحثون والطلاب يبنون المحتوى معًا — ولا يُنشر شيء قبل الاعتماد." : "Institutions, researchers and students build the content together — nothing is published before approval."}</p>
          <p className="text-brand-ink/85">{t("login.subtitle")}</p>
        </div>
        <div className="relative text-sm text-brand-ink/80">{t("app.name")}</div>
      </section>
      <section className="flex flex-col justify-center px-5 py-10 sm:px-12">
        <div className="w-full max-w-xl mx-auto flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold">{t("login.title")}</h1>
            <p className="text-ink-2 mt-1">{t("login.subtitle")}</p>
          </div>
          <LoginForm personas={personas} defaultPin={env.demoMode ? env.demoPin : ""} />
        </div>
      </section>
    </main>
  );
}

import Link from "next/link";
import { getI18n } from "@/i18n/server";

export default async function NotFound() {
  const { locale } = await getI18n();
  return (
    <main className="min-h-dvh grid place-items-center p-6 text-center">
      <div className="flex flex-col gap-3 items-center">
        <p className="mono text-ink-3">404</p>
        <h1 className="text-2xl font-semibold">{locale === "ar" ? "لم نجد هذه الصفحة" : "We couldn't find that page"}</h1>
        <Link href="/" className="text-accent underline underline-offset-4">{locale === "ar" ? "العودة إلى الرئيسية" : "Back to home"}</Link>
      </div>
    </main>
  );
}

import { cookies, headers } from "next/headers";
import { dirOf, makeT, messages, type Locale } from "./index";

export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get("lang")?.value;
  if (c === "ar" || c === "en") return c;
  const al = (await headers()).get("accept-language") || "";
  return /^ar\b/i.test(al.trim()) ? "ar" : "en";
}

export async function getI18n() {
  const locale = await getLocale();
  return { locale, dir: dirOf(locale), t: makeT(messages, locale) };
}

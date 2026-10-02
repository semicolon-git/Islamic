import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { Welcome } from "@/features/beneficiary/welcome";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("beneficiary.welcome.metaTitle") };
}

export default function WelcomePage() {
  return <Welcome />;
}

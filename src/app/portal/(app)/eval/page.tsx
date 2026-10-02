import type { Metadata } from "next";
import { getUser } from "@/lib/auth";
import { getI18n } from "@/i18n/server";
import { latestRun } from "@/features/eval/store";
import { EvalBoard } from "@/features/eval/ui/eval-board";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("eval.title") };
}

const ALLOWED = new Set(["researcher", "institution_admin", "platform_admin"]);

/** /portal/eval — the safety scoreboard (researchers, institution admins, platform admins). */
export default async function EvalPage() {
  const user = await getUser();
  const { t } = await getI18n();
  if (!user || !ALLOWED.has(user.role)) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-ink">{t("eval.forbidden.title")}</h1>
        <p className="text-ink-2">{t("eval.forbidden.body")}</p>
      </div>
    );
  }
  const latest = await latestRun();
  return <EvalBoard run={latest?.run ?? null} source={latest?.source ?? null} canRun />;
}

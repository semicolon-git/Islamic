import { ArrowRight, AtSign, ClipboardCheck, Scale, Type } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { fmtNumber } from "@/i18n/core";
import { getI18n } from "@/i18n/server";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { dashboardCounts } from "../server/tasks";

/** Portal dashboard card: the viewer's manuscript work at a glance, with one way in ("My work"). */
export async function MsWorkCard({ user }: { user: SessionUser }) {
  if (user.role === "specialist") return null;
  const { t, locale } = await getI18n();
  let c: Awaited<ReturnType<typeof dashboardCounts>>;
  try {
    c = await dashboardCounts(user);
  } catch {
    return null;
  }
  const rows: { icon: React.ElementType; label: string; show: boolean }[] = [
    { icon: ClipboardCheck, label: t("collab.dash.tasks", { n: fmtNumber(c.tasks, locale) }), show: user.role === "student" },
    { icon: Type, label: t("collab.dash.toKey", { n: fmtNumber(c.to_key, locale) }), show: user.role === "student" },
    { icon: ClipboardCheck, label: t("collab.dash.reviews", { n: fmtNumber(c.reviews, locale) }), show: user.role === "researcher" || user.role === "platform_admin" },
    { icon: Scale, label: t("collab.dash.disputed", { n: fmtNumber(c.disputed, locale) }), show: user.role === "researcher" || user.role === "platform_admin" },
    { icon: AtSign, label: t("collab.dash.mentions", { n: fmtNumber(c.mentions, locale) }), show: c.mentions > 0 },
  ];
  return (
    <Card className="p-5 flex flex-col gap-3" data-testid="ms-work-card">
      <div className="flex items-center gap-3">
        <span className="size-10 rounded-xl bg-accent-soft text-accent grid place-items-center"><ClipboardCheck className="size-5" aria-hidden /></span>
        <h2 className="text-lg font-semibold">{t("collab.dash.title")}</h2>
      </div>
      <ul className="flex flex-col gap-1.5 text-sm">
        {rows.filter((r) => r.show).map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-ink-2"><r.icon className="size-4 text-ink-3" aria-hidden />{r.label}</li>
        ))}
        {user.role === "institution_admin" && <li className="text-ink-2">{t("collab.dash.admin")}</li>}
        {c.due_soon > 0 && <li className="text-warn font-medium">{t("collab.dash.dueSoon", { n: fmtNumber(c.due_soon, locale) })}</li>}
      </ul>
      <div>
        <ButtonLink href="/portal/manuscripts/queue" variant="secondary" data-testid="ms-work-open">{t("collab.dash.open")}<ArrowRight className="size-4 rtl:rotate-180" aria-hidden /></ButtonLink>
      </div>
    </Card>
  );
}

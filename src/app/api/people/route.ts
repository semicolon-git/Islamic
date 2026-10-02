import { handler, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { getPeople } from "@/features/portal/server";
import { initialsOf } from "@/features/portal/logic";

export const dynamic = "force-dynamic";

/**
 * GET /api/people — learning points, roles and institutions, recent contributions.
 * Students only ever receive their own record. Student names are sent as initials unless ?names=1 (staff only).
 */
export const GET = handler(async (req: Request) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const data = await getPeople(user);
  const full = new URL(req.url).searchParams.get("names") === "1" && user.role !== "student";
  if (!full && !data.ownOnly) {
    const mask = <T extends { role: string; display_name_en: string; display_name_ar: string }>(p: T): T =>
      p.role === "student" ? { ...p, display_name_en: initialsOf(p.display_name_en), display_name_ar: initialsOf(p.display_name_ar) } : p;
    data.people = data.people.map(mask);
    data.contributions = data.contributions.map(mask);
  }
  return ok(data);
});

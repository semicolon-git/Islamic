import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { getPeople } from "@/features/portal/server";
import { initialsOf } from "@/features/portal/logic";
import { PeopleView } from "@/features/portal/people-view";
import { NoAccess } from "@/features/portal/no-access";

export const dynamic = "force-dynamic";
export const metadata = { title: "People" };

export default async function PeoplePage() {
  const user = await getUser();
  if (!user) redirect("/portal/login");
  if (user.role === "specialist") return <NoAccess />;
  const data = await getPeople(user);
  if (!data.ownOnly) {
    // privacy by default: students appear as initials (research memo §6.4)
    const mask = <T extends { role: string; display_name_en: string; display_name_ar: string }>(p: T): T =>
      p.role === "student" ? { ...p, display_name_en: initialsOf(p.display_name_en), display_name_ar: initialsOf(p.display_name_ar) } : p;
    data.people = data.people.map(mask);
    data.contributions = data.contributions.map(mask);
  }
  return <PeopleView initial={data} canReveal={user.role !== "student"} demo={env.demoMode} />;
}

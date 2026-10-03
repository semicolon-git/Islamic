import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getI18n } from "@/i18n/server";
import { NoAccess } from "@/features/portal/no-access";
import { myProgress } from "@/features/ms-collab/server/points";
import { myQueue } from "@/features/ms-collab/server/tasks";
import { QueueView } from "@/features/ms-collab/components/queue/queue-view";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("collab.queue.title") };
}

/** "My work": assignments, hard words, reviews and publication queues, mentions, own progress. */
export default async function QueuePage() {
  const user = await getUser();
  if (!user) redirect("/portal/login");
  if (user.role === "specialist") return <NoAccess />;
  const [data, progress] = await Promise.all([myQueue(user), user.role === "student" ? myProgress(user.id) : Promise.resolve(null)]);
  return <QueueView initial={data} progress={progress} />;
}

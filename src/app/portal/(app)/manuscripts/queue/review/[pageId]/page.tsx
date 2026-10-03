import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import { getI18n } from "@/i18n/server";
import { NoAccess } from "@/features/portal/no-access";
import { pageReview } from "@/features/ms-collab/server/review";
import { ReviewView } from "@/features/ms-collab/components/review/review-view";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("collab.review.title") };
}

export default async function ReviewPageRoute({ params }: { params: Promise<{ pageId: string }> }) {
  const user = await getUser();
  if (!user) redirect("/portal/login");
  if (!["researcher", "institution_admin", "platform_admin"].includes(user.role)) return <NoAccess />;
  const { pageId } = await params;
  try {
    return <ReviewView initial={await pageReview(user, pageId, "approved")} />;
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
}

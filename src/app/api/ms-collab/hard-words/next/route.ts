import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { nextHardWord } from "@/features/ms-collab/server/hardwords";

export const dynamic = "force-dynamic";

/** The next hard word to read (blind: the machine guess and the other reading are never sent before you submit). */
export const GET = handler(async (req: Request) => {
  const user = await requireUser(["student"]);
  const url = new URL(req.url);
  const page = url.searchParams.get("page") || undefined;
  const skip = (url.searchParams.get("skip") || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);
  return ok({ item: await nextHardWord(user, { pageId: page, skip }) });
});

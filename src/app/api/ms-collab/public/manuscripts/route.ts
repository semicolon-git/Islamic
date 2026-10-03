import { handler, ok } from "@/lib/http";
import { publishedManuscripts } from "@/features/ms-collab/server/public";

export const dynamic = "force-dynamic";

/** Public: manuscripts with at least one published (frozen, hashed) page. */
export const GET = handler(async () => ok({ manuscripts: await publishedManuscripts() }));

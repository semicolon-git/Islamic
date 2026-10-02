import type { Queryable } from "../../src/lib/db";
import { ARABIC_LABEL_FIXES } from "../../src/features/beneficiary/labels";
import { log } from "./util";

/**
 * Beneficiary seed (idempotent): give concepts that were seeded without an Arabic label a proper one,
 * so the Arabic app (and the portal) never shows a raw id. Only fills labels that contain no Arabic yet.
 */
export async function seed(q: Queryable) {
  let n = 0;
  for (const [id, ar] of Object.entries(ARABIC_LABEL_FIXES)) {
    const r = await q.query<{ id: string }>(
      "update concepts set label_ar = $2 where id = $1 and label_ar !~ '[؀-ۿ]' returning id",
      [id, ar],
    );
    n += r.rows.length;
  }
  log(`${n} Arabic concept labels filled`);
}

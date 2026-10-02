import "server-only";
import { one, sql } from "@/lib/db";
import type { ItemRow } from "./types";

export interface PortalItem extends ItemRow {
  inscriptions: number;
  inscriptions_pending: number;
  creator_name_en: string | null;
  creator_name_ar: string | null;
}

const PORTAL_SELECT = `
  select h.*, v.code as venue_code, v.name_en as venue_name_en, v.name_ar as venue_name_ar,
         i.name_en as institution_name_en, i.name_ar as institution_name_ar, i.is_demo as institution_is_demo,
         u.display_name_en as creator_name_en, u.display_name_ar as creator_name_ar,
         (select count(*)::int from inscriptions n where n.item_id = h.id) as inscriptions,
         (select count(*)::int from inscriptions n where n.item_id = h.id and n.status = 'suggested') as inscriptions_pending
    from heritage_items h
    left join venues v on v.id = h.venue_id
    left join institutions i on i.id = h.institution_id
    left join users u on u.id = h.created_by`;

export async function listPortalItems(): Promise<PortalItem[]> {
  return sql<PortalItem>(`${PORTAL_SELECT} order by h.updated_at desc, h.created_at desc`);
}

export async function getPortalItem(id: string): Promise<PortalItem | null> {
  return one<PortalItem>(`${PORTAL_SELECT} where h.id = $1`, [id]);
}

export interface Option {
  id: string;
  label_en: string;
  label_ar: string;
}

/** Choices for the register form. */
export async function formOptions() {
  const [venues, concepts, cards, manuscripts] = await Promise.all([
    sql<Option>("select id, name_en as label_en, name_ar as label_ar from venues order by name_en"),
    sql<Option>("select id, label_en, label_ar from concepts where track in ('art','heritage') and enabled order by track, sort, label_en"),
    sql<Option>("select id, title_en as label_en, title_ar as label_ar from cards where status = 'published' order by title_en"),
    sql<Option>("select id, title_en as label_en, title_ar as label_ar from manuscripts order by title_en"),
  ]);
  return { venues, concepts, cards, manuscripts };
}
export type FormOptions = Awaited<ReturnType<typeof formOptions>>;

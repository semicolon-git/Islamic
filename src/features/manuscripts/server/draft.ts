import "server-only";
import { q, sql, tx } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { audit, emit } from "@/lib/events";
import { HttpError } from "@/lib/http";
import type { Status } from "@/lib/workflow";
import { canRunDraft } from "../rules";
import { plainText } from "../tokens";
import type { Polygon } from "../geometry";
import { draftLines, DRAFT_PROMPT_VERSION, type LineCrop } from "./engines";
import { cropLine, fileForPublicPath } from "./images";

export interface DraftReport {
  engine: string;
  drafted: number;
  kept_human: number;
  empty: number;
  note?: string;
}

/**
 * Machine draft for a page. Never overwrites human work: only lines with no human version receive a new machine
 * version (appended to the history, so earlier drafts stay visible).
 */
export async function runDraft(user: SessionUser, pageId: string, lineIds?: string[]): Promise<DraftReport> {
  const page = (await sql<{ id: string; manuscript_id: string; status: Status; image_path: string; width: number; height: number; title_en: string; script: string | null }>(
    `select p.id, p.manuscript_id, p.status, p.image_path, p.width, p.height, m.title_en, m.script from ms_pages p join manuscripts m on m.id = p.manuscript_id where p.id = $1`,
    [pageId],
  ))[0];
  if (!page) throw new HttpError(404, "not_found", "This page doesn't exist.");
  if (!canRunDraft(user.role, page.status)) throw new HttpError(403, "frozen", "Machine drafts can only be made while the page is being transcribed.");
  const lines = await sql<{ id: string; polygon: Polygon; human: boolean; current_version: number }>(
    `select l.id, l.polygon, l.current_version, exists (select 1 from ms_line_versions v where v.line_id = l.id and v.kind <> 'machine') as human
       from ms_lines l where l.page_id = $1 ${lineIds?.length ? "and l.id = any($2::text[])" : ""} order by l.seq`,
    lineIds?.length ? [pageId, lineIds] : [pageId],
  );
  const targets = lines.filter((l) => !l.human);
  const keptHuman = lines.length - targets.length;
  if (!targets.length) return { engine: "none", drafted: 0, kept_human: keptHuman, empty: 0 };

  const file = fileForPublicPath(page.image_path);
  const crops: LineCrop[] = [];
  for (const l of targets) crops.push({ line_id: l.id, png: (await cropLine(file, l.polygon, { width: page.width, height: page.height })).png });
  const out = await draftLines(crops, `${page.title_en}${page.script ? ` · script: ${page.script}` : ""}`);

  let drafted = 0, empty = 0;
  await tx(async (qb) => {
    for (const d of out.lines) {
      if (!d.tokens.length) { empty++; continue; }
      const cur = (await q<{ current_version: number; human: boolean }>(qb,
        `select current_version, exists (select 1 from ms_line_versions v where v.line_id = l.id and v.kind <> 'machine') as human from ms_lines l where id = $1`, [d.line_id]))[0];
      if (!cur || cur.human) continue; // someone transcribed it meanwhile: keep their work
      const version = cur.current_version + 1;
      await qb.query(
        `insert into ms_line_versions (line_id, version, tokens, plain_text, kind, engine, base_version, note, author_id) values ($1,$2,$3,$4,'machine',$5,$6,$7,null)`,
        [d.line_id, version, JSON.stringify(d.tokens), plainText(d.tokens), out.engine, cur.current_version, `Machine draft (${DRAFT_PROMPT_VERSION}) requested by ${user.id}`],
      );
      await qb.query("update ms_lines set current_version = $2 where id = $1", [d.line_id, version]);
      drafted++;
    }
    await qb.query("update ms_pages set draft_engine = $2, updated_at = now() where id = $1", [pageId, out.engine.startsWith("claude") ? "claude" : "tesseract"]);
    await audit(qb, user.id, "page.draft", "page", pageId, null, { engine: out.engine, drafted, kept_human: keptHuman, prompt: DRAFT_PROMPT_VERSION });
    await emit(`page:${pageId}`, "draft.done", { engine: out.engine, drafted }, user.id, qb);
  });
  return { engine: out.engine, drafted, kept_human: keptHuman, empty, note: out.note };
}

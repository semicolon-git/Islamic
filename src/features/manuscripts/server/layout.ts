import "server-only";
import { q, sql, tx, type Queryable } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { audit, emit } from "@/lib/events";
import { HttpError } from "@/lib/http";
import { newId } from "@/lib/ids";
import type { Status } from "@/lib/workflow";
import { bbox, center, rectPolygon, regionAt, type Polygon } from "../geometry";
import { canEditLayout } from "../rules";
import type { RegionType } from "../schema";
import { segmentLines } from "../segment";
import { fileForPublicPath, grayRaster } from "./images";

async function pageFor(qb: Queryable, pageId: string) {
  const p = (await q<{ id: string; status: Status; width: number; height: number; image_path: string; manuscript_id: string }>(qb,
    "select id, status, width, height, image_path, manuscript_id from ms_pages where id = $1", [pageId]))[0];
  if (!p) throw new HttpError(404, "not_found", "This page doesn't exist.");
  return p;
}

function assertLayout(user: SessionUser, status: Status) {
  if (!canEditLayout(user.role, status)) throw new HttpError(403, "frozen", "The layout can only change while the page is being transcribed.");
}

const clampPoly = (poly: Polygon, w: number, h: number): Polygon => poly.map(([x, y]) => [Math.round(Math.max(0, Math.min(w, x))), Math.round(Math.max(0, Math.min(h, y)))]);

async function changed(qb: Queryable, user: SessionUser, pageId: string, action: string, entity: string, id: string, after: unknown) {
  await qb.query("update ms_pages set layout_source = coalesce(layout_source, 'manual'), updated_at = now() where id = $1", [pageId]);
  await audit(qb, user.id, `layout.${action}`, entity, id, null, after);
  await emit(`page:${pageId}`, "layout.changed", { action, id }, user.id, qb);
}

export async function createRegion(user: SessionUser, pageId: string, type: RegionType, polygon: Polygon) {
  return tx(async (qb) => {
    const p = await pageFor(qb, pageId);
    assertLayout(user, p.status);
    const id = newId("reg");
    const seq = (await q<{ n: number }>(qb, "select coalesce(max(seq), 0)::int + 1 as n from ms_regions where page_id = $1", [pageId]))[0].n;
    await qb.query("insert into ms_regions (id, page_id, type, polygon, seq, source, created_by) values ($1,$2,$3,$4,$5,'manual',$6)",
      [id, pageId, type, JSON.stringify(clampPoly(polygon, p.width, p.height)), seq, user.id]);
    await changed(qb, user, pageId, "region.create", "region", id, { type });
    return { id };
  });
}

export async function patchRegion(user: SessionUser, regionId: string, patch: { type?: RegionType; polygon?: Polygon; seq?: number }) {
  return tx(async (qb) => {
    const r = (await q<{ page_id: string }>(qb, "select page_id from ms_regions where id = $1", [regionId]))[0];
    if (!r) throw new HttpError(404, "not_found", "This region no longer exists.");
    const p = await pageFor(qb, r.page_id);
    assertLayout(user, p.status);
    if (patch.type) await qb.query("update ms_regions set type = $2 where id = $1", [regionId, patch.type]);
    if (patch.polygon) await qb.query("update ms_regions set polygon = $2 where id = $1", [regionId, JSON.stringify(clampPoly(patch.polygon, p.width, p.height))]);
    if (patch.seq !== undefined) await qb.query("update ms_regions set seq = $2 where id = $1", [regionId, patch.seq]);
    await changed(qb, user, r.page_id, "region.update", "region", regionId, patch);
    return { id: regionId };
  });
}

export async function deleteRegion(user: SessionUser, regionId: string) {
  return tx(async (qb) => {
    const r = (await q<{ page_id: string }>(qb, "select page_id from ms_regions where id = $1", [regionId]))[0];
    if (!r) throw new HttpError(404, "not_found", "This region no longer exists.");
    const p = await pageFor(qb, r.page_id);
    assertLayout(user, p.status);
    await qb.query("delete from ms_regions where id = $1", [regionId]); // lines keep their text (region_id set null)
    await changed(qb, user, r.page_id, "region.delete", "region", regionId, null);
    return { id: regionId };
  });
}

/** New line (e.g. drawn by hand): assigned to the region under its centre and appended to that region's order. */
export async function createLine(user: SessionUser, pageId: string, polygon: Polygon, regionId?: string | null) {
  return tx(async (qb) => {
    const p = await pageFor(qb, pageId);
    assertLayout(user, p.status);
    const poly = clampPoly(polygon, p.width, p.height);
    const b = bbox(poly);
    if (b.w < 8 || b.h < 6) throw new HttpError(400, "too_small", "Draw a larger box around the line.");
    let region = regionId ?? null;
    if (region === null || region === undefined) {
      const regions = await q<{ id: string; polygon: Polygon }>(qb, "select id, polygon from ms_regions where page_id = $1", [pageId]);
      region = regionAt(regions, center(poly))?.id ?? null;
    }
    // Insert in reading order inside the region: after the last line whose centre is above this one.
    const siblings = await q<{ id: string; seq: number; polygon: Polygon }>(qb,
      `select id, seq, polygon from ms_lines where page_id = $1 and ${region ? "region_id = $2" : "region_id is null"} order by seq`, region ? [pageId, region] : [pageId]);
    const cy = center(poly)[1];
    const before = siblings.filter((s) => center(s.polygon)[1] < cy);
    const seq = before.length ? before[before.length - 1].seq + 1 : siblings.length ? siblings[0].seq : 1;
    await qb.query(`update ms_lines set seq = seq + 1 where page_id = $1 and ${region ? "region_id = $3" : "region_id is null"} and seq >= $2`, region ? [pageId, seq, region] : [pageId, seq]);
    const id = newId("ln");
    await qb.query("insert into ms_lines (id, page_id, region_id, seq, polygon, status, current_version, source) values ($1,$2,$3,$4,$5,'draft',0,'manual')",
      [id, pageId, region, seq, JSON.stringify(poly)]);
    await changed(qb, user, pageId, "line.create", "line", id, { region, seq });
    return { id };
  });
}

export async function patchLine(user: SessionUser, lineId: string, patch: { polygon?: Polygon; region_id?: string | null }) {
  return tx(async (qb) => {
    const l = (await q<{ page_id: string }>(qb, "select page_id from ms_lines where id = $1", [lineId]))[0];
    if (!l) throw new HttpError(404, "not_found", "This line no longer exists.");
    const p = await pageFor(qb, l.page_id);
    assertLayout(user, p.status);
    if (patch.polygon) await qb.query("update ms_lines set polygon = $2, baseline = null where id = $1", [lineId, JSON.stringify(clampPoly(patch.polygon, p.width, p.height))]);
    if (patch.region_id !== undefined) await qb.query("update ms_lines set region_id = $2 where id = $1", [lineId, patch.region_id]);
    await changed(qb, user, l.page_id, "line.update", "line", lineId, patch);
    return { id: lineId };
  });
}

/** Delete a line. A line with human transcriptions can only be removed by a researcher (its history goes with it). */
export async function deleteLine(user: SessionUser, lineId: string) {
  return tx(async (qb) => {
    const l = (await q<{ page_id: string; human: boolean }>(qb,
      "select page_id, exists (select 1 from ms_line_versions v where v.line_id = ms_lines.id and v.kind <> 'machine') as human from ms_lines where id = $1", [lineId]))[0];
    if (!l) throw new HttpError(404, "not_found", "This line no longer exists.");
    const p = await pageFor(qb, l.page_id);
    assertLayout(user, p.status);
    if (l.human && user.role !== "researcher" && user.role !== "platform_admin")
      throw new HttpError(409, "has_transcription", "This line has a human transcription. Ask a researcher to remove it.");
    await qb.query("delete from ms_lines where id = $1", [lineId]);
    await changed(qb, user, l.page_id, "line.delete", "line", lineId, null);
    return { id: lineId };
  });
}

/** Set the reading order: line_ids in the new order (per page; seq is page-wide within each region). */
export async function reorderLines(user: SessionUser, pageId: string, lineIds: string[]) {
  return tx(async (qb) => {
    const p = await pageFor(qb, pageId);
    assertLayout(user, p.status);
    const own = new Set((await q<{ id: string }>(qb, "select id from ms_lines where page_id = $1", [pageId])).map((r) => r.id));
    if (lineIds.some((id) => !own.has(id))) throw new HttpError(400, "bad_lines", "Some lines don't belong to this page.");
    for (const [i, id] of lineIds.entries()) await qb.query("update ms_lines set seq = $2 where id = $1", [id, i + 1]);
    await changed(qb, user, pageId, "line.reorder", "page", pageId, { count: lineIds.length });
    return { count: lineIds.length };
  });
}

/**
 * Auto-segmentation: text block + projection-profile lines. Adds a main region and its lines (layout_source='auto').
 * Refuses to replace lines that already carry human work.
 */
export async function autoSegment(user: SessionUser, pageId: string, replace = false) {
  const p = (await sql<{ id: string; status: Status; width: number; height: number; image_path: string }>("select id, status, width, height, image_path from ms_pages where id = $1", [pageId]))[0];
  if (!p) throw new HttpError(404, "not_found", "This page doesn't exist.");
  assertLayout(user, p.status);
  const raster = await grayRaster(fileForPublicPath(p.image_path), 1000);
  const seg = segmentLines(raster.data, raster.width, raster.height);
  const sc = p.width / raster.width;
  return tx(async (qb) => {
    const existing = (await q<{ n: number; human: number }>(qb,
      `select count(*)::int as n, count(*) filter (where exists (select 1 from ms_line_versions v where v.line_id = l.id and v.kind <> 'machine'))::int as human from ms_lines l where l.page_id = $1`, [pageId]))[0];
    if (existing.n && !replace) throw new HttpError(409, "has_lines", "This page already has lines. Choose “Replace lines” to detect them again.");
    if (existing.human) throw new HttpError(409, "has_transcription", "Some lines already have human transcriptions; adjust the layout by hand instead.");
    if (existing.n) {
      await qb.query("delete from ms_lines where page_id = $1", [pageId]);
      await qb.query("delete from ms_regions where page_id = $1 and source = 'auto'", [pageId]);
    }
    let regionId: string | null = null;
    if (seg.block) {
      regionId = newId("reg");
      const blk = { x: seg.block.x * sc, y: seg.block.y * sc, w: seg.block.w * sc, h: seg.block.h * sc };
      await qb.query("insert into ms_regions (id, page_id, type, polygon, seq, source, created_by) values ($1,$2,'main',$3,1,'auto',$4)", [regionId, pageId, JSON.stringify(rectPolygon(blk)), user.id]);
    }
    for (const [i, l] of seg.lines.entries()) {
      const box = { x: l.x * sc, y: l.y * sc, w: l.w * sc, h: l.h * sc };
      const base: Polygon = [[Math.round(box.x), Math.round(l.baseline * sc)], [Math.round(box.x + box.w), Math.round(l.baseline * sc)]];
      await qb.query("insert into ms_lines (id, page_id, region_id, seq, polygon, baseline, status, current_version, source) values ($1,$2,$3,$4,$5,$6,'draft',0,'auto')",
        [newId("ln"), pageId, regionId, i + 1, JSON.stringify(rectPolygon(box)), JSON.stringify(base)]);
    }
    await qb.query("update ms_pages set layout_source = 'auto', updated_at = now() where id = $1", [pageId]);
    await audit(qb, user.id, "layout.segment", "page", pageId, null, { lines: seg.lines.length, pitch: Math.round(seg.pitch * sc) });
    await emit(`page:${pageId}`, "layout.changed", { action: "segment", lines: seg.lines.length }, user.id, qb);
    return { lines: seg.lines.length, block: !!seg.block };
  });
}

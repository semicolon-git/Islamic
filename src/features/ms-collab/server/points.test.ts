import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Points are idempotent: awarding the same accepted work twice (or reconciling approved lines repeatedly) never adds a
 * second ledger row or more points. Runs against an in-memory PGlite with every migration applied.
 */
type Db = typeof import("@/lib/db");
type Points = typeof import("./points");
let db: Db;
let points: Points;

beforeAll(async () => {
  vi.resetModules();
  vi.stubEnv("DATA_DIR", "memory://");
  vi.stubEnv("DATABASE_URL", "");
  db = await import("@/lib/db");
  points = await import("./points");
  await db.sql("insert into institutions (id, slug, name_en, name_ar, kind) values ('i1','i1','I','I','library')");
  await db.sql("insert into users (id, display_name_en, display_name_ar, role) values ('s1','Sara','سارة','student'), ('r1','Huda','هدى','researcher')");
  await db.sql("insert into manuscripts (id, institution_id, title_en, title_ar) values ('m1','i1','T','ت')");
  await db.sql("insert into ms_pages (id, manuscript_id, seq, image_path, width, height) values ('p1','m1',1,'/x.jpg',100,100)");
  await db.sql("insert into ms_regions (id, page_id, type, polygon) values ('r-main','p1','main','[[0,0],[1,0],[1,1]]'), ('r-margin','p1','margin','[[0,0],[1,0],[1,1]]')");
  await db.sql(`insert into ms_lines (id, page_id, region_id, seq, polygon, status, current_version) values
    ('l1','p1','r-main',1,'[[0,0],[1,0],[1,1]]','approved',2), ('l2','p1','r-margin',2,'[[0,0],[1,0],[1,1]]','approved',2), ('l3','p1','r-main',3,'[[0,0],[1,0],[1,1]]','transcribed',2)`);
  for (const l of ["l1", "l2", "l3"])
    await db.sql(`insert into ms_line_versions (line_id, version, tokens, plain_text, kind, author_id) values
      ($1,1,'[]','', 'machine', null), ($1,2,'[{"t":"text","v":"x"}]','x','student','s1')`, [l]);
}, 60_000);

afterAll(() => vi.unstubAllEnvs());

const ledger = () => db.sql<{ reason: string; ref: string; delta: number }>("select reason, ref, delta from points_ledger where user_id = 's1' order by ref");
const userPoints = async () => (await db.sql<{ points: number }>("select points from users where id = 's1'"))[0].points;

describe("points ledger", () => {
  it("awards accepted lines once, weighted by zone, however often it is reconciled", async () => {
    const first = await db.tx((qb) => points.reconcileLinePoints(qb));
    expect(first.map((a) => [a.ref, a.delta])).toEqual([["line:l1", 2], ["line:l2", 4]]);
    const again = await db.tx((qb) => points.reconcileLinePoints(qb, "p1"));
    expect(again).toEqual([]);
    expect(await ledger()).toEqual([{ reason: "ms_line_accepted", ref: "line:l1", delta: 2 }, { reason: "ms_line_accepted", ref: "line:l2", delta: 4 }]);
    expect(await userPoints()).toBe(6);
  });

  it("a repeated award (same user, reason, ref) is a no-op; another ref counts", async () => {
    const a = { user_id: "s1", reason: "ms_keying_accepted" as const, ref: "hw:1", delta: 1 };
    expect(await db.tx((qb) => points.award(qb, [a]))).toHaveLength(1);
    expect(await db.tx((qb) => points.award(qb, [a, a]))).toHaveLength(0);
    expect(await db.tx((qb) => points.award(qb, [{ ...a, ref: "hw:2" }]))).toHaveLength(1);
    expect(await userPoints()).toBe(8);
  });

  it("the student sees only their own progress", async () => {
    const p = await points.myProgress("s1");
    expect(p.points).toBe(8);
    expect(p.by_reason.ms_line_accepted).toEqual({ n: 2, points: 6 });
    expect(p.by_reason.ms_keying_accepted).toEqual({ n: 2, points: 2 });
    expect(p.lines_checked).toBe(3);
    expect((await points.myProgress("r1")).points).toBe(0);
  });
});

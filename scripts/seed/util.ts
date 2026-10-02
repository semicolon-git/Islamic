import fs from "node:fs";
import path from "node:path";
import type { Queryable } from "../../src/lib/db";

export const ROOT = process.cwd();
export const RAW = path.join(ROOT, "prep/data/raw");
export const readJson = <T = unknown>(p: string): T => JSON.parse(fs.readFileSync(path.isAbsolute(p) ? p : path.join(ROOT, p), "utf8"));
export const exists = (p: string) => fs.existsSync(path.isAbsolute(p) ? p : path.join(ROOT, p));

/** Multi-row insert in batches. rows: arrays of values in column order. */
export async function insertMany(q: Queryable, table: string, cols: string[], rows: unknown[][], suffix = "", batch = 400) {
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch);
    const params: unknown[] = [];
    const values = chunk
      .map((r) => `(${r.map((v) => { params.push(v); return `$${params.length}`; }).join(",")})`)
      .join(",");
    await q.query(`insert into ${table} (${cols.join(",")}) values ${values} ${suffix}`, params);
  }
}

export const log = (...a: unknown[]) => console.log("  ·", ...a);

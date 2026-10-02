import fs from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";

/**
 * Minimal query layer over two drivers:
 *  - PGlite (embedded Postgres, default; DATA_DIR or memory://) for dev, tests and single-node demos
 *  - node-postgres when DATABASE_URL is set (Supabase / any Postgres)
 * Migrations in db/migrations/*.sql are applied automatically on first use.
 */
export type Row = Record<string, unknown>;
export interface Queryable {
  query<T = Row>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

type Driver = Queryable & {
  transaction<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  exec(sqlText: string): Promise<void>;
  close(): Promise<void>;
};

const g = globalThis as unknown as { __sayDb?: Promise<Driver> };

async function createPglite(): Promise<Driver> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const dir = env.dataDir;
  if (!dir.startsWith("memory://")) fs.mkdirSync(dir, { recursive: true });
  const db = await PGlite.create({ dataDir: dir, extensions: { pg_trgm } });
  return {
    query: async <T,>(text: string, params?: unknown[]) => {
      const r = await db.query<T>(text, params as unknown[]);
      return { rows: r.rows };
    },
    transaction: <T,>(fn: (q: Queryable) => Promise<T>) =>
      db.transaction(async (tx) =>
        fn({
          query: async <R,>(text: string, params?: unknown[]) => {
            const r = await tx.query<R>(text, params as unknown[]);
            return { rows: r.rows };
          },
        }),
      ) as Promise<T>,
    exec: async (sqlText) => {
      await db.exec(sqlText);
    },
    close: () => db.close(),
  };
}

async function createPg(): Promise<Driver> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: env.databaseUrl, max: 5 });
  return {
    query: async <T,>(text: string, params?: unknown[]) => {
      const r = await pool.query(text, params as unknown[]);
      return { rows: r.rows as T[] };
    },
    transaction: async <T,>(fn: (q: Queryable) => Promise<T>) => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const out = await fn({
          query: async <R,>(text: string, params?: unknown[]) => {
            const r = await client.query(text, params as unknown[]);
            return { rows: r.rows as R[] };
          },
        });
        await client.query("commit");
        return out;
      } catch (e) {
        await client.query("rollback");
        throw e;
      } finally {
        client.release();
      }
    },
    exec: async (sqlText) => {
      await pool.query(sqlText);
    },
    close: () => pool.end(),
  };
}

export function migrationsDir() {
  return path.join(process.cwd(), "db", "migrations");
}

async function migrate(d: Driver) {
  await d.exec(
    "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const done = new Set(
    (await d.query<{ name: string }>("select name from _migrations")).rows.map((r) => r.name),
  );
  const files = fs
    .readdirSync(migrationsDir())
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sqlText = fs.readFileSync(path.join(migrationsDir(), f), "utf8");
    await d.transaction(async (q) => {
      // Run statement by statement: PGlite's extended protocol takes one statement at a time.
      for (const stmt of splitSql(sqlText)) await q.query(stmt);
      await q.query("insert into _migrations(name) values ($1)", [f]);
    });
  }
}

/** Split a SQL file on semicolons that end a statement (ignores ';' inside strings, comments and $$ blocks). */
export function splitSql(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  let inS = false, inLine = false, inBlock = false, inDollar = false;
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (inLine) { if (c === "\n") inLine = false; cur += c; i++; continue; }
    if (inBlock) { if (c === "*" && n === "/") { inBlock = false; cur += "*/"; i += 2; continue; } cur += c; i++; continue; }
    if (inS) { cur += c; if (c === "'") inS = false; i++; continue; }
    if (inDollar) { if (c === "$" && n === "$") { inDollar = false; cur += "$$"; i += 2; continue; } cur += c; i++; continue; }
    if (c === "-" && n === "-") { inLine = true; cur += c; i++; continue; }
    if (c === "/" && n === "*") { inBlock = true; cur += "/*"; i += 2; continue; }
    if (c === "'") { inS = true; cur += c; i++; continue; }
    if (c === "$" && n === "$") { inDollar = true; cur += "$$"; i += 2; continue; }
    if (c === ";") { if (cur.replace(/--[^\n]*/g, "").trim()) out.push(cur.trim()); cur = ""; i++; continue; }
    cur += c; i++;
  }
  if (cur.replace(/--[^\n]*/g, "").trim()) out.push(cur.trim());
  return out;
}

export function getDb(): Promise<Driver> {
  if (!g.__sayDb) {
    g.__sayDb = (async () => {
      const d = env.databaseUrl ? await createPg() : await createPglite();
      await migrate(d);
      return d;
    })();
    g.__sayDb.catch(() => {
      g.__sayDb = undefined;
    });
  }
  return g.__sayDb;
}

/** Run a query, return rows. */
export async function sql<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const d = await getDb();
  return (await d.query<T>(text, params)).rows;
}

/** Run a query expecting at most one row. */
export async function one<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await sql<T>(text, params);
  return rows[0] ?? null;
}

/** Run fn inside a transaction. */
export async function tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
  const d = await getDb();
  return d.transaction(fn);
}

/** Helper for use inside tx: return rows. */
export async function q<T = Row>(qb: Queryable, text: string, params: unknown[] = []): Promise<T[]> {
  return (await qb.query<T>(text, params)).rows;
}

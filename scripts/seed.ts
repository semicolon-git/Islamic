/**
 * Seed the database. Idempotent. Usage:
 *   npm run seed            (uses DATA_DIR / DATABASE_URL like the app)
 *   npm run seed -- --reset (drop the embedded database first; PGlite only)
 * Feature builders add modules in scripts/seed/<feature>.ts exporting `seed(q)`; they run after core, in FEATURES order.
 */
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../src/lib/db";
import { env } from "../src/lib/env";
import { seedCore } from "./seed/core";

const FEATURES = ["content", "cards", "beneficiary", "manuscripts", "heritage", "inbox", "ask", "eval", "ms-collab"];

async function main() {
  const t0 = Date.now();
  if (process.argv.includes("--reset") && !env.databaseUrl && !env.dataDir.startsWith("memory://")) {
    fs.rmSync(env.dataDir, { recursive: true, force: true });
    console.log(`reset ${env.dataDir}`);
  }
  const db = await getDb();
  console.log(`seeding ${env.databaseUrl ? "Postgres (DATABASE_URL)" : `PGlite at ${env.dataDir}`}`);
  await db.transaction((q) => seedCore(q));
  for (const f of FEATURES) {
    const file = path.join(process.cwd(), "scripts/seed", `${f}.ts`);
    if (!fs.existsSync(file)) continue;
    const mod = await import(`./seed/${f}.ts`);
    if (typeof mod.seed === "function") {
      console.log(`feature: ${f}`);
      await db.transaction((q) => mod.seed(q));
    }
  }
  await db.close();
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

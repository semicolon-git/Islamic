/** Dev helper: run one SQL query against the local database. usage: npx tsx scripts/sql.mts "select …" (DATA_DIR / DATABASE_URL apply) */
import { sql } from "../src/lib/db";

const q = process.argv[2];
if (!q) {
  console.error('usage: npx tsx scripts/sql.mts "select …"');
  process.exit(2);
}
console.log(JSON.stringify(await sql(q), null, 1));
process.exit(0);

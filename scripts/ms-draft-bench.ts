/**
 * Live benchmark of the Claude manuscript draft against the dataset ground truth.
 *   npx tsx --conditions=react-server scripts/ms-draft-bench.ts                 → every bundled page
 *   npx tsx --conditions=react-server scripts/ms-draft-bench.ts bnf-arabe-5341_03 --verbose   (one page, line by line)
 * Crops each line exactly as the Studio does, drafts it with Claude (draftWithClaude) and reports the page CER
 * (Σ edit distance / Σ reference characters), next to the stored seed draft's CER. Needs ANTHROPIC_API_KEY. Writes nothing to the DB.
 */
import fs from "node:fs";
import path from "node:path";
import { aiEnabled } from "../src/lib/ai/claude";
import { cropLine } from "../src/features/manuscripts/server/images";
import { draftWithClaude } from "../src/features/manuscripts/server/engines";
import { cerParts } from "../src/features/manuscripts/text";
import { plainText } from "../src/features/manuscripts/tokens";

type Line = { id: string; polygon: [number, number][]; gt_text?: string };
type Page = { page_id: string; width: number; height: number; image: string; lines: Line[] };
const DIR = "data/manuscripts";

async function upscale(png: Buffer, k: number): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const m = await sharp(png).metadata();
  return sharp(png).resize({ width: Math.round((m.width ?? 1) * k), kernel: "lanczos3" }).png().toBuffer();
}

async function main() {
  if (!aiEnabled()) throw new Error("Set ANTHROPIC_API_KEY (and ANTHROPIC_WORKSPACE_ID if your key needs it).");
  const verbose = process.argv.includes("--verbose");
  // Experiment knobs: BENCH_SCALE (extra upscale before the engine's own enlargement), BENCH_EFFORT, BENCH_BATCH.
  const scale = Number(process.env.BENCH_SCALE || 1);
  const effort = (process.env.BENCH_EFFORT || undefined) as "low" | "medium" | "high" | undefined;
  const batch = process.env.BENCH_BATCH ? Number(process.env.BENCH_BATCH) : undefined;
  const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
  let total = { dist: 0, chars: 0 };
  for (const ms of fs.readdirSync(DIR).filter((d) => fs.existsSync(path.join(DIR, d, "manifest.json")))) {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIR, ms, "manifest.json"), "utf8")) as { pages: { page_id: string; json: string }[] };
    for (const ref of manifest.pages) {
      if (only && ref.page_id !== only) continue;
      const page = JSON.parse(fs.readFileSync(path.join(DIR, ms, ref.json), "utf8")) as Page;
      const lines = page.lines.filter((l) => l.gt_text?.trim());
      const file = path.join(DIR, ms, page.image.startsWith("pages/") ? page.image : `pages/${path.basename(page.image)}`);
      const crops = [];
      for (const l of lines) {
        const poly = typeof l.polygon === "string" ? JSON.parse(l.polygon) : l.polygon;
        let png = (await cropLine(file, poly, { width: page.width, height: page.height })).png;
        if (scale !== 1) png = await upscale(png, scale);
        crops.push({ line_id: l.id, png });
      }
      const t0 = Date.now();
      const out = await draftWithClaude(crops, { context: ms, effort, batch });
      const byId = new Map(out.lines.map((d) => [d.line_id, plainText(d.tokens)]));
      let p = { dist: 0, chars: 0 }, missing = 0;
      for (const l of lines) {
        const hyp = byId.get(l.id);
        if (hyp === undefined) missing++;
        const c = cerParts(hyp ?? "", l.gt_text!);
        if (verbose) console.log(`  ${l.id.padEnd(4)} ${((c.dist / Math.max(1, c.chars)) * 100).toFixed(0).padStart(3)}%  GT : ${l.gt_text}\n                HYP: ${hyp ?? "(missing)"}`);
        p = { dist: p.dist + c.dist, chars: p.chars + c.chars };
      }
      total = { dist: total.dist + p.dist, chars: total.chars + p.chars };
      const seed = fs.existsSync(path.join(DIR, ms, "drafts", `${page.page_id}.claude.json`)) ? "seed draft on file" : "no seed draft";
      console.log(`${page.page_id.padEnd(20)} CER ${((p.dist / p.chars) * 100).toFixed(1).padStart(5)}%  ${lines.length} lines${missing ? `, ${missing} missing` : ""}  ${((Date.now() - t0) / 1000).toFixed(0)}s  ${out.engine} (${seed})`);
    }
  }
  if (total.chars) console.log(`\nALL pages: CER ${((total.dist / total.chars) * 100).toFixed(1)}% over ${total.chars} reference characters`);
  process.exit(0);
}
main();

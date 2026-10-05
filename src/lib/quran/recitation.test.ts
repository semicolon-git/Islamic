import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AYAH_COUNTS, parseVerseKey, recitationFile, recitationUrl, RECITER } from "./recitation";

const RAW = path.join(process.cwd(), "prep/data/raw/quran_kfgqpc_hafs_v18.json");
const rows = JSON.parse(fs.readFileSync(RAW, "utf8")) as { sora: number; aya_no: number; aya_text_emlaey: string }[];

describe("recitation mapping", () => {
  it("uses the same verse count per sura as KFGQPC Hafs v18", () => {
    const counts = new Array<number>(114).fill(0);
    for (const r of rows) counts[r.sora - 1] = Math.max(counts[r.sora - 1], r.aya_no);
    expect(AYAH_COUNTS).toEqual(counts);
    expect(AYAH_COUNTS.reduce((a, b) => a + b, 0)).toBe(6236);
  });

  it("maps every KFGQPC verse to its own file, and no two verses share one", () => {
    const files = new Set<string>();
    for (const r of rows) {
      const file = recitationFile(`${r.sora}:${r.aya_no}`);
      expect(file).toBe(`${String(r.sora).padStart(3, "0")}${String(r.aya_no).padStart(3, "0")}.mp3`);
      files.add(file!);
    }
    expect(files.size).toBe(6236);
  });

  it("builds the Al-Husary URL by key", () => {
    expect(recitationUrl("10:5")).toBe(`${RECITER.base_url}/010005.mp3`);
    expect(recitationUrl("114:6")).toBe(`${RECITER.base_url}/114006.mp3`);
    expect(recitationUrl("1:1")).toBe(`${RECITER.base_url}/001001.mp3`);
  });

  it("never returns a URL for a verse that does not exist", () => {
    for (const k of ["0:1", "1:0", "1:8", "2:287", "114:7", "115:1", "10:05x", "", "Q:10:5", "10-5", "1000:1"]) {
      expect(parseVerseKey(k)).toBeNull();
      expect(recitationUrl(k)).toBeNull();
    }
  });

  it("matches the text's bismillah rule: only 1:1 is the bismillah, other first verses start without it", () => {
    // The recordings follow the same rule (checked against the audio by scripts/recitation-check.mts).
    const first = (s: number) => rows.find((r) => r.sora === s && r.aya_no === 1)!.aya_text_emlaey;
    expect(first(1)).toMatch(/^بسم الله/);
    for (let s = 2; s <= 114; s++) expect(first(s)).not.toMatch(/^بسم الله الرحمن الرحيم/);
  });
});

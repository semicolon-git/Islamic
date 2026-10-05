import "server-only";
import fs from "node:fs";
import path from "node:path";
import { parseVerseKey } from "./recitation";

/** [start ms, end ms] for each word of a verse, indexed like verseTokens(). Built by scripts/recitation-segments.mts. */
export type WordTimings = [number, number][];

let cache: Record<string, WordTimings> | null = null;

function all(): Record<string, WordTimings> {
  cache ??= (JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/content/recitation/husary-segments.json"), "utf8")) as {
    verses: Record<string, WordTimings>;
  }).verses;
  return cache;
}

/** Word timings for each requested verse, or null where the verse has none (it then plays without highlighting). */
export function wordTimings(keys: string[]): Record<string, WordTimings | null> {
  const verses = all();
  return Object.fromEntries(keys.filter((k) => parseVerseKey(k)).map((k) => [k, verses[k] ?? null]));
}

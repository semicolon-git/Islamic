import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { matchChains, type ChainLite } from "./chains";

/**
 * Measured: how well the deterministic word matcher (no AI) maps everyday photo labels to contribution chains, on a fixed
 * set of labels a vision model typically returns. Negatives must match nothing — a wrong chain is worse than none.
 * The AI picker covers what the word matcher misses (synonyms, descriptions); this set measures the floor without a key.
 */

const chains = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "science", "chains.json"), "utf8")) as ChainLite[];

/** [label_en, label_ar, acceptable chain ids ([] = must match nothing)] */
export const LABELS: [string, string, string[]][] = [
  ["television", "تلفاز", ["light-and-image"]],
  ["flat screen tv", "شاشة تلفاز", ["light-and-image"]],
  ["digital camera", "كاميرا", ["light-and-image"]],
  ["projector", "جهاز عرض", ["light-and-image"]],
  ["eyeglasses", "نظارة", ["lenses-and-eyeglasses"]],
  ["microscope", "مجهر", ["lenses-and-eyeglasses"]],
  ["telescope", "تلسكوب", ["lenses-and-eyeglasses"]],
  ["magnifying glass", "عدسة مكبرة", ["lenses-and-eyeglasses"]],
  ["laptop", "حاسوب محمول", ["algorithms-and-computing"]],
  ["desktop computer", "حاسوب", ["algorithms-and-computing"]],
  ["smartphone", "هاتف ذكي", ["algorithms-and-computing", "light-and-image"]],
  ["calculator", "آلة حاسبة", ["algorithms-and-computing", "numbers-and-zero"]],
  ["price tag", "بطاقة سعر", ["numbers-and-zero"]],
  ["wall clock", "ساعة حائط", ["clocks-and-timekeeping"]],
  ["wristwatch", "ساعة يد", ["clocks-and-timekeeping"]],
  ["alarm clock", "منبه", ["clocks-and-timekeeping"]],
  ["map", "خريطة", ["maps-and-navigation"]],
  ["globe", "مجسم الكرة الأرضية", ["maps-and-navigation"]],
  ["gps navigation device", "جهاز ملاحة", ["maps-and-navigation"]],
  ["robot", "روبوت", ["machines-and-automation"]],
  ["water pump", "مضخة ماء", ["machines-and-automation"]],
  ["sheet of paper", "ورقة", ["paper-and-books"]],
  ["book", "كتاب", ["paper-and-books"]],
  ["newspaper", "جريدة", ["paper-and-books"]],
  ["hospital", "مستشفى", ["hospitals-and-medicine"]],
  ["medicine pills", "أقراص دواء", ["hospitals-and-medicine"]],
  ["stethoscope", "سماعة طبيب", ["hospitals-and-medicine"]],
  ["scalpel", "مشرط", ["surgery-and-dentistry"]],
  ["dental chair", "كرسي أسنان", ["surgery-and-dentistry"]],
  ["perfume", "عطر", ["chemistry-and-perfume"]],
  ["bar of soap", "صابون", ["chemistry-and-perfume"]],
  ["cup of coffee", "فنجان قهوة", ["coffee"]],
  ["coffee beans", "حبوب القهوة", ["coffee"]],
  // Negatives: nothing should match.
  ["cat", "قطة", []],
  ["pomegranate", "رمان", []],
  ["television tower", "برج التلفاز", []],
  ["watchtower", "برج مراقبة", []],
  ["glass of water", "كأس ماء", []],
  ["picture frame", "إطار صورة", []],
  ["bookshelf", "رف كتب", []],
  ["palm tree", "نخلة", []],
  ["mosque dome", "قبة مسجد", []],
  ["red car", "سيارة حمراء", []],
  ["clock tower", "برج الساعة", []],
];

export function score() {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  const misses: string[] = [];
  for (const [en, ar, ok] of LABELS) {
    const got = matchChains({ label_en: en, label_ar: ar }, chains);
    if (!ok.length) {
      if (got.length) { fp++; misses.push(`${en}: unexpected ${got.join(",")}`); } else tn++;
      continue;
    }
    if (got.some((g) => ok.includes(g)) && got.every((g) => ok.includes(g))) tp++;
    else if (got.length) { fp++; misses.push(`${en}: got ${got.join(",")}, want ${ok.join("|")}`); }
    else { fn++; misses.push(`${en}: no match, want ${ok.join("|")}`); }
  }
  return { tp, fp, fn, tn, precision: tp / Math.max(1, tp + fp), recall: tp / Math.max(1, tp + fn), misses };
}

describe("contribution chains: word matcher on everyday labels (measured)", () => {
  const s = score();
  it("never links a wrong chain (precision 100%) and never links negatives", () => {
    expect(s.misses.filter((m) => m.includes("got") || m.includes("unexpected"))).toEqual([]);
  });
  it("finds the right chain for at least 90% of positive labels without AI", () => {
    expect(s.recall, s.misses.join("\n")).toBeGreaterThanOrEqual(0.9);
  });
});

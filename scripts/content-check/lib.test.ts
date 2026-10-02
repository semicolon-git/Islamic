import { describe, expect, it } from "vitest";
import { BANNED, CONSENSUS, bannedHits, longestSharedRun, normalizeArabic, parseCitations, sentences, unattributedSentences } from "./lib";

const suras = new Map<string, number>([
  [normalizeArabic("يُونس"), 10],
  [normalizeArabic("البَقَرَة"), 2],
  [normalizeArabic("الإخلَاص"), 112],
  [normalizeArabic("يسٓ"), 36],
  [normalizeArabic("آل عِمران"), 3],
  [normalizeArabic("الشُّوري"), 42],
]);
const refs = (t: string) => parseCitations(t, suras).citations.map((c) => c.ref);

describe("normalizeArabic", () => {
  it("strips tashkeel and folds letter variants", () => {
    expect(normalizeArabic("الإخلَاص")).toBe("الاخلاص");
    expect(normalizeArabic("الشورى")).toBe(normalizeArabic("الشُّوري"));
    expect(normalizeArabic("يسٓ")).toBe("يس");
    expect(normalizeArabic("رحمةً")).toBe("رحمه");
  });
});

describe("parseCitations", () => {
  it("reads English verse and hadith citations, including ranges and lists", () => {
    expect(refs("signs (10:5) and phases (10:5; 36:39)")).toEqual(["10:5", "10:5", "36:39"]);
    expect(refs("tree (14:24–25)")).toEqual(["14:24", "14:25"]);
    expect(refs("eclipse (al-Bukhari 1042) and (al-Bukhari 7352; Muslim 1716)")).toEqual(["bukhari:1042", "bukhari:7352", "muslim:1716"]);
  });
  it("reads Arabic citations with sura names and Arabic-Indic digits", () => {
    expect(refs("آيتين (يونس ٥؛ يس ٣٩)")).toEqual(["10:5", "36:39"]);
    expect(refs("(الإخلاص ١–٤)")).toEqual(["112:1", "112:2", "112:3", "112:4"]);
    expect(refs("(البخاري ٧٣٥٢؛ مسلم ١٧١٦)")).toEqual(["bukhari:7352", "muslim:1716"]);
    expect(refs("(آل عمران ١٩٠) (الشورى ١١)")).toEqual(["3:190", "42:11"]);
  });
  it("ignores ordinary parentheses and flags unknown Arabic citations", () => {
    expect(refs("mindfulness (taqwa), Mary (Maryam), (1250–1517), (Altair), (١٤٥٣م)")).toEqual([]);
    expect(parseCitations("(سورة مجهولة ٥)", suras).unresolved).toEqual(["سورة مجهولة ٥"]);
  });
});

describe("banned framings", () => {
  const hit = (t: string) => bannedHits(t, BANNED).map((h) => h.rule.id);
  it("catches grade words, counts, rulings, tarjih, term-lock and science framing", () => {
    expect(hit("This authentic hadith says")).toContain("V5");
    expect(hit("وهذا حديث صحيح")).toContain("V5");
    expect(hit("The moon is mentioned 27 times")).toContain("V6");
    expect(hit("ذُكر القمر في القرآن ٢٧ مرة")).toContain("V6");
    expect(hit("It is permissible for you to do this")).toContain("V7");
    expect(hit("You must pray")).toContain("V7");
    expect(hit("والراجح أن")).toContain("V7");
    expect(hit("the correct view is")).toContain("V7");
    expect(hit("jihad means holy war")).toContain("V8");
    expect(hit("Allah is a moon god")).toContain("V8");
    expect(hit("Tawhid means unity")).toContain("V8");
    expect(hit("a scientific miracle")).toContain("V9");
    expect(hit("science proves the Quran")).toContain("V9");
    expect(hit("من الإعجاز العلمي")).toContain("V9");
  });
  it("does not flag ordinary words that merely contain a banned string", () => {
    expect(hit("guidance for those of understanding, the best of people")).toEqual([]);
    expect(hit("بالتي هي أحسن، وأحسن الحديث")).toEqual([]);
    expect(hit("five pillars; the ninth month; seven ears")).toEqual([]);
    expect(hit("so that people may be grateful")).toEqual([]);
  });
  it("allows consensus words only through the separate CONSENSUS list", () => {
    expect(bannedHits("there is consensus that", CONSENSUS)).toHaveLength(1);
    expect(bannedHits("وهذا بالإجماع", CONSENSUS)).toHaveLength(1);
  });
});

describe("V3 longestSharedRun", () => {
  const verse = "هو الذي جعل الشمس ضياء والقمر نورا وقدره منازل";
  it("finds verse wording typed into prose, ignoring diacritics", () => {
    expect(longestSharedRun("قال: جعل الشمسَ ضياءً والقمرَ نورًا للناس", verse).length).toBe(5);
  });
  it("allows short shared phrases in a paraphrase", () => {
    expect(longestSharedRun("فالشمس ضياء والقمر نور، وقد قدّر الله للقمر منازل", verse).length).toBeLessThanOrEqual(3);
  });
});

describe("V4 attribution", () => {
  it("flags sentences attributing words to the Prophet without a hadith citation", () => {
    expect(unattributedSentences("The Prophet ﷺ said that eclipses are signs. The Quran says so (10:5).", suras)).toHaveLength(1);
    expect(unattributedSentences("The Prophet ﷺ said that eclipses are signs (al-Bukhari 1042).", suras)).toHaveLength(0);
    expect(unattributedSentences("وقال النبي ﷺ إن الكسوف آية (البخاري ١٠٤٢). وقال النبي ﷺ كذا.", suras)).toHaveLength(1);
  });
  it("splits sentences on Latin and Arabic punctuation", () => {
    expect(sentences("One. Two? ثلاثة؟ أربعة.")).toEqual(["One", "Two", "ثلاثة", "أربعة."]);
  });
});
